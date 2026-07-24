'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('imported templates open in a dedicated full-screen editor route', () => {
  const editorPage = read('imported-document-editor.html');
  const frontend = read('assets/document-templates.js');
  const css = read('assets/app.css');

  assert.match(editorPage, /data-document-editor-route="true"/);
  assert.match(editorPage, /data-page-search="off"/);
  assert.match(editorPage, /data-imported-inline-editor/);
  assert.match(editorPage, /data-back-to-templates/);
  assert.match(editorPage, /data-imported-document-stage/);

  assert.match(frontend, /function importedEditorUrl\(template\)/);
  assert.match(frontend, /imported-document-editor\.html\?template=/);
  assert.match(frontend, /template\.design && template\.design\.importedCanvas && !editorRoute/);
  assert.match(frontend, /loadTemplates\(editorRoute \? routeTemplateId : null\)/);
  assert.match(frontend, /document-templates\.html\?type=/);

  assert.match(css, /body\[data-document-editor-route="true"\] \.sidebar[\s\S]*?display:\s*none !important/);
  assert.match(css, /body\[data-document-editor-route="true"\] \.app-shell[\s\S]*?height:\s*100vh/);
  assert.match(css, /body\[data-document-editor-route="true"\] \.document-template-editor\.is-imported-inline[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\)/);
  assert.match(css, /body\[data-document-editor-route="true"\] \.imported-document-stage[\s\S]*?height:\s*100%/);
});

test('the dedicated editor returns to the same document-type tab', () => {
  const frontend = read('assets/document-templates.js');
  assert.match(frontend, /function templateLibraryUrl\(documentType\)/);
  assert.match(frontend, /encodeURIComponent\(type\)/);
  assert.match(frontend, /returnToTemplateLibrary/);
  assert.match(frontend, /initialFilter = \['INVOICE', 'QUOTE', 'CONTRACT'\]\.includes\(requestedFilter\)/);
});
