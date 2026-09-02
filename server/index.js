import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
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

if (!process.env.DATABASE_URL) {
  throw new Error('Missing DATABASE_URL. Add it to your environment variables.');
}

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true
  })
);
app.use(express.json());
app.use(cookieParser());

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

// same idea as mapContractRow, rosters and requests also come back snake_case now
function mapRosterRow(row) {
  return {
    ...row,
    rosterId: row.roster_id,
    userId: row.user_id,
    sourceFileName: row.source_file_name,
    storedFileName: row.stored_file_name,
    storedFilePath: row.stored_file_path,
    playerCount: row.player_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRequestRow(row) {
  return {
    ...row,
    requestId: row.request_id,
    contractId: row.contract_id,
    contractFileName: row.contract_file_name,
    contractFileSize: row.contract_file_size,
    storedFilePath: row.stored_file_path,
    mimeType: row.mime_type,
    studentUserId: row.student_user_id,
    studentEmail: row.student_email,
    studentSchool: row.student_school,
    studentDivision: row.student_division,
    assignedComplianceUserId: row.assigned_compliance_user_id,
    assignedComplianceEmail: row.assigned_compliance_email,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    reviewerEmail: row.reviewer_email,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
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

  const remaining = await query('SELECT COUNT(*) FROM rosters WHERE stored_file_path = $1', [storedFilePath]);

  if (Number(remaining.rows[0].count) > 0) {
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
    const result = await query(
      'SELECT * FROM rosters WHERE user_id = $1 ORDER BY updated_at DESC, school ASC, sport ASC, year ASC',
      [userId]
    );
    const rosters = result.rows.map(mapRosterRow);

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

      const existingResult = await query(
        'SELECT * FROM rosters WHERE user_id = $1 AND school = $2 AND sport = $3 AND year = $4',
        [userId, rosterGroup.school, rosterGroup.sport, rosterGroup.year]
      );
      const existingRoster = existingResult.rows[0] ? mapRosterRow(existingResult.rows[0]) : null;

      if (existingRoster?.storedFilePath && existingRoster.storedFilePath !== storedFilePath) {
        staleFilePaths.add(existingRoster.storedFilePath);
      }

      // one row per user/school/sport/year, the insert becomes an update on a repeat upload
      const upsertResult = await query(
        `INSERT INTO rosters
         (roster_id, user_id, school, sport, year, players, player_count, source_file_name, stored_file_name, stored_file_path)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (user_id, school, sport, year) DO UPDATE SET
           roster_id = $1, players = $6, player_count = $7, source_file_name = $8,
           stored_file_name = $9, stored_file_path = $10, updated_at = now()
         RETURNING *`,
        [
          rosterId,
          userId,
          rosterGroup.school,
          rosterGroup.sport,
          rosterGroup.year,
          JSON.stringify(rosterGroup.players),
          rosterGroup.players.length,
          file.originalname,
          storedFileName,
          storedFilePath
        ]
      );
      savedRosters.push(mapRosterRow(upsertResult.rows[0]));
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
    const rosterResult = await query(
      'SELECT * FROM rosters WHERE roster_id = $1 AND user_id = $2',
      [rosterId, userId]
    );
    const roster = rosterResult.rows[0] ? mapRosterRow(rosterResult.rows[0]) : null;

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
    const rosterResult = await query(
      'SELECT * FROM rosters WHERE roster_id = $1 AND user_id = $2',
      [rosterId, userId]
    );
    const roster = rosterResult.rows[0] ? mapRosterRow(rosterResult.rows[0]) : null;

    if (!roster) {
      return res.status(404).json({ message: 'Roster not found for the current user.' });
    }

    await query('DELETE FROM rosters WHERE roster_id = $1 AND user_id = $2', [rosterId, userId]);
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
      const result = await query(
        'SELECT * FROM document_requests WHERE student_user_id = $1 ORDER BY submitted_at DESC, updated_at DESC',
        [userId]
      );

      return res.json({
        requests: result.rows.map(mapRequestRow).map(serializeDocumentRequest)
      });
    }

    assertUserRole(user, 'compliance');

    const result = await query(
      'SELECT * FROM document_requests WHERE assigned_compliance_user_id = $1 ORDER BY status ASC, submitted_at DESC, updated_at DESC',
      [userId]
    );

    return res.json({
      requests: result.rows.map(mapRequestRow).map(serializeDocumentRequest)
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
    const existingResult = await query(
      'SELECT * FROM document_requests WHERE student_user_id = $1 AND contract_id = $2',
      [userId, contractId]
    );
    const existingRequest = existingResult.rows[0] ? mapRequestRow(existingResult.rows[0]) : null;
    const requestId = existingRequest?.requestId || `REQ-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;

    // resubmitting for the same contract reuses the row and resets the review fields
    const upsertResult = await query(
      `INSERT INTO document_requests
       (request_id, contract_id, contract_file_name, contract_file_size, stored_file_path, mime_type,
        student_user_id, student_email, student_school, student_division,
        assigned_compliance_user_id, assigned_compliance_email, status, reviewed_at, reviewed_by, reviewer_email, submitted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NULL, NULL, NULL, $14)
       ON CONFLICT (student_user_id, contract_id) DO UPDATE SET
         request_id = $1, contract_file_name = $3, contract_file_size = $4, stored_file_path = $5,
         mime_type = $6, student_email = $8, student_school = $9, student_division = $10,
         assigned_compliance_user_id = $11, assigned_compliance_email = $12, status = $13,
         reviewed_at = NULL, reviewed_by = NULL, reviewer_email = NULL, submitted_at = $14, updated_at = now()
       RETURNING *`,
      [
        requestId,
        contractId,
        contract.fileName,
        contract.fileSize,
        contract.storedFilePath,
        contract.mimeType || 'application/pdf',
        userId,
        user.email,
        user.school || null,
        user.ncaaDivision || null,
        String(complianceOfficer.id),
        complianceOfficer.email,
        'pending',
        now
      ]
    );

    const savedRequest = mapRequestRow(upsertResult.rows[0]);

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

    const requestResult = await query(
      'SELECT * FROM document_requests WHERE request_id = $1 AND assigned_compliance_user_id = $2',
      [requestId, userId]
    );
    const documentRequest = requestResult.rows[0] ? mapRequestRow(requestResult.rows[0]) : null;

    if (!documentRequest) {
      return res.status(404).json({ message: 'Compliance request not found for the current officer.' });
    }

    await query(
      `UPDATE document_requests
       SET status = $1, reviewed_at = now(), reviewed_by = $2, reviewer_email = $3, updated_at = now()
       WHERE request_id = $4`,
      [nextStatus, userId, user.email, requestId]
    );

    const updatedResult = await query('SELECT * FROM document_requests WHERE request_id = $1', [requestId]);
    const updatedRequest = mapRequestRow(updatedResult.rows[0]);

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
      const requestResult = await query(
        'SELECT * FROM document_requests WHERE request_id = $1 AND student_user_id = $2',
        [requestId, userId]
      );
      documentRequest = requestResult.rows[0] ? mapRequestRow(requestResult.rows[0]) : null;
    } else {
      assertUserRole(user, 'compliance');
      const requestResult = await query(
        'SELECT * FROM document_requests WHERE request_id = $1 AND assigned_compliance_user_id = $2',
        [requestId, userId]
      );
      documentRequest = requestResult.rows[0] ? mapRequestRow(requestResult.rows[0]) : null;
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
  await initDb();

  // Contract analysis endpoint (must be after the database is ready)
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
