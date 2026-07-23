'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  BLOCK_TYPES,
  normalizeDesign,
  rendererLocalization,
  starterDesign
} = require('../src/services/documentTemplate.service');
const { createBusinessDocumentPdf } = require('../src/services/businessDocumentPdf.service');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('document studio persists tenant-scoped templates and immutable published versions', () => {
  const schema = read('prisma/schema.prisma');
  const migration = read('prisma/migrations/20260723193000_document_studio_foundation/migration.sql');
  assert.match(schema, /model DocumentTemplate \{/);
  assert.match(schema, /model DocumentTemplateVersion \{/);
  assert.match(schema, /@@unique\(\[templateId, version\]\)/);
  assert.match(schema, /documentTemplates\s+DocumentTemplate\[\]/);
  for (const entity of ['Quote', 'Invoice', 'ServiceContract']) {
    assert.match(schema, new RegExp(`model ${entity} \\{[\\s\\S]*documentTemplateId\\s+String\\?`));
    assert.match(schema, new RegExp(`model ${entity} \\{[\\s\\S]*documentTemplateVersion\\s+Int\\?`));
    assert.match(migration, new RegExp(`ALTER TABLE "${entity}"[\\s\\S]*"documentTemplateVersion"`));
  }
  assert.match(migration, /FOREIGN KEY \("companyId"\) REFERENCES "Company"/);
  assert.match(migration, /DocumentTemplateVersion_templateId_version_key/);
});

test('document studio exposes ready-made, blank, imported, preview, publish, and archive workflows', () => {
  const routes = read('src/routes/api.js');
  const html = read('document-templates.html');
  const frontend = read('assets/document-templates.js');
  const layout = read('assets/layout.js');
  for (const route of [
    "router.get('/document-templates'",
    "router.post('/document-templates'",
    "router.post('/document-templates/import'",
    "router.patch('/document-templates/:id'",
    "router.post('/document-templates/:id/publish'",
    "router.post('/document-templates/:id/duplicate'",
    "router.post('/document-templates/:id/archive'",
    "router.post('/document-templates/:id/restore'",
    "router.delete('/document-templates/:id/import-source'",
    "router.delete('/document-templates/:id'",
    "router.post('/document-templates/preview.pdf'"
  ]) assert.match(routes, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(routes, /where: \{ companyId: req\.companyId/);
  assert.match(routes, /documentTemplateVersion\.create/);
  assert.match(routes, /status: 'ARCHIVED'/);
  assert.match(routes, /status: 'DELETED'/);
  assert.match(routes, /System templates cannot be deleted/);
  assert.match(routes, /12 \* 1024 \* 1024/);
  assert.match(routes, /application\/pdf/);
  assert.match(routes, /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/);
  assert.match(html, /data-import-template/);
  assert.match(html, /data-create-blank/);
  assert.match(html, /data-create-starter/);
  assert.match(html, /data-template-preview-frame/);
  assert.match(frontend, /Import an existing document/);
  assert.match(frontend, /Start from scratch/);
  assert.match(frontend, /Use a ready-made template/);
  assert.match(frontend, /RevEngineUI\.confirm/);
  assert.match(layout, /'document-templates', 'Document Studio'/);
});

test('structured designs preserve editable payment, legal, signature, and contract blocks', () => {
  const invoice = starterDesign('INVOICE', 'PROFESSIONAL');
  assert.deepEqual(invoice.blocks.map((block) => block.type), ['CUSTOMER_DETAILS', 'DOCUMENT_DETAILS', 'LINE_ITEMS', 'TOTALS', 'PAYMENT_OPTIONS', 'ONLINE_PAYMENT', 'DISCLAIMER', 'FOOTER']);
  assert.match(invoice.blocks.find((block) => block.type === 'DISCLAIMER').body, /confirm that the payment details/i);
  const blank = starterDesign('INVOICE', 'BLANK');
  assert.equal(blank.header.visible, false);
  assert.equal(blank.page.showPageNumbers, false);
  assert.deepEqual(blank.blocks, []);

  const contract = starterDesign('CONTRACT', 'PROFESSIONAL');
  assert.ok(contract.blocks.some((block) => block.type === 'CONTRACT_BODY'));
  assert.ok(contract.blocks.some((block) => block.type === 'SIGNATURES'));
  assert.ok(BLOCK_TYPES.includes('PAYMENT_OPTIONS'));

  const normalized = normalizeDesign({
    theme: { primaryColor: '#abcdef' },
    blocks: [
      { id: 'pay', type: 'PAYMENT_OPTIONS', label: 'How to pay', bankName: 'First National Bank', accountNumber: '12345' },
      { id: 'notice', type: 'DISCLAIMER', label: 'Fraud warning', body: 'Verify our bank account before payment.' }
    ]
  }, 'INVOICE');
  assert.equal(normalized.theme.primaryColor, '#ABCDEF');
  assert.equal(normalized.blocks[0].accountNumber, '12345');
  assert.equal(normalized.blocks[1].label, 'Fraud warning');
});

test('the shared PDF renderer applies document studio blocks to invoices and contracts', () => {
  const invoiceDesign = starterDesign('INVOICE', 'PROFESSIONAL');
  const payment = invoiceDesign.blocks.find((block) => block.type === 'PAYMENT_OPTIONS');
  Object.assign(payment, { bankName: 'First National Bank', accountName: 'Pristine Panels', accountNumber: '62270551015', branchCode: '210554', swiftCode: 'FIRNZAJJ', referenceRule: 'Use INV-1001 as reference.' });
  const disclaimer = invoiceDesign.blocks.find((block) => block.type === 'DISCLAIMER');
  disclaimer.body = 'Verify the company bank account before making payment.';
  const localization = rendererLocalization({ defaultCurrency: 'USD', numberFormat: 'en-US', taxName: 'VAT' }, { documentType: 'INVOICE', sourceType: 'BLANK', design: invoiceDesign });
  const invoicePdf = createBusinessDocumentPdf({
    kind: 'invoice',
    company: { name: 'Pristine Panels', legalName: 'Pristine Panels Private Limited', registrationNumber: '123/2026', taxNumber: 'VAT-77' },
    branding: { brandName: 'Pristine Panels', supportEmail: 'accounts@example.com', primaryColor: '#1D65BC' },
    localization,
    record: {
      number: 'INV-1001', status: 'DRAFT', createdAt: '2026-07-23', dueDate: '2026-08-06', onlinePaymentUrl: 'https://pay.example.com/INV-1001',
      customer: { companyName: 'Customer Limited', email: 'client@example.com' },
      lineItems: [{ description: 'Solar maintenance', quantity: 1, unitPrice: 100, lineTotal: 100 }],
      subtotal: 100, taxTotal: 15, total: 115
    }
  });
  const invoiceText = invoicePdf.toString('latin1');
  assert.equal(invoicePdf.subarray(0, 8).toString(), '%PDF-1.4');
  assert.match(invoiceText, /First National Bank/);
  assert.match(invoiceText, /62270551015/);
  assert.match(invoiceText, /FIRNZAJJ/);
  assert.match(invoiceText, /Verify the company bank account/);
  assert.match(invoiceText, /pay\.example\.com/);

  const contractDesign = starterDesign('CONTRACT', 'PROFESSIONAL');
  contractDesign.blocks.find((block) => block.type === 'CONTRACT_BODY').body = 'This agreement covers inspection and maintenance services.';
  const contractPdf = createBusinessDocumentPdf({
    kind: 'contract',
    company: { name: 'Pristine Panels' },
    branding: { brandName: 'Pristine Panels', primaryColor: '#1D65BC' },
    localization: rendererLocalization({ defaultCurrency: 'USD', numberFormat: 'en-US' }, { documentType: 'CONTRACT', sourceType: 'BLANK', design: contractDesign }),
    record: { contractNumber: 'OM-100', status: 'ACTIVE', startDate: '2026-07-23', endDate: '2027-07-23', customer: { name: 'Customer' }, serviceLines: [], contractValue: 1000 }
  });
  const contractText = contractPdf.toString('latin1');
  assert.match(contractText, /This agreement covers inspection/);
  assert.match(contractText, /For the company/);
  assert.match(contractText, /For the customer/);
});

test('real quote, invoice, and contract PDFs resolve locked template versions', () => {
  const routes = read('src/routes/api.js');
  assert.match(routes, /documentTemplateForRecord\(req\.companyId, 'QUOTE', record\)/);
  assert.match(routes, /documentTemplateForRecord\(req\.companyId, 'INVOICE', record\)/);
  assert.match(routes, /documentTemplateForRecord\(req\.companyId, 'CONTRACT', record\)/);
  assert.match(routes, /lockDefaultDocumentTemplate\(tx, req\.companyId, 'QUOTE', 'quote'/);
  assert.match(routes, /lockDefaultDocumentTemplate\(tx, req\.companyId, 'INVOICE', 'invoice'/);
  assert.match(routes, /lockDefaultDocumentTemplate\(tx, req\.companyId, 'CONTRACT', 'serviceContract'/);
  assert.match(routes, /router\.get\('\/service-contracts\/:id\/pdf'/);
  assert.match(routes, /router\.get\(["']\/client\/service-contracts\/:id\/pdf["']/);
  const admin = read('assets/api.js');
  const client = read('assets/client-portal.js');
  assert.match(admin, /data-row-action-menu/);
  assert.match(admin, /'contract-pdf'/);
  assert.match(client, /data-action="contract-pdf"/);
});

test('imported document references are private runtime files, not public static assets', () => {
  const app = read('src/app.js');
  const ignore = read('.gitignore');
  const routes = read('src/routes/api.js');
  assert.match(app, /app\.use\('\/private-data'/);
  assert.match(ignore, /private-data\//);
  assert.match(routes, /Cache-Control', 'private, no-store'/);
  assert.match(routes, /path\.basename\(template\.importSourceUrl\)/);
  assert.match(routes, /mode: 0o600/);
});
