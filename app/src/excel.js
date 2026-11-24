/**
 * Excel bulk import / export of listings.
 *
 * One sheet per sub-category (CATEGORY_TREE order), each with the same columns
 * the admin form has for that type: basics, price, the sub-category's
 * highlights, common amenities, furnishings (where the type has a Furnishing
 * highlight) and a Photo links column. Column 1 is the Property ID:
 *   - blank            -> the row is added as a new listing
 *   - an existing ID   -> that listing is updated from the row
 * An empty cell clears that value. Uploaded photos are never touched by import;
 * the Photo links column only manages photos given as web links. Each linked photo
 * is downloaded into the uploads folder (property_images.source_url keeps the link).
 *
 * Headers are matched by text, so columns can be reordered but not renamed.
 * Mandatory headers are dark green.
 */
const ExcelJS = require('exceljs');
const pool = require('./db');
const fields = require('./fields');
const { CATEGORY_TREE } = require('./bootstrap');
const fs = require('fs');
const crypto = require('crypto');
const { diskPath, isLocal, isMissing } = require('./uploads');
const { processImage, removeImage } = require('./images');
const { setBrochure } = require('./brochures');

const CITIES = ['Bangalore', 'Mumbai', 'Navi Mumbai', 'Thane'];
const STATUS = { active: 'Active', inactive: 'Inactive', sold_out: 'Sold out', rented_out: 'Rented out' };
const STATUS_IN = Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [v.toLowerCase(), k]));
const MAX_ROWS = 1000;            // rows given dropdowns in the template
const SITE = 'https://viprarealty.com/';

const GREEN = 'FF1E5631', GREY = 'FFE7EAEE', TINT = { hl: 'FFEAF2FB', am: 'FFF4F0FA', fu: 'FFFDF3E7', ph: 'FFF1F3F5' };

// Column definitions for one sub-category sheet.
// kind: base column name | 'hl' highlight | 'am' amenity | 'fu' furnishing | 'photos'
function columnsFor(subName) {
  const c = (header, extra) => ({ header, width: 16, ...extra });
  const cols = [
    c('Property ID', { kind: 'id', width: 12, note: 'Leave blank to add a new listing. Do not change the ID of an existing listing.' }),
    c('Property title', { kind: 'project_title', req: true, width: 34 }),
    c('Looking to', { kind: 'search_type', req: true, list: ['Rent', 'Buy'], width: 12 }),
    c('Status', { kind: 'status', req: true, list: Object.values(STATUS), width: 13 }),
    c('City', { kind: 'city', req: true, list: CITIES, width: 14 }),
    c('Locality / area', { kind: 'locality', req: true, width: 22 }),
    c('Featured on home page', { kind: 'featured', list: ['Yes', 'No'], width: 12 }),
    c('About this property', { kind: 'description', width: 44 }),
    c('Sale price (₹) - Buy', { kind: 'sale_price', req: true, num: true, note: 'Required for Buy listings: an amount, or On request. Ignored for Rent.' }),
    c('Down payment (₹) - Buy', { kind: 'down_payment', num: true }),
    c('+ Stamp Duty, Regn + Taxes - Buy', { kind: 'stamp_duty', width: 20, note: 'An amount (350000), a percentage (7%) or text (Extra).' }),
    c('Monthly rent (₹) - Rent', { kind: 'monthly_rent', req: true, num: true, note: 'Required for Rent listings: an amount, or On request. Ignored for Buy.' }),
    c('Deposit (₹) - Rent', { kind: 'deposit_amount', num: true }),
    c('Maintenance - Rent', { kind: 'maintenance', note: 'A monthly amount (5000) or text (Included).' }),
    c('Brokerage', { kind: 'brokerage', note: 'Rent and Buy. An amount (50000), a percentage (2%) or text (1 month rent, Nil).' }),
    c('Expected possession - Buy', { kind: 'possession_date', note: 'Buy listings: DD-MM-YYYY or Ready to move. Ignored for Rent.' }),
    c('Available from - Rent', { kind: 'available_from', note: 'Rent listings: DD-MM-YYYY or Immediate. Ignored for Buy.' }),
    c('Label on photo', { kind: 'image_label', width: 18, note: 'Text on the photo (max 40 characters). Leave blank to show For sale / For rent.' }),
  ];
  for (const f of fields.highlightsFor(subName)) {
    const only = f.rentOnly ? ' - Rent' : f.buyOnly ? ' - Buy' : '';
    cols.push(c(f.label + only, { kind: 'hl', key: f.key, list: f.type === 'select' ? f.options : null, width: Math.max(14, Math.min(28, f.label.length + 4)) }));
  }
  for (const a of fields.AMENITIES) {
    cols.push(c('Amenity: ' + a.label, { kind: 'am', key: a.key, width: 18, note: 'Yes, or a number/note (e.g. 120). Leave blank if not available.' }));
  }
  if (fields.highlightsFor(subName).some((f) => f.key === 'furnishing')) {
    for (const f of fields.FURNISHINGS) {
      cols.push(c('Furnishing: ' + f.label, { kind: 'fu', key: f.key, width: 18, note: 'Rent listings that are semi- or fully furnished. Yes, or a count/note (e.g. 4).' }));
    }
  }
  cols.push(c('Project brochure link', { kind: 'brochure', width: 30, note: 'Web link to the project brochure PDF (Google Drive file shared as "Anyone with the link", Dropbox or a direct PDF link). Downloaded and saved on the website; visitors get it after OTP. Leave blank to remove.' }));
  cols.push(c('Photo links', { kind: 'photos', width: 40, note: 'Web links to photos, separated by commas. A shared Google Drive folder link adds every photo in the folder (in file-name order). Each photo is downloaded and saved on the website. Google Drive links work when the file is shared as "Anyone with the link". Photos uploaded in the admin are not listed here and are never changed by import.' }));
  return cols;
}

