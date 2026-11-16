const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const pool = require('../src/db');
const { requireLogin, requireMaster, csrfToken, checkCsrf } = require('../src/middleware');
const { sendSms } = require('../src/mailer');
const { ensureSchema, dbMessage, CATEGORY_TREE, backfillHighlights } = require('../src/bootstrap');
const fields = require('../src/fields');

// canonical display order for sub-categories, from the tree
const SUB_ORDER = {};
Object.values(CATEGORY_TREE).forEach((list) => list.forEach((n, i) => { SUB_ORDER[n] = i; }));

const router = express.Router();

// Auto-wrap async handlers so a rejected promise goes to the error handler
// instead of crashing the process (Express 4 does not catch async errors).
['get', 'post'].forEach((m) => {
  const orig = router[m].bind(router);
  router[m] = (p, ...hs) => orig(p, ...hs.map((h) =>
    (typeof h === 'function' && h.constructor.name === 'AsyncFunction')
      ? (req, res, next) => Promise.resolve(h(req, res, next)).catch(next)
      : h));
});

const { UPLOAD_DIR, diskPath, isLocal, isMissing, storageInfo } = require('../src/uploads');

const OK_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = (file.originalname.split('.').pop() || '').toLowerCase();
    cb(null, 'p_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex') + '.' + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, OK_EXT.includes((file.originalname.split('.').pop() || '').toLowerCase())),
});

const base = (req) => ({ user: req.session.user, csrf: csrfToken(req), SITE_NAME: 'Vipra Realty' });

// ---------- install (one-time) ----------
router.get('/install', async (req, res) => {
  try {
    await ensureSchema();
  } catch (e) {
    console.error('install bootstrap failed:', e);
    return res.render('install', { hasMaster: false, done: false, error: dbMessage(e), MASTER_EMAIL: process.env.MASTER_EMAIL || '', SITE_NAME: 'Vipra Realty' });
  }
  const [[{ n }]] = await pool.query("SELECT COUNT(*) n FROM users WHERE role='master'");
  res.render('install', { hasMaster: n > 0, done: false, error: null, MASTER_EMAIL: process.env.MASTER_EMAIL || '', SITE_NAME: 'Vipra Realty' });
});
router.post('/install', async (req, res) => {
  try {
    await ensureSchema();
  } catch (e) {
    console.error('install bootstrap failed:', e);
    return res.render('install', { hasMaster: false, done: false, error: dbMessage(e), MASTER_EMAIL: (req.body.email || '').trim(), SITE_NAME: 'Vipra Realty' });
  }
  const [[{ n }]] = await pool.query("SELECT COUNT(*) n FROM users WHERE role='master'");
  if (n > 0) return res.render('install', { hasMaster: true, done: false, error: null, MASTER_EMAIL: '', SITE_NAME: 'Vipra Realty' });
  const email = (req.body.email || '').trim();
  const pass = req.body.password || '';
  let error = null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) error = 'Enter a valid email.';
  else if (pass.length < 8) error = 'Password must be at least 8 characters.';
  if (error) return res.render('install', { hasMaster: false, done: false, error, MASTER_EMAIL: email, SITE_NAME: 'Vipra Realty' });
  await pool.query("INSERT INTO users (email,password_hash,role,is_active,must_change_password) VALUES (?,?,'master',1,0)",
    [email, bcrypt.hashSync(pass, 10)]);
  res.render('install', { hasMaster: false, done: true, error: null, MASTER_EMAIL: '', SITE_NAME: 'Vipra Realty' });
});

// ---------- auth ----------
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/adminvr/dashboard');
  res.render('login', { error: null, SITE_NAME: 'Vipra Realty' });
});
router.post('/login', async (req, res) => {
  const email = (req.body.email || '').trim();
  const pass = req.body.password || '';
  const [rows] = await pool.query('SELECT * FROM users WHERE email=? AND is_active=1', [email]);
  const u = rows[0];
  if (u && bcrypt.compareSync(pass, u.password_hash)) {
    req.session.regenerate((err) => {
      if (err) return res.status(500).send('Session error');
      req.session.user = { id: u.id, email: u.email, role: u.role, must_change_password: !!u.must_change_password };
      res.redirect('/adminvr/dashboard');
    });
  } else {
    res.render('login', { error: 'Incorrect email or password.', SITE_NAME: 'Vipra Realty' });
  }
});
router.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/adminvr/login')));

// everything below needs a login
router.use(requireLogin);

