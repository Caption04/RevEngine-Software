const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const RETIRED_LOWER = 'field' + 'core';
const RETIRED_TITLE = 'Field' + 'Core';
const TEXT_EXTENSIONS = new Set(['.html', '.js', '.css', '.dart', '.xml', '.plist', '.yaml', '.yml', '.json', '.md']);
const USER_FACING_ROOTS = ['assets', 'apps/revengine_technician', 'src', 'prisma/seed.js'];
const ROOT_HTML = fs.readdirSync(ROOT).filter((name) => name.endsWith('.html'));

function filesUnder(relativePath) {
  const absolute = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.statSync(absolute);
  if (stat.isFile()) return [absolute];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === '.git') return [];
    return filesUnder(path.join(relativePath, entry.name));
  });
}

function removeAllowedCredentials(text) {
  const emailPattern = new RegExp('\\b(?:owner|admin|worker|client)(?:\\.(?:zw|sa))?@' + RETIRED_LOWER + '\\.test\\b', 'gi');
  return text
    .replace(emailPattern, '')
    .replace(new RegExp(RETIRED_TITLE + 'Demo2026!', 'g'), '');
}

test('retired product name is absent from browser, API, seed, and mobile branding', () => {
  const files = [
    ...ROOT_HTML.map((name) => path.join(ROOT, name)),
    ...USER_FACING_ROOTS.flatMap(filesUnder)
  ].filter((file) => {
    if (file.includes(`${path.sep}prisma${path.sep}migrations${path.sep}`)) return false;
    return TEXT_EXTENSIONS.has(path.extname(file));
  });

  const violations = [];
  for (const file of files) {
    const text = removeAllowedCredentials(fs.readFileSync(file, 'utf8'));
    const match = text.match(new RegExp(RETIRED_LOWER, 'i'));
    if (match) {
      const line = text.slice(0, match.index).split(/\r?\n/).length;
      violations.push(`${path.relative(ROOT, file)}:${line}`);
    }
  }

  assert.deepEqual(violations, [], `Retired product branding remains in:\n${violations.join('\n')}`);
});