const SUB_NAMES = () => Object.values(CATEGORY_TREE).flat();

// ---------- export ----------
async function buildWorkbook({ withData }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Vipra Realty admin';
  addInstructions(wb);

  const [subs] = await pool.query('SELECT id, name FROM sub_categories');
  const subId = Object.fromEntries(subs.map((s) => [s.name, s.id]));
  let props = [], fv = {}, photos = {};
  if (withData) {
    [props] = await pool.query('SELECT * FROM properties ORDER BY id');
    const [frows] = await pool.query('SELECT property_id, grp, field_key, value FROM property_fields');
    for (const r of frows) ((fv[r.property_id] ||= {})[r.grp] ||= {})[r.field_key] = r.value;
    const [imgs] = await pool.query('SELECT property_id, file_path, source_url FROM property_images ORDER BY sort_order, id');
    for (const i of imgs) { const k = linkOf(i); if (k) (photos[i.property_id] ||= []).push(k); }
  }

  for (const subName of SUB_NAMES()) {
    const cols = columnsFor(subName);
    const ws = wb.addWorksheet(subName, { views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }] });
    ws.columns = cols.map((c) => ({ header: c.header, width: c.width }));
    const head = ws.getRow(1);
    head.height = 42;
    cols.forEach((c, i) => {
      const cell = head.getCell(i + 1);
      const fill = c.req ? GREEN : (TINT[c.kind] || GREY);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      cell.font = { bold: true, color: { argb: c.req ? 'FFFFFFFF' : 'FF1F2733' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
      if (c.note) cell.note = c.note;
      const col = ws.getColumn(i + 1);
      if (!c.num && c.kind !== 'id') col.numFmt = '@';   // keep text as typed (no date / number conversion)
    });

    const rows = props.filter((p) => p.sub_category_id === subId[subName]);
    for (const p of rows) ws.addRow(cols.map((c) => valueFor(c, p, fv[p.id] || {}, photos[p.id] || [])));

    // dropdowns
    cols.forEach((c, i) => {
      if (!c.list) return;
      const letter = ws.getColumn(i + 1).letter;
      ws.dataValidations.add(`${letter}2:${letter}${MAX_ROWS + 1}`, {
        type: 'list', allowBlank: true, formulae: ['"' + c.list.join(',') + '"'],
        showErrorMessage: true, errorTitle: 'Choose from the list', error: 'Pick one of: ' + c.list.join(', '),
      });
    });
  }
  return wb;
}

