const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('Document Studio PDF previews are allowed by Content Security Policy', () => {
  const app = read('src/app.js');
  assert.match(app, /frameSrc:\s*\["'self'",\s*"blob:"\]/);
});

test('Document Studio opens on invoices without an All tab', () => {
  const html = read('document-templates.html');
  const frontend = read('assets/document-templates.js');
  assert.doesNotMatch(html, /data-document-filter="ALL"/);
  assert.match(html, /class="tab active"[^>]+data-document-filter="INVOICE"/);
  assert.match(frontend, /filter:\s*'INVOICE'/);
  assert.doesNotMatch(frontend, /state\.filter === 'ALL'/);
});

test('section search indexes template cards and refreshes after the library rerenders', () => {
  const layout = read('assets/layout.js');
  const frontend = read('assets/document-templates.js');
  assert.match(layout, /\.document-template-card/);
  assert.match(layout, /revengine:section-search-refresh/);
  assert.match(frontend, /dispatchEvent\(new Event\('revengine:section-search-refresh'\)\)/);
});

test('invoice due-date guidance renders below its input and form rows align from the top', () => {
  const ui = read('assets/api.js');
  const css = read('assets/app.css');
  assert.match(ui, /<label for="fc-dueDate">Due Date<\/label><input id="fc-dueDate"[^>]*><small class="field-help" data-invoice-due-help>/);
  assert.doesNotMatch(ui, /field-label-with-help" for="fc-dueDate"/);
  assert.match(css, /\.form-grid\s*\{[\s\S]*?align-items:\s*start;/);
});