// ---------- dashboard ----------
router.get('/dashboard', async (req, res) => {
  const q = async (sql) => (await pool.query(sql))[0][0].n;
  const counts = {
    'Total listings': await q('SELECT COUNT(*) n FROM properties'),
    'Active': await q("SELECT COUNT(*) n FROM properties WHERE status='active'"),
    'Sold out': await q("SELECT COUNT(*) n FROM properties WHERE status='sold_out'"),
    'Rented out': await q("SELECT COUNT(*) n FROM properties WHERE status='rented_out'"),
    'Enquiries': await q('SELECT COUNT(*) n FROM enquiries WHERE otp_verified=1'),
  };
  const [byCat] = await pool.query(`SELECT c.name, COUNT(p.id) n FROM categories c
    LEFT JOIN properties p ON p.category_id=c.id GROUP BY c.id`);
  const [top] = await pool.query(`SELECT p.project_title, COUNT(e.id) n
    FROM properties p JOIN enquiries e ON e.property_id=p.id AND e.otp_verified=1
    GROUP BY p.id ORDER BY n DESC LIMIT 5`);
  const storage = req.session.user.role === 'master' ? storageInfo() : null;
  res.render('dashboard', { ...base(req), page: 'dashboard', counts, byCat, top, storage });
});

// ---------- properties list + status actions ----------
router.get('/properties', async (req, res) => {
  const [rows] = await pool.query(`SELECT p.*, c.name cat, s.name subcat
    FROM properties p LEFT JOIN categories c ON c.id=p.category_id
    LEFT JOIN sub_categories s ON s.id=p.sub_category_id ORDER BY p.created_at DESC`);
  res.render('properties', { ...base(req), page: 'properties', rows });
});
router.get('/properties/:id/status', requireMaster, checkCsrf, async (req, res) => {
  const allowed = ['active', 'inactive', 'sold_out', 'rented_out'];
  const s = allowed.includes(req.query.status) ? req.query.status : 'active';
  await pool.query('UPDATE properties SET status=? WHERE id=?', [s, +req.params.id]);
  res.redirect('/adminvr/properties');
});
router.get('/properties/:id/feature', requireMaster, checkCsrf, async (req, res) => {
  await pool.query('UPDATE properties SET featured = 1 - featured WHERE id=?', [+req.params.id]);
  res.redirect('/adminvr/properties');
});
router.get('/properties/:id/delete', requireMaster, checkCsrf, async (req, res) => {
  const id = +req.params.id;
  const [imgs] = await pool.query('SELECT file_path FROM property_images WHERE property_id=?', [id]);
  for (const r of imgs) removeFile(r.file_path);
  await pool.query('DELETE FROM properties WHERE id=?', [id]);
  res.redirect('/adminvr/properties');
});

// ---------- photos of one property (master) ----------
function removeFile(filePath) {
  if (!isLocal(filePath)) return;
  try { fs.unlinkSync(diskPath(filePath)); } catch (e) {}
}
// remove one photo
router.get('/properties/:id/images/:imgId/delete', requireMaster, checkCsrf, async (req, res) => {
  const id = +req.params.id;
  const [rows] = await pool.query('SELECT id, file_path FROM property_images WHERE id=? AND property_id=?', [+req.params.imgId, id]);
  if (rows[0]) {
    removeFile(rows[0].file_path);
    await pool.query('DELETE FROM property_images WHERE id=?', [rows[0].id]);
  }
  res.redirect('/adminvr/property-edit?id=' + id);
});
// remove every photo record whose file no longer exists on the server
router.get('/properties/:id/images/prune', requireMaster, checkCsrf, async (req, res) => {
  const id = +req.params.id;
  const [rows] = await pool.query('SELECT id, file_path FROM property_images WHERE property_id=?', [id]);
  const dead = rows.filter((r) => isMissing(r.file_path)).map((r) => r.id);
  if (dead.length) await pool.query('DELETE FROM property_images WHERE id IN (?)', [dead]);
  res.redirect('/adminvr/property-edit?id=' + id);
});

// ---------- add / edit ----------
const PROP_FIELDS = ['project_title', 'description', 'search_type',
  'category_id', 'sub_category_id', 'city', 'locality', 'sale_price', 'monthly_rent', 'deposit_amount', 'down_payment',
  'possession_date', 'bedrooms', 'bathrooms', 'carpet_area', 'builtup_area', 'total_floors', 'floor_no',
  'ceiling_height', 'status', 'featured'];

