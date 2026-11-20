// Idempotent schema bootstrap: create tables if missing, seed categories once.
// Lets /install work without a manual phpMyAdmin import.
const fs = require('fs');
const path = require('path');
const pool = require('./db');
const fields = require('./fields');

// Single source of truth for the category → sub-category tree.
// Change this list (and redeploy) to add/remove/reorder sub-categories;
// ensureCategoryTree() reconciles the live DB to match on each startup.
const CATEGORY_TREE = {
  Residential: ['Flat', 'Villa', 'Pent House', 'Independent House', 'Independent Plot'],
  Commercial: ['Office Space', 'Retail Store', 'Warehouse', 'Land'],
};

// Sub-categories renamed in place (old name -> new name). ensureCategoryTree()
// renames the live rows before reconciling, so listings keep their sub-category.
// Old names also stay accepted by the CSV importer.
const RENAMED_SUBS = {
  'Flats': 'Flat',
  'Villas': 'Villa',
  'Independent Plots': 'Independent Plot',
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
      // rename first; if both names exist, move listings onto the new one and drop the old
      for (const [oldName, newName] of Object.entries(RENAMED_SUBS)) {
        if (!subs.includes(newName)) continue;
        const [[o]] = await conn.query('SELECT id FROM sub_categories WHERE category_id=? AND name=?', [catId, oldName]);
        if (!o) continue;
        const [[n]] = await conn.query('SELECT id FROM sub_categories WHERE category_id=? AND name=?', [catId, newName]);
        if (n) {
          await conn.query('UPDATE properties SET sub_category_id=? WHERE sub_category_id=?', [n.id, o.id]);
          await conn.query('DELETE FROM sub_categories WHERE id=?', [o.id]);
        } else {
          await conn.query('UPDATE sub_categories SET name=? WHERE id=?', [newName, o.id]);
        }
      }
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

// Create the property_fields table on an existing DB (schema.sql covers fresh installs).
async function ensureFieldsTable() {
  await pool.query(`CREATE TABLE IF NOT EXISTS property_fields (
    property_id INT NOT NULL,
    grp VARCHAR(12) NOT NULL,
    field_key VARCHAR(40) NOT NULL,
    value VARCHAR(255) NOT NULL DEFAULT '',
    display TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (property_id, grp, field_key),
    FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

// Rent listings: maintenance moved from the Highlights section to the price
// section (properties.maintenance). Add the column if missing, then copy a
// Highlights value across once for rent listings that have none yet.
async function ensureMaintenanceColumn() {
  const [[{ n }]] = await pool.query(
    "SELECT COUNT(*) n FROM information_schema.COLUMNS " +
      "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='properties' AND COLUMN_NAME='maintenance'");
  if (n === 0) await pool.query('ALTER TABLE properties ADD COLUMN maintenance VARCHAR(80) NULL AFTER deposit_amount');
  await pool.query(
    `UPDATE properties p JOIN property_fields f
       ON f.property_id=p.id AND f.grp='highlight' AND f.field_key IN ('maintenance','maintenance_cam') AND f.value<>''
     SET p.maintenance=LEFT(f.value, 80)
     WHERE p.search_type='Rent' AND (p.maintenance IS NULL OR p.maintenance='')`);
}

// Buy listings: "+ Stamp Duty, Regn + Taxes" in the price section. Add the column if missing.
async function ensureStampDutyColumn() {
  const [[{ n }]] = await pool.query(
    "SELECT COUNT(*) n FROM information_schema.COLUMNS " +
      "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='properties' AND COLUMN_NAME='stamp_duty'");
  if (n === 0) await pool.query('ALTER TABLE properties ADD COLUMN stamp_duty VARCHAR(80) NULL AFTER down_payment');
}

// Brokerage (price section, Rent and Buy) and the photo label text
// (shown instead of "For sale" / "For rent"). Add the columns if missing.
async function ensureBrokerageLabelColumns() {
  const add = { brokerage: 'VARCHAR(80) NULL AFTER possession_date', image_label: 'VARCHAR(40) NULL AFTER brokerage' };
  for (const [col, def] of Object.entries(add)) {
    const [[{ n }]] = await pool.query(
      "SELECT COUNT(*) n FROM information_schema.COLUMNS " +
        "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='properties' AND COLUMN_NAME=?", [col]);
    if (n === 0) await pool.query(`ALTER TABLE properties ADD COLUMN ${col} ${def}`);
  }
}

// Excel import downloads linked photos into the uploads folder; source_url keeps
// the link each one came from, so importing the same link again is not a duplicate.
async function ensureImageSourceColumn() {
  const [[{ n }]] = await pool.query(
    "SELECT COUNT(*) n FROM information_schema.COLUMNS " +
      "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='property_images' AND COLUMN_NAME='source_url'");
  if (n === 0) await pool.query('ALTER TABLE property_images ADD COLUMN source_url VARCHAR(500) NULL AFTER file_path');
}

// Copy the old spec columns (bedrooms, carpet area, floor, ...) into highlight
// rows for listings that have none yet — existing listings and CSV imports.
// Idempotent: a listing with any highlight row is left alone.
async function backfillHighlights() {
  const [rows] = await pool.query(
    `SELECT p.*, s.name sub_name FROM properties p JOIN sub_categories s ON s.id=p.sub_category_id
     WHERE NOT EXISTS (SELECT 1 FROM property_fields f WHERE f.property_id=p.id AND f.grp='highlight')`);
  for (const r of rows) {
    for (const [k, v] of Object.entries(fields.fromLegacy(r.sub_name, r))) {
      await pool.query('INSERT IGNORE INTO property_fields (property_id,grp,field_key,value,display) VALUES (?,?,?,?,1)',
        [r.id, 'highlight', k, String(v).slice(0, 255)]);
    }
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

module.exports = { ensureSchema, dbMessage, ensureCategoryTree, dropLegacyColumns, ensureFieldsTable, ensureMaintenanceColumn, ensureStampDutyColumn, ensureImageSourceColumn, ensureBrokerageLabelColumns, backfillHighlights, CATEGORY_TREE, RENAMED_SUBS };
