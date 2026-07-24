'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('exact PDF imports open as a full-width click-to-edit document instead of a side-panel form', () => {
  const html = read('document-templates.html');
  const frontend = read('assets/document-templates.js');
  const css = read('assets/app.css');

  assert.match(html, /data-imported-inline-editor hidden/);
  assert.match(html, /data-imported-document-pages/);
  assert.match(html, /data-imported-contextbar hidden/);
  assert.match(html, /data-imported-editor-mode="EDIT"/);
  assert.match(html, /data-imported-editor-mode="PREVIEW"/);
  assert.match(frontend, /structuredWorkspace\.hidden = exactImport/);
  assert.match(frontend, /importedInlineEditor\.hidden = !exactImport/);
  assert.match(frontend, /contenteditable="\$\{canType \? 'plaintext-only' : 'false'\}"/);
  assert.match(html, /Click any text and type/);
  assert.match(css, /\.imported-document-stage\s*\{[\s\S]*?min-height:\s*calc\(100vh - 290px\)/);
  assert.match(css, /\.imported-inline-text\.is-original\s*\{[\s\S]*?color:\s*transparent/);
  assert.match(css, /\.imported-inline-text\.is-active[\s\S]*?background:\s*var\(--imported-cover\)/);
});

test('inline text editing keeps page geometry rigid while changing content and live-data mappings', () => {
  const frontend = read('assets/document-templates.js');
  assert.match(frontend, /match\.element\.text = value/);
  assert.match(frontend, /match\.element\.binding = 'STATIC'/);
  assert.match(frontend, /importedInlineBinding\.addEventListener\('change'/);
  assert.match(frontend, /openImportedFieldPicker/);
  assert.match(frontend, /The document position and surrounding design stay locked/);
  assert.doesNotMatch(frontend, /data-imported-inline-text[^\n]+draggable/);
});

test('imported PDF page images are served only through a tenant-scoped template asset route', () => {
  const routes = read('src/routes/api.js');
  assert.match(routes, /router\.get\('\/document-templates\/:id\/canvas-assets\/:assetName'/);
  assert.match(routes, /companyId:\s*req\.companyId/);
  assert.match(routes, /canvas\.pages\.some\(\(page\) => page && page\.backgroundAsset === assetName\)/);
  assert.match(routes, /Content-Type', 'image\/png'/);
  assert.match(routes, /Cache-Control', 'private, no-store'/);
});

test('the imported logo remains clickable and can be kept, replaced, or hidden', () => {
  const html = read('document-templates.html');
  const frontend = read('assets/document-templates.js');
  assert.match(html, /data-imported-inline-logo-mode/);
  assert.match(html, /Keep original/);
  assert.match(html, /Use company logo/);
  assert.match(frontend, /data-imported-inline-logo/);
  assert.match(frontend, /companyLogoUrl/);
  assert.match(frontend, /canvas\.logo\.mode = importedInlineLogoMode\.value/);
});
