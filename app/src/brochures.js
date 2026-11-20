/**
 * Project brochures (PDF) for listings.
 *
 * The admin gives a web link (Google Drive, Dropbox or any direct PDF link) in
 * the property form or the Excel "Project brochure link" column. The PDF is
 * downloaded once and stored in UPLOAD_DIR/brochures; properties.brochure_url
 * keeps the link, properties.brochure_file the stored file name.
 *
 * The folder is not served publicly (app.js blocks /uploads/brochures): visitors
 * get the file from /api/brochure/:id only after verifying their mobile by OTP.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('./db');
const { UPLOAD_DIR } = require('./uploads');

const DIR = path.join(UPLOAD_DIR, 'brochures');
const MAX_PDF = 40 * 1024 * 1024;
const NOT_PDF = 'the link does not open a PDF. For Google Drive, share the file as "Anyone with the link".';

const fileOf = (name) => path.join(DIR, path.basename(String(name)));
const exists = (name) => !!name && fs.existsSync(fileOf(name));

// Share links open a web page, not the file: turn them into a direct download.
function directPdfUrl(u) {
  const m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?(?:.*&)?id=|uc\?(?:.*&)?id=)([\w-]{10,})/i)
    || u.match(/docs\.google\.com\/(?:uc\?(?:.*&)?id=|file\/d\/)([\w-]{10,})/i);
  if (m) return 'https://drive.usercontent.google.com/download?id=' + m[1] + '&export=download&confirm=t';
  if (/^https?:\/\/(www\.)?dropbox\.com\//i.test(u)) return u.replace(/([?&])(dl|raw)=\d\b/, '$1dl=1') + (/[?&](dl|raw)=/.test(u) ? '' : (u.includes('?') ? '&' : '?') + 'dl=1');
  return u;
}

// Download a PDF link into the brochures folder. Returns { file } or { error }.
async function download(link) {
  if (!/^https?:\/\//i.test(link)) return { error: 'the brochure link must start with http:// or https://' };
  if (/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\//i.test(link)) return { error: 'the brochure link is a folder; give the link of the PDF file itself.' };
  try {
    const res = await fetch(directPdfUrl(link), { redirect: 'follow', signal: AbortSignal.timeout(60000) });
    const len = +(res.headers.get('content-length') || 0);
    if (!res.ok || len > MAX_PDF) {
      try { await res.body?.cancel(); } catch (_) { /* ignore */ }
      return { error: len > MAX_PDF ? 'the brochure is larger than 40 MB.' : NOT_PDF };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_PDF) return { error: 'the brochure is larger than 40 MB.' };
    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') return { error: NOT_PDF };
    fs.mkdirSync(DIR, { recursive: true });
    const name = 'b_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex') + '.pdf';
    fs.writeFileSync(fileOf(name), buf);
    return { file: name };
  } catch (_) { return { error: NOT_PDF }; }
}

// Set a listing's brochure from a link (blank removes it). A link that is
// already stored is not downloaded again. If the download fails, the listing
// keeps its current brochure and { error } is returned.
async function setBrochure(pid, link) {
  link = String(link || '').trim().slice(0, 500);
  const [[cur]] = await pool.query('SELECT brochure_url, brochure_file FROM properties WHERE id=?', [pid]);
  if (!cur) return { error: 'listing not found' };
  const drop = (name) => { if (name) try { fs.unlinkSync(fileOf(name)); } catch (_) { /* ignore */ } };
  if (!link) {
    if (cur.brochure_url || cur.brochure_file) {
      await pool.query('UPDATE properties SET brochure_url=NULL, brochure_file=NULL WHERE id=?', [pid]);
      drop(cur.brochure_file);
    }
    return { ok: true };
  }
  if (link === cur.brochure_url && exists(cur.brochure_file)) return { ok: true };
  const got = await download(link);
  if (got.error) return got;
  await pool.query('UPDATE properties SET brochure_url=?, brochure_file=? WHERE id=?', [link, got.file, pid]);
  drop(cur.brochure_file);
  return { ok: true };
}

module.exports = { setBrochure, fileOf, exists, directPdfUrl };
