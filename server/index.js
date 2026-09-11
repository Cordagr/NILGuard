import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { MongoClient, ObjectId } from 'mongodb';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { analyzeContractPdf } from './contractClassifier.js';
import { resolveSchoolFromEmail } from './ncaaSchoolDirectory.js';
import { isEduEmail, isStrongPassword } from './utils/validation.js';
import { signToken, setAuthCookie, clearAuthCookie } from './utils/jwt.js';
import { makeRequireAuth } from './middleware/auth.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 5000);
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'nilguard';
const AGREEMENT_METADATA_VERSION = 2;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.join(__dirname, 'uploads', 'contracts');
const rosterUploadsRoot = path.join(__dirname, 'uploads', 'rosters');

const allowedRoles = new Set(['student', 'coach', 'school', 'compliance']);
const COMPLIANCE_REVIEW_DAYS = 5;
const NIL_GUIDELINES = [
  ['compliance-missing-compensation', 'Compensation clause', 'Confirm compensation, consideration, or payment terms are clear.'],
  ['compliance-missing-termination', 'Termination clause', 'Confirm the contract includes a termination date or termination process.'],
  ['compliance-missing-governing-law', 'Governing law', 'Confirm the governing law or jurisdiction is specified.'],
  ['compliance-missing-signature', 'Signature block', 'Confirm all required parties have a signature or signed section.'],
  ['compliance-missing-party-definitions', 'Party definitions', 'Confirm the student and other parties are clearly identified.'],
  ['compliance-missing-nil-disclosure', 'NIL disclosure', 'Confirm the contract addresses Name, Image, and Likeness rights.'],
  ['compliance-missing-exclusivity', 'Exclusivity statement', 'Confirm exclusivity or non-exclusivity terms are clear.']
].map(([id, title, summary]) => ({ id, title, summary }));

function buildGuidelineReviews(findings = [], dueAt) {
  const findingsById = new Map(findings.map((finding) => [finding.id, finding]));
  return NIL_GUIDELINES.map((guideline) => ({
    id: guideline.id,
    title: guideline.title,
    summary: guideline.summary,
    aiStatus: findingsById.get(guideline.id)?.status || 'pending',
    decision: null,
    feedback: '',
    dueAt
  }));
}

function getReviewDueAt(documentRequest) {
  if (documentRequest.reviewDueAt) {
    return documentRequest.reviewDueAt;
  }

  const submittedAt = documentRequest.submittedAt || documentRequest.timeline?.find((event) => event.type === 'submitted')?.at;
  if (submittedAt) {
    return new Date(new Date(submittedAt).getTime() + COMPLIANCE_REVIEW_DAYS * 24 * 60 * 60 * 1000);
  }

  return null;
}

const contractUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 12 * 1024 * 1024
  },
  fileFilter: (_req, file, callback) => {
    const isPdfMimeType = file.mimetype === 'application/pdf';
    const hasPdfExtension = String(file.originalname || '').toLowerCase().endsWith('.pdf');

    if (isPdfMimeType || hasPdfExtension) {
      callback(null, true);
      return;
    }

    callback(new Error('Only PDF files are allowed.'));
  }
});
const rosterUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (_req, file, callback) => {
    const mimeType = String(file.mimetype || '').toLowerCase();
    const fileName = String(file.originalname || '').toLowerCase();
    const allowedMimeTypes = new Set(['text/csv', 'application/csv', 'text/plain']);

    if (allowedMimeTypes.has(mimeType) || fileName.endsWith('.csv')) {
      callback(null, true);
      return;
    }

    callback(new Error('Only CSV files are allowed.'));
  }
});

if (!MONGODB_URI) {
  throw new Error('Missing MONGODB_URI. Add it to your environment variables.');
}

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true
  })
);
app.use(express.json());
app.use(cookieParser());

const client = new MongoClient(MONGODB_URI);
let usersCollection;
let contractsCollection;
let rostersCollection;
let documentRequestsCollection;
let auditLogsCollection;
let messagesCollection;

// checks the session cookie on every protected request
const requireAuth = makeRequireAuth(() => usersCollection, recordAuditLog);

function normalizeRole(role) {
  const normalized = String(role || 'student').toLowerCase().trim();
  return allowedRoles.has(normalized) ? normalized : 'student';
}

function serializeUser(user, resolvedSchool) {
  const matchedSchool = resolvedSchool || resolveSchoolFromEmail(user.email);

  return {
    id: String(user._id || user.id || ''),
    email: user.email,
    role: user.role,
    school: user.school || matchedSchool?.school || null,
    ncaaDivision: user.ncaaDivision || matchedSchool?.division || null
  };
}

async function recordAuditLog(action, details = {}) {
  try {
    await auditLogsCollection.insertOne({
      action,
      userId: details.userId || null,
      email: details.email || null,
      ip: details.ip || null,
      createdAt: new Date()
    });
  } catch (error) {
    // audit logging should never break the request itself
    console.error('Failed to write audit log:', error.message);
  }
}

function buildStoredFileName(contractId, originalName) {
  const sanitizedName = String(originalName || 'contract.pdf')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_');

  return `${contractId}-${sanitizedName.toLowerCase().endsWith('.pdf') ? sanitizedName : `${sanitizedName}.pdf`}`;
}


function getDefaultAgreementMetadata() {
  return {
    athleteName: '',
    brandPayer: '',
    contractValue: '',
    startDate: '',
    endDate: '',
    deliverables: [],
    paymentStatus: 'Not recorded',
    disclosureStatus: 'Pending',
    amendments: []
  };
}

