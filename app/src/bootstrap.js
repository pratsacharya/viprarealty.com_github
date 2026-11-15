// Idempotent schema bootstrap: create tables if missing, seed categories once.
// Lets /install work without a manual phpMyAdmin import.
const fs = require('fs');
const path = require('path');
const pool = require('./db');

// Single source of truth for the category → sub-category tree.
// Change this list (and redeploy) to add/remove/reorder sub-categories;
// ensureCategoryTree() reconciles the live DB to match on each startup.
const CATEGORY_TREE = {
  Residential: ['Flats', 'Villas', 'Pent House', 'Independent House', 'Independent Plots'],
  Commercial: ['Office Space', 'Retail Store', 'Warehouse', 'Land'],
};

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
    // 2) Seed the categories only when empty (sub-categories handled by
    //    ensureCategoryTree, which also runs on an existing DB).
    const [[{ c }]] = await conn.query('SELECT COUNT(*) c FROM categories');
    if (c === 0) {
      await conn.query("INSERT INTO categories (name) VALUES ('Residential'),('Commercial')");
    }
  } finally {
    conn.release();
  }
  await ensureCategoryTree();
}

// Drop columns retired from the data model, if they still exist on the live
// properties table. Idempotent: checks information_schema first (MySQL has no
// DROP COLUMN IF EXISTS), so it ALTERs once and then no-ops forever after.
async function dropLegacyColumns() {
  const legacy = ['listing_type', 'builder_name', 'building_name'];
  const conn = await pool.getConnection();
  try {
    for (const col of legacy) {
      const [[{ n }]] = await conn.query(
        "SELECT COUNT(*) n FROM information_schema.COLUMNS " +
          "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='properties' AND COLUMN_NAME=?",
        [col]
      );
      if (n > 0) await conn.query('ALTER TABLE properties DROP COLUMN `' + col + '`');
    }
  } finally {
    conn.release();
  }
}

// Reconcile the live categories/sub-categories to CATEGORY_TREE:
// add any missing, and remove any that are no longer in the tree AND not
// referenced by a property. Idempotent — safe to run on every startup.
async function ensureCategoryTree() {
  const conn = await pool.getConnection();
  try {
    for (const [cat, subs] of Object.entries(CATEGORY_TREE)) {
      await conn.query('INSERT IGNORE INTO categories (name) VALUES (?)', [cat]);
      const [[c]] = await conn.query('SELECT id FROM categories WHERE name=?', [cat]);
      const catId = c.id;
      for (const s of subs) {
        await conn.query(
          'INSERT INTO sub_categories (category_id, name) SELECT ?, ? FROM DUAL ' +
            'WHERE NOT EXISTS (SELECT 1 FROM sub_categories WHERE category_id=? AND name=?)',
          [catId, s, catId, s]
        );
      }
      const [extra] = await conn.query(
        'SELECT id FROM sub_categories WHERE category_id=? AND name NOT IN (?)',
        [catId, subs]
      );
      for (const e of extra) {
        const [[u]] = await conn.query('SELECT COUNT(*) n FROM properties WHERE sub_category_id=?', [e.id]);
        if (u.n === 0) await conn.query('DELETE FROM sub_categories WHERE id=?', [e.id]);
      }
    }
  } finally {
    conn.release();
  }
}

// Turn a DB driver error into a message that names the Hostinger setting to fix.
function dbMessage(e) {
  const code = e && e.code;
  let msg;
  switch (code) {
    case 'ER_ACCESS_DENIED_ERROR':
      msg = 'Database access denied. Check the DB_USER and DB_PASS environment variables in Hostinger, and that the user is assigned to the database.';
      break;
    case 'ER_BAD_DB_ERROR':
      msg = 'Database not found. Check DB_NAME, and create that MySQL database in Hostinger if it does not exist yet.';
      break;
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      msg = 'Database host not found. Check the DB_HOST value (on Hostinger shared hosting it is usually "localhost").';
      break;
    case 'ECONNREFUSED':
    case 'ETIMEDOUT':
    case 'PROTOCOL_CONNECTION_LOST':
      msg = 'Could not reach the database server. Check DB_HOST and that the MySQL database is running.';
      break;
    default:
      msg = 'Database error (' + (code || (e && e.message) || 'unknown') + '). Check the DB_HOST, DB_NAME, DB_USER and DB_PASS environment variables in Hostinger.';
  }
  return msg;
}

module.exports = { ensureSchema, dbMessage, ensureCategoryTree, dropLegacyColumns, CATEGORY_TREE };