function valueFor(c, p, fv, links) {
  const g = (grp, k) => ((fv[grp] || {})[k]);
  switch (c.kind) {
    case 'id': return p.id;
    case 'search_type': return p.search_type;
    case 'status': return STATUS[p.status] || 'Active';
    case 'featured': return p.featured ? 'Yes' : 'No';
    case 'hl': return g('highlight', c.key) || '';
    case 'am': case 'fu': {
      const v = g(c.kind === 'am' ? 'amenity' : 'furnishing', c.key);
      return v === undefined ? '' : (v || 'Yes');
    }
    case 'photos': return links.join(', ');
    case 'brochure': return p.brochure_url || '';
    case 'sale_price': return p.search_type === 'Buy' ? (p.sale_price || 'On request') : '';
    case 'monthly_rent': return p.search_type === 'Rent' ? (p.monthly_rent || 'On request') : '';
    default: { const v = p[c.kind]; return v === null || v === undefined ? '' : v; }
  }
}

function addInstructions(wb) {
  const ws = wb.addWorksheet('How to use');
  ws.getColumn(1).width = 110;
  const lines = [
    ['Vipra Realty - bulk listings (import / export)', { bold: true, size: 14 }],
    [''],
    ['Each sheet is one sub-category (Flat, Villa, Office Space ...). Put each listing on the sheet for its type.'],
    ['Headings in dark green are mandatory. Sale price is required for Buy listings, Monthly rent for Rent listings (an amount, or On request).'],
    [''],
    ['Add a listing: fill a new row and leave Property ID blank. The ID is given when you import.'],
    ['Change a listing: edit its row and keep its Property ID. Every column of the row is saved, and an empty cell clears that value.'],
    ['Change status: set Status to Active, Inactive, Sold out or Rented out. Inactive hides a listing from the website.'],
    ['Move a listing to another sub-category: cut its row (with the ID) and paste it on the other sheet.'],
    ['Listings are never deleted by import. Rows not in the file are left as they are.'],
    [''],
    ['Columns ending in "- Buy" or "- Rent" are only used for that kind of listing.'],
    ['Amenity columns: type Yes, or a number / note (e.g. 120 for Total Car Park). Leave blank if not available.'],
    ['Furnishing columns are used for Rent listings marked Semi-furnished or Fully furnished (Furnished for offices).'],
    ['Photo links: web links to photos, separated by commas. Photos uploaded in the admin are kept and are not listed here.'],
    ['Google Drive photos: in Drive, Share → General access → "Anyone with the link", then Copy link and paste it here.'],
    ['Google Drive folder: paste the folder link to add every photo in it, in file-name order (name them 01, 02, ... to choose the order; the first is the card photo). Videos are skipped. Max 20 photos.'],
    ['Linked photos are downloaded and saved on the website when you import, so they keep showing even if you later delete them from Drive. Remove a link from the cell to remove that photo from the listing.'],
    ['Brokerage is used for both Rent and Buy listings. Label on photo replaces the For sale / For rent label on the photo; leave it blank for the usual label.'],
    ['Project brochure link: a web link to the brochure PDF (Google Drive file shared as "Anyone with the link"). It is downloaded and saved; visitors download it from the property page after verifying their mobile by OTP. Clear the cell to remove it.'],
    ['Highlights you hid with "Show on site" stay hidden; new values are shown.'],
    [''],
    ['Tip: download "Export all listings" first, edit that file, then import it. Do not rename sheets or headings.'],
  ];
  lines.forEach(([t, font], i) => {
    const cell = ws.getCell('A' + (i + 1));
    cell.value = t; cell.alignment = { wrapText: true };
    if (font) cell.font = font;
  });
  const key = ws.getCell('A20');
  key.value = 'Mandatory heading';
  key.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
  key.font = { bold: true, color: { argb: 'FFFFFFFF' } };
}

