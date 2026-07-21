const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'assets', 'app.css'), 'utf8');

function compact(value) {
  return value.replace(/\s+/g, ' ');
}

test('companies and solar operations are contained inside the app viewport', () => {
  const source = compact(css);

  assert.match(source, /\.page-mount, \.page-mount > \.page,[^{]+\{ width: 100%; min-width: 0; max-width: 100%; \}/);
  assert.match(source, /body\[data-page="workspaces"\] \.panel,[^{]+body\[data-page="solar-operations"\] \.panel \{ min-width: 0; max-width: 100%; \}/);
  assert.match(source, /@media \(max-width: 1500px\) and \(min-width: 981px\)[^{]*\{[\s\S]*?body\[data-page="workspaces"\] \.app-shell,[^{]+\{ grid-template-columns: 250px minmax\(0, 1fr\); \}/);
  assert.match(source, /body\[data-page="solar-operations"\] \.hero-row \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(source, /body\[data-page="solar-operations"\] \.solar-actions \{ justify-content: flex-start; \}/);
});
