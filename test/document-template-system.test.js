'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createBusinessDocumentPdf, normalizeTemplate } = require('../src/services/businessDocumentPdf.service');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const transparentPng = fs.readFileSync(path.join(root, 'assets/rev-engine-mark.png'));

test('document template settings are company-scoped, validated, and migrated', () => {
  const schema = read('prisma/schema.prisma');
  const migration = read('prisma/migrations/20260723180000_document_template_system/migration.sql');
  const routes = read('src/routes/api.js');
  for (const field of ['documentTemplate', 'documentHeaderStyle', 'documentLogoPosition', 'documentLogoSize', 'documentTableDensity', 'showDocumentLogo', 'showPaymentInstructions']) {
    assert.match(schema, new RegExp(field));
    assert.match(migration, new RegExp(field));
    assert.match(routes, new RegExp(field));
  }
  assert.match(migration, /ROW_NUMBER\(\) OVER \(PARTITION BY q\."companyId"/);
  assert.match(migration, /quoteNextNumber/);
});

test('all quote creation paths use the shared quote number allocator', () => {
  const routes = read('src/routes/api.js');
  const creates = Array.from(routes.matchAll(/tx\.quote\.create\(/g));
  const allocations = Array.from(routes.matchAll(/nextQuoteNumber\(tx, req\.companyId\)/g));
  assert.equal(creates.length, 3);
  assert.equal(allocations.length, 3);
  assert.match(routes, /quoteData\.number = await nextQuoteNumber\(tx, req\.companyId\)/);
  assert.match(routes, /quoteNumber: quote\.number \|\| quote\.id/);
});

test('preview and real documents call the same PDF renderer', () => {
  const html = read('settings.html');
  const frontend = read('assets/api.js');
  const routes = read('src/routes/api.js');
  assert.match(html, /data-document-preview-frame/);
  assert.match(frontend, /POST[\s\S]*company\/document-preview\.pdf/);
  assert.match(routes, /router\.post\('\/company\/document-preview\.pdf'[\s\S]*createBusinessDocumentPdf/);
  assert.match(routes, /router\.get\('\/quotes\/:id\/pdf'[\s\S]*createBusinessDocumentPdf/);
  assert.match(routes, /router\.get\('\/invoices\/:id\/pdf'[\s\S]*createBusinessDocumentPdf/);
});

test('PDF renderer embeds PNG logos and respects controlled visibility settings', () => {
  const localization = normalizeTemplate({ documentTemplate: 'CLASSIC', documentLogoPosition: 'RIGHT', showTax: false, showPurchaseOrder: false, showPaymentInstructions: false });
  assert.equal(localization.template, 'CLASSIC');
  assert.equal(localization.logoPosition, 'RIGHT');
  const pdf = createBusinessDocumentPdf({
    kind: 'invoice',
    company: { name: 'Pristine Panels', email: 'office@example.com', address: 'Harare' },
    branding: { brandName: 'Pristine Panels', primaryColor: '#1d65bc', logoUrl: '/uploads/logos/logo.png' },
    localization: { defaultCurrency: 'USD', numberFormat: 'en-US', documentTemplate: 'CLASSIC', showTax: false, showPurchaseOrder: false, showPaymentInstructions: false },
    logoImage: { buffer: transparentPng, type: 'png' },
    record: {
      number: 'INV-0001', status: 'DRAFT', createdAt: '2026-07-23', dueDate: '2026-08-06', purchaseOrderNumber: 'PO-77',
      customer: { companyName: 'Solar Customer', customerType: 'BUSINESS', email: 'client@example.com' },
      lineItems: [{ description: 'Panel cleaning', quantity: 1, unitPrice: 100, lineTotal: 100 }],
      subtotal: 100, taxTotal: 15, total: 115
    }
  });
  const text = pdf.toString('latin1');
  assert.equal(pdf.subarray(0, 8).toString(), '%PDF-1.4');
  assert.match(text, /\/XObject/);
  assert.match(text, /\/Logo/);
  assert.doesNotMatch(text, /Customer PO/);
  assert.doesNotMatch(text, /Payment instructions/);
});

test('WEBP logos are converted to PNG before upload for PDF compatibility', () => {
  const frontend = read('assets/api.js');
  const logoService = read('src/services/businessDocumentLogo.service.js');
  assert.match(frontend, /file\.type !== 'image\/webp'/);
  assert.match(frontend, /canvas\.toBlob/);
  assert.match(frontend, /'image\/png'/);
  assert.match(logoService, /\['png', 'jpeg'\]/);
});

test('long customer documents paginate before totals and remain readable', () => {
  const lineItems = Array.from({ length: 24 }, (_, index) => ({
    description: `Solar service item ${index + 1}`,
    quantity: 1,
    unitPrice: 100,
    lineTotal: 100
  }));
  const pdf = createBusinessDocumentPdf({
    kind: 'invoice',
    company: { name: 'Pristine Panels' },
    branding: { brandName: 'Pristine Panels', primaryColor: '#1d65bc' },
    localization: { defaultCurrency: 'USD', numberFormat: 'en-US', documentTableDensity: 'COMFORTABLE' },
    record: {
      number: 'INV-0024', status: 'DRAFT', createdAt: '2026-07-23', dueDate: '2026-08-06',
      customer: { name: 'Customer' }, lineItems, subtotal: 2400, total: 2400
    }
  });
  const text = pdf.toString('latin1');
  assert.match(text, /\/Count 3/);
  assert.equal((text.match(/\(Total\)/g) || []).length, 1);
  assert.match(text, /Page 3 of 3/);
});
