const express = require('express');
const crypto = require('crypto');
const pool = require('../src/db');
const { sendSms, notifyMasterEnquiry } = require('../src/mailer');

const router = express.Router();

// Auto-wrap async handlers so a rejected promise is forwarded to the error
// handler instead of crashing the process (Express 4 behaviour).
['get', 'post'].forEach((m) => {
  const orig = router[m].bind(router);
  router[m] = (p, ...hs) => orig(p, ...hs.map((h) =>
    (typeof h === 'function' && h.constructor.name === 'AsyncFunction')
      ? (req, res, next) => Promise.resolve(h(req, res, next)).catch(next)
      : h));
});

// Category → sub-category tree, from the live DB (drives the public filters)
router.get('/categories', async (req, res) => {
  const [cats] = await pool.query('SELECT id, name FROM categories ORDER BY id');
  const [subs] = await pool.query('SELECT category_id, name FROM sub_categories');
  const { CATEGORY_TREE } = require('../src/bootstrap');
  const order = {};
  Object.values(CATEGORY_TREE).forEach((list) => list.forEach((n, i) => { order[n] = i; }));
  const tree = {};
  cats.forEach((c) => { tree[c.name] = []; });
  subs.forEach((s) => {
    const c = cats.find((x) => x.id === s.category_id);
    if (c) tree[c.name].push(s.name);
  });
  Object.keys(tree).forEach((k) => tree[k].sort((a, b) => (order[a] ?? 99) - (order[b] ?? 99)));
  res.json({ tree });
});

// Step 1: submit enquiry, issue a 4-digit OTP
router.post('/enquiry', async (req, res) => {
  const name = (req.body.name || '').trim();
  const mobile = (req.body.mobile || '').replace(/[^0-9]/g, '');
  const requirement = (req.body.requirement || '').trim();
  const propertyId = req.body.property_id ? parseInt(req.body.property_id, 10) : null;

  if (!name || mobile.length !== 10) {
    return res.status(422).json({ error: 'Name and a 10-digit mobile are required.' });
  }
  const [r] = await pool.query(
    'INSERT INTO enquiries (property_id,name,mobile,requirement,otp_verified) VALUES (?,?,?,?,0)',
    [propertyId || null, name, mobile, requirement]);
  const enquiryId = r.insertId;

  const otp = String(crypto.randomInt(0, 10000)).padStart(4, '0');
  await pool.query("INSERT INTO otp_logs (mobile,otp,result) VALUES (?,?,'issued')", [mobile, otp]);
  await sendSms(mobile, `Your Vipra Realty verification code is ${otp}`);

  res.json({ ok: true, enquiry_id: enquiryId, message: 'OTP sent to your mobile.' });
});

// Step 2: verify OTP; on success the enquiry reaches the team
router.post('/verify-otp', async (req, res) => {
  const mobile = (req.body.mobile || '').replace(/[^0-9]/g, '');
  const otp = (req.body.otp || '').replace(/[^0-9]/g, '');
  const enquiryId = parseInt(req.body.enquiry_id || 0, 10);

  const [rows] = await pool.query(
    `SELECT * FROM otp_logs WHERE mobile=? AND result='issued'
     AND issued_at > (NOW() - INTERVAL 10 MINUTE) ORDER BY id DESC LIMIT 1`, [mobile]);
  const log = rows[0];
  if (!log || log.otp !== otp) return res.status(401).json({ error: 'Invalid or expired OTP.' });

  await pool.query("UPDATE otp_logs SET result='verified', verified_at=NOW() WHERE id=?", [log.id]);
  await pool.query('UPDATE enquiries SET otp_verified=1 WHERE id=?', [enquiryId]);

  const [erows] = await pool.query(
    `SELECT e.*, p.project_title FROM enquiries e
     LEFT JOIN properties p ON p.id=e.property_id WHERE e.id=?`, [enquiryId]);
  const e = erows[0];
  if (e) {
    const label = (e.project_title || '').trim() || '—';
    await notifyMasterEnquiry({ name: e.name, mobile: e.mobile, requirement: e.requirement, propLabel: label });
    await sendSms(mobile, 'Thank you for your enquiry, we will get in touch with you — Vipra Realty.');
  }
  res.json({ ok: true, message: 'Enquiry verified. We will get in touch with you.' });
});

// Public read API for the front-end
router.get('/listings', async (req, res) => {
  // Public listings: active plus sold-out / rented-out (shown with a badge). Inactive stays hidden.
  const where = ["p.status IN ('active','sold_out','rented_out')"]; const args = [];
  const eq = { search_type: 'p.search_type', city: 'p.city' };
  for (const [k, col] of Object.entries(eq)) if (req.query[k]) { where.push(`${col}=?`); args.push(req.query[k]); }
  if (req.query.category) { where.push('c.name=?'); args.push(req.query.category); }
  if (req.query.sub) { where.push('s.name=?'); args.push(req.query.sub); }
  if (req.query.featured) where.push('p.featured=1');
  if (req.query.id) { where.push('p.id=?'); args.push(parseInt(req.query.id, 10)); }
  if (req.query.q) {
    where.push('(p.project_title LIKE ? OR p.locality LIKE ? OR p.description LIKE ?)');
    const like = '%' + req.query.q + '%'; args.push(like, like, like);
  }
  // Budget: monthly rent for Rent listings, sale price for Buy listings
  const priceExpr = "CASE WHEN p.search_type='Buy' THEN p.sale_price ELSE p.monthly_rent END";
  const minP = parseInt(req.query.min_price, 10), maxP = parseInt(req.query.max_price, 10);
  if (minP > 0) { where.push(`${priceExpr} >= ?`); args.push(minP); }
  if (maxP > 0) { where.push(`${priceExpr} <= ?`); args.push(maxP); }
  const order = {
    price_asc: `${priceExpr} IS NULL, ${priceExpr} ASC`,
    price_desc: `${priceExpr} DESC`,
  }[req.query.sort] || "(p.status='active') DESC, p.featured DESC, p.created_at DESC";
  const [rows] = await pool.query(
    `SELECT p.*, c.name category, s.name sub_category FROM properties p
     LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN sub_categories s ON s.id=p.sub_category_id
     WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 200`, args);
  for (const r of rows) {
    const [imgs] = await pool.query('SELECT file_path FROM property_images WHERE property_id=? ORDER BY sort_order', [r.id]);
    r.images = imgs.map((i) => i.file_path);
  }
  res.json({ count: rows.length, listings: rows });
});

module.exports = router;