async function loadFormData() {
  const [cats] = await pool.query('SELECT * FROM categories ORDER BY id');
  const [subs] = await pool.query('SELECT * FROM sub_categories');
  subs.sort((a, b) => a.category_id - b.category_id ||
    ((SUB_ORDER[a.name] ?? 99) - (SUB_ORDER[b.name] ?? 99)));
  return { cats, subs, cities: ['Bangalore', 'Mumbai', 'Navi Mumbai', 'Thane'],
    catalog: { highlights: fields.HIGHLIGHTS, amenities: fields.AMENITIES, furnishings: fields.FURNISHINGS, furnished: fields.FURNISHED_VALUES } };
}

// Stored extra fields of one property, shaped for the form:
// { highlight: {key: {value, display}}, amenity: {...}, furnishing: {...} }
async function loadFieldValues(id) {
  const out = { highlight: {}, amenity: {}, furnishing: {} };
  if (!id) return out;
  const [rows] = await pool.query('SELECT grp, field_key, value, display FROM property_fields WHERE property_id=?', [id]);
  for (const r of rows) if (out[r.grp]) out[r.grp][r.field_key] = { value: r.value, display: !!r.display };
  return out;
}

// Read the extra fields out of a submitted form, keeping only keys the catalog
// defines for this listing's type. Same shape as loadFieldValues().
function readFieldValues(body, subName, searchType) {
  const obj = (k) => (body[k] && typeof body[k] === 'object' ? body[k] : {});
  const txt = (v) => (typeof v === 'string' ? v.trim().slice(0, 255) : '');
  const out = { highlight: {}, amenity: {}, furnishing: {} };
  const hl = obj('hl'), show = obj('hl_show'), am = obj('am'), amOn = obj('am_on'), fu = obj('fu');
  for (const f of fields.highlightsFor(subName)) {
    if (f.rentOnly && searchType !== 'Rent') continue;
    let v = txt(hl[f.key]);
    if (f.type === 'select' && v && !f.options.includes(v)) v = '';
    if (v) out.highlight[f.key] = { value: v, display: !!show[f.key] };
  }
  for (const a of fields.AMENITIES) {
    const v = txt(am[a.key]);
    if (amOn[a.key] || v) out.amenity[a.key] = { value: v, display: true };
  }
  const furnishing = (out.highlight.furnishing || {}).value;
  if (fields.furnishingsApply(searchType, furnishing)) {
    for (const f of fields.FURNISHINGS) { const v = txt(fu[f.key]); if (v) out.furnishing[f.key] = { value: v, display: true }; }
  }
  return out;
}

router.get('/property-edit', async (req, res) => {
  const id = +(req.query.id || 0);
  if (id && req.session.user.role !== 'master') return res.status(403).send('Editing is master-only.');
  let p = { search_type: 'Rent', status: 'active', featured: 0 };
  let images = [];
  if (id) {
    const [rows] = await pool.query('SELECT * FROM properties WHERE id=?', [id]);
    if (!rows[0]) return res.status(404).send('Not found.');
    p = rows[0];
    const [imgs] = await pool.query('SELECT id, file_path FROM property_images WHERE property_id=? ORDER BY sort_order, id', [id]);
    images = imgs.map((i) => ({ id: i.id, src: isLocal(i.file_path) ? '/' + i.file_path : i.file_path, missing: isMissing(i.file_path) }));
  }
  res.render('property-form', { ...base(req), page: 'property-edit', ...(await loadFormData()), p, isEdit: !!id, images, fv: await loadFieldValues(id), error: null });
});

