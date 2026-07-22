const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('customer accounts store detailed identity, contact, billing, status, and note fields', () => {
  const schema = read('prisma/schema.prisma');
  const migration = read('prisma/migrations/20260722160000_customer_account_details/migration.sql');

  for (const field of [
    'status',
    'customerReference',
    'registeredCompanyName',
    'registrationNumber',
    'taxNumber',
    'industry',
    'alternatePhone',
    'preferredContactMethod',
    'billingEmail',
    'billingContactName',
    'paymentTerms',
    'purchaseOrderRequired',
    'serviceNotes',
    'internalNotes'
  ]) {
    assert.match(schema, new RegExp(`\\b${field}\\b`));
  }
  assert.match(schema, /enum CustomerStatus/);
  assert.match(schema, /enum PreferredContactMethod/);
  assert.match(schema, /enum CustomerPaymentTerms/);
  assert.match(migration, /Customer_companyId_customerReference_key/);
  assert.match(migration, /SET "serviceNotes" = "notes"/);
});

test('customer edit form uses clear sections and permission-aware branch and billing controls', () => {
  const script = read('assets/customer-profile.js');
  const css = read('assets/app.css');

  for (const section of ['Customer account', 'Business identity', 'Primary contact', 'Billing', 'Notes']) {
    assert.match(script, new RegExp(section));
  }
  assert.match(script, /branchSelectionMode === 'FIXED'/);
  assert.match(script, /Choose the customer branch/);
  assert.match(script, /access\.canEditBilling/);
  assert.match(script, /Finance access is required to change this/);
  assert.match(script, /Purchase order required/);
  assert.match(script, /data-business-section/);
  assert.match(css, /\.customer-form-section-grid/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test('customer API protects billing and internal notes while keeping primary contact details in sync', () => {
  const api = read('src/routes/api.js');

  assert.match(api, /function canViewCustomerBilling/);
  assert.match(api, /function canEditCustomerBilling/);
  assert.match(api, /delete record\.invoices/);
  assert.match(api, /delete record\.internalNotes/);
  assert.match(api, /customerReference: newCustomerReference\(\)/);
  assert.match(api, /primaryContactRole/);
  assert.match(api, /branchSelectionMode: branchContext\.selectionMode/);
  assert.match(api, /customerBranches: branchContext\.branches/);
});
