const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'customer-profile.html'), 'utf8');
const layout = fs.readFileSync(path.join(root, 'assets', 'layout.js'), 'utf8');
const profile = fs.readFileSync(path.join(root, 'assets', 'customer-profile.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets', 'app.css'), 'utf8');

test('customer profile keeps utility controls out of the customer heading', () => {
  assert.match(html, /data-page-search="off"/);
  assert.match(layout, /document\.body\.dataset\.pageSearch === 'off'/);
  assert.match(layout, /search\.remove\(\)/);
  assert.ok(profile.includes('<span aria-hidden="true">‹</span> Customers</a>'));
  assert.doesNotMatch(profile, /Back to customers/);
});

test('menu control stays plain while its state remains accessible', () => {
  assert.match(layout, /menuToggleLabel\.textContent = 'Menu'/);
  assert.match(layout, /menuToggle\.setAttribute\('aria-label', menuAction\)/);
  assert.match(css, /Calm detail-page header/);
  assert.match(css, /body\[data-page="customer-profile"\] \.customer-profile-title-row/);
});
