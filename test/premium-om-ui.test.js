const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('branch setup uses the company time zone before and after city selection', () => {
  const frontend = read('assets/enterprise-pages.js');
  const routes = read('src/routes/api.js');

  assert.match(routes, /defaultTimezone:\s*regional\.timezone/);
  assert.match(routes, /timezone:\s*regional\.timezone/);
  assert.match(routes, /country:\s*regional\.code,[\s\S]*timezone:\s*regional\.timezone/);
  assert.match(frontend, /const defaultTimezone = String\(payload && payload\.defaultTimezone \|\| ''\)/);
  assert.match(frontend, /if \(timezone\) timezone\.value = defaultTimezone/);
  assert.match(frontend, /timezone\.value = defaultTimezone \|\| item\.timezone/);
});

test('dropdown arrows are aligned through one shared icon instead of text glyphs', () => {
  const html = read('branches.html');
  const css = read('assets/app.css');
  const layout = read('assets/layout.js');

  assert.match(css, /--select-chevron:/);
  assert.match(css, /background-position:\s*right 16px center/);
  assert.match(html, /data-branch-city-toggle/);
  assert.match(css, /\.searchable-select-toggle[\s\S]*background:\s*var\(--select-chevron\)/);
  assert.match(css, /\.searchable-select::after\s*\{[\s\S]*content:\s*none/);
  assert.match(css, /\.account-chevron,[\s\S]*\.nav-group-chevron[\s\S]*background:\s*var\(--select-chevron\)/);
  assert.doesNotMatch(layout, /account-chevron[^\n]*⌄/);
  assert.doesNotMatch(layout, /nav-group-chevron[^\n]*⌄/);
});

test('branch and O&M pages use premium but plain-language presentation', () => {
  const html = read('branches.html');
  const css = read('assets/app.css');
  const frontend = read('assets/enterprise-pages.js');

  assert.match(html, /branch-summary-strip/);
  assert.match(html, /Keep customers, work orders, technicians, and stock tied to the right location/);
  assert.match(html, /branch-directory/);
  assert.match(frontend, /branch-card/);
  assert.match(css, /body\[data-page="branches"\],[\s\S]*body\[data-page="procurement-costing"\]/);
  assert.match(css, /\.branch-card:hover/);
});

test('brand preview shows a real customer document example', () => {
  const html = read('settings.html');
  const css = read('assets/app.css');
  const frontend = read('assets/api.js');

  assert.match(html, /Customer document preview/);
  assert.match(html, /Quote preview/);
  assert.match(html, /Prepared for/);
  assert.match(html, /data-preview-contact/);
  assert.match(html, /data-preview-support/);
  assert.match(css, /\.brand-preview-document/);
  assert.match(frontend, /data-preview-contact/);
  assert.match(frontend, /data-preview-website/);
});
