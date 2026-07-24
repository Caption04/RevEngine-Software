'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('the imported document route uses a thin Word-like ribbon instead of a second page header', () => {
  const html = read('imported-document-editor.html');
  const css = read('assets/app.css');

  assert.match(html, /<header class="imported-editor-ribbon"/);
  assert.match(html, /<summary class="imported-ribbon-tab">File<\/summary>/);
  assert.match(html, /data-back-to-templates[\s\S]*?Back to templates/);
  assert.match(html, /data-save-template[\s\S]*?Save draft/);
  assert.match(html, /data-publish-template[\s\S]*?Publish as default/);
  assert.match(html, /data-view-import-source[\s\S]*?Open original PDF/);
  assert.doesNotMatch(html, /<div class="document-editor-heading">/);
  assert.doesNotMatch(html, /<div class="imported-editor-commandbar">/);

  assert.match(css, /body\[data-document-editor-route="true"\] \.document-template-editor\.is-imported-inline\s*\{[\s\S]*?grid-template-rows:\s*48px minmax\(0, 1fr\)/);
  assert.match(css, /body\[data-document-editor-route="true"\] \.imported-inline-editor\s*\{[\s\S]*?padding:\s*0/);
  assert.match(css, /body\[data-document-editor-route="true"\] \.imported-document-stage\s*\{[\s\S]*?border-radius:\s*0/);
  assert.match(css, /body\[data-document-editor-route="true"\] \.imported-editor-guidance,[\s\S]*?display:\s*none !important/);
});

test('file actions close their menu and Ctrl+S saves without leaving the canvas', () => {
  const frontend = read('assets/document-templates.js');
  assert.match(frontend, /data-imported-editor-menu\]\[open/);
  assert.match(frontend, /event\.target\.closest\('\.imported-file-menu-item'\)/);
  assert.match(frontend, /\(event\.ctrlKey \|\| event\.metaKey\)[\s\S]*?toLowerCase\(\) === 's'/);
  assert.match(frontend, /window\.requestAnimationFrame\(\(\) => window\.requestAnimationFrame\(fitImportedDocument\)\)/);
});
