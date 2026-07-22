const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('inline validation reserves space and keeps every form grid top aligned', () => {
  const formUx = read('assets/form-ux.js');
  const css = read('assets/app.css');

  assert.match(formUx, /function ensureErrorSlot\(input\)/);
  assert.match(formUx, /ensureErrorSlot\(input\);/);
  assert.match(formUx, /node\.hidden = true/);
  assert.match(css, /\.field-error\[hidden\]\s*\{[\s\S]*display:\s*block\s*!important;[\s\S]*visibility:\s*hidden;/);
  assert.match(css, /\.field-error\s*\{[\s\S]*min-height:\s*17px;/);
  assert.match(css, /\.compact-form\s*\{[\s\S]*align-items:\s*start;/);
  assert.doesNotMatch(css, /\.field-error\[hidden\]\s*\{\s*display:\s*none/);
});
