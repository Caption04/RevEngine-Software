const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const layout = fs.readFileSync(path.join(root, 'assets', 'layout.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets', 'app.css'), 'utf8');

test('desktop sidebar can be hidden, restored, and remembered', () => {
  assert.match(layout, /SIDEBAR_STORAGE_KEY = 'revengine\.sidebarCollapsed'/);
  assert.match(layout, /document\.body\.classList\.toggle\('sidebar-collapsed'\)/);
  assert.match(layout, /saveSidebarPreference\(collapsed\)/);
  assert.match(layout, /aria-controls="primary-sidebar"/);
  assert.match(layout, /menuToggleLabel\.textContent = 'Menu'/);
  assert.match(layout, /const menuAction = isExpanded \? 'Hide menu' : 'Show menu'/);
  assert.match(layout, /menuToggle\.setAttribute\('aria-label', menuAction\)/);
  assert.match(layout, /sidebar\.inert = !isExpanded/);
  assert.match(css, /body\.sidebar-collapsed \.app-shell\s*\{[\s\S]*grid-template-columns:\s*0 minmax\(0, 1fr\)/);
  assert.match(css, /body\.sidebar-collapsed \.sidebar\s*\{[\s\S]*visibility:\s*hidden;[\s\S]*pointer-events:\s*none/);
});

test('mobile menu continues to use the existing slide-out navigation', () => {
  assert.match(layout, /document\.body\.classList\.toggle\('nav-open'\)/);
  assert.match(layout, /menuToggleLabel\.textContent = 'Menu'/);
  assert.match(layout, /const menuAction = isExpanded \? 'Hide menu' : 'Show menu'/);
  assert.match(css, /@media \(max-width: 980px\)/);
});
