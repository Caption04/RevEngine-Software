'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  DOCX_TYPE,
  convertImportedDocument,
  extractDocx
} = require('../src/services/documentImportConversion.service');
const { createBusinessDocumentPdf } = require('../src/services/businessDocumentPdf.service');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function storedZip(fileName, body) {
  const name = Buffer.from(fileName, 'utf8');
  const data = Buffer.from(body, 'utf8');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt32LE(0, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt32LE(0, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(0, 42);

  const centralOffset = local.length + name.length + data.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, name, data, central, name, end]);
}

function popplerAvailable() {
  return ['pdftotext', 'pdftoppm'].every((command) => {
    const result = spawnSync(command, ['-v'], { encoding: 'utf8' });
    return !result.error;
  });
}

test('searchable PDFs keep their exact pages and expose editable text without system sections', { skip: !popplerAvailable() }, () => {
  const source = createBusinessDocumentPdf({
    kind: 'invoice',
    logoImage: { type: 'png', buffer: fs.readFileSync(path.join(root, 'assets/rev-engine-mark.png')) },
    company: { name: 'Source Company', legalName: 'Source Company (Private) Limited', address: 'Harare' },
    branding: { brandName: 'Source Company', supportEmail: 'billing@example.com' },
    localization: { defaultCurrency: 'USD', numberFormat: 'en-US' },
    record: {
      number: 'SOURCE-INV-0042',
      status: 'DRAFT',
      createdAt: new Date('2026-07-24T00:00:00Z'),
      dueDate: new Date('2026-08-07T00:00:00Z'),
      customer: { name: 'Original Customer', email: 'customer@example.com' },
      lineItems: [{ description: 'Original service', quantity: 1, unitPrice: 850, lineTotal: 850 }],
      subtotal: 850,
      taxTotal: 127.5,
      total: 977.5
    }
  });

  const converted = convertImportedDocument({
    buffer: source,
    mimeType: 'application/pdf',
    fileName: 'existing-invoice.pdf',
    documentType: 'INVOICE',
    assetKey: 'exact-layout-test'
  });

  assert.equal(converted.status, 'EXACT_LAYOUT');
  assert.equal(converted.design.importAnalysis.sourceFormat, 'PDF');
  assert.equal(converted.design.importedCanvas.mode, 'EXACT_PDF');
  assert.equal(converted.design.blocks.length, 0);
  assert.ok(converted.design.importedCanvas.pages.length >= 1);
  assert.equal(converted.assets.length, converted.design.importedCanvas.pages.length);
  const textElements = converted.design.importedCanvas.pages.flatMap((page) => page.textElements);
  assert.ok(textElements.length > 5);
  assert.ok(textElements.some((element) => /SOURCE-INV-0042/.test(element.originalText)));
  assert.ok(textElements.every((element) => element.binding === 'STATIC'));
  assert.equal(converted.design.importedCanvas.logo && converted.design.importedCanvas.logo.mode, 'ORIGINAL');

  const importedAssets = Object.fromEntries(converted.assets.map((asset) => [asset.fileName, { type: 'png', buffer: asset.buffer }]));
  const exactPdf = createBusinessDocumentPdf({
    kind: 'invoice',
    company: { name: 'Different Company' },
    branding: { brandName: 'Different Company' },
    localization: { defaultCurrency: 'USD', numberFormat: 'en-US', documentDesign: converted.design },
    importedAssets,
    record: { number: 'NEW-INV-1', customer: { name: 'Different Customer' }, total: 10 }
  });
  assert.ok(exactPdf.subarray(0, 5).equals(Buffer.from('%PDF-')));
  assert.ok(exactPdf.length > source.length / 2);

  const numberElement = textElements.find((element) => /SOURCE-INV-0042/.test(element.originalText));
  numberElement.binding = 'STATIC';
  numberElement.text = 'Invoice: {{DOCUMENT_NUMBER}}';
  const mappedPdf = createBusinessDocumentPdf({
    kind: 'invoice',
    company: { name: 'Different Company' },
    branding: { brandName: 'Different Company' },
    localization: { defaultCurrency: 'USD', numberFormat: 'en-US', documentDesign: converted.design },
    importedAssets,
    record: { number: 'NEW-INV-1', customer: { name: 'Different Customer' }, total: 10 }
  });
  assert.notDeepEqual(mappedPdf, exactPdf);
});

