'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  DOCX_TYPE,
  convertImportedDocument,
  extractDocx,
  extractPdf
} = require('../src/services/documentImportConversion.service');

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

function textPdf(textCommands) {
  const stream = Buffer.from(textCommands, 'latin1');
  return Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Length ${stream.length} >>\nstream\n${textCommands}\nendstream\nendobj\n2 0 obj << /Type /Page >> endobj\n%%EOF`, 'latin1');
}

test('searchable PDFs are converted into editable billing sections instead of a generic reference', () => {
  const source = textPdf([
    '0.09 0.21 0.36 rg',
    'BT /F1 18 Tf 1 0 0 1 360 780 Tm (Fee Statement) Tj ET',
    'BT /F1 12 Tf 1 0 0 1 50 650 Tm (Summary) Tj ET',
    'BT /F1 12 Tf 1 0 0 1 50 500 Tm (Payment Options) Tj ET',
    'BT /F1 10 Tf 1 0 0 1 50 480 Tm (Self-funded Payments) Tj ET',
    'BT /F1 10 Tf 1 0 0 1 50 460 Tm (Banking Details: First National Bank) Tj ET',
    'BT /F1 10 Tf 1 0 0 1 50 440 Tm (Account Number: 622 7055 1015) Tj ET',
    'BT /F1 10 Tf 1 0 0 1 50 420 Tm (Branch Code: 210 554) Tj ET',
    'BT /F1 10 Tf 1 0 0 1 50 400 Tm (SWIFT Code: FIRNZAJJ) Tj ET',
    'BT /F1 10 Tf 1 0 0 1 50 380 Tm (Reference Number: 2552204) Tj ET',
    'BT /F1 10 Tf 1 0 0 1 50 350 Tm (Online Payments) Tj ET',
    'BT /F1 10 Tf 1 0 0 1 50 330 Tm (Make an Online Payment https://pay.example.com) Tj ET',
    'BT /F1 9 Tf 1 0 0 1 50 280 Tm (Given the rise in cybercrime, before making any payment verify the bank account issued by the company.) Tj ET'
  ].join('\n'));

  const extracted = extractPdf(source);
  assert.match(extracted.text, /Payment Options/);
  const converted = convertImportedDocument({ buffer: source, mimeType: 'application/pdf', fileName: 'fee-statement.pdf', documentType: 'INVOICE' });
  assert.equal(converted.status, 'CONVERTED_WITH_WARNINGS');
  assert.equal(converted.design.importAnalysis.sourceFormat, 'PDF');
  assert.ok(converted.design.importAnalysis.detectedFields.includes('payment.reference'));
  const payment = converted.design.blocks.find((block) => block.type === 'PAYMENT_OPTIONS');
  const disclaimer = converted.design.blocks.find((block) => block.type === 'DISCLAIMER');
  const online = converted.design.blocks.find((block) => block.type === 'ONLINE_PAYMENT');
  assert.equal(payment.accounts[0].accountNumber, '622 7055 1015');
  assert.equal(payment.accounts[0].swiftCode, 'FIRNZAJJ');
  assert.equal(payment.accountLayout, 'STACKED');
  assert.match(disclaimer.body, /rise in cybercrime/i);
  assert.equal(online.customUrl, 'https://pay.example.com');
  assert.match(online.body, /Make an Online Payment/);
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
  assert.match(frontend, /Best results: searchable PDF or DOCX/);
  assert.match(frontend, /Images and scanned documents are not recommended/);
  assert.match(frontend, /URL\.createObjectURL\(file\)/);
  assert.match(frontend, /data-upload-preview/);
  assert.match(frontend, /\/import-preview/);
  assert.match(frontend, /reconvertImportedSource/);
  assert.doesNotMatch(frontend, /window\.open\(url, '_blank'\)/);
  assert.match(html, /data-import-heading/);
  assert.match(html, /Preview original/);
  assert.match(html, /data-reconvert-import-source/);
  assert.match(routes, /convertImportedDocument/);
  assert.match(routes, /router\.get\('\/document-templates\/:id\/import-preview'/);
  assert.match(routes, /router\.post\('\/document-templates\/:id\/reconvert'/);
  assert.match(routes, /conversionStatus: conversion\.status/);
});
