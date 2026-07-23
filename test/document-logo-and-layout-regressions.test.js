'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createBusinessDocumentPdf } = require('../src/services/businessDocumentPdf.service');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const squareLogo = fs.readFileSync(path.join(root, 'LogoRev.jpg'));

test('document logos preserve their original aspect ratio inside the logo box', () => {
  const pdf = createBusinessDocumentPdf({
    kind: 'invoice',
    company: { name: 'Rev Engine Zimbabwe' },
    branding: { brandName: 'Rev Engine Zimbabwe', primaryColor: '#2363ff' },
    localization: {
      defaultCurrency: 'USD',
      numberFormat: 'en-US',
      documentTemplate: 'MODERN',
      documentLogoSize: 'MEDIUM',
      documentLogoPosition: 'RIGHT'
    },
    logoImage: { buffer: squareLogo, type: 'jpeg' },
    record: {
      number: 'ZW-INV-0001',
      status: 'DRAFT',
      createdAt: '2026-07-23',
      dueDate: '2026-08-06',
      customer: { name: 'Customer' },
      lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100, lineTotal: 100 }],
      subtotal: 100,
      total: 100
    }
  });

  const source = pdf.toString('latin1');
  assert.match(source, /q 46\.00 0 0 46\.00 501\.00 [\d.]+ cm \/Logo Do Q/);
  assert.doesNotMatch(source, /q 78\.20 0 0 46\.00 [\d.]+ [\d.]+ cm \/Logo Do Q/);
});

test('Document Studio style controls use fixed aligned rows', () => {
  const css = read('assets/app.css');
  assert.match(css, /\.document-style-grid,[\s\S]*?align-items:\s*start;/);
  assert.match(css, /\.document-style-grid > \.field \{[\s\S]*?align-self:\s*start;[\s\S]*?grid-template-rows:\s*18px 48px;/);
  assert.match(css, /\.document-style-grid > \.field > input,[\s\S]*?\.document-style-grid > \.field > select \{[\s\S]*?height:\s*48px;[\s\S]*?min-height:\s*48px;[\s\S]*?max-height:\s*48px;/);
});