function normalizeAgreementMetadata(metadata = {}) {
  const defaults = getDefaultAgreementMetadata();

  return {
    athleteName: String(metadata.athleteName || '').trim(),
    brandPayer: String(metadata.brandPayer || '').trim(),
    contractValue: String(metadata.contractValue || '').trim(),
    startDate: String(metadata.startDate || '').trim(),
    endDate: String(metadata.endDate || '').trim(),
    deliverables: Array.isArray(metadata.deliverables)
      ? metadata.deliverables
          .map((item) => String(item || '').trim())
          .filter(Boolean)
      : defaults.deliverables,
    paymentStatus: String(metadata.paymentStatus || defaults.paymentStatus).trim(),
    disclosureStatus: String(metadata.disclosureStatus || defaults.disclosureStatus).trim(),
    amendments: Array.isArray(metadata.amendments)
      ? metadata.amendments
          .map((amendment) => ({
            date: String(amendment?.date || '').trim(),
            notes: String(amendment?.notes || '').trim()
          }))
          .filter((amendment) => amendment.date || amendment.notes)
      : defaults.amendments
  };
}

function mergeExtractedAgreementMetadata(existing, extracted) {
  const current = normalizeAgreementMetadata(existing);
  const detected = normalizeAgreementMetadata(extracted);

  return {
    athleteName: current.athleteName || detected.athleteName,
    brandPayer: current.brandPayer || detected.brandPayer,
    contractValue: current.contractValue || detected.contractValue,
    startDate: current.startDate || detected.startDate,
    endDate: current.endDate || detected.endDate,
    deliverables: current.deliverables.length
      ? current.deliverables
      : detected.deliverables,
    paymentStatus: current.paymentStatus !== 'Not recorded'
      ? current.paymentStatus
      : detected.paymentStatus,
    disclosureStatus: current.disclosureStatus !== 'Pending'
      ? current.disclosureStatus
      : detected.disclosureStatus,
    amendments: current.amendments.length
      ? current.amendments
      : detected.amendments
  };
}

async function hydrateLegacyContractMetadata(contract) {
  const existing = normalizeAgreementMetadata(contract.agreementMetadata);

  const needsExtraction =
    contract.agreementMetadataVersion !== AGREEMENT_METADATA_VERSION ||
    !contract.agreementMetadata ||
    !Object.prototype.hasOwnProperty.call(contract.agreementMetadata, 'athleteName') ||
    !Array.isArray(contract.agreementMetadata.amendments);

  if (!needsExtraction || !contract.storedFilePath) {
    return contract;
  }

  try {
    const fileBuffer = await fs.readFile(contract.storedFilePath);
    const screening = await analyzeContractPdf(fileBuffer, contract.fileName);
    const mergedMetadata = mergeExtractedAgreementMetadata(
      existing,
      screening.agreementMetadata
    );

    await contractsCollection.updateOne(
      {
        contractId: contract.contractId,
        userId: contract.userId
      },
      {
        $set: {
          agreementMetadata: mergedMetadata,
          agreementMetadataVersion: AGREEMENT_METADATA_VERSION
        }
      }
    );

    return {
      ...contract,
      agreementMetadata: mergedMetadata,
      agreementMetadataVersion: AGREEMENT_METADATA_VERSION
    };
  } catch (_error) {
    return contract;
  }
}

function serializeContract(contract) {
  return {
    id: contract.contractId,
    fileName: contract.fileName,
    fileSize: contract.fileSize,
    createdAt: contract.createdAt,
    updatedAt: contract.updatedAt,
    lastAccessedAt: contract.lastAccessedAt,
    accessCount: contract.accessCount,
    uploadedBy: contract.userId,
    agreementMetadata: normalizeAgreementMetadata(contract.agreementMetadata)
  };
}

function serializeDocumentRequest(documentRequest) {
  const timeline = [...(documentRequest.timeline || [])];
  if (!timeline.some((event) => event.type === 'submitted') && documentRequest.submittedAt) {
    timeline.unshift({ type: 'submitted', at: documentRequest.submittedAt });
  }
  if (
    ['accepted', 'rejected'].includes(documentRequest.status) &&
    documentRequest.reviewedAt &&
    !timeline.some((event) => event.type === 'closed')
  ) {
    timeline.push({ type: 'closed', outcome: documentRequest.status, at: documentRequest.reviewedAt });
  }

  return {
    id: documentRequest.requestId,
    contractId: documentRequest.contractId,
    contractFileName: documentRequest.contractFileName,
    contractFileSize: documentRequest.contractFileSize,
    studentUserId: documentRequest.studentUserId,
    studentEmail: documentRequest.studentEmail,
    studentSchool: documentRequest.studentSchool,
    studentDivision: documentRequest.studentDivision,
    assignedComplianceUserId: documentRequest.assignedComplianceUserId || null,
    assignedComplianceEmail: documentRequest.assignedComplianceEmail || null,
    status: documentRequest.status,
    submittedAt: documentRequest.submittedAt,
    updatedAt: documentRequest.updatedAt,
    reviewedAt: documentRequest.reviewedAt || null,
    reviewedBy: documentRequest.reviewedBy || null,
    reviewerEmail: documentRequest.reviewerEmail || null,
    reviewDueAt: getReviewDueAt(documentRequest),
    guidelines: documentRequest.guidelines?.length
      ? documentRequest.guidelines
      : buildGuidelineReviews([], null),
    timeline,
    hasSourceFile: Boolean(documentRequest.storedFilePath)
  };
}

function serializeMessage(message) {
  return {
    id: message.messageId,
    requestId: message.requestId || null,
    contractId: message.contractId || null,
    senderUserId: message.senderUserId,
    senderEmail: message.senderEmail,
    senderSchool: message.senderSchool || null,
    recipientEmail: message.recipientEmail,
    recipientUserId: message.recipientUserId || null,
    subject: message.subject,
    body: message.body,
    isRead: Boolean(message.isRead),
    createdAt: message.createdAt
  };
}

function assertUserRole(user, ...roles) {
  if (roles.includes(user.role)) {
    return;
  }

  const error = new Error('This action is not permitted for the current user role.');
  error.statusCode = 403;
  throw error;
}

