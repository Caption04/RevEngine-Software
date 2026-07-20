const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('lead page and permission wiring are present', () => {
  const page = read('leads.html');
  const layout = read('assets/layout.js');
  const frontend = read('assets/api.js');
  const backend = read('src/routes/api.js');

  assert.match(page, /data-page="leads"/);
  assert.match(page, /data-create-resource="leads"/);
  assert.match(layout, /\['leads', 'Leads', 'leads\.html'/);
  assert.match(layout, /leads: 'leads\.view'/);
  assert.match(frontend, /action: '\/leads'/);
  assert.match(backend, /router\.get\('\/leads'/);
  assert.match(backend, /router\.post\('\/leads'/);
  assert.match(backend, /router\.post\('\/leads\/:id\/convert'/);
});

test('dispatch board is connected to the schedule without exposing unfinished clutter', () => {
  const schedule = read('schedule.html');
  const layout = read('assets/layout.js');
  const frontend = read('assets/api.js');
  const backend = read('src/routes/api.js');

  assert.match(schedule, /data-dispatch-board/);
  assert.match(frontend, /api\('\/dispatch\/board'\)/);
  assert.match(backend, /router\.get\('\/dispatch\/board'/);
  const enterpriseGroup = layout.split("['Enterprise', 'Advanced operations'")[1].split('],')[0];
  assert.ok(!enterpriseGroup.includes('mobile-sync'));
  assert.ok(!enterpriseGroup.includes('onboarding'));
  assert.doesNotMatch(layout, /href="subscription\.html" data-full-access-only/);
});
