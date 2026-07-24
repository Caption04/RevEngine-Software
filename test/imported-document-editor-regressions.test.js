'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizeImportedCanvas } = require('../src/services/documentTemplate.service');
const { parsePdfXml } = require('../src/services/importedDocumentCanvas.service');
const { createBusinessDocumentPdf } = require('../src/services/businessDocumentPdf.service');

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
  assert.match(frontend, /rememberImportedChange\(\);[\s\S]*?logo\.mode = (?:importedInlineLogoMode\.value|nextMode)/);
  assert.match(frontend, /shortcut === 'z'/);
  assert.match(frontend, /shortcut === 'y'/);
  assert.match(frontend, /event\.shiftKey\) redoImportedChange\(\)/);
});


test('imported company logos can be resized and dragged inside a clipped reserved box', () => {
  const frontend = read('assets/document-templates.js');
  const css = read('assets/app.css');
  const pdf = read('src/services/businessDocumentPdf.service.js');
  const templateService = read('src/services/documentTemplate.service.js');
  assert.match(frontend, /--imported-logo-scale/);
  assert.match(frontend, /imageOffsetX/);
  assert.match(frontend, /imageOffsetY/);
  assert.match(frontend, /importedLogoDrag/);
  assert.match(frontend, /pointermove/);
  assert.match(css, /\.imported-inline-logo\.mode-company\s*\{[\s\S]*?overflow:\s*hidden !important/);
  assert.match(css, /\.imported-logo-image-frame\s*\{[\s\S]*?overflow:\s*hidden !important/);
  assert.match(css, /scale\(var\(--imported-logo-scale, 1\)\)/);
  assert.match(pdf, /commandClippedNamedImage/);
  assert.match(pdf, / re W n /);
  assert.match(templateService, /imageScale:/);
});

test('imported text preserves links and lets any selected text become a link', () => {
  const html = read('imported-document-editor.html');
  const frontend = read('assets/document-templates.js');
  const css = read('assets/app.css');
  const canvasService = read('src/services/importedDocumentCanvas.service.js');
  const templateService = read('src/services/documentTemplate.service.js');
  const pdf = read('src/services/businessDocumentPdf.service.js');
  assert.match(html, /data-imported-inline-link/);
  assert.match(html, /data-imported-inline-open-link/);
  assert.match(frontend, /function editImportedTextLink\(/);
  assert.match(frontend, /normalizeImportedLinkUrl/);
  assert.match(frontend, /openImportedLink/);
  assert.match(canvasService, /linkUrlFromMarkup/);
  assert.match(canvasService, /parseHtmlLinks/);
  assert.match(templateService, /originalLinkUrl:/);
  assert.match(frontend, /is-underlined/);
  assert.match(frontend, /data-link-url/);
  assert.match(css, /text-decoration: underline/);
  assert.match(pdf, /\/Subtype \/Link/);
  assert.match(pdf, /\/Annots/);
});

test('PDF font family traits retain original bold and italic styling', () => {
  const pages = parsePdfXml(`
    <pdf2xml>
      <fontspec id="0" size="12" family="Arial-BoldMT" color="#000000"/>
      <fontspec id="1" size="10" family="TimesNewRomanPS-ItalicMT" color="#111111"/>
      <page number="1" width="595" height="842">
        <text top="10" left="20" width="180" height="14" font="0">Important payment notice</text>
        <text top="30" left="20" width="160" height="12" font="1">Italic detail</text>
        <text top="50" left="20" width="220" height="14" font="0"><a href="https://example.com/pay">Make an Online Payment</a></text>
      </page>
    </pdf2xml>
  `);
  assert.equal(pages[0].lines[0].bold, true);
  assert.equal(pages[0].lines[1].italic, true);
  assert.equal(pages[0].lines[2].bold, true);
  assert.equal(pages[0].lines[2].underline, true);
  assert.equal(pages[0].lines[2].linkUrl, 'https://example.com/pay');
});

test('generated imported PDFs clip oversized logos and contain clickable link annotations', () => {
  const background = fs.readFileSync(path.join(root, 'assets/rev-engine-mark.png'));
  const design = {
    importedCanvas: {
      mode: 'EXACT_PDF',
      textEditable: true,
      pages: [{
        pageNumber: 1,
        width: 200,
        height: 200,
        backgroundAsset: 'page-1.png',
        textElements: [{
          id: 'link-1', page: 1, x: 20, y: 20, width: 120, height: 16,
          originalText: 'Pay online', text: 'Pay online', binding: 'STATIC',
          fontSize: 10, fontFamily: 'Arial, Helvetica, sans-serif', bold: true,
          italic: false, lineHeight: 1, align: 'LEFT', textColor: '#1155CC',
          backgroundColor: '#FFFFFF', underline: true, linkUrl: 'https://example.com/pay'
        }]
      }],
      logos: [{
        id: 'logo-1', page: 1, x: 20, y: 60, width: 80, height: 40,
        mode: 'COMPANY', backgroundColor: '#FFFFFF', imageScale: 3,
        imageOffsetX: 25, imageOffsetY: -10, imagePadding: 2
      }]
    }
  };
  const output = createBusinessDocumentPdf({
    kind: 'invoice',
    record: { number: 'INV-1', customer: { name: 'Customer' }, total: 1 },
    company: { name: 'Company' },
    branding: { brandName: 'Company' },
    localization: { documentDesign: design, defaultCurrency: 'USD', numberFormat: 'en-US' },
    logoImage: { type: 'png', buffer: background },
    importedAssets: { 'page-1.png': { type: 'png', buffer: background } }
  });
  const source = output.toString('latin1');
  assert.match(source, / re W n [\d.]+ 0 0 [\d.]+ [\d.-]+ [\d.-]+ cm \/Logo Do Q/);
  assert.match(source, /\/Subtype \/Link/);
  assert.match(source, /\/URI \(https:\/\/example\.com\/pay\)/);
  assert.match(source, /\/Annots \[/);
});


test('linked imported text always renders in standard dark blue with underline', () => {
  const frontend = read('assets/document-templates.js');
  const css = read('assets/app.css');
  const canvasService = read('src/services/importedDocumentCanvas.service.js');
  const pdf = read('src/services/businessDocumentPdf.service.js');
  assert.match(frontend, /const IMPORTED_LINK_COLOR = '#1155CC'/);
  assert.match(frontend, /function importedTextColour\(/);
  assert.match(css, /\.imported-inline-text\.is-linkish\s*\{[\s\S]*?color:\s*var\(--imported-link-color, #1155CC\) !important/);
  assert.match(canvasService, /textColor: linkUrl \? IMPORTED_LINK_COLOR/);
  assert.match(pdf, /function importedElementColor\(/);
});

test('refreshing original formatting preserves edits while restoring source font metadata', () => {
  const routes = read('src/routes/api.js');
  const frontend = read('assets/document-templates.js');
  const canvasService = read('src/services/importedDocumentCanvas.service.js');
  assert.match(routes, /mergeImportedCanvasEdits\(freshDesign\.importedCanvas, existingDesign\.importedCanvas\)/);
  assert.match(canvasService, /function mergeImportedCanvasEdits\(/);
  assert.match(canvasService, /styleMetadataVersion: 2/);
  assert.match(frontend, /Refresh the original formatting/);
  assert.match(frontend, /keeping your current text edits/);
});

test('original bold metadata remains effective until the user explicitly toggles it', () => {
  const frontend = read('assets/document-templates.js');
  const pdf = read('src/services/businessDocumentPdf.service.js');
  const canvasService = read('src/services/importedDocumentCanvas.service.js');
  assert.match(frontend, /function importedTextIsBold\(/);
  assert.match(frontend, /element\.bold === true \|\| element\.originalBold === true/);
  assert.match(pdf, /function importedElementBold\(/);
  assert.match(canvasService, /\['b', 'strong'\]/);
  assert.match(canvasService, /font-weight\\s\*:/);
});

test('logo toolbar dropdown and action stay aligned at the same fixed height', () => {
  const css = read('assets/app.css');

  assert.match(css, /\[data-imported-logo-context-controls\]\s*\{[\s\S]*?flex-direction:\s*row;[\s\S]*?align-items:\s*center;[\s\S]*?min-height:\s*32px;/);
  assert.match(css, /\[data-imported-logo-context-controls\] select,[\s\S]*?\[data-imported-logo-context-controls\] \.secondary-button\.compact\s*\{[\s\S]*?height:\s*32px;[\s\S]*?min-height:\s*32px;[\s\S]*?margin:\s*0;/);
});


test('logo mode select uses a stable custom appearance inside the scrollable toolbar', () => {
  const css = read('assets/app.css');
  assert.match(css, /\[data-imported-logo-context-controls\] select\s*\{[\s\S]*?appearance:\s*none/);
  assert.match(css, /\[data-imported-logo-context-controls\] select\s*\{[\s\S]*?background-image:\s*var\(--select-chevron\)/);
  assert.match(css, /\[data-imported-logo-context-controls\] select\s*\{[\s\S]*?line-height:\s*30px/);
});


test('logo mode uses a custom popover menu so native select focus cannot move the toolbar', () => {
  const html = read('imported-document-editor.html');
  const frontend = read('assets/document-templates.js');
  const css = read('assets/app.css');
  assert.match(html, /data-imported-inline-logo-mode="" type="hidden" value="ORIGINAL"/);
  assert.match(html, /data-imported-logo-mode-trigger/);
  assert.match(html, /data-imported-logo-mode-menu="" popover="auto"/);
  assert.match(frontend, /function openImportedLogoModeMenu\(\)/);
  assert.match(frontend, /data-imported-logo-mode-option/);
  assert.match(frontend, /dispatchEvent\(new Event\('change'/);
  assert.match(css, /\.imported-logo-mode-trigger\s*\{/);
  assert.match(css, /\.imported-logo-mode-menu\[popover\]/);
});


test('logo toolbar renders only one visible dropdown and all controls share one baseline', () => {
  const html = read('imported-document-editor.html');
  const css = read('assets/app.css');
  assert.doesNotMatch(html, /<select data-imported-inline-logo-mode/);
  assert.match(html, /<input data-imported-inline-logo-mode="" type="hidden" value="ORIGINAL">/);
  assert.match(css, /\[data-imported-inline-logo-mode\]\[type="hidden"\]\s*\{[\s\S]*?display:\s*none !important/);
  assert.match(css, /--imported-toolbar-control-height:\s*32px/);
  assert.match(css, /\.imported-context-controls input:not\(\[type="hidden"\]\),[\s\S]*?\.imported-context-controls button\s*\{[\s\S]*?height:\s*var\(--imported-toolbar-control-height\) !important/);
  assert.match(css, /\.imported-context-colour input\[type="color"\]\s*\{[\s\S]*?position:\s*static/);
});

test('imported text has a font-size control and automatically fits long values inside the original box', () => {
  const html = read('imported-document-editor.html');
  const frontend = read('assets/document-templates.js');
  const pdf = read('src/services/businessDocumentPdf.service.js');
  const templateService = read('src/services/documentTemplate.service.js');
  const canvasService = read('src/services/importedDocumentCanvas.service.js');
  assert.match(html, /data-imported-inline-font-size/);
  assert.match(frontend, /function importedTextFitSize\(/);
  assert.match(frontend, /applyImportedTextFit\(node, match\.element, value\)/);
  assert.match(frontend, /updateImportedTextFormatting\('fontSize', value\)/);
  assert.match(pdf, /fittedImportedFontSize\(value, boxWidth, boxHeight, requestedSize, element\.lineHeight\)/);
  assert.match(templateService, /originalFontSize:/);
  assert.match(canvasService, /styleWasChanged\(old, 'fontSize', 'originalFontSize'\)/);
});


test('imported text reserves vertical room for descenders in the editor and PDF', () => {
  const frontend = read('assets/document-templates.js');
  const css = read('assets/app.css');
  const pdf = read('src/services/businessDocumentPdf.service.js');

  assert.match(frontend, /const descenderBleed = Math\.max\(1, fittedFontSize \* 0\.28\)/);
  assert.match(frontend, /padding:\$\{topBleed \* zoom\}px 0 \$\{bottomBleed \* zoom\}px/);
  assert.match(frontend, /textHeight \+ topBleed \+ bottomBleed/);
  assert.match(css, /vertical box with transparent bleed/);
  assert.match(pdf, /function importedTextBaseline\(/);
  assert.match(pdf, /const descenderReserve = safeSize \* 0\.24/);
  assert.match(pdf, /const baseline = importedTextBaseline\(y, boxHeight, size\)/);
});
