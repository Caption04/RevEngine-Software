const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('branch creation opens in a modal and the branch page has no section search', () => {
  const html = read('branches.html');
  const frontend = read('assets/enterprise-pages.js');
  const css = read('assets/app.css');

  assert.match(html, /data-page-search="off"/);
  assert.match(html, /data-open-branch-modal/);
  assert.match(html, /data-branch-modal hidden/);
  assert.match(html, /role="dialog" aria-modal="true"/);
  assert.match(frontend, /const openModal = \(branch = null\)/);
  assert.match(frontend, /openButton\?\.addEventListener\('click', \(\) => openModal\(\)\)/);
  assert.match(css, /\.fc-modal\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
});

test('branch inputs use real validation and do not show generic green success borders', () => {
  const html = read('branches.html');
  const formUx = read('assets/form-ux.js');
  const routes = read('src/routes/api.js');

  assert.match(html, /data-phone-field="true"/);
  assert.match(html, /data-address-field="true"/);
  assert.match(formUx, /digits\.length < 7 \|\| digits\.length > 15/);
  assert.match(formUx, /input\.dataset\.addressField === 'true'/);
  assert.match(formUx, /\/\[@<>\]\/\.test\(address\)/);
  assert.match(formUx, /input\.dataset\.showValid === 'true'/);
  assert.match(routes, /optionalBranchPhone/);
  assert.match(routes, /optionalBranchAddress/);
  assert.match(routes, /optionalBranchEmail/);
});

test('editing a branch reapplies the prescribed city code even for legacy records', () => {
  const routes = read('src/routes/api.js');
  assert.match(routes, /update\.code = await nextBranchCode\(req\.companyId, location\.code, existing\.id\)/);
  assert.doesNotMatch(routes, /if \(location\.city !== existing\.city\) update\.code/);
});

test('account control is identical across pages', () => {
  const css = read('assets/app.css');
  const layout = read('assets/layout.js');
  assert.match(css, /\.account-trigger\s*\{[\s\S]*width:\s*272px;[\s\S]*height:\s*64px;/);
  assert.match(css, /\.account-avatar\s*\{[\s\S]*background:\s*linear-gradient\(135deg,\s*var\(--account-brand-primary\),\s*var\(--account-brand-secondary\)\)/);
  assert.match(layout, /const primary = safeHex\(branding\.primaryColor, '#2363ff'\)/);
  assert.match(layout, /root\.style\.setProperty\('--account-brand-primary', primary\)/);
  assert.match(css, /\.account-chevron\s*\{[\s\S]*background-position:\s*center;/);
});