test('DOCX paragraphs become editable contract content', () => {
  const xml = '<?xml version="1.0"?><w:document xmlns:w="urn:test"><w:body><w:p><w:r><w:t>Service Agreement</w:t></w:r></w:p><w:p><w:r><w:t>This agreement covers solar maintenance and inspection services.</w:t></w:r></w:p><w:p><w:r><w:t>Terms and conditions</w:t></w:r></w:p><w:p><w:r><w:t>Payment is due within fourteen days.</w:t></w:r></w:p></w:body></w:document>';
  const source = storedZip('word/document.xml', xml);
  const extracted = extractDocx(source);
  assert.match(extracted.text, /solar maintenance/);
  const converted = convertImportedDocument({ buffer: source, mimeType: DOCX_TYPE, fileName: 'agreement.docx', documentType: 'CONTRACT' });
  const body = converted.design.blocks.find((block) => block.type === 'CONTRACT_BODY');
  const terms = converted.design.blocks.find((block) => block.type === 'TERMS');
  assert.match(body.body, /solar maintenance/);
  assert.match(terms.body, /Payment is due/);
});

test('images remain allowed but are clearly marked as poor conversion sources', () => {
  const converted = convertImportedDocument({ buffer: Buffer.from('image'), mimeType: 'image/png', fileName: 'scan.png', documentType: 'QUOTE' });
  assert.equal(converted.status, 'NEEDS_REVIEW');
  assert.equal(converted.design.blocks.length, 0);
  assert.match(converted.warnings[0], /not recommended/i);
});

test('the import interface previews chosen files and warns against images and scans', () => {
  const frontend = read('assets/document-templates.js');
  const html = read('document-templates.html');
  const routes = read('src/routes/api.js');
  assert.match(frontend, /Use this for a document your company already uses/);
  assert.match(frontend, /already part of your company workflow/);
  assert.match(frontend, /use a ready-made template or start from scratch instead/);
  assert.match(frontend, /Best results: searchable PDF or DOCX/);
  assert.match(frontend, /Images and scanned documents are not recommended/);
  assert.match(frontend, /URL\.createObjectURL\(file\)/);
  assert.match(frontend, /data-upload-preview/);
  assert.match(frontend, /\/import-preview/);
  assert.match(frontend, /reconvertImportedSource/);
  assert.match(frontend, /The original PDF is the template/);
  assert.match(frontend, /data-edit-imported-text/);
  assert.match(frontend, /data-insert-imported-field/);
  assert.match(frontend, /importedMergeToken/);
  assert.match(html, /Keep the original PDF logo/);
  assert.doesNotMatch(frontend, /window\.open\(url, '_blank'\)/);
  assert.match(html, /data-import-heading/);
  assert.match(html, /Preview original/);
  assert.match(html, /data-reconvert-import-source/);
  assert.match(html, /data-imported-canvas-controls/);
  assert.match(html, /data-import-logo-mode/);
  assert.match(routes, /convertImportedDocument/);
  assert.match(routes, /router\.get\('\/document-templates\/:id\/import-preview'/);
  assert.match(routes, /router\.post\('\/document-templates\/:id\/reconvert'/);
  assert.match(routes, /conversionStatus: conversion\.status/);
  assert.match(routes, /writeDocumentTemplateAssets\(conversion\.assets\)/);
  assert.match(routes, /loadImportedCanvasAssets/);
});
