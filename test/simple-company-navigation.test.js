const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('company switching uses the existing account menu and stays hidden for one company', () => {
  const layout = read('assets/layout.js');
  assert.doesNotMatch(layout, /data-workspace-switcher|class="workspace-switcher"/);
  assert.match(layout, /data-company-list/);
  assert.match(layout, /companies\.length < 2/);
  assert.match(layout, /Switch company/);
  assert.match(layout, /data-switch-company/);
  assert.match(layout, /account-current-company/);
  assert.match(layout, /organization\/switch-workspace/);
});

test('normal sign in does not expose test accounts or prefilled credentials', () => {
  const login = read('login.html');
  assert.doesNotMatch(login, /Staff demo accounts|owner@fieldcore\.test|FieldCoreDemo2026!/);
  assert.doesNotMatch(login, /class="auth-demo/);
});

test('new multi-company screens use plain business language', () => {
  const layout = read('assets/layout.js');
  const page = read('workspaces.html');
  assert.match(layout, /\['workspaces', 'Companies'/);
  assert.match(page, /<h3>Companies<\/h3>/);
  assert.match(page, /<h3>Add company<\/h3>/);
  assert.match(page, /Managers for all companies/);
  assert.doesNotMatch(page, />Workspaces</);
  assert.doesNotMatch(page, />Add workspace</);
  assert.doesNotMatch(page, /data-status|Loading\.\.\./);
});

test('cleanup migration only targets known seed records', () => {
  const migration = read('prisma/migrations/20260721120000_remove_demo_ui_scaffolding/migration.sql');
  assert.match(migration, /revengine-zw-demo/);
  assert.match(migration, /revengine-sa-demo/);
  assert.doesNotMatch(migration, /DELETE FROM|DROP TABLE/);
});
