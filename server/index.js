import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import dns from 'dns';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import multer from 'multer';
import nodemailer from 'nodemailer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { analyzeContractPdf } from './contractClassifier.js';
import { analyzeContractWithAi } from './contractAnalyzer.js';
import { getAiConfig } from './aiClient.js';
import { RUBRIC_VERSION } from './analysisRubric.js';
import { isEmailOnSchoolDomain, resolveSchoolFromEmail } from './ncaaSchoolDirectory.js';
import { isEduEmail, isStrongPassword, isValidEmailAddress } from './utils/validation.js';
import { validateAvatar } from './utils/avatar.js';
import { signToken, setAuthCookie, clearAuthCookie } from './utils/jwt.js';
import { makeRequireAuth } from './middleware/auth.js';
import { createCollections, initializeDatabase } from './db.js';
import {
  canLinkRosterPlayer,
  canRegisterWithCoachInvite,
  markRosterEmailConflicts,
  normalizeRosterEmail,
  reconcileVerifiedRosterEmail,
  unlinkRosterPlayerForEmailChange
} from './utils/rosterLinking.js';

dotenv.config();

dns.setServers(['8.8.8.8', '1.1.1.1']);

const app = express();
const PORT = Number(process.env.PORT || 5000);
const AGREEMENT_METADATA_VERSION = 2;
const DATABASE_URL = process.env.DATABASE_URL;
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDirectory = path.resolve(
  process.env.UPLOADS_DIR || path.join(__dirname, 'uploads')
);
const uploadsRoot = path.join(uploadsDirectory, 'contracts');
const rosterUploadsRoot = path.join(uploadsDirectory, 'rosters');
const requireStudentEmailVerification =
  String(process.env.REQUIRE_STUDENT_EMAIL_VERIFICATION || 'false').toLowerCase() === 'true';

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
const EDUCATION_COURSES = {
  moneyBasics: { totalLessons: 3 },
  nilDeals: { totalLessons: 3 },
  contracts101: { totalLessons: 3 }
};

async function storedFileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

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

if (!DATABASE_URL) {
  throw new Error('Missing DATABASE_URL. Add it to your environment variables.');
}

const configuredCorsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const isOriginAllowed = (origin) => {
  if (configuredCorsOrigins.includes(origin)) {
    return true;
  }

  if (process.env.NODE_ENV !== 'production') {
    try {
      const parsedOrigin = new URL(origin);
      return (
        parsedOrigin.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(parsedOrigin.hostname)
      );
    } catch {
      return false;
    }
  }

  return false;
};

app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, !origin || isOriginAllowed(origin));
    },
    credentials: true
  })
);
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && !isOriginAllowed(origin)) {
    return res.status(403).json({ message: 'Origin not allowed.' });
  }
  next();
});
app.use(express.json({ limit: '3mb' }));
app.use(cookieParser());

const { Pool } = pg;
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined
});
let usersCollection;
let contractsCollection;
let rostersCollection;
let documentRequestsCollection;
let auditLogsCollection;
let messagesCollection;
let notificationsCollection;
let rosterLinkInvitesCollection;

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
    ncaaDivision: user.ncaaDivision || matchedSchool?.division || null,
    schoolEmailDomain: user.schoolEmailDomain || matchedSchool?.primaryDomain || null,
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    title: user.title || '',
    phone: user.phone || '',
    preferredName: user.preferredName || '',
    avatar: user.avatar || '',
    sport: user.sport || '',
    year: user.year || '',
    contactEmail: user.contactEmail || '',
    studentId: user.studentId || '',
    profileVisibility: user.profileVisibility || {},
    educationSharingEnabled: Boolean(user.educationSharingEnabled),
    emailVerified: Boolean(user.emailVerifiedAt)
  };
}

function createSmtpTransport() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const user = String(process.env.SMTP_USER || '').trim();
  const password = String(process.env.SMTP_PASSWORD || '');
  const from = String(process.env.SMTP_FROM || '').trim();
  const port = Number(process.env.SMTP_PORT || 587);

  if (!host || !user || !password || !from || !Number.isInteger(port)) {
    const error = new Error('Email delivery is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM.');
    error.statusCode = 503;
    throw error;
  }

  return {
    from,
    transport: nodemailer.createTransport({
      host,
      port,
      secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
      auth: { user, pass: password }
    })
  };
}

