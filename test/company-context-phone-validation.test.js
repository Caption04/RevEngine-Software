const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const {
  normalizePhoneForCountry,
  phoneRulesForCountry,
  validatePhoneForCountry
} = require('../src/services/phoneNumber.service');

test('branch phone rules validate Zimbabwe and South Africa numbers by country', () => {
  assert.equal(validatePhoneForCountry('077 123 4567', 'ZW'), true);
  assert.equal(validatePhoneForCountry('+263 24 212 3456', 'ZW'), true);
  assert.equal(validatePhoneForCountry('3877392823898392', 'ZW'), false);
  assert.equal(validatePhoneForCountry('082 123 4567', 'ZA'), true);
  assert.equal(validatePhoneForCountry('+27 11 123 4567', 'ZA'), true);
  assert.equal(validatePhoneForCountry('12345', 'ZA'), false);
  assert.equal(normalizePhoneForCountry('077 123 4567', 'ZW'), '+263771234567');
  assert.equal(normalizePhoneForCountry('011 123 4567', 'ZA'), '+27111234567');
  assert.match(phoneRulesForCountry('ZA').phonePlaceholder, /011 123 4567/);
});

test('branch UI receives country-aware placeholders and validation metadata', () => {
  const branchHtml = read('branches.html');
  const branchJs = read('assets/enterprise-pages.js');
  const formUx = read('assets/form-ux.js');
  const routes = read('src/routes/api.js');

  assert.match(branchHtml, /data-branch-phone-help/);
  assert.match(branchHtml, /data-branch-whatsapp-help/);
  assert.match(branchJs, /field\.dataset\.phoneCountry/);
  assert.match(branchJs, /phoneRules\.phonePlaceholder/);
  assert.match(formUx, /countryPhoneValidation/);
  assert.match(routes, /branchPhoneForCountry/);
  assert.match(routes, /phoneValidationMessage/);
});

test('company setup aligns related fields and uses prescribed main branch cities', () => {
  const workspacesHtml = read('workspaces.html');
  const workspacesJs = read('assets/workspaces.js');
  const registerHtml = read('register.html');
  const routes = read('src/routes/api.js');
  const css = read('assets/app.css');

  assert.match(workspacesHtml, /workspace-create-form/);
  assert.match(workspacesHtml, /data-main-branch-city/);
  assert.match(workspacesHtml, /Company contact/);
  assert.match(workspacesHtml, /Main branch/);
  assert.match(workspacesJs, /fillMainBranchCities/);
  assert.match(registerHtml, /data-register-branch-city/);
  assert.match(routes, /mainBranchLocation\.code/);
  assert.match(css, /\.field > label[\s\S]*display: flex/);
});

test('company settings and account control show active-company context and branding', () => {
  const settings = read('settings.html');
  const api = read('assets/api.js');
  const layout = read('assets/layout.js');
  const organization = read('src/services/organization.service.js');
  const css = read('assets/app.css');

  assert.match(settings, /data-company-settings-title/);
  assert.match(settings, /These details apply only to the company currently open/);
  assert.match(api, /activeCompany/);
  assert.match(layout, /applyAccountBrand/);
  assert.match(layout, /--account-brand-primary/);
  assert.match(organization, /branding: \{/);
  assert.match(css, /\.account-trigger[\s\S]*var\(--account-brand-surface-a\)/);
  assert.match(css, /\.account-avatar[\s\S]*var\(--account-brand-primary\)/);
});
