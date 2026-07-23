'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createBusinessDocumentPdf } = require('../src/services/businessDocumentPdf.service');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('company settings collect the legal details required on customer documents', () => {
  const html = read('settings.html');
  for (const field of ['legalName', 'registrationNumber', 'taxNumber', 'email', 'phone', 'address']) {
    assert.match(html, new RegExp(`data-profile-field="${field}"`));
  }
  assert.match(html, /data-branding-field="websiteUrl"/);

  const switchPosition = html.indexOf('data-finance-field="pricesIncludeTax"');
  const helperPosition = html.indexOf('Turn this on when line item prices already include VAT\/tax.');
  assert.ok(switchPosition >= 0 && helperPosition > switchPosition, 'tax helper copy should sit below the switch control');
});

test('draft quotes and invoices expose full edit actions with line-item editing', () => {
  const ui = read('assets/api.js');
  assert.match(ui, /add\('Edit', 'quote-edit', true, 'quotes\.edit'\)/);
  assert.match(ui, /add\('Edit', 'invoice-edit', true, 'invoices\.edit'\)/);
  assert.match(ui, /openBillingDocumentEditor\('quotes', id\)/);
  assert.match(ui, /openBillingDocumentEditor\('invoices', id\)/);
  assert.match(ui, /method: 'PATCH'/);
  assert.match(ui, /data-document-line-item/);
  assert.match(ui, /data-add-document-line/);
  assert.match(ui, /data-line-discount/);
  assert.match(ui, /data-line-tax/);
  assert.match(ui, /'invoice-po'/);
});

test('invoice financial edits are limited to drafts and cannot change the allocated invoice number', () => {
  const api = read('src/routes/api.js');
  assert.match(api, /const invoicePatchSchema = invoiceSchema\.partial\(\)\.omit\(\{ number: true \}\)/);
  assert.match(api, /function assertDraftInvoiceEditable\(invoice\)/);
  assert.match(api, /Only draft invoices can be edited/);
  assert.equal((api.match(/assertDraftInvoiceEditable\(invoice\);/g) || []).length, 4);
});

test('quote and invoice PDFs show the configured legal business identity', () => {
  const pdf = createBusinessDocumentPdf({
    kind: 'invoice',
    company: {
      name: 'Pristine Panels',
      legalName: 'Pristine Panels & Property Care (Private) Limited',
      registrationNumber: 'ZW-REG-2026-001',
      taxNumber: 'VAT-998877',
      address: '12 Solar Way, Harare, Zimbabwe',
      email: 'accounts@pristinepanels.co',
      phone: '+263 77 123 4567'
    },
    branding: {
      brandName: 'Pristine Panels',
      primaryColor: '#1d65bc',
      supportEmail: 'support@pristinepanels.co',
      supportPhone: '+263 77 555 0101',
      websiteUrl: 'https://pristinepanels.co'
    },
    localization: { defaultCurrency: 'USD', numberFormat: 'en-US', taxName: 'VAT' },
    record: {
      number: 'ZW-INV-0001',
      status: 'DRAFT',
      createdAt: '2026-07-23',
      dueDate: '2026-08-06',
      customer: { name: 'Solar Customer', email: 'client@example.com' },
      lineItems: [{ description: 'Panel cleaning', quantity: 1, unitPrice: 100, lineTotal: 100 }],
      subtotal: 100,
      total: 100
    }
  });

  const text = pdf.toString('latin1');
  assert.match(text, /Pristine Panels & Property Care/);
  assert.match(text, /Reg No: ZW-REG-2026-001/);
  assert.match(text, /VAT No: VAT-998877/);
  assert.match(text, /12 Solar Way, Harare, Zimbabwe/);
  assert.match(text, /support@pristinepanels\.co/);
  assert.match(text, /\+263 77 555 0101/);
  assert.match(text, /https:\/\/pristinepanels\.co/);
});
