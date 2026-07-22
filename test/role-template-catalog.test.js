const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const apiSource = fs.readFileSync(path.join(root, 'src/routes/api.js'), 'utf8');
const membersSource = fs.readFileSync(path.join(root, 'assets/members.js'), 'utf8');

test('saved company roles stay separate from suggested O&M templates', () => {
  assert.match(apiSource, /router\.get\('\/role-templates'[\s\S]*where: \{ companyId: req\.companyId, isCustom: true, active: true \}/);
  assert.match(apiSource, /router\.get\('\/role-template-catalog'[\s\S]*companyId: null, isSystemTemplate: true, active: true/);
  assert.match(apiSource, /rows\.filter\(\(row\) => row\.systemRole !== 'OWNER'\)/);
  assert.match(membersSource, /suggestedTemplates: \[\]/);
  assert.match(membersSource, /api\('\/role-template-catalog'\)/);
  assert.match(membersSource, /Suggested solar O&amp;M roles/);
  assert.match(membersSource, /function findStartingRole/);
});
