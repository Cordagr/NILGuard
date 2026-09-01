import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { MongoClient } from 'mongodb';
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
import { query, initDb } from './db.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 5000);
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'nilguard';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.join(__dirname, 'uploads', 'contracts');
const rosterUploadsRoot = path.join(__dirname, 'uploads', 'rosters');

const allowedRoles = new Set(['student', 'coach', 'school', 'compliance']);
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
let rostersCollection;
let documentRequestsCollection;

// checks the session cookie on every protected request
const requireAuth = makeRequireAuth(recordAuditLog);

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
    ncaaDivision: user.ncaaDivision || user.ncaa_division || matchedSchool?.division || null
  };
}

async function recordAuditLog(action, details = {}) {
  try {
    await query(
      'INSERT INTO audit_logs (action, user_id, email, ip) VALUES ($1, $2, $3, $4)',
      [action, details.userId || null, details.email || null, details.ip || null]
    );
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

function serializeContract(contract) {
  return {
    id: contract.contractId,
    fileName: contract.fileName,
    fileSize: contract.fileSize,
    createdAt: contract.createdAt,
    updatedAt: contract.updatedAt,
    lastAccessedAt: contract.lastAccessedAt,
    accessCount: contract.accessCount,
    uploadedBy: contract.userId
  };
}

// postgres rows come back snake_case, this keeps the old camelCase names the routes expect
function mapContractRow(row) {
  return {
    ...row,
    contractId: row.contract_id,
    userId: row.user_id,
    fileName: row.file_name,
    storedFileName: row.stored_file_name,
    storedFilePath: row.stored_file_path,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    aiScreening: row.ai_screening,
    accessCount: row.access_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastAccessedAt: row.last_accessed_at
  };
}

function serializeDocumentRequest(documentRequest) {
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
    hasSourceFile: Boolean(documentRequest.storedFilePath)
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
    const sortBy = req.query.sortBy === 'createdAt' ? 'created_at' : 'last_accessed_at';
    const sortDirection = req.query.sortDirection === 'asc' ? 'ASC' : 'DESC';

    // sql can not use $1 for column names so the whitelist above keeps this safe
    const result = await query(
      `SELECT * FROM contracts WHERE user_id = $1 ORDER BY ${sortBy} ${sortDirection}, created_at DESC`,
      [userId]
    );
    const contracts = result.rows.map(mapContractRow);

    res.json({
      contracts: contracts.map(serializeContract)
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

    const insertResult = await query(
      `INSERT INTO contracts
       (contract_id, user_id, file_name, stored_file_name, stored_file_path, file_size, mime_type, ai_screening)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        contractId,
        userId,
        file.originalname,
        storedFileName,
        storedFilePath,
        file.size,
        file.mimetype || 'application/pdf',
        // jsonb columns take a json string
        JSON.stringify({
          score: contractScreening.score,
          positiveSignals: contractScreening.positiveSignals,
          negativeSignals: contractScreening.negativeSignals,
          textLength: contractScreening.textLength,
          screenedAt: now
        })
      ]
    );
    const contractDocument = mapContractRow(insertResult.rows[0]);

    return res.status(201).json({
      message: 'Contract uploaded successfully.',
      contract: serializeContract(contractDocument)
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/contracts/:contractId/file', async (req, res, next) => {
  try {
    const userId = String(req.user._id);
    const { contractId } = req.params;
    const contractResult = await query(
      'SELECT * FROM contracts WHERE contract_id = $1 AND user_id = $2',
      [contractId, userId]
    );
    const contract = contractResult.rows[0] ? mapContractRow(contractResult.rows[0]) : null;

    if (!contract) {
      return res.status(404).json({ message: 'Contract not found for the current user.' });
    }

    await query(
      `UPDATE contracts
       SET last_accessed_at = now(), updated_at = now(), access_count = access_count + 1
       WHERE contract_id = $1 AND user_id = $2`,
      [contractId, userId]
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
    assertUserRole(user, 'student');

    const contractId = String(req.body?.contractId || '').trim();
    const complianceEmail = String(req.body?.complianceEmail || '').toLowerCase().trim();

    if (!contractId) {
      return res.status(400).json({ message: 'A contract id is required.' });
    }

    if (!complianceEmail) {
      return res.status(400).json({ message: 'A compliance officer email is required.' });
    }

    const contractResult = await query(
      'SELECT * FROM contracts WHERE contract_id = $1 AND user_id = $2',
      [contractId, userId]
    );
    const contract = contractResult.rows[0] ? mapContractRow(contractResult.rows[0]) : null;

    if (!contract) {
      return res.status(404).json({ message: 'Contract not found for the current student.' });
    }

    const officerResult = await query(
      "SELECT * FROM users WHERE email = $1 AND role = 'compliance'",
      [complianceEmail]
    );
    // sql treats null = null as false so match the school here to keep the old behavior
    const complianceOfficer = officerResult.rows.find(
      (officer) => (officer.school || null) === (user.school || null)
    );

    if (!complianceOfficer) {
      return res.status(404).json({
        message: 'No compliance officer account with that email was found for your school.'
      });
    }

    const now = new Date();
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
          assignedComplianceUserId: String(complianceOfficer.id),
          assignedComplianceEmail: complianceOfficer.email,
          status: 'pending',
          reviewedAt: null,
          reviewedBy: null,
          reviewerEmail: null,
          updatedAt: now,
          submittedAt: now
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

    if (!['accepted', 'rejected'].includes(nextStatus)) {
      return res.status(400).json({ message: 'Status must be accepted or rejected.' });
    }

    const documentRequest = await documentRequestsCollection.findOne({ requestId, assignedComplianceUserId: userId });

    if (!documentRequest) {
      return res.status(404).json({ message: 'Compliance request not found for the current officer.' });
    }

    const now = new Date();

    await documentRequestsCollection.updateOne(
      { requestId },
      {
        $set: {
          status: nextStatus,
          reviewedAt: now,
          reviewedBy: userId,
          reviewerEmail: user.email,
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

    res.setHeader('Content-Type', documentRequest.mimeType || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${documentRequest.contractFileName || 'document.pdf'}"`);
    return res.sendFile(documentRequest.storedFilePath);
  } catch (error) {
    next(error);
  }
});

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
  // the school directory is optional now, any .edu email can register
  const resolvedSchool = resolveSchoolFromEmail(normalizedEmail);

  const existingEmail = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
  if (existingEmail.rows.length > 0) {
    return res.status(409).json({ message: 'An account with this email already exists.' });
  }

  const passwordHash = await bcrypt.hash(String(password), 10);

  const insertResult = await query(
    `INSERT INTO users (email, password_hash, role, school, ncaa_division, school_email_domain)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      normalizedEmail,
      passwordHash,
      normalizedRole,
      resolvedSchool ? resolvedSchool.school : null,
      resolvedSchool ? resolvedSchool.division : null,
      resolvedSchool ? resolvedSchool.primaryDomain : null
    ]
  );
  const newUser = insertResult.rows[0];

  await recordAuditLog('register', { userId: newUser.id, email: normalizedEmail, ip: req.ip });

  const token = signToken(newUser);
  setAuthCookie(res, token);

  return res.status(201).json({
    message: 'Registration successful.',
    user: serializeUser(newUser, resolvedSchool)
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

  const userResult = await query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
  const user = userResult.rows[0];

  if (!user) {
    await recordAuditLog('login_failed', { email: normalizedEmail, ip: req.ip });
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  // lock the account for 15 minutes after 3 failed attempts
  const now = new Date();
  if (user.lock_until && user.lock_until > now) {
    const minutesLeft = Math.ceil((user.lock_until - now) / 60000);
    return res.status(423).json({
      message: `Too many failed login attempts. Try again in ${minutesLeft} minute(s).`
    });
  }

  const passwordMatches = await bcrypt.compare(String(password), user.password_hash);
  if (!passwordMatches) {
    const attempts = user.failed_login_attempts + 1;

    await query(
      'UPDATE users SET failed_login_attempts = $1, updated_at = now() WHERE id = $2',
      [attempts, user.id]
    );

    if (attempts >= 3) {
      await query(
        'UPDATE users SET lock_until = $1, updated_at = now() WHERE id = $2',
        [new Date(now.getTime() + 15 * 60 * 1000), user.id]
      );
      await recordAuditLog('lockout', { userId: user.id, email: normalizedEmail, ip: req.ip });
    }

    await recordAuditLog('login_failed', { userId: user.id, email: normalizedEmail, ip: req.ip });
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  if (role && user.role !== expectedRole) {
    return res.status(403).json({ message: `This account is registered as ${user.role}, not ${expectedRole}.` });
  }

  // keep the school fields up to date when the directory recognizes the domain
  if (
    resolvedSchool &&
    (user.school !== resolvedSchool.school ||
      user.ncaa_division !== resolvedSchool.division ||
      user.school_email_domain !== resolvedSchool.primaryDomain)
  ) {
    await query(
      `UPDATE users
       SET school = $1, ncaa_division = $2, school_email_domain = $3, updated_at = now()
       WHERE id = $4`,
      [resolvedSchool.school, resolvedSchool.division, resolvedSchool.primaryDomain, user.id]
    );
  }

  // successful login resets the failed attempt counter
  await query(
    `UPDATE users
     SET failed_login_attempts = 0, lock_until = null, last_login_at = now(), last_login_ip = $1, updated_at = now()
     WHERE id = $2`,
    [req.ip || null, user.id]
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
    const contractResult = await query(
      'SELECT * FROM contracts WHERE contract_id = $1 AND user_id = $2',
      [contractId, userId]
    );
    const contract = contractResult.rows[0] ? mapContractRow(contractResult.rows[0]) : null;
    if (!contract) {
      return res.status(404).json({ message: 'Contract not found for the current user.' });
    }
    // Remove contract record
    await query('DELETE FROM contracts WHERE contract_id = $1 AND user_id = $2', [contractId, userId]);
    // Remove file if unused
    if (contract.storedFilePath) {
      const remaining = await query('SELECT COUNT(*) FROM contracts WHERE stored_file_path = $1', [contract.storedFilePath]);
      // pg returns COUNT(*) as a string so turn it into a number
      if (Number(remaining.rows[0].count) === 0) {
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
  // postgres owns auth + audit logs, mongo still holds contracts until the move is done
  await initDb();
  await client.connect();
  const db = client.db(DB_NAME);
  rostersCollection = db.collection('rosters');
  documentRequestsCollection = db.collection('documentRequests');

  await rostersCollection.createIndex({ userId: 1, updatedAt: -1 });
  await rostersCollection.createIndex({ userId: 1, school: 1, sport: 1, year: 1 }, { unique: true });
  await documentRequestsCollection.createIndex({ requestId: 1 }, { unique: true });
  await documentRequestsCollection.createIndex({ studentUserId: 1, submittedAt: -1 });
  await documentRequestsCollection.createIndex({ studentSchool: 1, status: 1, submittedAt: -1 });
  await documentRequestsCollection.createIndex({ studentUserId: 1, contractId: 1 }, { unique: true });

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
      const contractResult = await query(
        'SELECT * FROM contracts WHERE contract_id = $1 AND user_id = $2',
        [contractId, userId]
      );
      const contract = contractResult.rows[0] ? mapContractRow(contractResult.rows[0]) : null;
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
