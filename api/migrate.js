const fs = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: true } });
  try {
    const schema = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schema);
    process.stdout.write('Database schema applied.\n');
  } finally {
    await pool.end();
  }
}

main().catch((error) => { process.stderr.write(`Migration failed: ${error.message}\n`); process.exitCode = 1; });
