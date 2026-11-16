/**
 * Where uploaded property images live on disk.
 *
 * Default is app/uploads, which sits inside the deployed code: a Git redeploy
 * replaces that folder and the images are lost. In production set UPLOAD_DIR
 * to a folder outside the application root (e.g. ~/vipra-uploads) so images
 * survive deploys. The public URL stays /uploads/<file> either way.
 *
 * A bare name (vipra-uploads) or ~/name is placed in the home folder, never in
 * the app folder: on Hostinger the app folder is a per-deploy build directory
 * (.../hbuilds/versions/<id>/nodejs), so anything relative to it is lost.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const APP_UPLOADS = path.join(__dirname, '..', 'uploads');

function resolveDir() {
  const raw = (process.env.UPLOAD_DIR || '').trim();
  if (!raw) return APP_UPLOADS;
  if (path.isAbsolute(raw)) return path.normalize(raw);
  // ~, ~/name, ./name and bare names all resolve against the home folder
  return path.resolve(os.homedir(), raw.replace(/^~(?=$|[\\/])/, '.'));
}

// Use the configured folder if it can be created and written to; otherwise fall
// back to app/uploads so a bad setting cannot stop the site from starting.
let UPLOAD_DIR = resolveDir();
let fallbackReason = '';
try {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.accessSync(UPLOAD_DIR, fs.constants.W_OK);
} catch (e) {
  fallbackReason = 'Could not use ' + UPLOAD_DIR + ' (' + (e.code || e.message) + ')';
  console.error('UPLOAD_DIR: ' + fallbackReason + ' — falling back to ' + APP_UPLOADS);
  UPLOAD_DIR = APP_UPLOADS;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// DB rows store 'uploads/<filename>'; map one to its real location on disk.
const diskPath = (filePath) => path.join(UPLOAD_DIR, path.basename(String(filePath)));

// Only files we store ourselves can go missing; CSV-imported external URLs are left alone.
const isLocal = (filePath) => String(filePath).startsWith('uploads/');
const isMissing = (filePath) => isLocal(filePath) && !fs.existsSync(diskPath(filePath));

// Diagnostics for the admin dashboard: where photos are stored and whether a deploy will wipe them.
function storageInfo() {
  const appRoot = path.join(__dirname, '..');
  const rel = path.relative(fs.realpathSync(appRoot), fs.realpathSync(UPLOAD_DIR));
  let files = 0;
  try { files = fs.readdirSync(UPLOAD_DIR).filter((f) => !f.startsWith('.')).length; } catch (e) {}
  return {
    dir: UPLOAD_DIR,
    setting: (process.env.UPLOAD_DIR || '').trim(),
    insideApp: !rel.startsWith('..') && !path.isAbsolute(rel),
    appRoot,
    home: os.homedir(),
    fallbackReason,
    files,
  };
}

module.exports = { UPLOAD_DIR, diskPath, isLocal, isMissing, storageInfo };
