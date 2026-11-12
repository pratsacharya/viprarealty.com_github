// Idempotent schema bootstrap: create tables if missing, seed categories once.
// Lets /install work without a manual phpMyAdmin import.
const fs = require('fs');
const path = require('path');
const pool = require('./db');

async function ensureSchema() {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  // Split into statements, drop comment-only chunks.
  const statements = raw
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);

  const conn = await pool.getConnection();
  try {
    // 1) Create tables (CREATE TABLE IF NOT EXISTS — safe to repeat).
    for (const st of statements) {
      if (/^CREATE\s+TABLE/i.test(st)) await conn.query(st);
    }
    // 2) Seed the category tree only when empty (avoids duplicates on repeat).
    const [[{ c }]] = await conn.query('SELECT COUNT(*) c FROM categories');
    if (c === 0) {
      await conn.query("INSERT INTO categories (name) VALUES ('Residential'),('Commercial')");
      await conn.query(
        "INSERT INTO sub_categories (category_id, name) VALUES " +
          "(1,'Flats'),(1,'Villas'),(1,'Independent House'),(1,'Independent Plots')," +
          "(2,'Office Space'),(2,'Retail Store'),(2,'Warehouse'),(2,'Land'),(2,'Others')"
      );
    }
  } finally {
    conn.release();
  }
}

// Turn a DB driver error into a message that names the Hostinger setting to fix.
function dbMessage(e) {
  const code = e && e.code;
  switch (code) {
    case 'ER_ACCESS_DENIED_ERROR':
      return 'Database access denied. Check the DB_USER and DB_PASS environment variables in Hostinger, and that the user is assigned to the database.';
    case 'ER_BAD_DB_ERROR':
      return 'Database not found. Check DB_NAME, and create that MySQL database in Hostinger if it does not exist yet.';
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return 'Database host not found. Check the DB_HOST value (on Hostinger shared hosting it is usually "localhost").';
    case 'ECONNREFUSED':
    case 'ETIMEDOUT':
    case 'PROTOCOL_CONNECTION_LOST':
      return 'Could not reach the database server. Check DB_HOST and that the MySQL database is running.';
    default:
      return 'Database error (' + (code || (e && e.message) || 'unknown') + '). Check the DB_HOST, DB_NAME, DB_USER and DB_PASS environment variables in Hostinger.';
  }
}

module.exports = { ensureSchema, dbMessage };
