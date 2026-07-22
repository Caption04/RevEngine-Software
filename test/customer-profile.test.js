const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('customer profile keeps business, site, and role-sensitive information in one place', () => {
  const html = read('customer-profile.html');
  const script = read('assets/customer-profile.js');
  const api = read('src/routes/api.js');

  assert.match(html, /data-page="customer-profile"/);
  for (const tab of ['Overview', 'Contacts', 'Solar Sites', 'Work History', 'Quotes & Contracts', 'Documents & Notes', 'Money']) {
    assert.match(script, new RegExp(tab.replace(/[&]/g, '\\&')));
  }
  for (const siteTab of ['System Overview', 'Equipment', 'Faults', 'Readings', 'Maintenance', 'Photos', 'Documents']) {
    assert.match(script, new RegExp(siteTab));
  }
  assert.match(api, /router\.get\('\/customer-profiles\/:id'/);
  assert.match(api, /technicianVisible: true/);
  assert.match(api, /money: canViewMoney \?/);
  assert.match(api, /requireCustomer\(req, customerId\)/);
});

test('customer creation opens the real customer profile and job details link technicians to it', () => {
  const script = read('assets/api.js');
  assert.match(script, /config\.action === '\/customers'[\s\S]*customer-profile\.html\?id=/);
  assert.match(script, /Open customer profile/);
  assert.match(script, /add\('Open profile', 'customer-profile'/);
  assert.match(script, /title: 'New Sales Enquiry'/);
  assert.match(script, /title: 'Add Existing Customer'/);
});

test('customer profile does not use browser-native dialogs', () => {
  const script = read('assets/customer-profile.js');
  assert.doesNotMatch(script, /\b(?:alert|confirm|prompt)\s*\(/);
});
