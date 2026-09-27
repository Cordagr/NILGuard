import { randomUUID } from 'crypto';

const collectionNames = new Set([
  'users',
  'contracts',
  'rosters',
  'document_requests',
  'audit_logs',
  'messages',
  'notifications'
]);

const dateFieldPattern = /(?:At|Until|Date)$/;

function reviveDates(value) {
  if (Array.isArray(value)) {
    return value.map(reviveDates);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(Object.entries(value).map(([key, child]) => {
    if (typeof child === 'string' && dateFieldPattern.test(key) && !Number.isNaN(Date.parse(child))) {
      return [key, new Date(child)];
    }

    return [key, reviveDates(child)];
  }));
}

function getPath(value, path) {
  return path.split('.').reduce((current, segment) => current?.[segment], value);
}

function setPath(value, path, nextValue) {
  const segments = path.split('.');
  const leaf = segments.pop();
  const parent = segments.reduce((current, segment) => {
    if (!current[segment] || typeof current[segment] !== 'object') {
      current[segment] = {};
    }
    return current[segment];
  }, value);
  parent[leaf] = nextValue;
}

function compileFilter(filter = {}) {
  const clauses = [];
  const values = [];

  for (const [key, expected] of Object.entries(filter)) {
    const path = key.split('.').map((segment) => `'${segment.replaceAll("'", "''")}'`);
    const expression = key === '_id'
      ? 'id'
      : `${path.slice(0, -1).reduce((sql, segment) => `${sql}->${segment}`, 'data')}->>${path[path.length - 1]}`;

    if (expected && typeof expected === 'object' && !Array.isArray(expected) && '$in' in expected) {
      values.push(expected.$in.map(String));
      clauses.push(`${expression} = ANY($${values.length}::text[])`);
      continue;
    }

    values.push(expected === null || expected === undefined ? null : String(expected));
    clauses.push(`${expression} IS NOT DISTINCT FROM $${values.length}::text`);
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    values
  };
}

function applyUpdate(document, update) {
  const next = structuredClone(document);

  for (const [path, value] of Object.entries(update.$set || {})) {
    setPath(next, path, value);
  }

  for (const [path, amount] of Object.entries(update.$inc || {})) {
    setPath(next, path, Number(getPath(next, path) || 0) + Number(amount));
  }

  for (const [path, value] of Object.entries(update.$push || {})) {
    const current = getPath(next, path);
    setPath(next, path, [...(Array.isArray(current) ? current : []), value]);
  }

  return next;
}

function projectDocument(document, projection) {
  if (!projection || !Object.values(projection).some(Boolean)) {
    return document;
  }

  const projected = {};
  for (const [path, included] of Object.entries(projection)) {
    if (included) {
      const value = getPath(document, path);
      if (value !== undefined) {
        setPath(projected, path, value);
      }
    }
  }

  if (projection._id !== 0) {
    projected._id = document._id;
  }

  return projected;
}

function compareValues(left, right) {
  if (left instanceof Date && right instanceof Date) {
    return left - right;
  }

  if (left == null || right == null) {
    return left == null ? (right == null ? 0 : -1) : 1;
  }

  return typeof left === 'number' && typeof right === 'number'
    ? left - right
    : String(left).localeCompare(String(right));
}

export class PgCollection {
  constructor(pool, name) {
    if (!collectionNames.has(name)) {
      throw new Error(`Unknown PostgreSQL collection: ${name}`);
    }
    this.pool = pool;
    this.name = name;
  }

  async insertOne(document) {
    const id = String(document._id || randomUUID());
    const storedDocument = { ...document, _id: id };
    await this.pool.query(
      `INSERT INTO ${this.name} (id, data) VALUES ($1, $2::jsonb)`,
      [id, JSON.stringify(storedDocument)]
    );
    return { insertedId: id };
  }

  async findOne(filter = {}) {
    const { where, values } = compileFilter(filter);
    const result = await this.pool.query(
      `SELECT id, data FROM ${this.name} ${where} LIMIT 1`,
      values
    );
    return result.rows[0] ? reviveDates(result.rows[0].data) : null;
  }

  find(filter = {}) {
    return new PgCursor(this.pool, this.name, filter);
  }

  async countDocuments(filter = {}) {
    const { where, values } = compileFilter(filter);
    const result = await this.pool.query(
      `SELECT COUNT(*)::int AS count FROM ${this.name} ${where}`,
      values
    );
    return result.rows[0].count;
  }

  async updateOne(filter, update, options = {}) {
    const current = await this.findOne(filter);
    if (!current) {
      if (!options.upsert) {
        return { matchedCount: 0, modifiedCount: 0 };
      }

      const base = Object.fromEntries(
        Object.entries(filter).filter(([, value]) => !value || typeof value !== 'object')
      );
      const inserted = applyUpdate(base, update);
      for (const [path, value] of Object.entries(update.$setOnInsert || {})) {
        setPath(inserted, path, value);
      }
      const result = await this.insertOne(inserted);
      return { matchedCount: 0, modifiedCount: 0, upsertedId: result.insertedId };
    }

    const updated = applyUpdate(current, update);
    await this.pool.query(
      `UPDATE ${this.name} SET data = $2::jsonb WHERE id = $1`,
      [current._id, JSON.stringify(updated)]
    );
    return { matchedCount: 1, modifiedCount: 1 };
  }

  async updateMany(filter, update) {
    const documents = await this.find(filter).toArray();
    for (const document of documents) {
      const updated = applyUpdate(document, update);
      await this.pool.query(
        `UPDATE ${this.name} SET data = $2::jsonb WHERE id = $1`,
        [document._id, JSON.stringify(updated)]
      );
    }
    return { matchedCount: documents.length, modifiedCount: documents.length };
  }

  async deleteOne(filter) {
    const current = await this.findOne(filter);
    if (!current) {
      return { deletedCount: 0 };
    }
    await this.pool.query(`DELETE FROM ${this.name} WHERE id = $1`, [current._id]);
    return { deletedCount: 1 };
  }
}

class PgCursor {
  constructor(pool, name, filter) {
    this.pool = pool;
    this.name = name;
    this.filter = filter;
    this.sortFields = null;
    this.projection = null;
    this.maximum = null;
  }

  sort(fields) {
    this.sortFields = fields;
    return this;
  }

  project(fields) {
    this.projection = fields;
    return this;
  }

  limit(maximum) {
    this.maximum = maximum;
    return this;
  }

  async toArray() {
    const { where, values } = compileFilter(this.filter);
    const result = await this.pool.query(
      `SELECT id, data FROM ${this.name} ${where}`,
      values
    );
    let documents = result.rows.map((row) => reviveDates(row.data));

    if (this.sortFields) {
      const sortFields = Object.entries(this.sortFields);
      documents.sort((left, right) => {
        for (const [path, direction] of sortFields) {
          const comparison = compareValues(getPath(left, path), getPath(right, path));
          if (comparison !== 0) {
            return comparison * direction;
          }
        }
        return 0;
      });
    }

    if (this.maximum !== null) {
      documents = documents.slice(0, this.maximum);
    }

    return documents.map((document) => projectDocument(document, this.projection));
  }
}

export async function initializeDatabase(pool) {
  const tableNames = [...collectionNames];
  for (const tableName of tableNames) {
    await pool.query(`CREATE TABLE IF NOT EXISTS ${tableName} (id text PRIMARY KEY, data jsonb NOT NULL)`);
  }

  const indexes = [
    'CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users ((data->>\'email\'))',
    'CREATE INDEX IF NOT EXISTS messages_recipient_created ON messages ((data->>\'recipientEmail\'), (data->>\'createdAt\') DESC)',
    'CREATE INDEX IF NOT EXISTS messages_sender_created ON messages ((data->>\'senderUserId\'), (data->>\'createdAt\') DESC)',
    'CREATE INDEX IF NOT EXISTS notifications_recipient_created ON notifications ((data->>\'recipientUserId\'), (data->>\'createdAt\') DESC)',
    'CREATE UNIQUE INDEX IF NOT EXISTS notifications_id_unique ON notifications ((data->>\'notificationId\'))',
    'CREATE INDEX IF NOT EXISTS contracts_user_created ON contracts ((data->>\'userId\'), (data->>\'createdAt\') DESC)',
    'CREATE INDEX IF NOT EXISTS contracts_user_accessed ON contracts ((data->>\'userId\'), (data->>\'lastAccessedAt\') DESC)',
    'CREATE UNIQUE INDEX IF NOT EXISTS contracts_owner_id_unique ON contracts ((data->>\'contractId\'), (data->>\'userId\'))',
    'CREATE INDEX IF NOT EXISTS rosters_user_updated ON rosters ((data->>\'userId\'), (data->>\'updatedAt\') DESC)',
    'CREATE UNIQUE INDEX IF NOT EXISTS rosters_owner_group_unique ON rosters ((data->>\'userId\'), (data->>\'school\'), (data->>\'sport\'), (data->>\'year\'))',
    'CREATE UNIQUE INDEX IF NOT EXISTS document_requests_id_unique ON document_requests ((data->>\'requestId\'))',
    'CREATE INDEX IF NOT EXISTS document_requests_student_submitted ON document_requests ((data->>\'studentUserId\'), (data->>\'submittedAt\') DESC)',
    'CREATE INDEX IF NOT EXISTS document_requests_school_status_submitted ON document_requests ((data->>\'studentSchool\'), (data->>\'status\'), (data->>\'submittedAt\') DESC)',
    'CREATE UNIQUE INDEX IF NOT EXISTS document_requests_student_contract_unique ON document_requests ((data->>\'studentUserId\'), (data->>\'contractId\'))',
    'CREATE INDEX IF NOT EXISTS audit_logs_created ON audit_logs ((data->>\'createdAt\') DESC)',
    'CREATE INDEX IF NOT EXISTS audit_logs_user_created ON audit_logs ((data->>\'userId\'), (data->>\'createdAt\') DESC)'
  ];

  for (const indexSql of indexes) {
    await pool.query(indexSql);
  }
}

export function createCollections(pool) {
  return {
    usersCollection: new PgCollection(pool, 'users'),
    contractsCollection: new PgCollection(pool, 'contracts'),
    rostersCollection: new PgCollection(pool, 'rosters'),
    documentRequestsCollection: new PgCollection(pool, 'document_requests'),
    auditLogsCollection: new PgCollection(pool, 'audit_logs'),
    messagesCollection: new PgCollection(pool, 'messages'),
    notificationsCollection: new PgCollection(pool, 'notifications')
  };
}