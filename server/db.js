import 'dotenv/config';
import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

pool.on('error', (error) => {
  console.error('Unexpected database error:', error.message);
});

// runs the schema file so a fresh database is ready on first start
export async function initDb() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = await fs.readFile(schemaPath, 'utf8');
  await pool.query(schema);
}

export function query(sql, params = []) {
  return pool.query(sql, params);
}

export async function closeDb() {
  await pool.end();
}
