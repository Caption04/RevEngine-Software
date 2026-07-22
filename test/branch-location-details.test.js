const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('branch setup uses controlled city selection and generated location details', () => {
  const html = read('branches.html');
  const frontend = read('assets/enterprise-pages.js');
  const routes = read('src/routes/api.js');
  const organization = read('src/services/organization.service.js');
  const schema = read('prisma/schema.prisma');

  assert.match(html, /data-branch-city-picker/);
  assert.match(html, /type="search"[^>]+data-branch-city-search/);
  assert.match(html, /data-branch-code readonly/);
  assert.match(html, /data-branch-timezone readonly/);
  assert.doesNotMatch(html, /name="code"/);
  assert.doesNotMatch(html, /name="timezone"/);

  assert.match(html, /name="phone"/);
  assert.match(html, /name="whatsappPhone"/);
  assert.match(html, /name="email"/);

  assert.match(frontend, /api\('\/branch-location-options'\)/);
  assert.match(frontend, /searchable-select-option/);
  assert.match(routes, /Choose a city from the available list/);
  assert.match(routes, /nextBranchCode/);
  assert.match(organization, /BRANCH_LOCATION_CATALOG/);
  assert.match(organization, /Harare Province/);
  assert.match(organization, /Western Cape/);

  assert.match(schema, /phone\s+String\?/);
  assert.match(schema, /whatsappPhone\s+String\?/);
  assert.match(schema, /email\s+String\?/);
  assert.match(schema, /region\s+String\?/);
});