async function sendEmail({ to, subject, text, html }) {
  const { from, transport } = createSmtpTransport();
  try {
    await transport.sendMail({ from, to, subject, text, html });
  } finally {
    transport.close();
  }
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

function getApplicationUrl(pathname) {
  const baseUrl = String(process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return `${baseUrl}${pathname}`;
}

async function sendEmailVerification(user, token, inviteCode = '') {
  const query = new URLSearchParams({ token });
  if (inviteCode) {
    query.set('inviteCode', inviteCode);
  }
  const verificationUrl = `${getApplicationUrl('/verify-email')}?${query.toString()}`;
  await sendEmail({
    to: user.email,
    subject: 'Verify your NILGuard email',
    text: `Confirm your NILGuard email address: ${verificationUrl}`,
    html: `<p>Confirm your NILGuard email address:</p><p><a href="${verificationUrl}">Verify email</a></p>`
  });
}

async function refreshLinkedStudentId(userId) {
  const rosters = await rostersCollection.find({}).toArray();
  const studentIds = new Set(
    rosters.flatMap((roster) => (roster.players || [])
      .filter((player) => player.linkedStudentUserId === String(userId))
      .map((player) => String(player.studentId)))
  );
  await usersCollection.updateOne(
    { _id: String(userId) },
    { $set: { studentId: studentIds.size === 1 ? Array.from(studentIds)[0] : null, updatedAt: new Date() } }
  );
}

async function applyRosterEmailConflictReview(rosters) {
  const updatedRosters = markRosterEmailConflicts(rosters);
  const affectedUserIds = new Set(updatedRosters.flatMap((roster) =>
    (rosters.find((currentRoster) => currentRoster._id === roster._id)?.players || [])
      .map((player) => player.linkedStudentUserId)
      .filter(Boolean)
  ));
  for (const roster of updatedRosters) {
    await rostersCollection.updateOne(
      { _id: roster._id },
      { $set: { players: roster.players, updatedAt: new Date() } }
    );
  }
  for (const userId of affectedUserIds) {
    await refreshLinkedStudentId(userId);
  }
  return updatedRosters;
}

async function linkVerifiedAthlete(user, { allowPendingVerification = false } = {}) {
  if (!user?.emailVerifiedAt || user.role !== 'student') {
    return;
  }

  const allRosters = await rostersCollection.find({}).toArray();
  const updatedRosters = reconcileVerifiedRosterEmail(
    allRosters,
    user.email,
    String(user._id),
    new Date(),
    { allowPendingVerification }
  );
  const affectedUserIds = new Set(updatedRosters.flatMap((updatedRoster) =>
    (allRosters.find((roster) => roster._id === updatedRoster._id)?.players || [])
      .map((player) => player.linkedStudentUserId)
      .filter((linkedUserId) => linkedUserId && linkedUserId !== String(user._id))
  ));
  const linkedStudentIds = new Set();

  for (const roster of updatedRosters) {
    for (const player of roster.players) {
      if (player.linkedStudentUserId === String(user._id)) {
        linkedStudentIds.add(String(player.studentId));
        if (user.educationSharingEnabled && !player.educationConsentAt) {
          player.educationConsentAt = new Date();
        }
      }
    }
    await rostersCollection.updateOne(
      { _id: roster._id },
      { $set: { players: roster.players, updatedAt: new Date() } }
    );
  }

  await usersCollection.updateOne(
    { _id: user._id },
    {
      $set: {
        studentId: linkedStudentIds.size === 1 ? Array.from(linkedStudentIds)[0] : null,
        updatedAt: new Date()
      }
    }
  );
  for (const affectedUserId of affectedUserIds) {
    await refreshLinkedStudentId(affectedUserId);
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

function hasCustomGuidelineClauseContent(guidelines) {
  if (!Array.isArray(guidelines) || guidelines.length === 0) {
    return false;
  }

  return guidelines.some((guideline, index) => {
    const defaultGuideline = NIL_GUIDELINES[index];
    return !defaultGuideline ||
      guideline.id !== defaultGuideline.id ||
      guideline.title !== defaultGuideline.title ||
      guideline.summary !== defaultGuideline.summary;
  });
}

function getComplianceParticipantIds(documentRequest) {
  const participantIds = Array.isArray(documentRequest.complianceParticipantIds)
    ? documentRequest.complianceParticipantIds.map(String)
    : [];
  const leadId = documentRequest.assignedComplianceUserId
    ? String(documentRequest.assignedComplianceUserId)
    : '';

  return [...new Set([...participantIds, ...(leadId ? [leadId] : [])])];
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
    studentName: documentRequest.studentName || null,
    studentDivision: documentRequest.studentDivision,
    assignedComplianceUserId: documentRequest.assignedComplianceUserId || null,
    assignedComplianceEmail: documentRequest.assignedComplianceEmail || null,
    complianceParticipantIds: getComplianceParticipantIds(documentRequest),
    complianceParticipantEmails: Array.isArray(documentRequest.complianceParticipantEmails)
      ? documentRequest.complianceParticipantEmails
      : documentRequest.assignedComplianceEmail
        ? [documentRequest.assignedComplianceEmail]
        : [],
    status: documentRequest.status,
    guidelineClausesLocked: Boolean(documentRequest.guidelineClausesLockedAt) ||
      hasCustomGuidelineClauseContent(documentRequest.guidelines),
    rejectionReason: documentRequest.rejectionReason || '',
    reviewHistory: (documentRequest.reviewHistory || []).map((entry) => ({
      outcome: entry.outcome,
      rejectionReason: entry.rejectionReason || '',
      reviewedAt: entry.reviewedAt || entry.at || null,
      reviewedBy: entry.reviewedBy || null,
      reviewerEmail: entry.reviewerEmail || null,
      guidelines: entry.guidelines || []
    })),
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

function serializeMessage(message, viewerUserId) {
  const recipientUserIds = Array.isArray(message.recipientUserIds)
    ? message.recipientUserIds.map(String)
    : message.recipientUserId
      ? [String(message.recipientUserId)]
      : [];
  const readByUserIds = Array.isArray(message.readByUserIds)
    ? message.readByUserIds.map(String)
    : message.isRead
      ? recipientUserIds
      : [];
  const viewerId = String(viewerUserId);
  const isViewerRecipient = recipientUserIds.includes(viewerId);

  return {
    id: message.messageId,
    requestId: message.requestId || null,
    contractId: message.contractId || null,
    senderUserId: message.senderUserId,
    senderEmail: message.senderEmail,
    senderSchool: message.senderSchool || null,
    recipientEmail: message.recipientEmail,
    recipientEmails: Array.isArray(message.recipientEmails)
      ? message.recipientEmails
      : message.recipientEmail
        ? [message.recipientEmail]
        : [],
    recipientUserId: isViewerRecipient ? viewerId : message.recipientUserId || null,
    recipientUserIds,
    subject: message.subject,
    body: message.body,
    type: message.type || 'user',
    guidelines: Array.isArray(message.guidelines) ? message.guidelines : [],
    changes: Array.isArray(message.changes) ? message.changes : null,
    isRead: isViewerRecipient
      ? readByUserIds.includes(viewerId)
      : true,
    createdAt: message.createdAt
  };
}

function serializeNotification(notification) {
  return {
    id: notification.notificationId,
    requestId: notification.requestId || null,
    contractId: notification.contractId || null,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    isRead: Boolean(notification.isRead),
    createdAt: notification.createdAt
  };
}

async function createUserNotification({
  requestId,
  contractId,
  recipientUserId,
  type,
  title,
  body,
  notifications = notificationsCollection
}) {
  const recipientId = String(recipientUserId);
  const now = new Date();

  if (type === 'guidelines_updated' && requestId) {
    const [existingNotification] = await notifications
      .find({ recipientUserId: recipientId, requestId, type })
      .sort({ createdAt: -1 })
      .limit(1)
      .toArray();

    if (existingNotification) {
      await notifications.updateOne(
        { notificationId: existingNotification.notificationId },
        {
          $set: {
            title,
            body,
            isRead: false,
            readAt: null,
            createdAt: now
          }
        }
      );
      return;
    }
  }

  await notifications.insertOne({
    notificationId: `NOT-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
    requestId,
    contractId,
    recipientUserId: recipientId,
    type,
    title,
    body,
    isRead: false,
    createdAt: now
  });
}

async function createStudentNotification({
  requestId,
  contractId,
  studentUserId,
  type,
  title,
  body,
  notifications
}) {
  return createUserNotification({
    requestId,
    contractId,
    recipientUserId: studentUserId,
    type,
    title,
    body,
    notifications
  });
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
  const requiredColumns = ['student_id', 'first_name', 'last_name', 'email', 'school', 'sport', 'year'];
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
      email: normalizeRosterEmail(row[columnIndexes.email]),
      school: String(row[columnIndexes.school] || '').trim(),
      sport: String(row[columnIndexes.sport] || '').trim(),
      year: String(row[columnIndexes.year] || '').trim()
    };

    const hasMissingValue = Object.values(player).some((value) => value === '');

    if (hasMissingValue) {
      const error = new Error(`Row ${rowIndex + 2} contains blank required values, including email.`);
      error.statusCode = 400;
      throw error;
    }

    if (!isValidEmailAddress(player.email)) {
      const error = new Error(`Row ${rowIndex + 2} contains an invalid email address.`);
      error.statusCode = 400;
      throw error;
    }

    if (
      player.studentId.length > 100 ||
      player.firstName.length > 100 ||
      player.lastName.length > 100 ||
      player.school.length > 100 ||
      player.sport.length > 100 ||
      player.year.length > 100 ||
      player.email.length > 254
    ) {
      const error = new Error(`Row ${rowIndex + 2} contains a value that exceeds the maximum length.`);
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
      lastName: player.lastName,
      email: player.email,
      sport: player.sport,
      year: player.year,
      linkStatus: 'no_account'
    });
  });

  groupedRosters.forEach((roster) => {
    const emailCounts = new Map();
    roster.players.forEach((player) => {
      emailCounts.set(player.email, (emailCounts.get(player.email) || 0) + 1);
    });
    roster.players.forEach((player) => {
      if (emailCounts.get(player.email) > 1) {
        player.linkStatus = 'needs_review';
        player.linkReviewReason = 'duplicate_email';
      }
    });
  });

  return Array.from(groupedRosters.values());
}

function serializeRoster(
  roster,
  educationProgressByStudent = new Map(),
  viewer = null,
  linkedUsers = new Map()
) {
  return {
    id: roster.rosterId,
    school: roster.school,
    sport: roster.sport,
    year: roster.year,
    playerCount: roster.playerCount,
    players: Array.isArray(roster.players)
      ? roster.players.map((player) => {
          const educationShared = Boolean(player.linkedStudentUserId && player.educationConsentAt);
          const educationProgress = educationShared
            ? educationProgressByStudent.get(String(player.linkedStudentUserId))
            : null;

          const canSeeEmail = viewer?.role === 'coach' &&
            String(viewer.school || '').toLowerCase() === String(roster.school || '').toLowerCase();
          const linkedUser = player.linkedStudentUserId
            ? linkedUsers.get(String(player.linkedStudentUserId))
            : null;
          const profileVisibility = linkedUser?.profileVisibility || {};
          const sharedProfile = linkedUser && canSeeEmail
            ? Object.fromEntries(
                ['preferredName', 'avatar', 'sport', 'year', 'contactEmail']
                  .filter((field) => profileVisibility[field] === true && linkedUser[field])
                  .map((field) => [field, linkedUser[field]])
              )
            : {};

          return {
            studentId: player.studentId,
            firstName: player.firstName,
            lastName: player.lastName,
            sport: player.sport || roster.sport,
            year: player.year || roster.year,
            email: canSeeEmail ? player.email || '' : undefined,
            linkStatus: player.linkStatus === 'needs_review'
              ? 'needs_review'
              : player.linkedStudentUserId
                ? 'linked'
                : player.inviteSentAt
                  ? 'invited'
                  : 'no_account',
            sharedProfile: Object.keys(sharedProfile).length ? sharedProfile : null,
            educationShared,
            educationProgress: educationShared
              ? getRosterEducationSummary(educationProgress)
              : null
          };
        })
      : [],
    fileName: roster.sourceFileName,
    hasSourceFile: Boolean(roster.storedFilePath),
    manuallyEditedAt: roster.manuallyEditedAt,
    createdAt: roster.createdAt,
    updatedAt: roster.updatedAt
  };
}

async function serializeRosters(rosters, educationProgressByStudent, viewer) {
  const linkedUserIds = Array.from(new Set(rosters.flatMap((roster) =>
    (roster.players || [])
      .map((player) => player.linkedStudentUserId)
      .filter(Boolean)
      .map(String)
  )));
  const linkedUsers = linkedUserIds.length
    ? new Map((await usersCollection.find({ _id: { $in: linkedUserIds } }).toArray())
        .map((user) => [String(user._id), user]))
    : new Map();

  return rosters.map((roster) => serializeRoster(roster, educationProgressByStudent, viewer, linkedUsers));
}

function serializeAthlete(athlete) {
  return {
    studentId: athlete.studentId,
    firstName: athlete.firstName,
    lastName: athlete.lastName,
    school: athlete.school,
    linkStatus: athlete.linkStatus || 'no_account',
    avatar: athlete.avatar || null,
    assignments: athlete.assignments || []
  };
}

function validateRosterPlayer(input, roster) {
  const player = {
    studentId: String(input?.studentId || '').trim(),
    firstName: String(input?.firstName || '').trim(),
    lastName: String(input?.lastName || '').trim(),
    email: normalizeRosterEmail(input?.email),
    sport: String(input?.sport || roster?.sport || '').trim(),
    year: String(input?.year || roster?.year || '').trim()
  };

  if (Object.values(player).some((value) => !value)) {
    const error = new Error('Student ID, first name, last name, email, sport, and year are required.');
    error.statusCode = 400;
    throw error;
  }

  if (!isValidEmailAddress(player.email)) {
    const error = new Error('Enter a valid athlete email address.');
    error.statusCode = 400;
    throw error;
  }

  if (
    player.studentId.length > 100 ||
    player.firstName.length > 100 ||
    player.lastName.length > 100 ||
    player.sport.length > 100 ||
    player.year.length > 100
  ) {
    const error = new Error('Roster player fields must be 100 characters or fewer.');
    error.statusCode = 400;
    throw error;
  }

  return player;
}

function markDuplicateRosterEmails(players) {
  const counts = new Map();
  players.forEach((player) => {
    const email = normalizeRosterEmail(player.email);
    counts.set(email, (counts.get(email) || 0) + 1);
  });

  return players.map((player) => {
    if (counts.get(normalizeRosterEmail(player.email)) <= 1) {
      return player;
    }

    return {
      ...player,
      linkedStudentUserId: null,
      educationConsentAt: null,
      linkStatus: 'needs_review',
      linkReviewReason: 'duplicate_email'
    };
  });
}

function getRosterEducationSummary(progress) {
  const courses = Object.fromEntries(
    Object.entries(EDUCATION_COURSES).map(([courseId, course]) => {
      const savedCourse = progress?.[courseId] || {};
      const completedLessons = Array.isArray(savedCourse.completedLessons)
        ? savedCourse.completedLessons.length
        : 0;
      const quizPassed = savedCourse.quizResult?.passed === true;

      return [
        courseId,
        {
          completedLessons,
          totalLessons: course.totalLessons,
          quizAttempted: Boolean(savedCourse.quizResult),
          quizPassed,
          completed: completedLessons === course.totalLessons && quizPassed
        }
      ];
    })
  );

  return {
    courses,
    completedModules: Object.values(courses).filter((course) => course.completed).length,
    totalModules: Object.keys(EDUCATION_COURSES).length
  };
}

function validateCourseProgress(courseId, input, existing = {}) {
  const course = EDUCATION_COURSES[courseId];
  if (!course || !input || typeof input !== 'object' || Array.isArray(input)) {
    const error = new Error('Invalid education progress data.');
    error.statusCode = 400;
    throw error;
  }

  const result = { ...existing };

  if (Object.prototype.hasOwnProperty.call(input, 'completedLessons')) {
    if (
      !Array.isArray(input.completedLessons) ||
      input.completedLessons.some(
        (lesson) => !Number.isInteger(lesson) || lesson < 0 || lesson >= course.totalLessons
      )
    ) {
      const error = new Error('Completed lesson values are invalid.');
      error.statusCode = 400;
      throw error;
    }

    result.completedLessons = [...new Set(input.completedLessons)].sort((left, right) => left - right);
  }

  if (Object.prototype.hasOwnProperty.call(input, 'currentLesson')) {
    if (
      !Number.isInteger(input.currentLesson) ||
      input.currentLesson < 0 ||
      input.currentLesson >= course.totalLessons
    ) {
      const error = new Error('Current lesson value is invalid.');
      error.statusCode = 400;
      throw error;
    }

    result.currentLesson = input.currentLesson;
  }

  if (Object.prototype.hasOwnProperty.call(input, 'quizResult')) {
    if (input.quizResult === null) {
      result.quizResult = null;
    } else {
      const score = Number(input.quizResult?.score);
      const totalQuestions = Number(input.quizResult?.totalQuestions);

      if (
        !Number.isInteger(score) ||
        !Number.isInteger(totalQuestions) ||
        totalQuestions < 1 ||
        totalQuestions > 100 ||
        score < 0 ||
        score > totalQuestions
      ) {
        const error = new Error('Quiz result values are invalid.');
        error.statusCode = 400;
        throw error;
      }

      const percentage = Math.round((score / totalQuestions) * 100);
      result.quizResult = {
        score,
        totalQuestions,
        percentage,
        passed: percentage >= 80,
        completedAt: new Date()
      };
    }
  }

  result.updatedAt = new Date();
  return result;
}

function getEducationProgressSnapshot(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  return Object.entries(EDUCATION_COURSES).reduce((progress, [courseId]) => {
    const submittedCourse = input[courseId];
    if (submittedCourse && typeof submittedCourse === 'object' && !Array.isArray(submittedCourse)) {
      progress[courseId] = validateCourseProgress(courseId, submittedCourse);
    }
    return progress;
  }, {});
}

function hashRosterInviteCode(code) {
  return createHash('sha256').update(String(code || '').trim().toUpperCase()).digest('hex');
}

async function findValidRosterLinkInvite(code) {
  const invite = await rosterLinkInvitesCollection.findOne({
    codeHash: hashRosterInviteCode(code)
  });

  if (!invite) {
    const error = new Error('This sharing code is invalid.');
    error.statusCode = 404;
    throw error;
  }

  if (invite.acceptedAt) {
    const error = new Error('This sharing code has already been used.');
    error.statusCode = 409;
    throw error;
  }

  if (invite.revokedAt || !invite.expiresAt || new Date(invite.expiresAt) <= new Date()) {
    const error = new Error('This sharing code has expired or been revoked.');
    error.statusCode = 410;
    throw error;
  }

  const roster = await rostersCollection.findOne({
    rosterId: invite.rosterId,
    userId: invite.rosterOwnerId
  });
  const players = Array.isArray(roster?.players) ? roster.players : [];
  const matchingPlayers = players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => String(player.studentId) === String(invite.studentId));

  if (!roster || matchingPlayers.length !== 1) {
    const error = new Error('The roster entry for this sharing code is no longer available.');
    error.statusCode = 410;
    throw error;
  }

  if (
    invite.email &&
    normalizeRosterEmail(invite.email) !== normalizeRosterEmail(matchingPlayers[0].player.email)
  ) {
    const error = new Error('The email for this roster invite has changed. Request a new invite.');
    error.statusCode = 410;
    throw error;
  }

  return {
    invite,
    roster,
    player: matchingPlayers[0].player,
    playerIndex: matchingPlayers[0].index
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
app.use('/api/education', requireAuth);

app.get('/api/education/progress', async (req, res, next) => {
  try {
    assertUserRole(req.user, 'student');
    return res.json({
      progress: req.user.educationProgress || {}
    });
  } catch (error) {
    next(error);
  }
});

app.put('/api/education/progress/:courseId', async (req, res, next) => {
  let client;
  let transactionOpen = false;

  try {
    const user = req.user;
    assertUserRole(user, 'student');
    const courseId = req.params.courseId;
    if (!EDUCATION_COURSES[courseId]) {
      return res.status(400).json({ message: 'Unknown education course.' });
    }

    client = await pool.connect();
    await client.query('BEGIN');
    transactionOpen = true;
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [String(user._id)]);
    const transactionUsers = createCollections(client).usersCollection;
    const currentUser = await transactionUsers.findOne({ _id: String(user._id) });

    if (!currentUser) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(404).json({ message: 'Student account was not found.' });
    }

    const courseProgress = validateCourseProgress(
      courseId,
      req.body,
      currentUser.educationProgress?.[courseId] || {}
    );
    const educationProgress = {
      ...(currentUser.educationProgress || {}),
      [courseId]: courseProgress
    };

    await transactionUsers.updateOne(
      { _id: String(user._id) },
      { $set: { educationProgress, updatedAt: new Date() } }
    );
    await client.query('COMMIT');
    transactionOpen = false;

    return res.json({ progress: courseProgress });
  } catch (error) {
    if (transactionOpen) {
      await client.query('ROLLBACK');
    }
    next(error);
  } finally {
    client?.release();
  }
});

app.get('/api/education/sharing', async (req, res, next) => {
  try {
    const userId = String(req.user._id);
    assertUserRole(req.user, 'student');

    const rosters = await rostersCollection.find({}).toArray();
    const sharedRosters = rosters.flatMap((roster) =>
      (roster.players || [])
        .filter((player) => player.linkedStudentUserId === userId && player.educationConsentAt)
        .map((player) => ({
          athleteName: `${player.firstName} ${player.lastName}`,
          school: roster.school,
          sport: roster.sport,
          year: roster.year,
          consentedAt: player.educationConsentAt
        }))
    );

    return res.json({ shares: sharedRosters });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/education/sharing', async (req, res, next) => {
  try {
    const userId = String(req.user._id);
    assertUserRole(req.user, 'student');

    const rosters = await rostersCollection.find({}).toArray();
    const now = new Date();
    let revokedCount = 0;
    const revokedEntries = [];

    for (const roster of rosters) {
      const players = Array.isArray(roster.players) ? roster.players : [];
      let rosterChanged = false;
      const updatedPlayers = players.map((player) => {
        if (player.linkedStudentUserId !== userId || !player.educationConsentAt) {
          return player;
        }

        rosterChanged = true;
        revokedCount += 1;
        revokedEntries.push({
          rosterId: roster.rosterId,
          rosterOwnerId: roster.userId,
          studentId: player.studentId
        });
        return {
          ...player,
          linkedStudentUserId: null,
          educationConsentAt: null,
          educationRevokedAt: now
        };
      });

      if (rosterChanged) {
        await rostersCollection.updateOne(
          { rosterId: roster.rosterId, userId: roster.userId },
          { $set: { players: updatedPlayers, updatedAt: now } }
        );
      }
    }

    for (const entry of revokedEntries) {
      await rosterLinkInvitesCollection.updateMany(
        {
          rosterId: entry.rosterId,
          rosterOwnerId: entry.rosterOwnerId,
          studentId: entry.studentId,
          acceptedAt: null,
          revokedAt: null
        },
        { $set: { revokedAt: now } }
      );
    }

    if (revokedCount > 0) {
      await recordAuditLog('roster_education_sharing_revoked', {
        userId,
        email: req.user.email
      });
    }

    return res.json({
      message: 'Education progress sharing was revoked.',
      revokedCount
    });
  } catch (error) {
    next(error);
  }
});

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
    const user = req.user;
    const userId = String(user._id);
    const rosters = await rostersCollection
      .find({ userId })
      .sort({ updatedAt: -1, school: 1, sport: 1, year: 1 })
      .toArray();
    const linkedStudentIds = Array.from(new Set(
      rosters.flatMap((roster) =>
        (roster.players || [])
          .filter((player) => player.linkedStudentUserId && player.educationConsentAt)
          .map((player) => String(player.linkedStudentUserId))
      )
    ));
    const linkedStudents = linkedStudentIds.length
      ? await usersCollection.find({ _id: { $in: linkedStudentIds } }).toArray()
      : [];
    const educationProgressByStudent = new Map(
      linkedStudents.map((student) => [String(student._id), student.educationProgress || {}])
    );

    res.json({
      rosters: await serializeRosters(rosters, educationProgressByStudent, user)
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/rosters/:rosterId/players/:playerIndex/education-invite', async (req, res, next) => {
  try {
    const user = req.user;
    assertUserRole(user, 'coach', 'school');

    const userId = String(user._id);
    const playerIndex = Number(req.params.playerIndex);
    const roster = await rostersCollection.findOne({
      rosterId: req.params.rosterId,
      userId
    });

    if (!roster) {
      return res.status(404).json({ message: 'Roster not found for the current user.' });
    }

    if (!user.school || roster.school.toLowerCase() !== user.school.toLowerCase()) {
      return res.status(403).json({ message: 'You can only share education progress for your assigned school.' });
    }

    const players = Array.isArray(roster.players) ? roster.players : [];
    if (!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex >= players.length) {
      return res.status(404).json({ message: 'Athlete was not found in this roster.' });
    }

    const player = players[playerIndex];
    if (player.linkStatus === 'needs_review') {
      return res.status(409).json({ message: 'Resolve this athlete’s email review before sending an invite.' });
    }
    if (players.filter((currentPlayer) => currentPlayer.studentId === player.studentId).length !== 1) {
      return res.status(409).json({ message: 'This roster has duplicate student IDs. Resolve them before sending an invite.' });
    }
    if (!isValidEmailAddress(player.email)) {
      return res.status(400).json({ message: 'Add a valid email address to this roster row before sending an invite.' });
    }

    const now = new Date();
    if (player.inviteSentAt && now.getTime() - new Date(player.inviteSentAt).getTime() < 60 * 1000) {
      return res.status(429).json({ message: 'Wait one minute before sending another invite to this athlete.' });
    }
    const recentInvites = await rosterLinkInvitesCollection.find({ rosterOwnerId: userId }).toArray();
    if (recentInvites.filter((invite) => new Date(invite.createdAt).getTime() > now.getTime() - 60 * 60 * 1000).length >= 20) {
      return res.status(429).json({ message: 'You have reached the hourly invite limit. Try again later.' });
    }

    const code = randomBytes(16).toString('hex').toUpperCase();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const signUpUrl = `${getApplicationUrl('/register')}?role=student&inviteCode=${encodeURIComponent(code)}`;
    await sendEmail({
      to: player.email,
      subject: 'Your NILGuard athlete sign-up link',
      text: `Create or verify your NILGuard athlete account with this link: ${signUpUrl}\n\nIf needed, your one-time roster code is ${code}.`,
      html: `<p>Create or verify your NILGuard athlete account:</p><p><a href="${signUpUrl}">Continue to NILGuard</a></p><p>One-time fallback code: <strong>${code}</strong></p>`
    });
    await rosterLinkInvitesCollection.updateMany(
      {
        rosterId: roster.rosterId,
        rosterOwnerId: userId,
        studentId: player.studentId,
        acceptedAt: null,
        revokedAt: null
      },
      { $set: { revokedAt: now } }
    );
    await rosterLinkInvitesCollection.insertOne({
      inviteId: randomUUID(),
      codeHash: hashRosterInviteCode(code),
      rosterId: roster.rosterId,
      rosterOwnerId: userId,
      studentId: player.studentId,
      email: normalizeRosterEmail(player.email),
      createdAt: now,
      expiresAt,
      acceptedAt: null,
      revokedAt: null
    });
    const updatedPlayers = [...players];
    updatedPlayers[playerIndex] = { ...player, inviteSentAt: now, linkStatus: 'invited' };
    await rostersCollection.updateOne(
      { rosterId: roster.rosterId, userId },
      { $set: { players: updatedPlayers, updatedAt: now } }
    );
    await recordAuditLog('roster_education_invite_created', {
      userId,
      email: user.email
    });

    return res.status(201).json({
      message: 'Sign-up invite sent. The one-time fallback code expires in 24 hours.',
      code,
      expiresAt
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/rosters/link-invites/:code', async (req, res, next) => {
  try {
    const user = req.user;
    assertUserRole(user, 'student');

    const { invite, roster, player } = await findValidRosterLinkInvite(req.params.code);
    if (player.linkStatus === 'needs_review') {
      return res.status(409).json({ message: 'This roster row needs coach review before it can be linked.' });
    }
    if (!user.emailVerifiedAt || !canLinkRosterPlayer(user, player)) {
      return res.status(403).json({
        message: 'Verify the email address listed on this roster row before using the invite.'
      });
    }
    if (player.linkedStudentUserId && player.linkedStudentUserId !== String(user._id)) {
      return res.status(409).json({ message: 'This roster entry is already linked to another student account.' });
    }

    return res.json({
      invitation: {
        athleteName: `${player.firstName} ${player.lastName}`,
        studentId: player.studentId,
        school: roster.school,
        sport: roster.sport,
        year: roster.year,
        expiresAt: invite.expiresAt
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/rosters/link-invites/:code/accept', async (req, res, next) => {
  let client;
  let transactionOpen = false;

  try {
    const user = req.user;
    assertUserRole(user, 'student');

    if (req.body?.shareEducation !== undefined && typeof req.body.shareEducation !== 'boolean') {
      return res.status(400).json({ message: 'Education sharing must be on or off.' });
    }
    const shareEducation = req.body?.shareEducation === true;

    const userId = String(user._id);
    const codeHash = hashRosterInviteCode(req.params.code);
    client = await pool.connect();
    await client.query('BEGIN');
    transactionOpen = true;

    const transactionCollections = createCollections(client);
    let invite = await transactionCollections.rosterLinkInvitesCollection.findOne({ codeHash });
    if (!invite) {
      const error = new Error('This sharing code is invalid.');
      error.statusCode = 404;
      throw error;
    }

    await client.query('SELECT id FROM roster_link_invites WHERE id = $1 FOR UPDATE', [invite._id]);
    invite = await transactionCollections.rosterLinkInvitesCollection.findOne({ codeHash });
    if (invite.acceptedAt) {
      const error = new Error('This sharing code has already been used.');
      error.statusCode = 409;
      throw error;
    }
    if (invite.revokedAt || !invite.expiresAt || new Date(invite.expiresAt) <= new Date()) {
      const error = new Error('This sharing code has expired or been revoked.');
      error.statusCode = 410;
      throw error;
    }

    let roster = await transactionCollections.rostersCollection.findOne({
      rosterId: invite.rosterId,
      userId: invite.rosterOwnerId
    });
    if (!roster) {
      const error = new Error('The roster entry for this sharing code is no longer available.');
      error.statusCode = 410;
      throw error;
    }
    await client.query('SELECT id FROM rosters WHERE id = $1 FOR UPDATE', [roster._id]);
    roster = await transactionCollections.rostersCollection.findOne({
      rosterId: invite.rosterId,
      userId: invite.rosterOwnerId
    });

    const players = Array.isArray(roster?.players) ? roster.players : [];
    const matchingPlayers = players
      .map((player, index) => ({ player, index }))
      .filter(({ player }) => String(player.studentId) === String(invite.studentId));
    if (matchingPlayers.length !== 1) {
      const error = new Error('The roster entry for this sharing code is no longer uniquely available.');
      error.statusCode = 410;
      throw error;
    }

    const { player, index: playerIndex } = matchingPlayers[0];
    if (player.linkStatus === 'needs_review') {
      const error = new Error('This roster row needs coach review before it can be linked.');
      error.statusCode = 409;
      throw error;
    }
    if (player.linkedStudentUserId && player.linkedStudentUserId !== userId) {
      const error = new Error('This roster entry is already linked to another student account.');
      error.statusCode = 409;
      throw error;
    }

    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const currentUser = await transactionCollections.usersCollection.findOne({ _id: userId });
    if (!currentUser) {
      const error = new Error('The student account no longer exists.');
      error.statusCode = 404;
      throw error;
    }
    if (!currentUser.emailVerifiedAt || !canLinkRosterPlayer(currentUser, player)) {
      const error = new Error('Verify the email address listed on this roster row before using the invite.');
      error.statusCode = 403;
      throw error;
    }

    const now = new Date();
    const educationProgress = { ...(currentUser.educationProgress || {}) };
    const submittedProgress = shareEducation
      ? getEducationProgressSnapshot(req.body.educationProgress)
      : {};
    for (const [courseId, submittedCourse] of Object.entries(submittedProgress)) {
      const currentCourse = educationProgress[courseId] || {};
      const completedLessons = Array.from(new Set([
        ...(Array.isArray(currentCourse.completedLessons) ? currentCourse.completedLessons : []),
        ...(Array.isArray(submittedCourse.completedLessons) ? submittedCourse.completedLessons : [])
      ])).sort((left, right) => left - right);
      const currentQuizDate = Date.parse(currentCourse.quizResult?.completedAt || '');
      const submittedQuizDate = Date.parse(submittedCourse.quizResult?.completedAt || '');

      educationProgress[courseId] = {
        ...currentCourse,
        ...submittedCourse,
        currentLesson: Number.isInteger(currentCourse.currentLesson)
          ? currentCourse.currentLesson
          : submittedCourse.currentLesson,
        completedLessons,
        quizResult: submittedCourse.quizResult && submittedQuizDate > currentQuizDate
          ? submittedCourse.quizResult
          : currentCourse.quizResult || submittedCourse.quizResult
      };
    }
    const updatedPlayers = [...players];
    const shouldShareEducation = shareEducation || currentUser.educationSharingEnabled === true;
    updatedPlayers[playerIndex] = {
      ...player,
      linkedStudentUserId: userId,
      educationConsentAt: shouldShareEducation ? player.educationConsentAt || now : null,
      educationRevokedAt: null,
      linkStatus: 'linked',
      linkReviewReason: null,
      linkRequiresInvite: false
    };

    await transactionCollections.usersCollection.updateOne(
      { _id: userId },
      {
        $set: {
          educationProgress,
          ...(shareEducation ? { educationSharingEnabled: true } : {}),
          studentId: player.studentId,
          updatedAt: now
        }
      }
    );
    await transactionCollections.rostersCollection.updateOne(
      { rosterId: roster.rosterId, userId: invite.rosterOwnerId },
      { $set: { players: updatedPlayers, updatedAt: now } }
    );
    await transactionCollections.rosterLinkInvitesCollection.updateOne(
      { _id: invite._id },
      { $set: { acceptedAt: now, acceptedBy: userId } }
    );
    await transactionCollections.rosterLinkInvitesCollection.updateMany(
      {
        rosterId: roster.rosterId,
        rosterOwnerId: invite.rosterOwnerId,
        studentId: invite.studentId,
        acceptedAt: null,
        revokedAt: null
      },
      { $set: { revokedAt: now } }
    );

    await client.query('COMMIT');
    transactionOpen = false;
    await recordAuditLog('roster_education_sharing_consented', {
      userId,
      email: user.email
    });

    return res.json({
      message: shareEducation
        ? 'Your account is linked and you shared your NIL education completion status.'
        : 'Your account is linked. Your education progress remains private.'
    });
  } catch (error) {
    if (transactionOpen) {
      await client.query('ROLLBACK');
    }
    next(error);
  } finally {
    client?.release();
  }
});

app.post('/api/rosters/:rosterId/players', async (req, res, next) => {
  try {
    const user = req.user;
    assertUserRole(user, 'coach', 'school');

    const userId = String(user._id);
    const roster = await rostersCollection.findOne({
      rosterId: req.params.rosterId,
      userId
    });

    if (!roster) {
      return res.status(404).json({ message: 'Roster not found for the current user.' });
    }

    if (!user.school || roster.school.toLowerCase() !== user.school.toLowerCase()) {
      return res.status(403).json({ message: 'You can only edit rosters for your assigned school.' });
    }

    const player = {
      ...validateRosterPlayer(req.body, roster),
      linkRequiresInvite: true,
      linkStatus: 'no_account'
    };
    const players = Array.isArray(roster.players) ? roster.players : [];

    if (players.some((currentPlayer) => currentPlayer.studentId === player.studentId)) {
      return res.status(409).json({ message: 'That student ID is already in this roster.' });
    }

    const now = new Date();
    const updatedPlayers = markDuplicateRosterEmails([...players, player]);
    await rostersCollection.updateOne(
      { rosterId: roster.rosterId, userId },
      {
        $set: {
          players: updatedPlayers,
          playerCount: updatedPlayers.length,
          updatedAt: now,
          manuallyEditedAt: now
        }
      }
    );

    await applyRosterEmailConflictReview(await rostersCollection.find({}).toArray());
    const updatedRoster = await rostersCollection.findOne({ rosterId: roster.rosterId, userId });
    return res.status(201).json({
      message: 'Athlete added to the roster.',
      roster: (await serializeRosters([updatedRoster], new Map(), user))[0]
    });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/rosters/:rosterId/players/:playerIndex', async (req, res, next) => {
  try {
    const user = req.user;
    assertUserRole(user, 'coach', 'school');

    const userId = String(user._id);
    const playerIndex = Number(req.params.playerIndex);
    const roster = await rostersCollection.findOne({
      rosterId: req.params.rosterId,
      userId
    });

    if (!roster) {
      return res.status(404).json({ message: 'Roster not found for the current user.' });
    }

    if (!user.school || roster.school.toLowerCase() !== user.school.toLowerCase()) {
      return res.status(403).json({ message: 'You can only edit rosters for your assigned school.' });
    }

    const players = Array.isArray(roster.players) ? [...roster.players] : [];

    if (!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex >= players.length) {
      return res.status(404).json({ message: 'Athlete was not found in this roster.' });
    }

    const submittedPlayer = validateRosterPlayer(req.body, roster);

    if (players.some((currentPlayer, index) => index !== playerIndex && currentPlayer.studentId === submittedPlayer.studentId)) {
      return res.status(409).json({ message: 'That student ID is already in this roster.' });
    }

    const previousPlayer = players[playerIndex];
    const emailChanged = normalizeRosterEmail(previousPlayer.email) !== submittedPlayer.email;
    if (emailChanged && isValidEmailAddress(previousPlayer.email)) {
      createSmtpTransport();
    }
    players[playerIndex] = emailChanged
      ? {
          ...unlinkRosterPlayerForEmailChange(previousPlayer, submittedPlayer.email),
          ...submittedPlayer,
          linkedStudentUserId: null,
          educationConsentAt: null,
          educationRevokedAt: new Date(),
          linkStatus: 'no_account',
          linkRequiresInvite: true,
          inviteSentAt: null
        }
      : {
          ...previousPlayer,
          ...submittedPlayer,
          linkStatus: previousPlayer.linkStatus || (previousPlayer.linkedStudentUserId ? 'linked' : 'no_account')
        };
    const updatedPlayers = markDuplicateRosterEmails(players);
    const now = new Date();
    await rostersCollection.updateOne(
      { rosterId: roster.rosterId, userId },
      {
        $set: {
          players: updatedPlayers,
          playerCount: updatedPlayers.length,
          updatedAt: now,
          manuallyEditedAt: now
        }
      }
    );

    if (emailChanged) {
      await rosterLinkInvitesCollection.updateMany(
        {
          rosterId: roster.rosterId,
          rosterOwnerId: userId,
          studentId: previousPlayer.studentId,
          acceptedAt: null,
          revokedAt: null
        },
        { $set: { revokedAt: now } }
      );
      if (previousPlayer.linkedStudentUserId) {
        await refreshLinkedStudentId(previousPlayer.linkedStudentUserId);
      }
      if (isValidEmailAddress(previousPlayer.email)) {
        await sendEmail({
          to: previousPlayer.email,
          subject: 'Your NILGuard roster email was changed',
          text: `A coach changed the email address on the roster record for ${previousPlayer.firstName} ${previousPlayer.lastName}. The old account link has been removed.`
        });
      }
    }

    await applyRosterEmailConflictReview(await rostersCollection.find({}).toArray());
    const updatedRoster = await rostersCollection.findOne({ rosterId: roster.rosterId, userId });
    return res.json({
      message: 'Athlete details updated.',
      roster: (await serializeRosters([updatedRoster], new Map(), user))[0]
    });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/rosters/:rosterId/players/:playerIndex', async (req, res, next) => {
  try {
    const user = req.user;
    assertUserRole(user, 'coach', 'school');

    const userId = String(user._id);
    const playerIndex = Number(req.params.playerIndex);
    const roster = await rostersCollection.findOne({
      rosterId: req.params.rosterId,
      userId
    });

    if (!roster) {
      return res.status(404).json({ message: 'Roster not found for the current user.' });
    }

    if (!user.school || roster.school.toLowerCase() !== user.school.toLowerCase()) {
      return res.status(403).json({ message: 'You can only edit rosters for your assigned school.' });
    }

    const players = Array.isArray(roster.players) ? roster.players : [];

    if (!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex >= players.length) {
      return res.status(404).json({ message: 'Athlete was not found in this roster.' });
    }

    const updatedPlayers = players.filter((_player, index) => index !== playerIndex);
    const now = new Date();
    await rostersCollection.updateOne(
      { rosterId: roster.rosterId, userId },
      {
        $set: {
          players: updatedPlayers,
          playerCount: updatedPlayers.length,
          updatedAt: now,
          manuallyEditedAt: now
        }
      }
    );

    await applyRosterEmailConflictReview(await rostersCollection.find({}).toArray());
    const updatedRoster = await rostersCollection.findOne({ rosterId: roster.rosterId, userId });
    return res.json({
      message: 'Athlete removed from the roster.',
      roster: (await serializeRosters([updatedRoster], new Map(), user))[0]
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/rosters/athletes', async (req, res, next) => {
  try {
    const user = req.user;

    assertUserRole(user, 'coach');

    const userId = String(user._id);

    const rosters = await rostersCollection
      .find({ userId })
      .sort({ school: 1, sport: 1, year: 1 })
      .toArray();

    const athleteMap = new Map();

    rosters.forEach((roster) => {
      const players = Array.isArray(roster.players) ? roster.players : [];

      players.forEach((player) => {
        const studentId = String(player.studentId || '').trim();

        if (!studentId) {
          return;
        }

        if (!athleteMap.has(studentId)) {
          athleteMap.set(studentId, {
            studentId,
            firstName: String(player.firstName || '').trim(),
            lastName: String(player.lastName || '').trim(),
            school: roster.school,
            linkStatus: player.linkStatus || (player.linkedStudentUserId ? 'linked' : player.inviteSentAt ? 'invited' : 'no_account'),
            assignments: []
          });
        }

        const athlete = athleteMap.get(studentId);
        const statusPriority = { no_account: 0, invited: 1, linked: 2, needs_review: 3 };
        const playerStatus = player.linkStatus || (player.linkedStudentUserId ? 'linked' : player.inviteSentAt ? 'invited' : 'no_account');
        if ((statusPriority[playerStatus] || 0) > (statusPriority[athlete.linkStatus] || 0)) {
          athlete.linkStatus = playerStatus;
        }

        const alreadyAssigned = athlete.assignments.some(
          (assignment) =>
            assignment.sport === (player.sport || roster.sport) &&
            assignment.year === (player.year || roster.year)
        );

        if (!alreadyAssigned) {
          athlete.assignments.push({
            rosterId: roster.rosterId,
            sport: player.sport || roster.sport,
            year: player.year || roster.year
          });
        }
      });
    });

    const athletes = Array.from(athleteMap.values()).sort((a, b) => {
      const lastNameComparison = a.lastName.localeCompare(
        b.lastName,
        'en',
        { sensitivity: 'base' }
      );

      if (lastNameComparison !== 0) {
        return lastNameComparison;
      }

      return a.firstName.localeCompare(
        b.firstName,
        'en',
        { sensitivity: 'base' }
      );
    });

    return res.json({
      athletes: athletes.map(serializeAthlete)
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/rosters/athletes/:studentId', async (req, res, next) => {
  try {
    const user = req.user;

    assertUserRole(user, 'coach');

    const userId = String(user._id);
    const studentId = String(req.params.studentId || '').trim();

    if (!studentId) {
      return res.status(400).json({
        message: 'A student ID is required.'
      });
    }

    const rosters = await rostersCollection
      .find({ userId })
      .sort({ school: 1, sport: 1, year: 1 })
      .toArray();

    let athlete = null;

    rosters.forEach((roster) => {
      const players = Array.isArray(roster.players) ? roster.players : [];

      const matchingPlayer = players.find(
        (player) => String(player.studentId || '').trim() === studentId
      );

      if (!matchingPlayer) {
        return;
      }

      if (!athlete) {
        athlete = {
          studentId,
          firstName: String(matchingPlayer.firstName || '').trim(),
          lastName: String(matchingPlayer.lastName || '').trim(),
          school: roster.school,
          linkedStudentUserId: matchingPlayer.linkedStudentUserId
            ? String(matchingPlayer.linkedStudentUserId)
            : null,
          assignments: []
        };
      }

      const alreadyAssigned = athlete.assignments.some(
        (assignment) =>
          assignment.sport === (matchingPlayer.sport || roster.sport) &&
          assignment.year === (matchingPlayer.year || roster.year)
      );

      if (!alreadyAssigned) {
        athlete.assignments.push({
          rosterId: roster.rosterId,
          sport: matchingPlayer.sport || roster.sport,
          year: matchingPlayer.year || roster.year
        });
      }
    });

    if (!athlete) {
      return res.status(404).json({
        message: 'Athlete was not found in your assigned rosters.'
      });
    }

    if (athlete.linkedStudentUserId && String(user.school || '').toLowerCase() === String(athlete.school || '').toLowerCase()) {
      const linkedUser = await usersCollection.findOne({ _id: athlete.linkedStudentUserId });
      if (linkedUser?.profileVisibility?.avatar === true && linkedUser.avatar) {
        athlete.avatar = linkedUser.avatar;
      }
    }

    return res.json({
      athlete: serializeAthlete(athlete)
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

    
    if (typeof user.school !== 'string' || !user.school.trim()) {
      return res.status(403).json({
        message: 'Your account must have an assigned school before uploading rosters.'
      });
    }

    const normalizedAssignedSchool = user.school.toLowerCase().trim();
    const hasMismatchedSchool = rosterGroups.some(
      (rosterGroup) =>
        rosterGroup.school.toLowerCase().trim() !== normalizedAssignedSchool
    );

    if (hasMismatchedSchool) {
      return res.status(403).json({
        message: `Roster uploads for this account must match the assigned school: ${user.school}.`
      });
    }

    const emailChanges = [];
    for (const rosterGroup of rosterGroups) {
      const existingRoster = await rostersCollection.findOne({
        userId,
        school: rosterGroup.school,
        sport: rosterGroup.sport,
        year: rosterGroup.year
      });
      const existingPlayersByStudentId = new Map(
        (existingRoster?.players || []).map((player) => [String(player.studentId), player])
      );
      rosterGroup.players.forEach((player) => {
        const existingPlayer = existingPlayersByStudentId.get(String(player.studentId));
        if (existingPlayer && normalizeRosterEmail(existingPlayer.email) !== player.email) {
          emailChanges.push({
            rosterId: existingRoster.rosterId,
            studentId: existingPlayer.studentId,
            oldEmail: existingPlayer.email,
            firstName: existingPlayer.firstName,
            lastName: existingPlayer.lastName,
            linkedStudentUserId: existingPlayer.linkedStudentUserId
          });
        }
      });
    }
    if (emailChanges.some((change) => isValidEmailAddress(change.oldEmail))) {
      createSmtpTransport();
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
      const existingPlayersByStudentId = new Map(
        (existingRoster?.players || []).map((player) => [String(player.studentId), player])
      );
      const rosterPlayers = markDuplicateRosterEmails(rosterGroup.players.map((player) => {
        const existingPlayer = existingPlayersByStudentId.get(String(player.studentId));
        if (!existingPlayer) {
          return player;
        }

        if (normalizeRosterEmail(existingPlayer.email) !== player.email) {
          return {
            ...player,
            linkRequiresInvite: true,
            linkStatus: 'no_account'
          };
        }

        if (player.linkStatus === 'needs_review') {
          return player;
        }

        return {
          ...player,
          linkedStudentUserId: existingPlayer.linkedStudentUserId,
          educationConsentAt: existingPlayer.educationConsentAt,
          educationRevokedAt: existingPlayer.educationRevokedAt,
          inviteSentAt: existingPlayer.inviteSentAt,
          linkStatus: existingPlayer.linkStatus || (existingPlayer.linkedStudentUserId ? 'linked' : 'no_account'),
          linkRequiresInvite: existingPlayer.linkRequiresInvite
        };
      }));

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
            players: rosterPlayers,
            playerCount: rosterPlayers.length,
            sourceFileName: file.originalname,
            storedFileName,
            storedFilePath,
            manuallyEditedAt: null,
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

    for (const change of emailChanges) {
      await rosterLinkInvitesCollection.updateMany(
        {
          rosterId: change.rosterId,
          rosterOwnerId: userId,
          studentId: change.studentId,
          acceptedAt: null,
          revokedAt: null
        },
        { $set: { revokedAt: now } }
      );
      if (change.linkedStudentUserId) {
        await refreshLinkedStudentId(change.linkedStudentUserId);
      }
      if (isValidEmailAddress(change.oldEmail)) {
        await sendEmail({
          to: change.oldEmail,
          subject: 'Your NILGuard roster email was changed',
          text: `A coach changed the email address on the roster record for ${change.firstName} ${change.lastName}. The old account link has been removed.`
        });
      }
    }

    await applyRosterEmailConflictReview(await rostersCollection.find({}).toArray());
    const rosterEmails = new Set(rosterGroups.flatMap((group) => group.players.map((player) => player.email)));
    for (const email of rosterEmails) {
      const account = await usersCollection.findOne({ email });
      if (account?.emailVerifiedAt && account.role === 'student') {
        await linkVerifiedAthlete(account);
      }
    }

    const domainWarnings = [];
    if (user.schoolEmailDomain) {
      for (const email of rosterEmails) {
        if (!isEmailOnSchoolDomain(email, user.schoolEmailDomain)) {
          domainWarnings.push(`Email ${email} is not on ${user.schoolEmailDomain}.`);
        }
      }
    }

    return res.status(201).json({
      message: `Processed ${savedRosters.length} roster ${savedRosters.length === 1 ? 'group' : 'groups'} from CSV upload.`,
      warnings: domainWarnings,
      rosters: await serializeRosters(savedRosters, new Map(), user)
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

    if (
      req.user.role !== 'coach' ||
      String(req.user.school || '').toLowerCase() !== String(roster.school || '').toLowerCase()
    ) {
      return res.status(403).json({ message: 'Roster exports are available only to coaches at the roster school.' });
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
    const metadataChanged =
      JSON.stringify(existing) !== JSON.stringify(metadata);

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

    // Metadata edits on a submitted contract must be reviewed by its assigned officer.
    const documentRequest = await documentRequestsCollection.findOne({
      contractId,
      studentUserId: userId
    });

    if (metadataChanged && documentRequest) {
      const previousStatus = documentRequest.status || 'pending';
      const wasReviewed = ['accepted', 'rejected'].includes(previousStatus);
      const reviewHistory = [...(documentRequest.reviewHistory || [])];
      if (
        wasReviewed &&
        !reviewHistory.some(
          (entry) =>
            entry.outcome === previousStatus &&
            String(entry.reviewedAt || entry.at || '') ===
              String(documentRequest.reviewedAt || '')
        )
      ) {
        reviewHistory.push({
          outcome: previousStatus,
          rejectionReason: documentRequest.rejectionReason || '',
          reviewedAt: documentRequest.reviewedAt || now,
          reviewedBy: documentRequest.reviewedBy || null,
          reviewerEmail: documentRequest.reviewerEmail || null,
          guidelines: documentRequest.guidelines || []
        });
      }

      const timeline = [
        ...(documentRequest.timeline || []),
        {
          type: 'agreement_details_updated',
          at: now,
          actorUserId: userId,
          actorEmail: req.user.email,
          previousStatus
        }
      ];

      const requestUpdate = {
        reviewHistory,
        updatedAt: now,
        timeline
      };

      if (wasReviewed) {
        requestUpdate.status = 'pending';
        requestUpdate.reviewedAt = null;
        requestUpdate.reviewedBy = null;
        requestUpdate.reviewerEmail = null;
        requestUpdate.rejectionReason = '';
        requestUpdate.guidelineClausesLockedAt = null;

        // Clear prior guideline decisions so the revised details are reviewed afresh.
        requestUpdate.guidelines = buildGuidelineReviews(
          contract.aiScreening?.findings || [],
          null
        );
      }

      await documentRequestsCollection.updateOne(
        { requestId: documentRequest.requestId },
        { $set: requestUpdate }
      );

      if (documentRequest.assignedComplianceUserId) {
        await createUserNotification({
          requestId: documentRequest.requestId,
          contractId,
          recipientUserId: documentRequest.assignedComplianceUserId,
          type: 'agreement_details_updated',
          title: wasReviewed
            ? 'Agreement details changed — review required'
            : 'Agreement details updated',
          body: `${req.user.email} saved changes to the agreement details for "${contract.fileName}".${wasReviewed ? ' The request has returned to pending review.' : ' Please review the updated details.'}`
        });
      }

      await createStudentNotification({
        requestId: documentRequest.requestId,
        contractId,
        studentUserId: userId,
        type: 'agreement_details_updated',
        title: wasReviewed
          ? 'Updated agreement submitted for review'
          : 'Agreement details updated',
        body: wasReviewed
          ? 'Your updated agreement details were sent to compliance for another review.'
          : 'Your saved agreement details were updated. Your compliance officer has been notified.'
      });
    }

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

    if (!contract.storedFilePath || !(await storedFileExists(contract.storedFilePath))) {
      return res.status(404).json({
        message: 'The stored PDF is unavailable. Re-upload this contract; configure persistent upload storage to prevent this after deployments.'
      });
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
      .find({
        $or: [
          { assignedComplianceUserId: userId },
          { complianceParticipantIds: { $contains: userId } }
        ]
      })
      .sort({ status: 1, submittedAt: -1, updatedAt: -1 })
      .toArray();

    return res.json({
      requests: requests.map(serializeDocumentRequest)
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/compliance/officers', async (req, res, next) => {
  try {
    const user = req.user;
    assertUserRole(user, 'student');

    if (!user.school) {
      return res.status(400).json({ message: 'Your account is not associated with a school.' });
    }

    const officers = await usersCollection
      .find({ role: 'compliance', school: user.school })
      .sort({ email: 1 })
      .toArray();
    const availableOfficerIds = new Set(officers.map((officer) => String(officer._id)));
    const savedOfficerIds = (Array.isArray(user.savedComplianceOfficerIds)
      ? user.savedComplianceOfficerIds
      : [])
      .map(String)
      .filter((id) => availableOfficerIds.has(id));

    return res.json({
      officers: officers.map((officer) => ({
        id: String(officer._id),
        email: officer.email
      })),
      savedOfficerIds
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/compliance/officers/saved', async (req, res, next) => {
  try {
    const user = req.user;
    assertUserRole(user, 'student');

    if (!user.school) {
      return res.status(400).json({ message: 'Your account is not associated with a school.' });
    }

    const email = String(req.body?.email || '').toLowerCase().trim();
    if (!isEduEmail(email)) {
      return res.status(400).json({
        message: 'Enter the official university email for a registered compliance officer.'
      });
    }

    const officer = await usersCollection.findOne({
      email,
      role: 'compliance',
      school: user.school
    });
    if (!officer) {
      return res.status(404).json({
        message: 'No registered compliance officer with that email was found at your school.'
      });
    }

    const updateResult = await usersCollection.updateOne(
      { _id: String(user._id) },
      {
        $addToSet: { savedComplianceOfficerIds: String(officer._id) },
        $set: { updatedAt: new Date() }
      }
    );
    if (!updateResult.matchedCount) {
      return res.status(404).json({ message: 'Your student account could not be found.' });
    }

    const updatedStudent = await usersCollection.findOne({ _id: String(user._id) });
    return res.json({
      message: 'Compliance officer saved.',
      officer: {
        id: String(officer._id),
        email: officer.email
      },
      savedOfficerIds: (updatedStudent.savedComplianceOfficerIds || []).map(String)
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
    const leadComplianceUserId = String(req.body?.leadComplianceUserId || '').trim();
    const legacyComplianceEmail = String(req.body?.complianceEmail || '').toLowerCase().trim();
    const selectedComplianceUserIds = Array.isArray(req.body?.complianceUserIds)
      ? req.body.complianceUserIds.map((id) => String(id).trim()).filter(Boolean)
      : [];

    if (!contractId) {
      return res.status(400).json({ message: 'A contract id is required.' });
    }

    if (!leadComplianceUserId && !legacyComplianceEmail) {
      return res.status(400).json({ message: 'Choose a lead compliance officer.' });
    }

    const contract = await contractsCollection.findOne({ contractId, userId });

    if (!contract) {
      return res.status(404).json({ message: 'Contract not found for the current student.' });
    }

    const complianceOfficer = leadComplianceUserId
      ? await usersCollection.findOne({
        _id: leadComplianceUserId,
        role: 'compliance',
        school: user.school
      })
      : await usersCollection.findOne({
        email: legacyComplianceEmail,
        role: 'compliance',
        school: user.school
      });

    if (!complianceOfficer) {
      return res.status(404).json({
        message: 'The selected lead compliance officer was not found for your school.'
      });
    }

    const complianceParticipantIds = [...new Set([
      String(complianceOfficer._id),
      ...selectedComplianceUserIds
    ])];
    const complianceParticipants = await usersCollection
      .find({
        _id: { $in: complianceParticipantIds },
        role: 'compliance',
        school: user.school
      })
      .toArray();

    if (complianceParticipants.length !== complianceParticipantIds.length) {
      return res.status(400).json({
        message: 'All selected compliance officers must belong to your school.'
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
          studentName: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
          studentDivision: user.ncaaDivision || null,
          assignedComplianceUserId: complianceOfficer._id.toString(),
          assignedComplianceEmail: complianceOfficer.email,
          complianceParticipantIds,
          complianceParticipantEmails: complianceParticipants.map((officer) => officer.email),
          status: 'pending',
          reviewDueAt,
          guidelines: buildGuidelineReviews(guidelineFindings, null),
          guidelineClausesLockedAt: null,
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
    const submissionTarget = complianceParticipants.length === 1
      ? complianceOfficer.email
      : `the compliance group led by ${complianceOfficer.email}`;

    await createStudentNotification({
      requestId,
      contractId,
      studentUserId: userId,
      type: 'contract_submitted',
      title: 'Contract submitted',
      body: `Your contract was submitted to ${submissionTarget} for review.`
    });

    await Promise.all(complianceParticipants.map((officer) => createUserNotification({
      requestId,
      contractId,
      recipientUserId: String(officer._id),
      type: existingRequest ? 'contract_resubmitted' : 'contract_submitted',
      title: existingRequest ? 'Contract resubmitted for review' : 'New contract submitted',
      body: `${user.email} ${existingRequest ? 'resubmitted' : 'submitted'} "${contract.fileName}" for review.`
    })));

    return res.status(existingRequest ? 200 : 201).json({
      message: `Document submitted to ${submissionTarget} for review.`,
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
    const rejectionReason = String(req.body?.rejectionReason || '').trim();

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

      if (!submittedDueAt) {
        guidelineValidationMessage = `A student deadline is required for ${guideline.title}.`;
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

    if (
      nextStatus === 'rejected' &&
      reviewedGuidelines.every((guideline) => guideline.decision === 'pass') &&
      !rejectionReason
    ) {
      return res.status(400).json({
        message: 'Please provide a rejection reason when all NIL guidelines pass.'
      });
    }

    const now = new Date();
    const reviewHistory = [
      ...(documentRequest.reviewHistory || []),
      {
        outcome: nextStatus,
        rejectionReason: nextStatus === 'rejected' ? rejectionReason : '',
        reviewedAt: now,
        reviewedBy: userId,
        reviewerEmail: user.email,
        guidelines: reviewedGuidelines
      }
    ];

    await documentRequestsCollection.updateOne(
      { requestId },
      {
        $set: {
          reviewHistory,
          status: nextStatus,
          guidelines: reviewedGuidelines,
          rejectionReason: nextStatus === 'rejected' ? rejectionReason : '',
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

    const needsChanges = reviewedGuidelines.filter(
      (guideline) => guideline.decision === 'needs_changes'
    );

    await createStudentNotification({
      requestId,
      contractId: documentRequest.contractId,
      studentUserId: documentRequest.studentUserId,
      type: nextStatus === 'accepted' ? 'contract_approved' : 'contract_rejected',
      title: nextStatus === 'accepted' ? 'Contract approved' : 'Contract rejected',
      body: nextStatus === 'accepted'
        ? 'Your contract passed compliance review.'
        : 'Your contract was rejected. Review the compliance task feedback.'
    });

    if (needsChanges.length > 0) {
      await createStudentNotification({
        requestId,
        contractId: documentRequest.contractId,
        studentUserId: documentRequest.studentUserId,
        type: 'task_needs_changes',
        title: 'Compliance tasks need changes',
        body: `${needsChanges.length} compliance task${needsChanges.length === 1 ? '' : 's'} need your attention.`
      });
    }

    return res.json({
      message: `Document request ${nextStatus}.`,
      request: serializeDocumentRequest(updatedRequest)
    });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/compliance/requests/:requestId/guidelines', async (req, res, next) => {
  try {
    const user = req.user;
    const userId = String(user._id);
    assertUserRole(user, 'compliance');

    const documentRequest = await documentRequestsCollection.findOne({
      requestId: req.params.requestId,
      assignedComplianceUserId: userId
    });

    if (!documentRequest) {
      return res.status(404).json({ message: 'Compliance request not found for the current officer.' });
    }

    if (documentRequest.status !== 'pending') {
      return res.status(409).json({ message: 'Guidelines can only be changed while the contract is pending.' });
    }

    const submittedGuidelines = req.body?.guidelines;
    if (!Array.isArray(submittedGuidelines) || submittedGuidelines.length === 0 || submittedGuidelines.length > 25) {
      return res.status(400).json({ message: 'Provide between 1 and 25 NIL guideline conditions.' });
    }

    const existingGuidelines = documentRequest.guidelines?.length
      ? documentRequest.guidelines
      : buildGuidelineReviews([], null);
    const seenIds = new Set();
    const now = new Date();
    const guidelines = [];

    for (const submitted of submittedGuidelines) {
      if (!submitted || typeof submitted !== 'object' || Array.isArray(submitted)) {
        return res.status(400).json({ message: 'Each guideline condition must be an object.' });
      }

      const title = String(submitted?.title || '').trim();
      const summary = String(submitted?.summary || '').trim();
      const feedback = String(submitted?.feedback || '').trim();
      const decision = String(submitted?.decision || 'pending').trim().toLowerCase();
      const dueAtText = String(submitted?.dueAt || '').trim();
      const dueAt = dueAtText ? new Date(dueAtText) : null;

      if (!title || title.length > 120) {
        return res.status(400).json({ message: 'Each guideline needs a title of 1 to 120 characters.' });
      }
      if (!summary || summary.length > 2000) {
        return res.status(400).json({ message: `Provide a condition description of 1 to 2000 characters for "${title}".` });
      }
      if (!dueAt || Number.isNaN(dueAt.getTime())) {
        return res.status(400).json({ message: `Choose a valid student deadline for "${title}".` });
      }
      if (!['pending', 'pass', 'needs_changes'].includes(decision)) {
        return res.status(400).json({ message: `Choose a valid review status for "${title}".` });
      }
      if (feedback.length > 2000) {
        return res.status(400).json({ message: `Feedback for "${title}" must be 2000 characters or fewer.` });
      }

      const prior = existingGuidelines.find((item) => item.id === submitted.id);
      const id = prior?.id || `GUIDE-${randomUUID()}`;
      if (seenIds.has(id)) {
        return res.status(400).json({ message: 'Each guideline must have a unique id.' });
      }
      seenIds.add(id);

      const contentChanged = Boolean(prior) && (
        prior.title !== title ||
        prior.summary !== summary ||
        new Date(prior.dueAt || 0).getTime() !== dueAt.getTime()
      );
      const resolvedDecision = decision;
      const reviewedAt = resolvedDecision === 'pending'
        ? null
        : (
          prior?.decision === resolvedDecision && prior.feedback === feedback && !contentChanged
            ? prior.reviewedAt || now
            : now
        );

      guidelines.push({
        ...(prior || {}),
        id,
        title,
        summary,
        aiStatus: prior?.aiStatus || 'pending',
        decision: resolvedDecision,
        feedback,
        dueAt,
        reviewedAt
      });
    }

    const client = await pool.connect();
    let transactionOpen = false;
    let updatedRequest;
    try {
      await client.query('BEGIN');
      transactionOpen = true;
      const transactionCollections = createCollections(client);
      await client.query(
        'SELECT id FROM document_requests WHERE id = $1 FOR UPDATE',
        [documentRequest._id]
      );
      const currentRequest = await transactionCollections.documentRequestsCollection.findOne({
        requestId: documentRequest.requestId,
        assignedComplianceUserId: userId
      });

      if (!currentRequest || currentRequest.status !== 'pending') {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return res.status(409).json({
          message: 'This contract is no longer pending. Refresh the page and try again.'
        });
      }

      const currentGuidelines = currentRequest.guidelines?.length
        ? currentRequest.guidelines
        : buildGuidelineReviews([], null);
      const previousDecisions = new Map(currentGuidelines.map((guideline) => [
        String(guideline.id || guideline.title),
        guideline.decision || 'pending'
      ]));
      const clauseStatusChanges = guidelines.flatMap((guideline) => {
        const key = String(guideline.id || guideline.title);
        const previousStatus = previousDecisions.get(key);
        const status = guideline.decision || 'pending';
        return previousStatus === undefined || previousStatus === status
          ? []
          : [{
              clauseId: key,
              title: guideline.title,
              previousStatus,
              status
            }];
      });
      const clauseContentChanged = currentGuidelines.length !== guidelines.length ||
        currentGuidelines.some((guideline, index) => {
          const nextGuideline = guidelines[index];
          return !nextGuideline ||
            guideline.id !== nextGuideline.id ||
            guideline.title !== nextGuideline.title ||
            guideline.summary !== nextGuideline.summary;
        });
      const clausesAlreadyLocked = Boolean(currentRequest.guidelineClausesLockedAt) ||
        hasCustomGuidelineClauseContent(currentGuidelines);

      if (clausesAlreadyLocked && clauseContentChanged) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return res.status(409).json({
          message: 'Clause wording can only be updated once per review. Deadlines, review results, and feedback can still be changed.'
        });
      }

      const updateFields = { guidelines, updatedAt: now };
      if (clausesAlreadyLocked || clauseContentChanged) {
        updateFields.guidelineClausesLockedAt = currentRequest.guidelineClausesLockedAt || now;
      }

      const updateResult = await transactionCollections.documentRequestsCollection.updateOne(
        {
          requestId: documentRequest.requestId,
          assignedComplianceUserId: userId,
          status: 'pending'
        },
        { $set: updateFields }
      );

      if (!updateResult.matchedCount) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return res.status(409).json({
          message: 'This contract is no longer pending. Refresh the page and try again.'
        });
      }

      updatedRequest = await transactionCollections.documentRequestsCollection.findOne({
        requestId: documentRequest.requestId,
        assignedComplianceUserId: userId
      });

      await transactionCollections.messagesCollection.insertOne({
        messageId: `MSG-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
        requestId: documentRequest.requestId,
        contractId: documentRequest.contractId,
        senderUserId: userId,
        senderEmail: user.email,
        senderSchool: user.school || null,
        recipientEmail: documentRequest.studentEmail,
        recipientUserId: documentRequest.studentUserId,
        subject: 'NIL guideline review updated',
        body: 'The compliance officer updated the guideline review.',
        type: 'compliance_update',
        guidelines,
        changes: clauseStatusChanges,
        isRead: false,
        createdAt: now
      });

      await createStudentNotification({
        requestId: documentRequest.requestId,
        contractId: documentRequest.contractId,
        studentUserId: documentRequest.studentUserId,
        type: 'guidelines_updated',
        title: 'NIL guideline conditions updated',
        body: `Review the updated conditions, deadlines, and officer feedback for ${documentRequest.contractFileName}.`,
        notifications: transactionCollections.notificationsCollection
      });

      await client.query('COMMIT');
      transactionOpen = false;
    } catch (error) {
      if (transactionOpen) {
        await client.query('ROLLBACK');
      }
      throw error;
    } finally {
      client.release();
    }

    return res.json({
      message: 'NIL guideline conditions saved and sent to the student inbox.',
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
      documentRequest = await documentRequestsCollection.findOne({
        requestId,
        $or: [
          { assignedComplianceUserId: userId },
          { complianceParticipantIds: { $contains: userId } }
        ]
      });
    }

    if (!documentRequest) {
      return res.status(404).json({ message: 'Requested document could not be found.' });
    }

    if (!documentRequest.storedFilePath) {
      return res.status(404).json({ message: 'No document file is stored for this request.' });
    }

    if (!(await storedFileExists(documentRequest.storedFilePath))) {
      return res.status(404).json({
        message: 'The stored PDF is unavailable. Re-upload this contract; configure persistent upload storage to prevent this after deployments.'
      });
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
    assertUserRole(user, 'student', 'compliance');

    const visibleRequests = user.role === 'student'
      ? await documentRequestsCollection.find({ studentUserId: userId }).toArray()
      : await documentRequestsCollection.find({
        $or: [
          { assignedComplianceUserId: userId },
          { complianceParticipantIds: { $contains: userId } }
        ]
      }).toArray();
    const requestIds = visibleRequests.map((request) => request.requestId);

    const messages = await messagesCollection
      .find({ requestId: { $in: requestIds } })
      .sort({ createdAt: -1 })
      .toArray();

    return res.json({ messages: messages.map((message) => serializeMessage(message, userId)) });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/compliance/messages/:requestId/read', async (req, res, next) => {
  try {
    const user = req.user;
    const userId = String(user._id);
    assertUserRole(user, 'student', 'compliance');

    const request = user.role === 'compliance'
      ? await documentRequestsCollection.findOne({
        requestId: req.params.requestId,
        $or: [
          { assignedComplianceUserId: userId },
          { complianceParticipantIds: { $contains: userId } }
        ]
      })
      : await documentRequestsCollection.findOne({
        requestId: req.params.requestId,
        studentUserId: userId
      });

    if (!request) {
      return res.status(404).json({ message: 'Compliance conversation not found for the current user.' });
    }

    await messagesCollection.updateMany(
      {
        requestId: request.requestId,
        $or: [
          { recipientUserId: userId },
          { recipientUserIds: { $contains: userId } }
        ]
      },
      { $addToSet: { readByUserIds: userId } }
    );

    return res.json({ message: 'Messages marked as read.' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/compliance/notifications', async (req, res, next) => {
  try {
    const userId = String(req.user._id);
    assertUserRole(req.user, 'student', 'compliance');
    const notifications = await notificationsCollection
      .find({ recipientUserId: userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    const visibleNotifications = [];
    const seenGuidelineUpdates = new Set();

    for (const notification of notifications) {
      if (notification.type === 'guidelines_updated' && notification.requestId) {
        if (seenGuidelineUpdates.has(notification.requestId)) {
          continue;
        }
        seenGuidelineUpdates.add(notification.requestId);
      }
      visibleNotifications.push(notification);
    }

    return res.json({
      notifications: visibleNotifications.map(serializeNotification),
      unreadCount: visibleNotifications.filter((notification) => !notification.isRead).length
    });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/compliance/notifications/:notificationId/read', async (req, res, next) => {
  try {
    const userId = String(req.user._id);
    assertUserRole(req.user, 'student', 'compliance');
    const notification = await notificationsCollection.findOne({
      notificationId: req.params.notificationId,
      recipientUserId: userId
    });

    if (notification?.type === 'guidelines_updated' && notification.requestId) {
      await notificationsCollection.updateMany(
        {
          recipientUserId: userId,
          requestId: notification.requestId,
          type: notification.type
        },
        { $set: { isRead: true, readAt: new Date() } }
      );
    } else if (notification) {
      await notificationsCollection.updateOne(
        { notificationId: notification.notificationId, recipientUserId: userId },
        { $set: { isRead: true, readAt: new Date() } }
      );
    }
    return res.json({ message: 'Notification marked as read.' });
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

    const request = user.role === 'student'
      ? await documentRequestsCollection.findOne({
        requestId,
        studentUserId: userId
      })
      : await documentRequestsCollection.findOne({
        requestId,
        $or: [
          { assignedComplianceUserId: userId },
          { complianceParticipantIds: { $contains: userId } }
        ]
      });

    if (!request) {
      return res.status(user.role === 'student' ? 403 : 404).json({
        message: user.role === 'student'
          ? 'You can only message users about your own contracts.'
          : 'You are not a member of this contract conversation.'
      });
    }

    const complianceParticipantIds = getComplianceParticipantIds(request);
    const recipientUserIds = (user.role === 'student'
      ? complianceParticipantIds
      : [String(request.studentUserId), ...complianceParticipantIds]
    ).filter((recipientId) => recipientId !== userId);
    const recipientUsers = await usersCollection
      .find({ _id: { $in: recipientUserIds } })
      .toArray();
    const recipientUsersById = new Map(
      recipientUsers.map((recipient) => [String(recipient._id), recipient])
    );

    if (recipientUserIds.some((recipientId) => !recipientUsersById.has(recipientId))) {
      return res.status(409).json({
        message: 'A compliance group member could not be found. Update the group before sending a message.'
      });
    }

    const recipientEmails = recipientUserIds.map(
      (recipientId) => recipientUsersById.get(recipientId).email
    );
    const recipientEmail = recipientEmails.join(', ');
    const recipientUserId = recipientUserIds[0] || null;
    const now = new Date();
    await messagesCollection.insertOne({
      messageId: `MSG-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
      requestId,
      contractId: request.contractId,
      senderUserId: userId,
      senderEmail: user.email,
      senderSchool: user.school || null,
      recipientEmail,
      recipientUserId,
      recipientEmails,
      recipientUserIds,
      readByUserIds: [],
      subject: subject || '(No subject)',
      body,
      isRead: false,
      createdAt: now
    });

    await Promise.all(recipientUserIds.map(async (recipientId) => {
      const recipient = recipientUsersById.get(recipientId);
      const notificationBody = `${user.email} sent a message about "${request.contractFileName || 'a contract'}".`;
      const notificationTitle = user.role === 'student'
        ? 'New student message'
        : 'New message in contract group';

      if (recipient.role === 'student') {
        await createStudentNotification({
          requestId,
          contractId: request.contractId,
          studentUserId: recipientId,
          type: 'officer_message',
          title: 'New message from compliance',
          body: subject || 'You received a new compliance message.'
        });
      } else {
        await createUserNotification({
          requestId,
          contractId: request.contractId,
          recipientUserId: recipientId,
          type: user.role === 'student' ? 'student_message' : 'group_message',
          title: notificationTitle,
          body: notificationBody
        });
      }
    }));

    return res.status(201).json({
      message: 'Message sent to the contract group.'
    });
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
  const inviteCode = String(req.body?.inviteCode || '').trim().toUpperCase();

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
  const verificationToken = normalizedRole === 'student' && requireStudentEmailVerification
    ? randomBytes(32).toString('hex')
    : null;

  if (inviteCode && !/^[A-F0-9]{32}$/.test(inviteCode)) {
    return res.status(400).json({ message: 'The roster invite code is invalid.' });
  }

  if (!resolvedSchool) {
    return res.status(400).json({
      message: buildUnsupportedSchoolEmailMessage()
    });
  }

  const existingUser = await usersCollection.findOne({ email: normalizedEmail });
  if (existingUser) {
    return res.status(409).json({ message: 'An account with this email already exists.' });
  }

  if (normalizedRole === 'student' && inviteCode) {
    let invitation;
    try {
      invitation = await findValidRosterLinkInvite(inviteCode);
    } catch (error) {
      return res.status(error.statusCode || 400).json({
        message: 'This coach invitation is invalid, expired, or revoked. Ask your coach to send another invite.'
      });
    }

    if (invitation.player.linkStatus === 'needs_review') {
      return res.status(409).json({
        message: 'This roster row needs coach review before you can register.'
      });
    }
    if (invitation.player.linkedStudentUserId) {
      return res.status(409).json({
        message: 'This roster row is already linked to a student account.'
      });
    }
    if (!canRegisterWithCoachInvite(normalizedEmail, invitation.invite, invitation.player)) {
      return res.status(403).json({
        message: 'Use the email address listed on your coach’s roster invitation.'
      });
    }
  }

  if (verificationToken) {
    createSmtpTransport();
  }

  const passwordHash = await bcrypt.hash(String(password), 10);
  const now = new Date();

  const insertResult = await usersCollection.insertOne({
    email: normalizedEmail,
    passwordHash,
    role: normalizedRole,
    school: resolvedSchool ? resolvedSchool.school : null,
    ncaaDivision: resolvedSchool ? resolvedSchool.division : null,
    schoolEmailDomain: resolvedSchool ? resolvedSchool.primaryDomain : null,
    emailVerifiedAt: verificationToken ? null : now,
    emailVerificationTokenHash: verificationToken ? createHash('sha256').update(verificationToken).digest('hex') : null,
    emailVerificationExpiresAt: verificationToken ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : null,
    emailVerificationSentAt: verificationToken ? now : null,
    profileVisibility: {},
    educationSharingEnabled: false,
    createdAt: now,
    updatedAt: now
  });

  if (verificationToken) {
    await sendEmailVerification({ email: normalizedEmail }, verificationToken, inviteCode);
  } else {
    if (normalizedRole === 'student') {
      await linkVerifiedAthlete({
        _id: insertResult.insertedId,
        email: normalizedEmail,
        role: normalizedRole,
        emailVerifiedAt: now
      }, { allowPendingVerification: true });
    }
    const token = signToken({ _id: insertResult.insertedId, role: normalizedRole });
    setAuthCookie(res, token);
  }
  await recordAuditLog('register', { userId: String(insertResult.insertedId), email: normalizedEmail, ip: req.ip });

  return res.status(201).json({
    message: verificationToken
      ? 'Check your email to verify your account before signing in.'
      : 'Registration successful.',
    emailVerificationRequired: Boolean(verificationToken),
    user: verificationToken ? undefined : serializeUser(
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

app.post('/api/auth/verify-email', async (req, res, next) => {
  try {
    const token = String(req.body?.token || '').trim();
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      return res.status(400).json({ message: 'This email verification link is invalid or expired.' });
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const user = await usersCollection.findOne({ emailVerificationTokenHash: tokenHash });
    if (
      !user ||
      !user.emailVerificationExpiresAt ||
      new Date(user.emailVerificationExpiresAt) <= new Date()
    ) {
      return res.status(400).json({ message: 'This email verification link is invalid or expired.' });
    }

    const now = new Date();
    await usersCollection.updateOne(
      { _id: user._id },
      {
        $set: {
          emailVerifiedAt: now,
          emailVerificationTokenHash: null,
          emailVerificationExpiresAt: null,
          updatedAt: now
        }
      }
    );
    const verifiedUser = { ...user, emailVerifiedAt: now };
    await linkVerifiedAthlete(verifiedUser, { allowPendingVerification: true });
    const savedUser = await usersCollection.findOne({ _id: user._id });
    const authToken = signToken(savedUser);
    setAuthCookie(res, authToken);
    await recordAuditLog('email_verified', {
      userId: String(user._id),
      email: user.email,
      ip: req.ip
    });

    return res.json({
      message: 'Email verified successfully.',
      user: serializeUser(savedUser)
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/resend-verification', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!isValidEmailAddress(email)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }

    const user = await usersCollection.findOne({ email });
    if (user?.role === 'student' && !user.emailVerifiedAt) {
      const lastSentAt = Date.parse(user.emailVerificationSentAt || '');
      if (Number.isFinite(lastSentAt) && Date.now() - lastSentAt < 60 * 1000) {
        return res.status(429).json({ message: 'Wait one minute before requesting another verification email.' });
      }

      const token = randomBytes(32).toString('hex');
      const now = new Date();
      await usersCollection.updateOne(
        { _id: user._id },
        {
          $set: {
            emailVerificationTokenHash: createHash('sha256').update(token).digest('hex'),
            emailVerificationExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
            emailVerificationSentAt: now,
            updatedAt: now
          }
        }
      );
      await sendEmailVerification(user, token);
    }

    return res.json({ message: 'If an unverified athlete account exists for that address, a verification email has been sent.' });
  } catch (error) {
    next(error);
  }
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

  if (user.role === 'student' && !user.emailVerifiedAt && requireStudentEmailVerification) {
    return res.status(403).json({
      message: 'Verify your email address before signing in. You can request a new confirmation link.'
    });
  }

  if (user.role === 'student' && !user.emailVerifiedAt) {
    user.emailVerifiedAt = now;
    await usersCollection.updateOne(
      { _id: user._id },
      {
        $set: {
          emailVerifiedAt: now,
          emailVerificationTokenHash: null,
          emailVerificationExpiresAt: null,
          updatedAt: now
        }
      }
    );
    await linkVerifiedAthlete(user, { allowPendingVerification: true });
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

app.get('/api/profile', requireAuth, (req, res) => {
  if (!['coach', 'school', 'student'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Profiles are available to coach and athlete accounts.' });
  }
  return res.json({ profile: serializeUser(req.user) });
});

app.patch('/api/profile', requireAuth, async (req, res, next) => {
  try {
    const user = req.user;
    if (!['coach', 'school', 'student'].includes(user.role)) {
      return res.status(403).json({ message: 'Profiles are available to coach and athlete accounts.' });
    }

    const isAthlete = user.role === 'student';
    const editableFields = isAthlete
      ? new Set([
          'firstName', 'lastName', 'preferredName', 'avatar', 'sport', 'year',
          'contactEmail', 'profileVisibility', 'educationSharingEnabled'
        ])
      : new Set(['firstName', 'lastName', 'title', 'phone', 'avatar']);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const unexpectedFields = Object.keys(body).filter((field) => !editableFields.has(field));
    if (unexpectedFields.length) {
      return res.status(400).json({
        message: 'Only editable profile fields may be changed. Email, school, role, and student ID are read-only.'
      });
    }

    const update = {};
    const stringFields = isAthlete
      ? ['firstName', 'lastName', 'preferredName', 'sport', 'year', 'contactEmail']
      : ['firstName', 'lastName', 'title', 'phone'];
    for (const field of stringFields) {
      if (typeof body[field] !== 'string') {
        return res.status(400).json({ message: `${field} must be text.` });
      }
      update[field] = body[field].trim();
    }

    const requiredFields = isAthlete
      ? ['firstName', 'lastName', 'sport', 'year']
      : ['firstName', 'lastName', 'title'];
    if (requiredFields.some((field) => !update[field])) {
      return res.status(400).json({ message: 'Complete all required profile fields.' });
    }
    if (Object.entries(update).some(([field, value]) => value.length > (field === 'contactEmail' ? 254 : field === 'phone' ? 25 : 100))) {
      return res.status(400).json({ message: 'Profile fields exceed their maximum length.' });
    }
    if (update.phone && !/^[0-9+().\-\s]{7,25}$/.test(update.phone)) {
      return res.status(400).json({ message: 'Enter a valid phone number.' });
    }
    if (update.contactEmail && !isValidEmailAddress(update.contactEmail)) {
      return res.status(400).json({ message: 'Enter a valid contact email address.' });
    }
    if (Object.prototype.hasOwnProperty.call(body, 'avatar')) {
      try {
        update.avatar = validateAvatar(body.avatar);
      } catch (error) {
        return res.status(400).json({ message: error.message });
      }
    }

    if (isAthlete && Object.prototype.hasOwnProperty.call(body, 'profileVisibility')) {
      const visibility = body.profileVisibility;
      const allowedVisibilityFields = ['preferredName', 'avatar', 'sport', 'year', 'contactEmail'];
      if (!visibility || typeof visibility !== 'object' || Array.isArray(visibility)) {
        return res.status(400).json({ message: 'Profile visibility settings are invalid.' });
      }
      if (Object.keys(visibility).some((field) => !allowedVisibilityFields.includes(field))) {
        return res.status(400).json({ message: 'Profile visibility contains an unsupported field.' });
      }
      if (Object.values(visibility).some((value) => typeof value !== 'boolean')) {
        return res.status(400).json({ message: 'Profile visibility settings must be on or off.' });
      }
      update.profileVisibility = {
        ...(user.profileVisibility || {}),
        ...Object.fromEntries(allowedVisibilityFields.map((field) => [
          field,
          visibility[field] === true || (visibility[field] === undefined && user.profileVisibility?.[field] === true)
        ]))
      };
    }

    if (isAthlete && Object.prototype.hasOwnProperty.call(body, 'educationSharingEnabled')) {
      if (typeof body.educationSharingEnabled !== 'boolean') {
        return res.status(400).json({ message: 'Education sharing must be on or off.' });
      }
      update.educationSharingEnabled = body.educationSharingEnabled;
    }

    const now = new Date();
    update.updatedAt = now;
    await usersCollection.updateOne({ _id: user._id }, { $set: update });

    if (isAthlete && Object.prototype.hasOwnProperty.call(update, 'educationSharingEnabled')) {
      const rosters = await rostersCollection.find({}).toArray();
      for (const roster of rosters) {
        const players = Array.isArray(roster.players) ? [...roster.players] : [];
        let changed = false;
        players.forEach((player, index) => {
          if (player.linkedStudentUserId !== String(user._id)) {
            return;
          }
          players[index] = {
            ...player,
            educationConsentAt: update.educationSharingEnabled ? now : null,
            educationRevokedAt: update.educationSharingEnabled ? null : now
          };
          changed = true;
        });
        if (changed) {
          await rostersCollection.updateOne(
            { _id: roster._id },
            { $set: { players, updatedAt: now } }
          );
        }
      }
    }

    await recordAuditLog('profile_updated', {
      userId: String(user._id),
      email: user.email,
      ip: req.ip
    });
    const updatedUser = await usersCollection.findOne({ _id: user._id });
    return res.json({ message: 'Profile updated.', profile: serializeUser(updatedUser) });
  } catch (error) {
    next(error);
  }
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
  await pool.query('SELECT 1');
  await initializeDatabase(pool);
  ({
    usersCollection,
    contractsCollection,
    rostersCollection,
    documentRequestsCollection,
    auditLogsCollection,
    messagesCollection,
    notificationsCollection,
    rosterLinkInvitesCollection
  } = createCollections(pool));

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
      if (!(await storedFileExists(contract.storedFilePath))) {
        return res.status(404).json({
          message: 'The stored PDF is unavailable. Re-upload this contract; configure persistent upload storage to prevent this after deployments.'
        });
      }
      const fileBuffer = await fs.readFile(contract.storedFilePath);

      // Keep the existing rule-based report
      const analysis = await analyzeContractPdf(fileBuffer, contract.fileName);
      const findings = analysis.findings || [];

      const aiConfig = getAiConfig();
      const fileHash = createHash('sha256').update(fileBuffer).digest('hex');
      const savedAiAnalysis = contract.aiAnalysisCache;
      const forceRefresh = req.query.refresh === 'true';
      const hasCachedAnalysis =
        savedAiAnalysis &&
        savedAiAnalysis.fileHash === fileHash &&
        savedAiAnalysis.model === aiConfig.model &&
        savedAiAnalysis.rubricVersion === RUBRIC_VERSION;

      let aiStatus = 'unavailable';
      let aiMessage = '';
      let aiAnalysis = null;
      let aiCacheHit = false;

      if (!aiConfig.enabled) {
        aiMessage = 'AI_API_KEY is not configured. The rule-based report is still available.';
      } else if (hasCachedAnalysis && !forceRefresh) {
        aiStatus = 'completed';
        aiAnalysis = savedAiAnalysis.analysis;
        aiCacheHit = true;
      } else {
        const aiStartedAt = Date.now();

        try {
          const result = await analyzeContractWithAi(fileBuffer, contract.fileName, {
            school: contract.school,
            division: contract.ncaaDivision,
            stateName: contract.schoolStateName
          });

          aiStatus = result.aiStatus;
          aiMessage = result.message || '';
          aiAnalysis = result.analysis || null;

          if (aiAnalysis) {
            const cacheEntry = {
              fileHash: fileHash,
              model: aiConfig.model,
              rubricVersion: RUBRIC_VERSION,
              savedAt: new Date(),
              analysis: aiAnalysis
            };

            try {
              await contractsCollection.updateOne(
                { contractId: contractId, userId: userId },
                { $set: { aiAnalysisCache: cacheEntry } }
              );
            } catch (cacheError) {
              console.warn('AI result could not be cached:', {
                contractId: contractId,
                message: cacheError.message
              });
            }
          }
        } catch (error) {
          aiStatus = 'failed';
          aiMessage = error.message || 'The AI analysis failed.';
        }

        console.log('AI contract analysis finished:', {
          contractId: contractId,
          userId: userId,
          model: aiConfig.model,
          status: aiStatus,
          cacheHit: false,
          elapsedMs: Date.now() - aiStartedAt,
          findingCount: aiAnalysis?.findings?.length || 0
        });
      }

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
        findings,
        aiStatus: aiStatus,
        aiMessage: aiMessage,
        aiCacheHit: aiCacheHit,
        aiAnalysis: aiAnalysis
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
