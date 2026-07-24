'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { starterDesign, rendererLocalization } = require('../src/services/documentTemplate.service');
const { createBusinessDocumentPdf } = require('../src/services/businessDocumentPdf.service');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('template creation actions use a real fixed modal instead of an inline panel', () => {
  const html = read('document-templates.html');
  const css = read('assets/app.css');
  assert.match(html, /class="modal-backdrop" data-template-modal hidden/);
  assert.match(css, /\.modal-backdrop\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0;/);
  assert.match(css, /\.modal-backdrop\[hidden\][\s\S]*?display:\s*none\s*!important/);
});

test('opening a template does not force the page to scroll to the top', () => {
  const frontend = read('assets/document-templates.js');
  assert.doesNotMatch(frontend, /window\.scrollTo/);
  assert.match(frontend, /focus\(\{ preventScroll: true \}\)/);
});

test('archived templates can be viewed and restored while custom templates can be deleted', () => {
  const routes = read('src/routes/api.js');
  const frontend = read('assets/document-templates.js');
  const schema = read('prisma/schema.prisma');
  assert.match(schema, /isSystem\s+Boolean\s+@default\(false\)/);
  assert.match(routes, /status: archivedOnly \? 'ARCHIVED'/);
  assert.match(routes, /router\.post\('\/document-templates\/:id\/restore'/);
  assert.match(routes, /status: 'DELETED'/);
  assert.match(routes, /System templates cannot be deleted/);
  assert.match(frontend, /View archived/);
  assert.match(frontend, /restoreTemplate/);
  assert.match(frontend, /deleteTemplate/);
});

test('converted source files can be previewed and removed without deleting the editable template', () => {
  const html = read('document-templates.html');
  const frontend = read('assets/document-templates.js');
  const routes = read('src/routes/api.js');
  assert.match(html, /data-view-import-source/);
  assert.match(html, /data-remove-import-source/);
  assert.match(frontend, /\/import-preview/);
  assert.match(frontend, /Original document/);
  assert.match(routes, /router\.get\('\/document-templates\/:id\/import-preview'/);
  assert.match(routes, /router\.delete\('\/document-templates\/:id\/import-source'/);
  assert.match(routes, /sourceType: 'BLANK', importFileName: null/);
});

test('blank templates render as genuinely blank documents', () => {
  const design = starterDesign('INVOICE', 'BLANK');
  const localization = rendererLocalization({ defaultCurrency: 'USD', numberFormat: 'en-US' }, { documentType: 'INVOICE', sourceType: 'BLANK', design });
  const pdf = createBusinessDocumentPdf({
    kind: 'invoice',
    company: { name: 'Company' },
    branding: { brandName: 'Company' },
    localization,
    record: {
      number: 'INV-1', status: 'DRAFT', customer: { name: 'Customer' },
      lineItems: [{ description: 'Service', quantity: 1, unitPrice: 100, lineTotal: 100 }],
      subtotal: 100, total: 100
    }
  }).toString('latin1');
  assert.doesNotMatch(pdf, /Company/);
  assert.doesNotMatch(pdf, /INV-1/);
  assert.doesNotMatch(pdf, /DESCRIPTION/);
  assert.doesNotMatch(pdf, /Page 1 of 1/);
});

test('professional, classic, and minimal templates preserve distinct renderer variants', () => {
  const variants = ['PROFESSIONAL', 'CLASSIC', 'MINIMAL'].map((variant) => {
    const design = starterDesign('INVOICE', variant);
    return rendererLocalization({}, { documentType: 'INVOICE', sourceType: 'STARTER', design }).documentTemplate;
  });
  assert.deepEqual(variants, ['MODERN', 'CLASSIC', 'MINIMAL']);
  assert.notDeepEqual(starterDesign('INVOICE', 'PROFESSIONAL').theme, starterDesign('INVOICE', 'CLASSIC').theme);
  assert.notDeepEqual(starterDesign('INVOICE', 'CLASSIC').theme, starterDesign('INVOICE', 'MINIMAL').theme);
});
