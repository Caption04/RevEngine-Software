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
  assert.match(layout, /\['leads', 'Solar Leads', 'leads\.html'/);
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
  const navGroups = layout.split('const adminNavGroups = [')[1].split('];')[0];
  assert.ok(!navGroups.includes("'mobile-sync'"));
  assert.ok(!navGroups.includes("'onboarding'"));
  assert.doesNotMatch(layout, /href="subscription\.html" data-full-access-only/);
});
