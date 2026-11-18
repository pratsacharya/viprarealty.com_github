/**
 * Photo resizing for property images.
 *
 * Every stored photo becomes two WebP files in UPLOAD_DIR:
 *   p_<id>.webp    detail / gallery, longest side up to 1600 px, quality 80 (~100 KB)
 *   p_<id>_t.webp  card thumbnail,   600 x 450 (the card's 4:3 crop), quality 80 (~40 KB)
 * The DB keeps 'uploads/p_<id>.webp'; the thumbnail is found by name (thumbOf).
 * The original upload is moved to UPLOAD_DIR/originals as a backup.
 *
 * If sharp cannot load or a file cannot be read, the original is kept as it
 * was, so a photo is never lost and uploads never break.
 */
const fs = require('fs');
const path = require('path');
const { UPLOAD_DIR, diskPath, isLocal } = require('./uploads');

let sharp = null;
try { sharp = require('sharp'); } catch (e) { console.error('sharp not available, photos are stored unresized:', e.message); }

const ORIGINALS = path.join(UPLOAD_DIR, 'originals');
const FULL = 1600, THUMB_W = 600, THUMB_H = 450, QUALITY = 80, EFFORT = 6;

const thumbName = (filePath) => String(filePath).replace(/\.webp$/i, '_t.webp');
// Converted = a .webp photo whose thumbnail exists next to it.
const isConverted = (filePath) => isLocal(filePath) && /\.webp$/i.test(filePath) && fs.existsSync(diskPath(thumbName(filePath)));

// Card image for a stored photo: its thumbnail when there is one, else the photo itself.
function thumbOf(filePath) {
  return isConverted(filePath) ? thumbName(filePath) : filePath;
}

// Convert one stored photo ('uploads/<file>') to the two WebP sizes.
// Returns the new 'uploads/<file>.webp' path, or the same path when not converted.
async function processImage(filePath) {
  if (!sharp || !isLocal(filePath) || isConverted(filePath)) return filePath;
  const src = diskPath(filePath);
  const base = path.basename(src).replace(/\.[^.]+$/, '');
  const full = 'uploads/' + base + '.webp';
  let moved = null;
  try {
    const input = fs.readFileSync(src);
    // keep the original as a backup first (an uploaded .webp has the same name as the output)
    fs.mkdirSync(ORIGINALS, { recursive: true });
    moved = path.join(ORIGINALS, path.basename(src));
    fs.renameSync(src, moved);
    await sharp(input).rotate().resize({ width: FULL, height: FULL, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALITY, effort: EFFORT }).toFile(diskPath(full));
    await sharp(input).rotate().resize({ width: THUMB_W, height: THUMB_H, fit: 'cover', withoutEnlargement: true })
      .webp({ quality: QUALITY, effort: EFFORT }).toFile(diskPath(thumbName(full)));
    return full;
  } catch (e) {
    console.error('photo resize failed for ' + filePath + ':', e.message);
    for (const f of [full, thumbName(full)]) { try { fs.unlinkSync(diskPath(f)); } catch (_) { /* ignore */ } }
    if (moved) try { fs.renameSync(moved, src); } catch (_) { /* ignore */ }   // put the original back
    return filePath;
  }
}

// Delete a stored photo and its thumbnail (the backup original is kept).
function removeImage(filePath) {
  if (!isLocal(filePath)) return;
  const files = [filePath];
  if (/\.webp$/i.test(filePath)) files.push(thumbName(filePath));
  for (const f of files) try { fs.unlinkSync(diskPath(f)); } catch (_) { /* ignore */ }
}

// One-time job on startup: convert photos stored before resizing existed.
async function convertExisting(pool) {
  if (!sharp) return 0;
  const [rows] = await pool.query("SELECT id, file_path FROM property_images WHERE file_path LIKE 'uploads/%'");
  let n = 0;
  for (const r of rows) {
    if (isConverted(r.file_path) || !fs.existsSync(diskPath(r.file_path))) continue;
    const out = await processImage(r.file_path);
    if (out !== r.file_path) { await pool.query('UPDATE property_images SET file_path=? WHERE id=?', [out, r.id]); n++; }
  }
  return n;
}

module.exports = { processImage, thumbOf, removeImage, convertExisting, available: () => !!sharp };