function normalizeCsvHeader(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function parseCsvBuffer(buffer) {
  const text = String(buffer || '').replace(/^\uFEFF/, '');
  const rows = [];
  let currentField = '';
  let currentRow = [];
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (insideQuotes && nextCharacter === '"') {
        currentField += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }

      continue;
    }

    if (!insideQuotes && character === ',') {
      currentRow.push(currentField);
      currentField = '';
      continue;
    }

    if (!insideQuotes && (character === '\n' || character === '\r')) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1;
      }

      currentRow.push(currentField);
      const hasValues = currentRow.some((value) => String(value || '').trim() !== '');

      if (hasValues) {
        rows.push(currentRow);
      }

      currentField = '';
      currentRow = [];
      continue;
    }

    currentField += character;
  }

  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField);

    if (currentRow.some((value) => String(value || '').trim() !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function buildRosterGroups(buffer) {
  const csvRows = parseCsvBuffer(buffer);

  if (csvRows.length < 2) {
    const error = new Error('The CSV must include a header row and at least one player row.');
    error.statusCode = 400;
    throw error;
  }

  const headerRow = csvRows[0].map(normalizeCsvHeader);
  const requiredColumns = ['student_id', 'first_name', 'last_name', 'school', 'sport', 'year'];
  const missingColumns = requiredColumns.filter((column) => !headerRow.includes(column));

  if (missingColumns.length > 0) {
    const error = new Error(`The CSV is missing required columns: ${missingColumns.join(', ')}.`);
    error.statusCode = 400;
    throw error;
  }

  const columnIndexes = headerRow.reduce((accumulator, columnName, index) => {
    if (!(columnName in accumulator)) {
      accumulator[columnName] = index;
    }

    return accumulator;
  }, {});

  const groupedRosters = new Map();

  csvRows.slice(1).forEach((row, rowIndex) => {
    const player = {
      studentId: String(row[columnIndexes.student_id] || '').trim(),
      firstName: String(row[columnIndexes.first_name] || '').trim(),
      lastName: String(row[columnIndexes.last_name] || '').trim(),
      school: String(row[columnIndexes.school] || '').trim(),
      sport: String(row[columnIndexes.sport] || '').trim(),
      year: String(row[columnIndexes.year] || '').trim()
    };

    const hasMissingValue = Object.values(player).some((value) => value === '');

    if (hasMissingValue) {
      const error = new Error(`Row ${rowIndex + 2} contains blank required values.`);
      error.statusCode = 400;
      throw error;
    }

    const groupKey = `${player.school.toLowerCase()}::${player.sport.toLowerCase()}::${player.year.toLowerCase()}`;

    if (!groupedRosters.has(groupKey)) {
      groupedRosters.set(groupKey, {
        school: player.school,
        sport: player.sport,
        year: player.year,
        players: []
      });
    }

    groupedRosters.get(groupKey).players.push({
      studentId: player.studentId,
      firstName: player.firstName,
      lastName: player.lastName
    });
  });

  return Array.from(groupedRosters.values());
}

function serializeRoster(roster) {
  return {
    id: roster.rosterId,
    school: roster.school,
    sport: roster.sport,
    year: roster.year,
    playerCount: roster.playerCount,
    fileName: roster.sourceFileName,
    hasSourceFile: Boolean(roster.storedFilePath),
    createdAt: roster.createdAt,
    updatedAt: roster.updatedAt
  };
}

async function deleteRosterFileIfUnused(storedFilePath) {
  if (!storedFilePath) {
    return;
  }

  const remainingReferenceCount = await rostersCollection.countDocuments({ storedFilePath });

  if (remainingReferenceCount > 0) {
    return;
  }

  try {
    await fs.unlink(storedFilePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// everything below needs a logged in user
app.use('/api/contracts', requireAuth);
app.use('/api/rosters', requireAuth);
app.use('/api/compliance', requireAuth);

app.get('/api/contracts', async (req, res, next) => {
  try {
    const userId = String(req.user._id);
    const sortBy = req.query.sortBy === 'createdAt' ? 'createdAt' : 'lastAccessedAt';
    const sortDirection = req.query.sortDirection === 'asc' ? 1 : -1;

    const contracts = await contractsCollection
      .find({ userId })
      .sort({ [sortBy]: sortDirection, createdAt: -1 })
      .toArray();

    const hydratedContracts = await Promise.all(
      contracts.map(hydrateLegacyContractMetadata)
    );

    res.json({
      contracts: hydratedContracts.map(serializeContract)
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/rosters', async (req, res, next) => {
  try {
    const userId = String(req.user._id);
    const rosters = await rostersCollection
      .find({ userId })
      .sort({ updatedAt: -1, school: 1, sport: 1, year: 1 })
      .toArray();

    res.json({
      rosters: rosters.map(serializeRoster)
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/rosters', rosterUpload.single('file'), async (req, res, next) => {
  try {
    const user = req.user;
    const userId = String(user._id);
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'A CSV file is required.' });
    }

    const rosterGroups = buildRosterGroups(file.buffer.toString('utf8'));

    if (user.school) {
      const normalizedAssignedSchool = user.school.toLowerCase().trim();
      const hasMismatchedSchool = rosterGroups.some(
        (rosterGroup) => rosterGroup.school.toLowerCase().trim() !== normalizedAssignedSchool
      );

      if (hasMismatchedSchool) {
        return res.status(403).json({
          message: `Roster uploads for this account must match the assigned school: ${user.school}.`
        });
      }
    }

    const now = new Date();
    const savedRosters = [];
    const staleFilePaths = new Set();
    const rosterUploadId = `RST-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const userUploadDirectory = path.join(rosterUploadsRoot, userId);
    const storedFileName = buildStoredFileName(rosterUploadId, file.originalname);
    const storedFilePath = path.join(userUploadDirectory, storedFileName);

    await fs.mkdir(userUploadDirectory, { recursive: true });
    await fs.writeFile(storedFilePath, file.buffer);

    for (const rosterGroup of rosterGroups) {
      const rosterId = `${userId}-${rosterGroup.school}-${rosterGroup.sport}-${rosterGroup.year}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const existingRoster = await rostersCollection.findOne({
        userId,
        school: rosterGroup.school,
        sport: rosterGroup.sport,
        year: rosterGroup.year
      });

      if (existingRoster?.storedFilePath && existingRoster.storedFilePath !== storedFilePath) {
        staleFilePaths.add(existingRoster.storedFilePath);
      }

      await rostersCollection.updateOne(
        {
          userId,
          school: rosterGroup.school,
          sport: rosterGroup.sport,
          year: rosterGroup.year
        },
        {
          $set: {
            rosterId,
            school: rosterGroup.school,
            sport: rosterGroup.sport,
            year: rosterGroup.year,
            players: rosterGroup.players,
            playerCount: rosterGroup.players.length,
            sourceFileName: file.originalname,
            storedFileName,
            storedFilePath,
            updatedAt: now
          },
          $setOnInsert: {
            createdAt: now
          }
        },
        {
          upsert: true
        }
      );

      const savedRoster = await rostersCollection.findOne({
        userId,
        school: rosterGroup.school,
        sport: rosterGroup.sport,
        year: rosterGroup.year
      });

      if (savedRoster) {
        savedRosters.push(savedRoster);
      }
    }

    for (const staleFilePath of staleFilePaths) {
      await deleteRosterFileIfUnused(staleFilePath);
    }

    return res.status(201).json({
      message: `Processed ${savedRosters.length} roster ${savedRosters.length === 1 ? 'group' : 'groups'} from CSV upload.`,
      rosters: savedRosters.map(serializeRoster)
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/rosters/:rosterId/file', async (req, res, next) => {
  try {
    const userId = String(req.user._id);
    const { rosterId } = req.params;
    const roster = await rostersCollection.findOne({ rosterId, userId });

    if (!roster) {
      return res.status(404).json({ message: 'Roster not found for the current user.' });
    }

    if (!roster.storedFilePath) {
      return res.status(404).json({ message: 'No CSV file is stored for this roster.' });
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${roster.sourceFileName || 'roster.csv'}"`);
    return res.sendFile(roster.storedFilePath);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/rosters/:rosterId', async (req, res, next) => {
  try {
    const userId = String(req.user._id);
    const { rosterId } = req.params;
    const roster = await rostersCollection.findOne({ rosterId, userId });

    if (!roster) {
      return res.status(404).json({ message: 'Roster not found for the current user.' });
    }

    await rostersCollection.deleteOne({ rosterId, userId });
    await deleteRosterFileIfUnused(roster.storedFilePath);

    return res.json({ message: 'Roster deleted successfully.' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/contracts', contractUpload.single('file'), async (req, res, next) => {
  try {
    const userId = String(req.user._id);
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'A PDF file is required.' });
    }

    const contractScreening = await analyzeContractPdf(file.buffer, file.originalname);

    if (!contractScreening.isContract) {
      return res.status(400).json({
        code: 'NOT_A_CONTRACT',
        message: 'Upload rejected: this PDF does not appear to be a contract.'
      });
    }

    const contractId = `CTR-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const userUploadDirectory = path.join(uploadsRoot, userId);
    const storedFileName = buildStoredFileName(contractId, file.originalname);
    const storedFilePath = path.join(userUploadDirectory, storedFileName);
    const now = new Date();

    await fs.mkdir(userUploadDirectory, { recursive: true });
    await fs.writeFile(storedFilePath, file.buffer);

    const contractDocument = {
      contractId,
      userId,
      fileName: file.originalname,
      storedFileName,
      storedFilePath,
      fileSize: file.size,
      mimeType: file.mimetype || 'application/pdf',
      aiScreening: {
        score: contractScreening.score,
        positiveSignals: contractScreening.positiveSignals,
        negativeSignals: contractScreening.negativeSignals,
        textLength: contractScreening.textLength,
        findings: contractScreening.findings,
        screenedAt: now
      },
      agreementMetadata: normalizeAgreementMetadata(
        contractScreening.agreementMetadata
      ),
      agreementMetadataVersion: AGREEMENT_METADATA_VERSION,
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
      accessCount: 0
    };

    await contractsCollection.insertOne(contractDocument);

    return res.status(201).json({
      message: 'Contract uploaded successfully.',
      contract: serializeContract(contractDocument)
    });
  } catch (error) {
    next(error);
  }
});


/*
 * Persist editable agreement metadata for a student-owned contract.
 */
app.patch('/api/contracts/:contractId/metadata', async (req, res, next) => {
  try {
    const userId = String(req.user._id);
    const { contractId } = req.params;
    const incomingMetadata = req.body?.metadata || {};

    if (!contractId) {
      return res.status(400).json({
        message: 'A contract id is required.'
      });
    }

    const contract = await contractsCollection.findOne({
      contractId,
      userId
    });

    if (!contract) {
      return res.status(404).json({
        message: 'Contract not found for the current user.'
      });
    }

    const existing = normalizeAgreementMetadata(contract.agreementMetadata);

    const normalizeString = (value, fallback = '') => {
      if (value === null || value === undefined) {
        return fallback;
      }
      return String(value).trim();
    };

    const deliverables = Array.isArray(incomingMetadata.deliverables)
      ? incomingMetadata.deliverables
          .map((item) => normalizeString(item))
          .filter(Boolean)
      : existing.deliverables;

    const amendments = Array.isArray(incomingMetadata.amendments)
      ? incomingMetadata.amendments
          .map((amendment) => ({
            date: normalizeString(amendment?.date),
            notes: normalizeString(amendment?.notes)
          }))
          .filter((amendment) => amendment.date || amendment.notes)
      : existing.amendments;

    const metadata = {
      athleteName: normalizeString(
        incomingMetadata.athleteName,
        existing.athleteName
      ),
      brandPayer: normalizeString(
        incomingMetadata.brandPayer,
        existing.brandPayer
      ),
      contractValue: normalizeString(
        incomingMetadata.contractValue,
        existing.contractValue
      ),
      startDate: normalizeString(
        incomingMetadata.startDate,
        existing.startDate
      ),
      endDate: normalizeString(
        incomingMetadata.endDate,
        existing.endDate
      ),
      deliverables,
      paymentStatus: normalizeString(
        incomingMetadata.paymentStatus,
        existing.paymentStatus
      ),
      disclosureStatus: normalizeString(
        incomingMetadata.disclosureStatus,
        existing.disclosureStatus
      ),
      amendments
    };

    const now = new Date();

    await contractsCollection.updateOne(
      { contractId, userId },
      {
        $set: {
          agreementMetadata: metadata,
          agreementMetadataVersion: AGREEMENT_METADATA_VERSION,
          updatedAt: now
        }
      }
    );

    const updatedContract = await contractsCollection.findOne({
      contractId,
      userId
    });

    return res.json({
      message: 'Agreement details saved successfully.',
      contract: serializeContract(updatedContract)
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/contracts/:contractId/file', async (req, res, next) => {
  try {
    const userId = String(req.user._id);
    const { contractId } = req.params;
    const contract = await contractsCollection.findOne({ contractId, userId });

    if (!contract) {
      return res.status(404).json({ message: 'Contract not found for the current user.' });
    }

    const now = new Date();
    await contractsCollection.updateOne(
      { contractId, userId },
      {
        $set: {
          lastAccessedAt: now,
          updatedAt: now
        },
        $inc: {
          accessCount: 1
        }
      }
    );

    await documentRequestsCollection.updateMany(
      { contractId, studentUserId: userId },
      {
        $push: {
          timeline: {
            type: 'opened',
            at: now,
            actorUserId: userId,
            actorEmail: req.user.email
          }
        },
        $set: { updatedAt: now }
      }
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${contract.fileName}"`);
    return res.sendFile(contract.storedFilePath);
  } catch (error) {
    next(error);
  }
});

app.get('/api/compliance/requests', async (req, res, next) => {
  try {
    const user = req.user;
    const userId = String(user._id);

    if (user.role === 'student') {
      const requests = await documentRequestsCollection
        .find({ studentUserId: userId })
        .sort({ submittedAt: -1, updatedAt: -1 })
        .toArray();

      return res.json({
        requests: requests.map(serializeDocumentRequest)
      });
    }

    assertUserRole(user, 'compliance');

    const requests = await documentRequestsCollection
      .find({ assignedComplianceUserId: userId })
      .sort({ status: 1, submittedAt: -1, updatedAt: -1 })
      .toArray();

    return res.json({
      requests: requests.map(serializeDocumentRequest)
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/compliance/requests', async (req, res, next) => {
  try {
    const user = req.user;
    const userId = String(user._id);
    assertUserRole(user, 'student', 'compliance');

    const contractId = String(req.body?.contractId || '').trim();
    const complianceEmail = String(req.body?.complianceEmail || '').toLowerCase().trim();

    if (!contractId) {
      return res.status(400).json({ message: 'A contract id is required.' });
    }

    if (!complianceEmail) {
      return res.status(400).json({ message: 'A compliance officer email is required.' });
    }

    const contract = await contractsCollection.findOne({ contractId, userId });

    if (!contract) {
      return res.status(404).json({ message: 'Contract not found for the current student.' });
    }

    const complianceOfficer = await usersCollection.findOne({
      email: complianceEmail,
      role: 'compliance',
      school: user.school
    });

    if (!complianceOfficer) {
      return res.status(404).json({
        message: 'No compliance officer account with that email was found for your school.'
      });
    }

    let guidelineFindings = contract.aiScreening?.findings;
    if (!Array.isArray(guidelineFindings) || guidelineFindings.length === 0) {
      const contractBuffer = await fs.readFile(contract.storedFilePath);
      const contractAnalysis = await analyzeContractPdf(contractBuffer, contract.fileName);
      guidelineFindings = contractAnalysis.findings;
      await contractsCollection.updateOne(
        { contractId, userId },
        { $set: { 'aiScreening.findings': guidelineFindings, updatedAt: new Date() } }
      );
    }

    const now = new Date();
    const reviewDueAt = new Date(now.getTime() + COMPLIANCE_REVIEW_DAYS * 24 * 60 * 60 * 1000);
    const existingRequest = await documentRequestsCollection.findOne({ studentUserId: userId, contractId });
    const requestId = existingRequest?.requestId || `REQ-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;

    await documentRequestsCollection.updateOne(
      { studentUserId: userId, contractId },
      {
        $set: {
          requestId,
          contractId,
          contractFileName: contract.fileName,
          contractFileSize: contract.fileSize,
          storedFilePath: contract.storedFilePath,
          mimeType: contract.mimeType || 'application/pdf',
          studentUserId: userId,
          studentEmail: user.email,
          studentSchool: user.school || null,
          studentDivision: user.ncaaDivision || null,
          assignedComplianceUserId: complianceOfficer._id.toString(),
          assignedComplianceEmail: complianceOfficer.email,
          status: 'pending',
          reviewDueAt,
          guidelines: buildGuidelineReviews(guidelineFindings, null),
          reviewedAt: null,
          reviewedBy: null,
          reviewerEmail: null,
          updatedAt: now,
          submittedAt: now,
          timeline: [
            ...(existingRequest?.timeline || []),
            {
              type: 'submitted',
              at: now,
              actorUserId: userId,
              actorEmail: user.email
            }
          ]
        },
        $setOnInsert: {
          createdAt: now
        }
      },
      { upsert: true }
    );

    const savedRequest = await documentRequestsCollection.findOne({ studentUserId: userId, contractId });

    return res.status(existingRequest ? 200 : 201).json({
      message: `Document submitted to ${complianceOfficer.email} for review.`,
      request: serializeDocumentRequest(savedRequest)
    });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/compliance/requests/:requestId', async (req, res, next) => {
  try {
    const user = req.user;
    const userId = String(user._id);
    assertUserRole(user, 'compliance');

    const { requestId } = req.params;
    const nextStatus = String(req.body?.status || '').trim().toLowerCase();
    const submittedGuidelines = Array.isArray(req.body?.guidelines) ? req.body.guidelines : [];

    if (!['accepted', 'rejected'].includes(nextStatus)) {
      return res.status(400).json({ message: 'Status must be accepted or rejected.' });
    }

    const documentRequest = await documentRequestsCollection.findOne({ requestId, assignedComplianceUserId: userId });

    if (!documentRequest) {
      return res.status(404).json({ message: 'Compliance request not found for the current officer.' });
    }

    const existingGuidelines = documentRequest.guidelines?.length
      ? documentRequest.guidelines
      : buildGuidelineReviews([], null);
    if (existingGuidelines.length === 0 || submittedGuidelines.length !== existingGuidelines.length) {
      return res.status(400).json({ message: 'Review every NIL guideline before updating the contract.' });
    }

    let guidelineValidationMessage = '';
    const reviewedGuidelines = existingGuidelines.map((guideline) => {
      const submitted = submittedGuidelines.find((item) => item.id === guideline.id);
      const decision = String(submitted?.decision || '').trim().toLowerCase();
      const feedback = String(submitted?.feedback || '').trim();
      const hasSubmittedDueAt = submitted && Object.prototype.hasOwnProperty.call(submitted, 'dueAt');
      const submittedDueAt = hasSubmittedDueAt
        ? (submitted.dueAt ? new Date(submitted.dueAt) : null)
        : (guideline.dueAt ? new Date(guideline.dueAt) : null);

      if (!['pass', 'needs_changes'].includes(decision)) {
        guidelineValidationMessage = `A decision is required for ${guideline.title}.`;
      }

      if (decision === 'needs_changes' && !feedback) {
        guidelineValidationMessage = `Feedback is required for ${guideline.title}.`;
      }

      if (submittedDueAt && Number.isNaN(submittedDueAt.getTime())) {
        guidelineValidationMessage = `A valid due date is required for ${guideline.title}.`;
      }

      return {
        ...guideline,
        decision,
        feedback,
        dueAt: submittedDueAt,
        reviewedAt: new Date()
      };
    });

    if (guidelineValidationMessage) {
      return res.status(400).json({ message: guidelineValidationMessage });
    }

    if (nextStatus === 'accepted' && reviewedGuidelines.some((guideline) => guideline.decision !== 'pass')) {
      return res.status(400).json({ message: 'A contract can only be accepted when every NIL guideline passes.' });
    }

    const now = new Date();

    await documentRequestsCollection.updateOne(
      { requestId },
      {
        $set: {
          status: nextStatus,
          guidelines: reviewedGuidelines,
          reviewedAt: now,
          reviewedBy: userId,
          reviewerEmail: user.email,
          updatedAt: now,
          timeline: [
            ...(documentRequest.timeline || []),
            {
              type: 'closed',
              outcome: nextStatus,
              at: now,
              actorUserId: userId,
              actorEmail: user.email
            }
          ]
        }
      }
    );

    await contractsCollection.updateOne(
      {
        contractId: documentRequest.contractId,
        userId: documentRequest.studentUserId
      },
      {
        $set: {
          'agreementMetadata.disclosureStatus':
            nextStatus === 'accepted' ? 'Approved' : 'Rejected',
          updatedAt: now
        }
      }
    );

    const updatedRequest = await documentRequestsCollection.findOne({ requestId });

    return res.json({
      message: `Document request ${nextStatus}.`,
      request: serializeDocumentRequest(updatedRequest)
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/compliance/requests/:requestId/file', async (req, res, next) => {
  try {
    const user = req.user;
    const userId = String(user._id);
    const { requestId } = req.params;

    let documentRequest;

    if (user.role === 'student') {
      documentRequest = await documentRequestsCollection.findOne({ requestId, studentUserId: userId });
    } else {
      assertUserRole(user, 'compliance');
      documentRequest = await documentRequestsCollection.findOne({ requestId, assignedComplianceUserId: userId });
    }

    if (!documentRequest) {
      return res.status(404).json({ message: 'Requested document could not be found.' });
    }

    if (!documentRequest.storedFilePath) {
      return res.status(404).json({ message: 'No document file is stored for this request.' });
    }

    await documentRequestsCollection.updateOne(
      { requestId },
      {
        $set: {
          timeline: [
            ...(documentRequest.timeline || []),
            {
              type: 'opened',
              at: new Date(),
              actorUserId: userId,
              actorEmail: user.email
            }
          ],
          updatedAt: new Date()
        }
      }
    );

    res.setHeader('Content-Type', documentRequest.mimeType || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${documentRequest.contractFileName || 'document.pdf'}"`);
    return res.sendFile(documentRequest.storedFilePath);
  } catch (error) {
    next(error);
  }
});

app.get('/api/compliance/messages', async (req, res, next) => {
  try {
    const user = req.user;
    const userId = String(user._id);

    const assignedRequestQuery = user.role === 'compliance'
      ? { assignedComplianceUserId: userId }
      : { studentUserId: userId };
    const assignedRequests = await documentRequestsCollection.find(assignedRequestQuery).project({ requestId: 1 }).toArray();
    const requestIds = assignedRequests.map((request) => request.requestId);
    const messages = await messagesCollection
      .find({ requestId: { $in: requestIds } })
      .sort({ createdAt: -1 })
      .toArray();

    return res.json({ messages: messages.map(serializeMessage) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/compliance/messages', async (req, res, next) => {
  try {
    const user = req.user;
    const userId = String(user._id);
    assertUserRole(user, 'student', 'compliance');

    const requestId = String(req.body?.requestId || '').trim();
    const subject = String(req.body?.subject || '').trim();
    const body = String(req.body?.body || '').trim();

    if (!requestId) {
      return res.status(400).json({ message: 'A contract request is required for messaging.' });
    }

    if (!body) {
      return res.status(400).json({ message: 'A message body is required.' });
    }

    const request = user.role === 'compliance'
      ? await documentRequestsCollection.findOne({ requestId, assignedComplianceUserId: userId })
      : await documentRequestsCollection.findOne({ requestId, studentUserId: userId });

    if (!request) {
      return res.status(403).json({ message: 'You can only message users assigned to this contract.' });
    }

    const recipientUserId = user.role === 'compliance' ? request.studentUserId : request.assignedComplianceUserId;
    const recipientEmail = user.role === 'compliance' ? request.studentEmail : request.assignedComplianceEmail;

    const messageId = `MSG-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date();

    await messagesCollection.insertOne({
      messageId,
      requestId,
      contractId: request.contractId,
      senderUserId: userId,
      senderEmail: user.email,
      senderSchool: user.school || null,
      recipientEmail,
      recipientUserId,
      subject: subject || '(No subject)',
      body,
      isRead: false,
      createdAt: now
    });

    return res.status(201).json({ message: `Message sent to ${recipientEmail}.` });
  } catch (error) {
    next(error);
  }
});

app.post('/api/compliance/accounts', async (req, res, next) => {
  try {
    const user = req.user;
    assertUserRole(user, 'compliance');

    const { email, password, role } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    if (!isEduEmail(email)) {
      return res.status(400).json({ message: 'Use an official university .edu email address.' });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const normalizedRole = normalizeRole(role);
    const resolvedSchool = resolveSchoolFromEmail(normalizedEmail);

    const existingUser = await usersCollection.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);

    const insertResult = await usersCollection.insertOne({
      email: normalizedEmail,
      passwordHash,
      role: normalizedRole,
      school: resolvedSchool ? resolvedSchool.school : user.school || null,
      ncaaDivision: resolvedSchool ? resolvedSchool.division : user.ncaaDivision || null,
      schoolEmailDomain: resolvedSchool ? resolvedSchool.primaryDomain : null,
      createdBy: String(user._id),
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await recordAuditLog('account_created_by_compliance', {
      userId: String(insertResult.insertedId),
      email: normalizedEmail,
      ip: req.ip
    });

    return res.status(201).json({
      message: 'Account created successfully.',
      user: serializeUser(
        {
          _id: insertResult.insertedId,
          email: normalizedEmail,
          role: normalizedRole,
          school: resolvedSchool ? resolvedSchool.school : user.school || null,
          ncaaDivision: resolvedSchool ? resolvedSchool.division : user.ncaaDivision || null
        },
        resolvedSchool
      )
    });
  } catch (error) {
    next(error);
  }
});


function buildUnsupportedSchoolEmailMessage() {
  return 'Use a supported school email address.';
}

app.post('/api/auth/register', async (req, res) => {
  const { email, password, role } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  if (!isEduEmail(email)) {
    return res.status(400).json({ message: 'Use your official university .edu email address.' });
  }

  if (!isStrongPassword(password)) {
    return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const normalizedRole = normalizeRole(role);
  const resolvedSchool = resolveSchoolFromEmail(normalizedEmail);

  if (!resolvedSchool) {
    return res.status(400).json({
      message: buildUnsupportedSchoolEmailMessage()
    });
  }

  const existingUser = await usersCollection.findOne({ email: normalizedEmail });
  if (existingUser) {
    return res.status(409).json({ message: 'An account with this email already exists.' });
  }

  const passwordHash = await bcrypt.hash(String(password), 10);

  const insertResult = await usersCollection.insertOne({
    email: normalizedEmail,
    passwordHash,
    role: normalizedRole,
    school: resolvedSchool ? resolvedSchool.school : null,
    ncaaDivision: resolvedSchool ? resolvedSchool.division : null,
    schoolEmailDomain: resolvedSchool ? resolvedSchool.primaryDomain : null,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  await recordAuditLog('register', { userId: String(insertResult.insertedId), email: normalizedEmail, ip: req.ip });

  const token = signToken({ _id: insertResult.insertedId, role: normalizedRole });
  setAuthCookie(res, token);

  return res.status(201).json({
    message: 'Registration successful.',
    user: serializeUser(
      {
        _id: insertResult.insertedId,
        email: normalizedEmail,
        role: normalizedRole,
        school: resolvedSchool ? resolvedSchool.school : null,
        ncaaDivision: resolvedSchool ? resolvedSchool.division : null
      },
      resolvedSchool
    )
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password, role } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  if (!isEduEmail(email)) {
    return res.status(403).json({ message: 'Use your official university .edu email address.' });
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const expectedRole = normalizeRole(role);
  const resolvedSchool = resolveSchoolFromEmail(normalizedEmail);

  if (!resolvedSchool) {
    return res.status(403).json({
      message: buildUnsupportedSchoolEmailMessage()
    });
  }

  const user = await usersCollection.findOne({ email: normalizedEmail });

  if (!user) {
    await recordAuditLog('login_failed', { email: normalizedEmail, ip: req.ip });
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  // lock the account for 15 minutes after 3 failed attempts
  const now = new Date();
  if (user.lockUntil && user.lockUntil > now) {
    const minutesLeft = Math.ceil((user.lockUntil - now) / 60000);
    return res.status(423).json({
      message: `Too many failed login attempts. Try again in ${minutesLeft} minute(s).`
    });
  }

  const passwordMatches = await bcrypt.compare(String(password), user.passwordHash);
  if (!passwordMatches) {
    const attempts = (user.failedLoginAttempts || 0) + 1;
    const update = {
      $set: {
        failedLoginAttempts: attempts,
        updatedAt: now
      }
    };

    if (attempts >= 3) {
      update.$set.lockUntil = new Date(now.getTime() + 15 * 60 * 1000);
      await recordAuditLog('lockout', { userId: String(user._id), email: normalizedEmail, ip: req.ip });
    }

    await usersCollection.updateOne({ _id: user._id }, update);
    await recordAuditLog('login_failed', { userId: String(user._id), email: normalizedEmail, ip: req.ip });
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  if (role && user.role !== expectedRole) {
    return res.status(403).json({ message: `This account is registered as ${user.role}, not ${expectedRole}.` });
  }

  // keep the school fields up to date when the directory recognizes the domain
  if (
    resolvedSchool &&
    (user.school !== resolvedSchool.school ||
      user.ncaaDivision !== resolvedSchool.division ||
      user.schoolEmailDomain !== resolvedSchool.primaryDomain)
  ) {
    await usersCollection.updateOne(
      { _id: user._id },
      {
        $set: {
          school: resolvedSchool.school,
          ncaaDivision: resolvedSchool.division,
          schoolEmailDomain: resolvedSchool.primaryDomain,
          updatedAt: new Date()
        }
      }
    );
  }

  // successful login resets the failed attempt counter
  await usersCollection.updateOne(
    { _id: user._id },
    {
      $set: {
        failedLoginAttempts: 0,
        lockUntil: null,
        lastLoginAt: now,
        lastLoginIp: req.ip || null
      }
    }
  );

  const token = signToken(user);
  setAuthCookie(res, token);
  await recordAuditLog('login_success', { userId: String(user._id), email: normalizedEmail, ip: req.ip });

  return res.json({
    message: 'Login successful.',
    user: serializeUser(user, resolvedSchool)
  });
});

app.post('/api/auth/logout', (req, res) => {
  clearAuthCookie(res);
  return res.json({ message: 'Logged out.' });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  return res.json({ user: serializeUser(req.user) });
});

// Delete a contract (student-owned)
app.delete('/api/contracts/:contractId', async (req, res, next) => {
  try {
    const userId = String(req.user._id);
    const { contractId } = req.params;
    const contract = await contractsCollection.findOne({ contractId, userId });
    if (!contract) {
      return res.status(404).json({ message: 'Contract not found for the current user.' });
    }
    // Remove contract record
    await contractsCollection.deleteOne({ contractId, userId });
    // Remove file if unused
    if (contract.storedFilePath) {
      const remaining = await contractsCollection.countDocuments({ storedFilePath: contract.storedFilePath });
      if (remaining === 0) {
        try {
          await fs.unlink(contract.storedFilePath);
        } catch (err) {
          if (err?.code !== 'ENOENT') throw err;
        }
      }
    }
    return res.json({ message: 'Contract deleted successfully.' });
  } catch (error) {
    next(error);
  }
});

async function start() {
  await fs.mkdir(uploadsRoot, { recursive: true });
  await fs.mkdir(rosterUploadsRoot, { recursive: true });
  await client.connect();
  const db = client.db(DB_NAME);
  usersCollection = db.collection('users');
  contractsCollection = db.collection('contracts');
  rostersCollection = db.collection('rosters');
  documentRequestsCollection = db.collection('documentRequests');
  auditLogsCollection = db.collection('auditLogs');
  messagesCollection = db.collection('messages');

  await usersCollection.createIndex({ email: 1 }, { unique: true });
  await messagesCollection.createIndex({ recipientEmail: 1, createdAt: -1 });
  await messagesCollection.createIndex({ senderUserId: 1, createdAt: -1 });
  await contractsCollection.createIndex({ userId: 1, createdAt: -1 });
  await contractsCollection.createIndex({ userId: 1, lastAccessedAt: -1 });
  await contractsCollection.createIndex({ contractId: 1, userId: 1 }, { unique: true });
  await rostersCollection.createIndex({ userId: 1, updatedAt: -1 });
  await rostersCollection.createIndex({ userId: 1, school: 1, sport: 1, year: 1 }, { unique: true });
  await documentRequestsCollection.createIndex({ requestId: 1 }, { unique: true });
  await documentRequestsCollection.createIndex({ studentUserId: 1, submittedAt: -1 });
  await documentRequestsCollection.createIndex({ studentSchool: 1, status: 1, submittedAt: -1 });
  await documentRequestsCollection.createIndex({ studentUserId: 1, contractId: 1 }, { unique: true });
  await auditLogsCollection.createIndex({ createdAt: -1 });
  await auditLogsCollection.createIndex({ userId: 1, createdAt: -1 });

  // Contract analysis endpoint (must be after collections are initialized)
  app.get('/api/contracts/:contractId/analysis', async (req, res, next) => {
    try {
      const userId = String(req.user._id);
      const contractId = req.params.contractId;
      console.log('Contract analysis request:', { contractId, userId });
      if (!contractId) {
        return res.status(400).json({ message: 'Missing contractId.' });
      }

      // Find the contract in the database
      const contract = await contractsCollection.findOne({ contractId, userId });
      if (!contract) {
        console.log('Contract not found for analysis:', { contractId, userId });
        return res.status(404).json({ message: 'Contract not found.' });
      }

      // Read the contract PDF file
      if (!contract.storedFilePath) {
        console.log('Contract file not found for analysis:', { contractId, userId });
        return res.status(404).json({ message: 'Contract file not found.' });
      }
      const fileBuffer = await fs.readFile(contract.storedFilePath);

      // Analyze the contract
      const analysis = await analyzeContractPdf(fileBuffer, contract.fileName);

      // Use rule-based compliance findings from analysis
      const findings = analysis.findings || [];

      res.json({
        contract: serializeContract(contract),
        analysis,
        summary: {
          contractScreeningPassed: analysis.isContract,
          riskScore: analysis.score,
          flaggedFindingCount: findings.length,
          passedCheckpointCount: analysis.legalCategoryCount || 0,
          topSeverity: findings.some(f => f.severity === 'high') ? 'high' : 'low',
          generatedAt: new Date(),
          school: contract.school,
          division: contract.ncaaDivision,
          stateName: contract.schoolStateName
        },
        applicableRules: [],
        findings
      });
    } catch (error) {
      next(error);
    }
  });

  app.listen(PORT, () => {
    console.log(`Auth API listening on http://localhost:${PORT}`);
  });
}

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'File uploads exceed the allowed size limit.' });
  }

  if (error?.message === 'Only PDF files are allowed.') {
    return res.status(400).json({ message: error.message });
  }

  if (error?.message === 'Only CSV files are allowed.') {
    return res.status(400).json({ message: error.message });
  }

  if (error?.statusCode) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  console.error('API error:', error);
  return res.status(500).json({ message: 'An unexpected server error occurred.' });
});

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
