'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeImportedCanvas } = require('../src/services/documentTemplate.service');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('format controls stay in a permanent ribbon row instead of opening a popup', () => {
  const html = read('imported-document-editor.html');
  const css = read('assets/app.css');

  assert.match(html, /imported-inline-contextbar imported-permanent-toolbar/);
  assert.match(html, /data-imported-text-context-controls/);
  assert.match(html, /data-imported-logo-context-controls/);
  assert.doesNotMatch(html, /imported-editor-format-menu/);
  assert.doesNotMatch(html, /imported-format-menu-panel/);
  assert.match(css, /grid-template-rows:\s*40px 52px minmax\(0, 1fr\)/);
  assert.match(css, /\.imported-permanent-toolbar\s*\{[\s\S]*?display:\s*flex/);
});

test('all imported text is covered and redrawn so the original PDF text cannot show behind edits', () => {
  const frontend = read('assets/document-templates.js');
  const pdf = read('src/services/businessDocumentPdf.service.js');
  const css = read('assets/app.css');

  assert.match(frontend, /'is-rendered-text'/);
  assert.match(frontend, /const coverX = Math\.max\(0, Number\(element\.x \|\| 0\) - 1\.75\)/);
  assert.match(frontend, /font-family:\$\{escapeHtml\(element\.fontFamily \|\| 'Arial, Helvetica, sans-serif'\)\}/);
  assert.match(css, /\.imported-inline-text\.is-rendered-text\s*\{[\s\S]*?background:\s*var\(--imported-cover\)/);
  assert.doesNotMatch(pdf, /if \(!changed\) continue/);
  assert.match(pdf, /commandRect\(Math\.max\(0, x - 1\.75\)/);
  assert.match(pdf, /const size = Math\.max\(4, Number\(element\.fontSize \|\| 9\)\)/);
  assert.doesNotMatch(pdf, /fittedImportedFontSize\(value, boxWidth/);
});

test('legacy one-logo imports become selectable on every page', () => {
  const canvas = normalizeImportedCanvas({
    mode: 'EXACT_PDF',
    pages: [
      { pageNumber: 1, width: 595, height: 842, backgroundAsset: 'page-1.png', textElements: [] },
      { pageNumber: 2, width: 595, height: 842, backgroundAsset: 'page-2.png', textElements: [] }
    ],
    logo: { page: 1, x: 20, y: 25, width: 160, height: 70, mode: 'ORIGINAL', backgroundColor: '#FFFFFF' }
  });

  assert.equal(canvas.logos.length, 2);
  assert.deepEqual(canvas.logos.map((logo) => logo.page), [1, 2]);
  assert.equal(canvas.logo.page, 1);
});

test('company logos use contain fitting in both the editor and generated PDF', () => {
  const frontend = read('assets/document-templates.js');
  const css = read('assets/app.css');
  const pdf = read('src/services/businessDocumentPdf.service.js');

  assert.match(frontend, /imported-logo-image-frame/);
  assert.match(css, /object-fit:\s*contain/);
  assert.match(css, /object-position:\s*center/);
  assert.match(pdf, /const inset = Math\.max\(2, Math\.min\(8/);
  assert.match(pdf, /availableWidth/);
  assert.match(pdf, /availableHeight/);
});

test('undo and redo cover typing, toolbar actions, logo changes, and keyboard shortcuts', () => {
  const html = read('imported-document-editor.html');
  const frontend = read('assets/document-templates.js');

  assert.match(html, /data-imported-undo/);
  assert.match(html, /data-imported-redo/);
  assert.match(frontend, /importedUndoStack/);
  assert.match(frontend, /importedRedoStack/);
  assert.match(frontend, /rememberImportedChange\(state\.importedTypingSnapshot\)/);
  assert.match(frontend, /rememberImportedChange\(\);[\s\S]*?logo\.mode = importedInlineLogoMode\.value/);
  assert.match(frontend, /shortcut === 'z'/);
  assert.match(frontend, /shortcut === 'y'/);
  assert.match(frontend, /event\.shiftKey\) redoImportedChange\(\)/);
});
