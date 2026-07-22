const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('customer creation requires a branch for broad access and defaults fixed branch access', () => {
  const frontend = read('assets/api.js');
  const backend = read('src/routes/api.js');

  assert.match(frontend, /function customerBranchField\(\)/);
  assert.match(frontend, /scopeType === 'BRANCH' && branches\.length === 1/);
  assert.match(frontend, /Choose the customer branch/);
  assert.match(frontend, /api\('\/branches\?limit=100'\)/);

  assert.match(backend, /async function resolveCustomerBranchId/);
  assert.match(backend, /selectionMode === 'FIXED'/);
  assert.match(backend, /Choose the customer branch\./);
  assert.match(backend, /branchId = await resolveCustomerBranchId\(req, req\.body\.branchId/);
});

test('customer branch choices stay inside the signed-in users access scope', () => {
  const backend = read('src/routes/api.js');

  assert.match(backend, /access\.scopeType !== 'COMPANY'/);
  assert.match(backend, /where\.id = \{ in: access\.branchIds \}/);
  assert.match(backend, /Choose a branch within your access\./);
  assert.match(backend, /customerBranchAccessContext/);
  assert.match(backend, /active: true/);
});

test('customer profile uses a quieter premium visual hierarchy', () => {
  const script = read('assets/customer-profile.js');
  const css = read('assets/app.css');

  assert.match(script, /customer-profile-labels/);
  assert.match(script, /customer-branch-label/);
  assert.match(css, /Premium customer profile/);
  assert.match(css, /customer-summary-grid[\s\S]*gap: 0/);
  assert.match(css, /customer-profile-tab\.active[\s\S]*background: #fff/);
  assert.match(css, /customer-profile-empty[\s\S]*border-style: solid/);
});