// ---------- import ----------
function cellText(cell) {
  let v = cell.value;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    const d = (n) => String(n).padStart(2, '0');
    return `${d(v.getUTCDate())}-${d(v.getUTCMonth() + 1)}-${v.getUTCFullYear()}`;
  }
  if (typeof v === 'object') {
    if (v.richText) v = v.richText.map((r) => r.text).join('');
    else if ('result' in v) v = v.result;
    else if (v.text !== undefined) v = typeof v.text === 'object' && v.text.richText ? v.text.richText.map((r) => r.text).join('') : (v.hyperlink && typeof v.text !== 'string' ? v.hyperlink : v.text);
    else v = '';
  }
  return String(v === null || v === undefined ? '' : v).trim();
}

const digitsOnly = (v) => { const d = String(v).split('.')[0].replace(/[^0-9]/g, ''); return d === '' ? null : parseInt(d, 10); };

async function importWorkbook(buffer, userId) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const [subs] = await pool.query('SELECT id, name, category_id FROM sub_categories');
  const subByName = Object.fromEntries(subs.map((s) => [s.name.toLowerCase(), s]));
  const report = { added: 0, updated: 0, failed: 0, errors: [], added_ids: [], warnings: [] };
  const seen = new Set();

  for (const ws of wb.worksheets) {
    const sub = subByName[ws.name.trim().toLowerCase()];
    if (!sub) continue;                     // instructions or unknown sheets
    const defs = columnsFor(sub.name);
    const byHeader = Object.fromEntries(defs.map((d) => [d.header.toLowerCase(), d]));
    byHeader['possession date'] = { kind: 'possession_old' };   // older files: one column for both types
    if (byHeader['unit type'] && !byHeader['unit types']) byHeader['unit types'] = byHeader['unit type'];   // older files: label was "Unit Types"
    const colMap = [];                      // column index -> def
    ws.getRow(1).eachCell((cell, i) => { const d = byHeader[cellText(cell).toLowerCase()]; if (d) colMap[i] = d; });
    if (!colMap.some((d) => d && d.kind === 'project_title')) {
      report.errors.push(`${ws.name}: heading row not recognised, sheet skipped`); continue;
    }

    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const val = {};
      colMap.forEach((d, i) => { if (d) val[d.kind === 'hl' || d.kind === 'am' || d.kind === 'fu' ? d.kind + ':' + d.key : d.kind] = cellText(row.getCell(i)); });
      if (!Object.values(val).some((v) => v !== '')) continue;   // empty row
      const where = `${ws.name} row ${r}`;
      try {
        const res = await saveRow(val, defs, sub, userId, seen);
        if (res.added) { report.added++; report.added_ids.push(`${where} → ID ${res.id}`); } else report.updated++;
        for (const m of res.badLinks) report.warnings.push(`${where} (ID ${res.id}): ${m}`);
        if ('brochure' in val) {
          const b = await setBrochure(res.id, val.brochure);
          if (b.error) report.warnings.push(`${where} (ID ${res.id}): brochure not added, ${b.error}`);
        }
      } catch (e) {
        report.failed++; report.errors.push(`${where}: ${e.userMessage || e.message}`);
      }
    }
  }
  await pool.query('INSERT INTO import_batches (filename,rows_total,rows_ok,rows_failed,errors,created_by) VALUES (?,?,?,?,?,?)',
    ['excel', report.added + report.updated + report.failed, report.added + report.updated, report.failed, report.errors.join('\n'), userId]);
  return report;
}

// Share links from Google Drive / Dropbox open a web page, not the picture.
// Turn them into a direct image address the website can show.
function directImageUrl(u) {
  const m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?(?:.*&)?id=|uc\?(?:.*&)?id=|thumbnail\?(?:.*&)?id=)([\w-]{10,})/i)
    || u.match(/docs\.google\.com\/uc\?(?:.*&)?id=([\w-]{10,})/i);
  if (m) return 'https://lh3.googleusercontent.com/d/' + m[1];
  if (/^https?:\/\/(www\.)?dropbox\.com\//i.test(u)) return u.replace(/([?&])dl=0\b/, '$1raw=1') + (/[?&](dl|raw)=/.test(u) ? '' : (u.includes('?') ? '&' : '?') + 'raw=1');
  return u;
}

