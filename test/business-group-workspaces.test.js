const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadOrganizationService() {
  const source = read('src/services/organization.service.js');
  const sandbox = {
    require(request) {
      if (request === '../db') return { prisma: {} };
      throw new Error(`Unexpected require: ${request}`);
    },
    module: { exports: {} },
    exports: {},
    console
  };
  vm.runInNewContext(source, sandbox, { filename: 'organization.service.js' });
  return sandbox.module.exports;
}

function loadAccessControl() {
  const source = read('src/services/accessControl.service.js');
  const sandbox = {
    require(request) {
      if (request === '../db') return { prisma: {} };
      throw new Error(`Unexpected require: ${request}`);
    },
    module: { exports: {} },
    exports: {},
    Set,
    console
  };
  vm.runInNewContext(source, sandbox, { filename: 'accessControl.service.js' });
  return sandbox.module.exports;
}

test('country inputs normalize to stable ISO codes', () => {
  const { normalizeCountryCode, countryConfig } = loadOrganizationService();
  assert.equal(normalizeCountryCode('Zimbabwe'), 'ZW');
  assert.equal(normalizeCountryCode('zw'), 'ZW');
  assert.equal(normalizeCountryCode('South Africa'), 'ZA');
  assert.equal(normalizeCountryCode('SA'), 'ZA');
  assert.equal(countryConfig('ZA').currency, 'ZAR');
  assert.equal(countryConfig('ZW').timezone, 'Africa/Harare');
});

test('Prisma models connect companies and users through a business group', () => {
  const schema = read('prisma/schema.prisma');
  assert.match(schema, /enum BusinessGroupRole\s*{[\s\S]*OWNER[\s\S]*MANAGER/);
  assert.match(schema, /model BusinessGroup\s*{/);
  assert.match(schema, /model BusinessGroupMembership\s*{/);
  assert.match(schema, /groupId\s+String\?/);
  assert.match(schema, /businessGroupMemberships\s+BusinessGroupMembership\[\]/);
  assert.match(schema, /@@unique\(\[groupId, userId\]\)/);
});

test('migration backfills existing companies and owners without moving operational data', () => {
  const migration = read('prisma/migrations/20260721100000_business_group_workspaces/migration.sql');
  assert.match(migration, /INSERT INTO "BusinessGroup"/);
  assert.match(migration, /UPDATE "Company"[\s\S]*SET "groupId"/);
  assert.match(migration, /WHERE u\."role" = 'OWNER'/);
  assert.match(migration, /UPDATE "Branch"[\s\S]*'SOUTH AFRICA'[\s\S]*THEN 'ZA'/);
  assert.doesNotMatch(migration, /DELETE FROM|DROP TABLE/);
});

test('manager templates enforce group, workspace, and branch boundaries', () => {
  const { SYSTEM_ROLE_TEMPLATES } = loadAccessControl();
  const workspace = SYSTEM_ROLE_TEMPLATES.find((item) => item.key === 'workspace-manager');
  const branch = SYSTEM_ROLE_TEMPLATES.find((item) => item.key === 'branch-manager');
  assert.equal(workspace.systemRole, 'ADMIN');
  assert.equal(workspace.scope, 'COMPANY');
  assert.ok(workspace.permissions.includes('company.settings.manage'));
  assert.equal(branch.systemRole, 'ADMIN');
  assert.equal(branch.scope, 'BRANCH');
  assert.ok(branch.permissions.includes('jobs.edit'));
  assert.ok(branch.permissions.includes('payments.manage'));
  assert.ok(!branch.permissions.includes('company.settings.manage'));
  assert.ok(!branch.permissions.includes('members.manage'));
});

test('organization routes support workspace switching and owner-only delegation', () => {
  const api = read('src/routes/api.js');
  assert.match(api, /router\.get\('\/organization'/);
  assert.match(api, /router\.post\('\/organization\/switch-workspace'/);
  assert.match(api, /router\.post\('\/organization\/workspaces'/);
  assert.match(api, /requireBusinessGroupMembership\(req, \['OWNER'\]\)/);
  assert.match(api, /router\.post\('\/organization\/group-managers'/);
  assert.match(api, /router\.delete\('\/organization\/group-managers\/:id'/);
  assert.match(api, /role: groupRole === 'OWNER' \? 'OWNER' : groupRole === 'MANAGER' \? 'ADMIN'/);
});

test('branches inherit the workspace country and branch managers remain scoped', () => {
  const api = read('src/routes/api.js');
  const branches = read('branches.html');
  assert.doesNotMatch(branches, /name="country"/);
  assert.doesNotMatch(api.match(/const branchSchema = z\.object\(\{[\s\S]*?\n\}\);/)[0], /country:/);
  assert.match(api, /country: regional\.code/);
  assert.match(api, /access\.scopeType === 'BRANCH'[\s\S]*id: \{ in: access\.branchIds/);
  assert.match(api, /Only a workspace-wide manager can create branches/);
  assert.match(api, /access\.scopeType === 'BRANCH' && !access\.branchIds\.includes\(options\.branchId\)/);
});

test('signup and business group UI create the intended hierarchy', () => {
  const register = read('register.html');
  const workspaces = read('workspaces.html');
  const layout = read('assets/layout.js');
  assert.match(register, /name="groupName"/);
  assert.match(register, /name="companyName"/);
  assert.match(register, /name="branchName"/);
  assert.match(workspaces, /data-workspace-form/);
  assert.match(workspaces, /data-manager-form/);
  assert.match(layout, /workspaces\.html/);
});

test('new workspaces do not clone a paid subscription entitlement', () => {
  const api = read('src/routes/api.js');
  const route = api.slice(api.indexOf("router.post('/organization/workspaces'"), api.indexOf("router.post('/organization/group-managers'"));
  assert.match(route, /onboardingState: 'PLAN_SELECTION_REQUIRED'/);
  assert.match(route, /status: 'TRIALING'/);
  assert.doesNotMatch(route, /sourceCompany\.subscription/);
});
