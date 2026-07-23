const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createBusinessDocumentPdf } = require('../src/services/businessDocumentPdf.service');

const root = path.join(__dirname, '..');

test('quote and invoice PDF generator returns a readable PDF document', () => {
  const base = {
    customer: { customerType: 'BUSINESS', companyName: 'Solar Client', name: 'Client Contact', email: 'client@example.com' },
    lineItems: [{ description: 'Preventive maintenance', quantity: 1, unitPrice: 120, lineTotal: 120 }],
    subtotal: 120,
    total: 138,
    taxTotal: 18,
    status: 'DRAFT',
    createdAt: new Date('2026-07-23T00:00:00Z')
  };
  for (const kind of ['quote', 'invoice']) {
    const pdf = createBusinessDocumentPdf({
      kind,
      record: { ...base, id: `${kind}-1`, title: 'Solar maintenance', number: 'INV-0001', dueDate: new Date('2026-08-22T00:00:00Z') },
      company: { name: 'Solar O&M Company', email: 'info@example.com' },
      branding: { brandName: 'Solar O&M Company', primaryColor: '#123456' },
      localization: { defaultCurrency: 'USD', numberFormat: 'en-US' }
    });
    assert.equal(pdf.subarray(0, 8).toString(), '%PDF-1.4');
    assert.match(pdf.toString('ascii'), /Solar O&M Company/);
    assert.match(pdf.toString('ascii'), new RegExp(kind === 'quote' ? 'QUOTE' : 'INVOICE'));
  }
});

test('authenticated shell always replaces generic branding with the active company brand', () => {
  const layout = fs.readFileSync(path.join(root, 'assets/layout.js'), 'utf8');
  assert.match(layout, /function renderCompanyBrand\(user\)/);
  assert.match(layout, /if \(branding\.logoUrl\)/);
  assert.match(layout, /document\.querySelectorAll\('\.sidebar \.brand-name'\)/);
  assert.match(layout, /renderCompanyBrand\(user\)/);
});

test('invoice form keeps helper text attached to its label and explains due-date defaults', () => {
  const ui = fs.readFileSync(path.join(root, 'assets/api.js'), 'utf8');
  assert.match(ui, /field-label-with-help/);
  assert.match(ui, /Only if the customer gave you one/);
  assert.match(ui, /data-invoice-due-help/);
  assert.match(ui, /Set from.*payment terms/);
  assert.match(ui, /Changed manually from the customer/);
});

test('quote and invoice action menus expose protected PDF previews', () => {
  const ui = fs.readFileSync(path.join(root, 'assets/api.js'), 'utf8');
  const api = fs.readFileSync(path.join(root, 'src/routes/api.js'), 'utf8');
  assert.match(ui, /'View PDF', 'quote-pdf'/);
  assert.match(ui, /'View PDF', 'invoice-pdf'/);
  assert.match(api, /router\.get\('\/quotes\/:id\/pdf'/);
  assert.match(api, /router\.get\('\/invoices\/:id\/pdf'/);
  assert.match(api, /Content-Type', 'application\/pdf'/);
});