router.post('/property-edit', upload.array('images', 20), async (req, res) => {
  const id = +(req.query.id || 0);
  if (id && req.session.user.role !== 'master') return res.status(403).send('Editing is master-only.');
  if ((req.body.csrf || '') !== req.session.csrf) return res.status(400).send('Invalid request token.');

  const num = (k) => { const v = (req.body[k] || '').toString().replace(/[^0-9]/g, ''); return v === '' ? null : parseInt(v, 10); };
  const str = (k) => (req.body[k] || '').trim();
  const data = {
    project_title: str('project_title'),
    description: str('description'), search_type: str('search_type') === 'Buy' ? 'Buy' : 'Rent',
    category_id: num('category_id'), sub_category_id: num('sub_category_id'), city: str('city'), locality: str('locality'),
    sale_price: num('sale_price'), monthly_rent: num('monthly_rent'), deposit_amount: num('deposit_amount'),
    down_payment: num('down_payment'), possession_date: str('possession_date'),
    status: ['active', 'inactive', 'sold_out', 'rented_out'].includes(str('status')) ? str('status') : 'active',
    featured: req.body.featured ? 1 : 0,
  };

  // extra fields for this listing's type; the old spec columns follow the highlights
  const [[subRow]] = await pool.query('SELECT name FROM sub_categories WHERE id=?', [data.sub_category_id || 0]);
  const subName = subRow ? subRow.name : '';
  const fv = readFieldValues(req.body, subName, data.search_type);
  if (subName) {
    Object.assign(data, fields.legacyColumns(subName,
      Object.fromEntries(Object.entries(fv.highlight).map(([k, f]) => [k, f.value]))));
  }
  const cols = PROP_FIELDS.filter((k) => k in data);

  if (!data.project_title) {
    (req.files || []).forEach((f) => { try { fs.unlinkSync(f.path); } catch (e) {} });
    return res.render('property-form', { ...base(req), page: 'property-edit', ...(await loadFormData()), p: { ...data, id: id || undefined }, isEdit: !!id, images: [], fv, error: 'Enter a property title.' });
  }

  let pid;
  if (id) {
    const set = cols.map((k) => `${k}=?`).join(', ');
    await pool.query(`UPDATE properties SET ${set} WHERE id=?`, [...cols.map((k) => data[k]), id]);
    pid = id;
  } else {
    const [ins] = await pool.query(`INSERT INTO properties (${[...cols, 'created_by'].join(',')}) VALUES (${cols.map(() => '?').join(',')},?)`,
      [...cols.map((k) => data[k]), req.session.user.id]);
    pid = ins.insertId;
  }

  // replace the stored extra fields with what was submitted
  await pool.query('DELETE FROM property_fields WHERE property_id=?', [pid]);
  const frows = [];
  for (const grp of Object.keys(fv)) for (const [k, f] of Object.entries(fv[grp])) frows.push([pid, grp, k, f.value, f.display ? 1 : 0]);
  if (frows.length) await pool.query('INSERT INTO property_fields (property_id,grp,field_key,value,display) VALUES ?', [frows]);

  // record uploaded images, cap at 20 total
  let have = (await pool.query('SELECT COUNT(*) n FROM property_images WHERE property_id=?', [pid]))[0][0].n;
  for (const f of (req.files || [])) {
    if (have >= 20) { try { fs.unlinkSync(f.path); } catch (e) {} continue; }
    await pool.query('INSERT INTO property_images (property_id,file_path,sort_order) VALUES (?,?,?)',
      [pid, 'uploads/' + f.filename, have]);
    have++;
  }
  res.redirect('/adminvr/properties');
});

// ---------- change password ----------
router.get('/change-password', (req, res) => res.render('change-password', { ...base(req), page: 'change-password', msg: null, error: null }));
router.post('/change-password', checkCsrf, async (req, res) => {
  const n = req.body.new || '', c = req.body.confirm || '';
  let error = null, msg = null;
  if (n.length < 8) error = 'Password must be at least 8 characters.';
  else if (n !== c) error = 'Passwords do not match.';
  else {
    await pool.query('UPDATE users SET password_hash=?, must_change_password=0 WHERE id=?', [bcrypt.hashSync(n, 10), req.session.user.id]);
    req.session.user.must_change_password = false;
    msg = 'Password updated.';
  }
  res.render('change-password', { ...base(req), page: 'change-password', msg, error });
});

// ---------- enquiries (master) ----------
router.get('/enquiries', requireMaster, async (req, res) => {
  const [rows] = await pool.query(`SELECT e.*, p.project_title FROM enquiries e
    LEFT JOIN properties p ON p.id=e.property_id WHERE e.otp_verified=1 ORDER BY e.created_at DESC LIMIT 500`);
  res.render('enquiries', { ...base(req), page: 'enquiries', rows });
});

// ---------- users (master) ----------
router.get('/users', requireMaster, async (req, res) => {
  const [users] = await pool.query('SELECT * FROM users ORDER BY role, email');
  res.render('users', { ...base(req), page: 'users', users, msg: null, error: null });
});
router.post('/users', requireMaster, checkCsrf, async (req, res) => {
  const email = (req.body.email || '').trim(), temp = (req.body.temp || '').trim();
  let error = null, msg = null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) error = 'Enter a valid email.';
  else if (temp.length < 8) error = 'Temporary password must be at least 8 characters.';
  else {
    try {
      await pool.query("INSERT INTO users (email,password_hash,role,is_active,must_change_password) VALUES (?,?,'sub',1,1)",
        [email, bcrypt.hashSync(temp, 10)]);
      // TODO: email the sub-user their temp password + /adminvr/login link (nodemailer + Hostinger SMTP)
      msg = `Sub-user added. Share these with ${email}: password "${temp}" and the login link /adminvr/login.`;
    } catch (e) {
      error = e.code === 'ER_DUP_ENTRY' ? 'That email already exists.' : 'Could not add user.';
    }
  }
  const [users] = await pool.query('SELECT * FROM users ORDER BY role, email');
  res.render('users', { ...base(req), page: 'users', users, msg, error });
});
router.get('/users/:id/delete', requireMaster, checkCsrf, async (req, res) => {
  await pool.query("DELETE FROM users WHERE id=? AND role='sub'", [+req.params.id]);
  res.redirect('/adminvr/users');
});

