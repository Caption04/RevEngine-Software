const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  normalizePurchaseOrderNumber,
  paymentTermsDays,
  requirePurchaseOrderNumber,
  resolveInvoiceBranch
} = require('../src/services/invoicePolicy.service');

const root = path.join(__dirname, '..');

test('customer purchase-order policy enforces required numbers and normalizes valid values', () => {
  assert.equal(normalizePurchaseOrderNumber('  PO-2026-0042  '), 'PO-2026-0042');
  assert.equal(normalizePurchaseOrderNumber(''), null);
  assert.throws(() => requirePurchaseOrderNumber({ purchaseOrderRequired: true }, '', 'create'), /before creating this invoice/);
  assert.throws(() => requirePurchaseOrderNumber({ purchaseOrderRequired: true }, '', 'send'), /before sending this invoice/);
  assert.equal(requirePurchaseOrderNumber({ purchaseOrderRequired: false }, '', 'create'), null);
});

test('customer payment terms determine the invoice due date period', () => {
  assert.equal(paymentTermsDays({ paymentTerms: 'DUE_ON_RECEIPT' }, 14), 0);
  assert.equal(paymentTermsDays({ paymentTerms: 'NET_30' }, 14), 30);
  assert.equal(paymentTermsDays({ paymentTerms: 'UNKNOWN' }, 14), 14);
});

test('invoice branch and customer relations cannot be mixed', () => {
  const customer = { id: 'customer-a', branchId: 'branch-a' };
  assert.equal(resolveInvoiceBranch({ customer, job: { customerId: 'customer-a', branchId: 'branch-a' }, quote: null, requestedBranchId: null }), 'branch-a');
  assert.throws(() => resolveInvoiceBranch({ customer, job: { customerId: 'customer-b', branchId: 'branch-a' }, quote: null, requestedBranchId: null }), /different customer/);
  assert.throws(() => resolveInvoiceBranch({ customer, job: { customerId: 'customer-a', branchId: 'branch-b' }, quote: null, requestedBranchId: null }), /same branch/);
});

test('invoice API and UI enforce PO numbers and company-owned relations', () => {
  const api = fs.readFileSync(path.join(root, 'src/routes/api.js'), 'utf8');
  const ui = fs.readFileSync(path.join(root, 'assets/api.js'), 'utf8');
  const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
  const clientPortal = fs.readFileSync(path.join(root, 'assets/client-portal.js'), 'utf8');
  const customerProfile = fs.readFileSync(path.join(root, 'assets/customer-profile.js'), 'utf8');
  assert.match(schema, /purchaseOrderNumber\s+String\?/);
  assert.match(schema, /@@index\(\[companyId, purchaseOrderNumber\]\)/);
  assert.match(api, /requirePurchaseOrderNumber\(customer, before\.purchaseOrderNumber, 'send'\)/);
  assert.match(api, /paymentTermsDays\(context\.customer/);
  assert.match(api, /resolveInvoiceBranch\(\{ customer, job, quote, requestedBranchId \}\)/);
  assert.match(api, /router\.get\('\/invoice-customers'/);
  assert.match(api, /permission: 'invoices\.send'/);
  assert.match(api, /permission: 'payments\.manage'/);
  assert.match(api, /purchaseOrderNumber: invoice\.purchaseOrderNumber \|\| null/);
  assert.match(ui, /data-invoice-po-field/);
  assert.match(ui, /'invoice-po'/);
  assert.match(ui, /This customer requires its purchase-order number before an invoice can be created/);
  assert.match(clientPortal, /Purchase order/);
  assert.match(customerProfile, /invoice\.purchaseOrderNumber/);
});
