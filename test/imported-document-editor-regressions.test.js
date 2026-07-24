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

test('imported text is removed from the page raster and redrawn without rectangular covers', () => {
  const frontend = read('assets/document-templates.js');
  const pdf = read('src/services/businessDocumentPdf.service.js');
  const raster = read('src/services/importedDocumentRaster.service.js');
  const css = read('assets/app.css');

  assert.match(frontend, /canvas-assets\/\$\{encodeURIComponent\(page\.backgroundAsset\)\}\?clean=1/);
  assert.match(frontend, /const textX = Math\.max\(0, Number\(element\.x \|\| 0\)\)/);
  assert.doesNotMatch(frontend, /const coverX =/);
  assert.match(frontend, /font-family:\$\{escapeHtml\(element\.fontFamily \|\| 'Arial, Helvetica, sans-serif'\)\}/);
  assert.match(frontend, /font-style:\$\{element\.italic \? 'italic' : 'normal'\}/);
  assert.match(css, /\.imported-inline-text\.is-rendered-text\s*\{[\s\S]*?background:\s*transparent/);
  assert.match(raster, /stableLineSegments/);
  assert.match(raster, /const edgePadding = 0\.6/);
  assert.match(pdf, /cleanImportedPageAsset\(asset\.buffer, page\)/);
  assert.doesNotMatch(pdf, /commandRect\(Math\.max\(0, x - 1\.75\)/);
  assert.match(pdf, /fontFamily: element\.fontFamily, italic: element\.italic === true/);
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
  assert.match(pdf, /function drawContainedLogoPlacement\(/);
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


test('imported company logos can be resized and moved inside their reserved box without overflowing', () => {
  const frontend = read('assets/document-templates.js');
  const css = read('assets/app.css');
  const pdf = read('src/services/businessDocumentPdf.service.js');
  const templateService = read('src/services/documentTemplate.service.js');
  assert.match(frontend, /function importedLogoPlacement\(/);
  assert.match(frontend, /imageScale/);
  assert.match(frontend, /imageOffsetX/);
  assert.match(frontend, /imageOffsetY/);
  assert.match(css, /--imported-logo-width/);
  assert.match(pdf, /drawContainedLogoPlacement/);
  assert.match(templateService, /imageScale:/);
});

test('imported text preserves underline and link metadata for link-like PDF content', () => {
  const frontend = read('assets/document-templates.js');
  const css = read('assets/app.css');
  const canvasService = read('src/services/importedDocumentCanvas.service.js');
  const templateService = read('src/services/documentTemplate.service.js');
  const pdf = read('src/services/businessDocumentPdf.service.js');
  assert.match(canvasService, /linkUrl/);
  assert.match(canvasService, /underline/);
  assert.match(templateService, /linkUrl:/);
  assert.match(templateService, /underline:/);
  assert.match(frontend, /is-underlined/);
  assert.match(frontend, /data-link-url/);
  assert.match(css, /text-decoration: underline/);
  assert.match(pdf, /estimateTextWidth/);
});