// ---------- CSV import (master) ----------
const { parse } = require('csv-parse/sync');
const uploadCsv = multer({ dest: UPLOAD_DIR, limits: { fileSize: 5 * 1024 * 1024 } });
router.get('/import', requireMaster, (req, res) => res.render('import', { ...base(req), page: 'import', report: null }));
router.post('/import', requireMaster, uploadCsv.single('csv'), async (req, res) => {
  if ((req.body.csv_csrf || req.body.csrf || '') !== req.session.csrf) return res.status(400).send('Invalid request token.');
  if (!req.file) return res.render('import', { ...base(req), page: 'import', report: { err: 'No file uploaded.' } });

  const raw = fs.readFileSync(req.file.path);
  try { fs.unlinkSync(req.file.path); } catch (e) {}
  let records;
  try {
    records = parse(raw, { columns: (h) => h.map((c) => c.toLowerCase().replace(/\(.*?\)/g, '').trim()), skip_empty_lines: true, trim: true });
  } catch (e) {
    return res.render('import', { ...base(req), page: 'import', report: { err: 'Could not read CSV: ' + e.message } });
  }

  const [catRows] = await pool.query('SELECT id,name FROM categories');
  const [subRows] = await pool.query('SELECT id,name FROM sub_categories');
  const catMap = Object.fromEntries(catRows.map((r) => [r.name.toLowerCase(), r.id]));
  const subMap = Object.fromEntries(subRows.map((r) => [r.name.toLowerCase(), r.id]));
  const statusMap = { 'active': 'active', 'inactive': 'inactive', 'sold out': 'sold_out', 'rented out': 'rented_out' };
  const dig = (v) => { v = (v || '').replace(/[^0-9]/g, ''); return v === '' ? null : parseInt(v, 10); };

  let total = 0, ok = 0, fail = 0; const errors = [];
  for (const row of records) {
    total++;
    const g = (k) => (row[k] || '').trim();
    const propTitle = g('property title') || g('project title');
    if (!propTitle) { fail++; errors.push(`Row ${total}: missing property title`); continue; }
    const stype = g('search type').toLowerCase() === 'buy' ? 'Buy' : 'Rent';
    try {
      const [r] = await pool.query(
        `INSERT INTO properties (project_title,description,search_type,
          category_id,sub_category_id,city,locality,sale_price,monthly_rent,deposit_amount,down_payment,possession_date,
          bedrooms,bathrooms,carpet_area,builtup_area,total_floors,floor_no,ceiling_height,status,featured,created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [propTitle, g('brief description'), stype,
         catMap[g('category').toLowerCase()] || null, subMap[g('sub-category').toLowerCase()] || null,
         g('city'), g('locality / area'), dig(g('sale price')), dig(g('monthly rent')), dig(g('deposit amount')),
         dig(g('down payment')), g('possession date'), dig(g('bedrooms')), dig(g('bathrooms')), dig(g('carpet area')),
         dig(g('built-up / plot size')), dig(g('total floors')), dig(g('floor no')), g('ceiling height'),
         statusMap[g('status').toLowerCase()] || 'active', g('featured').toLowerCase() === 'yes' ? 1 : 0, req.session.user.id]);
      const pid = r.insertId;
      const urls = (g('image urls') || '').split(';').map((s) => s.trim()).filter(Boolean).slice(0, 20);
      let o = 0; for (const u of urls) await pool.query('INSERT INTO property_images (property_id,file_path,sort_order) VALUES (?,?,?)', [pid, u, o++]);
      ok++;
    } catch (e) { fail++; errors.push(`Row ${total}: ${e.message}`); }
  }
  await backfillHighlights();   // imported spec columns -> highlight fields
  await pool.query('INSERT INTO import_batches (filename,rows_total,rows_ok,rows_failed,errors,created_by) VALUES (?,?,?,?,?,?)',
    [req.file.originalname, total, ok, fail, errors.join('\n'), req.session.user.id]);
  res.render('import', { ...base(req), page: 'import', report: { total, ok, fail, errors } });
});

module.exports = router;
