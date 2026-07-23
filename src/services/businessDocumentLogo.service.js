'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const MAX_LOGO_BYTES = 3 * 1024 * 1024;
const PROJECT_ROOT = path.resolve(__dirname, '../..');

function imageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'jpeg';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function localLogoPath(value) {
  const clean = String(value || '').split('?')[0];
  if (!/^\/uploads\/logos\/[a-zA-Z0-9._-]+$/.test(clean)) return null;
  const resolved = path.resolve(PROJECT_ROOT, clean.replace(/^\//, ''));
  const uploadsRoot = path.resolve(PROJECT_ROOT, 'uploads/logos');
  return resolved.startsWith(uploadsRoot + path.sep) ? resolved : null;
}

async function loadBusinessDocumentLogo(logoUrl) {
  const filePath = localLogoPath(logoUrl);
  if (!filePath) return null;

  let buffer;
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile() || stats.size > MAX_LOGO_BYTES) return null;
    buffer = await fs.readFile(filePath);
  } catch {
    return null;
  }

  const type = imageType(buffer);
  // The settings UI converts new WEBP uploads to PNG before storing them.
  // Historic unsupported files safely use company initials instead of the
  // generic Rev Engine mark.
  if (!['png', 'jpeg'].includes(type)) return null;
  return { buffer, type };
}

module.exports = { loadBusinessDocumentLogo, imageType, localLogoPath };
