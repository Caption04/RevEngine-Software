'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('the imported document route uses a thin Word-like ribbon and a permanent formatting toolbar', () => {
  const html = read('imported-document-editor.html');
  const css = read('assets/app.css');

  assert.match(html, /<header class="imported-editor-ribbon"/);
  assert.match(html, /<summary class="imported-ribbon-tab">File<\/summary>/);
  assert.match(html, /data-back-to-templates[\s\S]*?Back to templates/);
  assert.match(html, /data-save-template[\s\S]*?Save draft/);
  assert.match(html, /data-publish-template[\s\S]*?Publish as default/);
  assert.match(html, /data-view-import-source[\s\S]*?Open original PDF/);
  assert.match(html, /class="imported-inline-contextbar imported-permanent-toolbar" data-imported-contextbar/);
  assert.match(html, /data-imported-empty-context/);
  assert.doesNotMatch(html, /class="imported-editor-format-menu"/);
  assert.doesNotMatch(html, /class="imported-format-menu-panel"/);
  assert.doesNotMatch(html, /<div class="document-editor-heading">/);
  assert.doesNotMatch(html, /<div class="imported-editor-commandbar">/);

  assert.match(css, /body\[data-document-editor-route="true"\] \.document-template-editor\.is-imported-inline\s*\{[\s\S]*?grid-template-rows:\s*40px 52px minmax\(0, 1fr\)/);
  assert.match(css, /body\[data-document-editor-route="true"\] \.imported-permanent-toolbar\s*\{[\s\S]*?display:\s*flex/);
  assert.match(css, /body\[data-document-editor-route="true"\] \.imported-inline-editor\s*\{[\s\S]*?padding:\s*0/);
  assert.match(css, /body\[data-document-editor-route="true"\] \.imported-document-stage\s*\{[\s\S]*?border-radius:\s*0/);
});

test('file actions close their menu and keyboard shortcuts support save, undo, and redo', () => {
  const html = read('imported-document-editor.html');
  const frontend = read('assets/document-templates.js');

  assert.match(html, /data-imported-undo/);
  assert.match(html, /data-imported-redo/);
  assert.match(frontend, /data-imported-editor-menu\]\[open/);
  assert.match(frontend, /event\.target\.closest\('\.imported-file-menu-item'\)/);
  assert.match(frontend, /shortcut === 's'/);
  assert.match(frontend, /shortcut === 'z'/);
  assert.match(frontend, /shortcut === 'y'/);
  assert.match(frontend, /event\.shiftKey\) redoImportedChange\(\)/);
  assert.match(frontend, /function undoImportedChange\(\)/);
  assert.match(frontend, /function redoImportedChange\(\)/);
  assert.match(frontend, /window\.requestAnimationFrame\(\(\) => window\.requestAnimationFrame\(fitImportedDocument\)\)/);
});
