/**
 * Where uploaded property images live on disk.
 *
 * Default is app/uploads, which sits inside the deployed code: a Git redeploy
 * replaces that folder and the images are lost. In production set UPLOAD_DIR
 * to a folder outside the application root (e.g. ~/vipra-uploads) so images
 * survive deploys. The public URL stays /uploads/<file> either way.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

function resolveDir() {
  const raw = (process.env.UPLOAD_DIR || '').trim();
  if (!raw) return path.join(__dirname, '..', 'uploads');
  if (raw === '~' || raw.startsWith('~/')) return path.join(os.homedir(), raw.slice(1));
  return path.resolve(raw);
}

const UPLOAD_DIR = resolveDir();
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// DB rows store 'uploads/<filename>'; map one to its real location on disk.
const diskPath = (filePath) => path.join(UPLOAD_DIR, path.basename(String(filePath)));

module.exports = { UPLOAD_DIR, diskPath };
