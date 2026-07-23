'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('billing settings have one editable source of truth', () => {
  const html = read('settings.html');
  assert.doesNotMatch(html, /data-settings-target="billing"/);
  assert.doesNotMatch(html, /data-invoice-defaults-form/);
  assert.match(html, /Billing &amp; Documents/);
  assert.match(html, /name="quotePrefix"/);
  assert.equal((html.match(/name="invoicePrefix"/g) || []).length, 1);
  assert.equal((html.match(/name="paymentTermsDays"/g) || []).length, 1);
  assert.equal((html.match(/name="invoiceFooter"/g) || []).length, 1);
});

test('quote and invoice PDFs use unified settings and conditional fields', () => {
  const route = read('src/routes/api.js');
  const pdf = read('src/services/businessDocumentPdf.service.js');
  assert.match(route, /nextQuoteNumber/);
  assert.match(route, /quotePrefix/);
  assert.match(pdf, /record\.purchaseOrderNumber \?/);
  assert.match(pdf, /localization && localization\.invoiceFooter/);
  assert.match(pdf, /localization && localization\.paymentInstructions/);
});
