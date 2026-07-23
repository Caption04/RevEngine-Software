'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { starterDesign, rendererLocalization } = require('../src/services/documentTemplate.service');
const { createBusinessDocumentPdf } = require('../src/services/businessDocumentPdf.service');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('the template back action stays at the top-left of the editor header', () => {
  const html = read('document-templates.html');
  const css = read('assets/app.css');
  assert.match(html, /<div class="document-editor-heading">\s*<button class="text-button document-editor-back"[^>]*>← Back to templates<\/button>/);
  assert.match(css, /\.document-editor-heading\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto;/);
  assert.match(css, /\.document-editor-back\s*\{[\s\S]*?grid-column:\s*1 \/ -1;[\s\S]*?justify-self:\s*start;[\s\S]*?text-align:\s*left;/);
});

test('rapid control changes only allow the newest PDF preview to win', () => {
  const frontend = read('assets/document-templates.js');
  assert.match(frontend, /previewRequest:\s*0/);
  assert.match(frontend, /previewController:\s*null/);
  assert.match(frontend, /new AbortController\(\)/);
  assert.match(frontend, /if \(request !== state\.previewRequest \|\| controller\.signal\.aborted\) return;/);
  assert.match(frontend, /if \(error && error\.name === 'AbortError'\) return;/);
});

test('page margin, text colour, text size, section headings, and line-item labels affect the PDF', () => {
  const design = starterDesign('INVOICE', 'PROFESSIONAL');
  design.header.visible = false;
  design.page.margin = 30;
  design.page.showPageNumbers = false;
  design.typography.bodySize = 11;
  design.theme.textColor = '#AA0000';
  design.blocks.find((block) => block.type === 'CUSTOMER_DETAILS').label = 'Client account';
  design.blocks.find((block) => block.type === 'DOCUMENT_DETAILS').label = 'Billing dates';
  design.blocks.find((block) => block.type === 'LINE_ITEMS').columns = ['WORK', 'HOURS', 'RATE', 'AMOUNT'];

  const localization = rendererLocalization({ defaultCurrency: 'USD', numberFormat: 'en-US' }, { documentType: 'INVOICE', design });
  const pdf = createBusinessDocumentPdf({
    kind: 'invoice',
    company: { name: 'Company' },
    branding: { brandName: 'Company' },
    localization,
    record: {
      number: 'INV-1', status: 'DRAFT', createdAt: '2026-07-23', dueDate: '2026-08-06',
      customer: { name: 'Customer' },
      lineItems: [{ description: 'Consulting', quantity: 2, unitPrice: 50, lineTotal: 100 }],
      subtotal: 100, total: 100
    }
  }).toString('latin1');

  assert.match(pdf, /\(CLIENT ACCOUNT\)/);
  assert.match(pdf, /\(BILLING DATES\)/);
  assert.match(pdf, /\(WORK\)/);
  assert.match(pdf, /\(HOURS\)/);
  assert.match(pdf, /\(RATE\)/);
  assert.match(pdf, /\(AMOUNT\)/);
  assert.match(pdf, /0\.667 0\.000 0\.000 rg BT \/F2 14 Tf 30 /);
});