// A shared Google Drive folder link -> its photos, as direct image links in
// file-name order (01, 02, ... decides the order on the website). Videos and
// other files are skipped. Returns null when the folder cannot be read
// (not shared as "Anyone with the link").
const FOLDER_RE = /drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([\w-]{10,})/i;
async function drivePhotos(folderId) {
  try {
    const res = await fetch('https://drive.google.com/embeddedfolderview?id=' + folderId, { signal: AbortSignal.timeout(20000) });
    const html = await res.text();
    if (!res.ok || !html.includes('flip-entries')) return null;
    const items = [];
    for (const block of html.split('class="flip-entry"').slice(1)) {
      const id = (block.match(/^\s*id="entry-([\w-]+)"/) || [])[1];
      const type = (block.match(/\/type\/([\w.+-]+\/[\w.+-]+)/) || [])[1] || '';
      const name = ((block.match(/flip-entry-title">([^<]*)</) || [])[1] || '').replace(/&amp;/g, '&');
      if (id && /^image\//i.test(type)) items.push({ id, name });
    }
    items.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    return items.map((i) => ({ url: 'https://lh3.googleusercontent.com/d/' + i.id, name: i.name }));
  } catch (_) { return null; }
}

// The link a photo row is managed by: the link it was downloaded from, or the
// web address it is shown from (older imports). Uploaded photos have none.
const linkOf = (i) => i.source_url || (/^https?:/i.test(i.file_path) ? i.file_path : null);

const IMG_EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const MAX_PHOTO = 8 * 1024 * 1024;   // same limit as admin uploads

// Download a photo link into the uploads folder. Returns 'uploads/<file>' or null
// when the link does not open a public image (e.g. a private Drive file).
async function downloadImage(u) {
  try {
    const res = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
    const ext = IMG_EXT[(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()];
    if (!res.ok || !ext) { try { await res.body?.cancel(); } catch (_) { /* ignore */ } return null; }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_PHOTO) return null;
    const name = 'uploads/p_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex') + '.' + ext;
    fs.writeFileSync(diskPath(name), buf);
    return await processImage(name);   // WebP 1600 px + 600x450 card thumbnail
  } catch (_) { return null; }
}
const unlinkQuiet = (f) => removeImage(f);

const fail = (m) => { const e = new Error(m); e.userMessage = m; throw e; };

async function saveRow(val, defs, sub, userId, seen) {
  const has = (k) => k in val;
  const id = val.id ? digitsOnly(val.id) : null;
  if (val.id && !id) fail('Property ID "' + val.id + '" is not a number');
  if (id && seen.has(id)) fail(`Property ID ${id} appears more than once in the file`);

  let existing = null;
  if (id) {
    const [[p]] = await pool.query('SELECT id FROM properties WHERE id=?', [id]);
    if (!p) fail(`no listing with Property ID ${id} (leave the ID blank to add a new listing)`);
    existing = p;
  }

  const stype = (val.search_type || '').toLowerCase() === 'buy' ? 'Buy' : (val.search_type || '').toLowerCase() === 'rent' ? 'Rent' : '';
  const status = STATUS_IN[(val.status || '').toLowerCase()];
  const missing = [];
  if (!val.project_title) missing.push('Property title');
  if (!stype) missing.push('Looking to (Rent or Buy)');
  if (!status) missing.push('Status (Active, Inactive, Sold out or Rented out)');
  if (!val.city) missing.push('City');
  if (!val.locality) missing.push('Locality / area');
  const priced = (v) => digitsOnly(v || '') || /^on request$/i.test(v || '');
  if (stype === 'Buy' && !priced(val.sale_price)) missing.push('Sale price (an amount or On request)');
  if (stype === 'Rent' && !priced(val.monthly_rent)) missing.push('Monthly rent (an amount or On request)');
  if (missing.length) fail('missing ' + missing.join(', '));
  if (!CITIES.includes(val.city)) fail(`City "${val.city}" is not one of ${CITIES.join(', ')}`);

  const n = (k) => digitsOnly(val[k] || '');
  const t = (k, max) => (val[k] || '').slice(0, max) || null;
  const data = {
    project_title: val.project_title.slice(0, 255), description: val.description || '',
    search_type: stype, category_id: sub.category_id, sub_category_id: sub.id,
    city: val.city, locality: val.locality.slice(0, 190), status,
    featured: (val.featured || '').toLowerCase() === 'yes' ? 1 : 0,
    sale_price: n('sale_price'), down_payment: n('down_payment'), stamp_duty: t('stamp_duty', 80),
    monthly_rent: n('monthly_rent'), deposit_amount: n('deposit_amount'), maintenance: t('maintenance', 80),
    possession_date: t('possession_date', 40), available_from: t('available_from', 40),
    brokerage: t('brokerage', 80), image_label: t('image_label', 40),
  };
  // a file from before the split has one "Possession date" column: use it for the row's type
  if ('possession_old' in val) {
    if (stype === 'Buy' && !('possession_date' in val)) data.possession_date = t('possession_old', 40);
    if (stype === 'Rent' && !('available_from' in val)) data.available_from = t('possession_old', 40);
  }
  if (stype === 'Rent') { data.sale_price = null; data.down_payment = null; data.stamp_duty = null; data.possession_date = null; }
  else { data.monthly_rent = null; data.deposit_amount = null; data.maintenance = null; data.available_from = null; }

  // extra fields, same rules as the admin form
  const oldDisplay = {};
  if (existing) {
    const [rows] = await pool.query("SELECT field_key, display FROM property_fields WHERE property_id=? AND grp='highlight'", [id]);
    for (const r of rows) oldDisplay[r.field_key] = !!r.display;
  }
  const fv = { highlight: {}, amenity: {}, furnishing: {} };
  for (const f of fields.highlightsFor(sub.name)) {
    if ((f.rentOnly && stype !== 'Rent') || (f.buyOnly && stype !== 'Buy')) continue;
    let v = (val['hl:' + f.key] || '').slice(0, 255);
    if (v && f.type === 'select') {
      const match = f.options.find((o) => o.toLowerCase() === v.toLowerCase());
      if (!match) fail(`"${v}" is not a choice for ${f.label} (${f.options.join(', ')})`);
      v = match;
    }
    if (v) fv.highlight[f.key] = { value: v, display: f.key in oldDisplay ? oldDisplay[f.key] : true };
  }
  const tick = (v) => (/^(yes|y|✓|true)$/i.test(v) ? '' : v.slice(0, 255));
  for (const a of fields.AMENITIES) {
    const v = val['am:' + a.key] || '';
    if (v && !/^(no|n|false)$/i.test(v)) fv.amenity[a.key] = { value: tick(v), display: true };
  }
  if (fields.furnishingsApply(stype, (fv.highlight.furnishing || {}).value)) {
    for (const f of fields.FURNISHINGS) {
      const v = val['fu:' + f.key] || '';
      if (v && !/^(no|n|false)$/i.test(v)) fv.furnishing[f.key] = { value: /^(yes|y|✓|true)$/i.test(v) ? 'Yes' : v.slice(0, 255), display: true };
    }
  }
  Object.assign(data, fields.legacyColumns(sub.name,
    Object.fromEntries(Object.entries(fv.highlight).map(([k, f]) => [k, f.value]))));

  // Photo links: each link is downloaded into the uploads folder before saving.
  // A link already downloaded for this listing is not fetched again.
  const OWN = /^https?:\/\/(www\.)?viprarealty\.com\/uploads\//i;
  // A Google Drive folder link brings in every photo in that folder.
  const rawOf = {};                           // direct link -> link as typed, for messages
  const badLinks = [], fetched = [];          // badLinks: messages; fetched: { key, file }
  let links = null, folderFailed = false;
  if (has('photos')) {
    const keys = [];
    for (const s of (val.photos || '').split(/[,\n]+/).map((x) => x.trim())) {
      if (!/^https?:\/\//i.test(s) || OWN.test(s)) continue;
      const folder = s.match(FOLDER_RE);
      if (folder) {
        const photos = await drivePhotos(folder[1]);
        if (!photos) folderFailed = true;
        if (!photos) badLinks.push('Drive folder could not be opened. Share it as "Anyone with the link": ' + s);
        else if (!photos.length) badLinks.push('no photos found in Drive folder: ' + s);
        else for (const p of photos) { rawOf[p.url] ||= p.name + ' (from the Drive folder)'; keys.push(p.url); }
      } else { const d = directImageUrl(s); rawOf[d] ||= s; keys.push(d); }
    }
    links = [...new Set(keys)];
    if (links.length > 20) {
      badLinks.push(`${links.length} photos given, only the first 20 are used`);
      links = links.slice(0, 20);
    }
  }
  let managed = [], keep = new Set(), otherCount = 0;
  if (links) {
    if (existing) {
      const [imgs] = await pool.query('SELECT id, file_path, source_url FROM property_images WHERE property_id=?', [id]);
      managed = imgs.filter(linkOf);
      otherCount = imgs.length - managed.length;
    }
    // a folder that could not be opened removes nothing: its photos stay as they are
    if (folderFailed) managed.forEach((i) => keep.add(i.id));
    const todo = [];
    for (const key of links) {
      const m = managed.find((i) => linkOf(i) === key);
      if (m && isLocal(m.file_path) && !isMissing(m.file_path)) keep.add(m.id); else todo.push({ key, row: m });
    }
    // download 4 at a time; results keep the order given (first photo = card photo)
    const files = new Array(todo.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, todo.length) }, async () => {
      while (next < todo.length) { const i = next++; files[i] = await downloadImage(todo[i].key); }
    }));
    todo.forEach((t, i) => {
      if (files[i]) fetched.push({ key: t.key, file: files[i], row: t.row });
      else { badLinks.push('photo not added, the link does not open a public image: ' + (rawOf[t.key] || t.key)); if (t.row) keep.add(t.row.id); }   // keep an older web-link row as it was
    });
  }
  const removed = [];

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const cols = Object.keys(data);
    let pid = id;
    if (existing) {
      await conn.query(`UPDATE properties SET ${cols.map((k) => k + '=?').join(', ')} WHERE id=?`, [...cols.map((k) => data[k]), id]);
    } else {
      const [ins] = await conn.query(`INSERT INTO properties (${[...cols, 'created_by'].join(',')}) VALUES (${cols.map(() => '?').join(',')},?)`,
        [...cols.map((k) => data[k]), userId]);
      pid = ins.insertId;
    }
    await conn.query('DELETE FROM property_fields WHERE property_id=?', [pid]);
    const frows = [];
    for (const grp of Object.keys(fv)) for (const [k, f] of Object.entries(fv[grp])) frows.push([pid, grp, k, f.value, f.display ? 1 : 0]);
    if (frows.length) await conn.query('INSERT INTO property_fields (property_id,grp,field_key,value,display) VALUES ?', [frows]);

    if (links) {
      // only link-managed photos are changed here; uploaded photos stay as they are
      const gone = managed.filter((i) => !keep.has(i.id) && !fetched.some((f) => f.row === i));
      if (gone.length) await conn.query('DELETE FROM property_images WHERE id IN (?)', [gone.map((i) => i.id)]);
      removed.push(...gone.map((i) => i.file_path));
      let have = otherCount + keep.size + fetched.filter((f) => f.row).length;
      for (const f of fetched) {
        if (f.row) {
          await conn.query('UPDATE property_images SET file_path=?, source_url=? WHERE id=?', [f.file, f.key.slice(0, 500), f.row.id]);
          removed.push(f.row.file_path);
        } else if (have < 20) {
          await conn.query('INSERT INTO property_images (property_id,file_path,source_url,sort_order) VALUES (?,?,?,?)', [pid, f.file, f.key.slice(0, 500), have++]);
        } else { unlinkQuiet(f.file); f.file = null; }
      }
    }
    await conn.commit();
    removed.forEach(unlinkQuiet);
    if (id) seen.add(id);
    return { added: !existing, id: pid, badLinks };
  } catch (e) {
    await conn.rollback();
    fetched.forEach((f) => f.file && unlinkQuiet(f.file));
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { buildWorkbook, importWorkbook, columnsFor, SITE };
