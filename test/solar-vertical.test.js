const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('registration is solar-only and no generic industry selector remains', () => {
  const register = read('register.html');
  const api = read('src/routes/api.js');
  assert.match(register, /Solar Operations &amp; Maintenance/);
  assert.match(register, /name="verticalKey" value="solar-om"/);
  assert.doesNotMatch(register, /General Field Services|HVAC|Plumbing|Facilities Management/);
  assert.match(api, /verticalKey: 'solar-om'/);
  assert.match(api, /ensureSolarCompanyDefaults\(tx, company\.id\)/);
});

test('solar operations models and migration exist', () => {
  const schema = read('prisma/schema.prisma');
  const migration = read('prisma/migrations/20260720160000_solar_vertical_foundation/migration.sql');
  for (const model of ['SolarSiteProfile', 'SolarReading', 'SolarFault']) assert.match(schema, new RegExp(`model ${model} \\{`));
  for (const field of ['parentAssetId', 'monitoringIdentifier', 'dcCapacityKw', 'batteryCapacityKwh']) assert.match(schema, new RegExp(`\\b${field}\\b`));
  assert.match(migration, /UPDATE "Company" SET "verticalKey" = 'solar-om'/);
  assert.match(migration, /Solar Preventive Maintenance/);
});

test('solar-only navigation and core operating screens are present', () => {
  const layout = read('assets/layout.js');
  const dashboard = read('index.html');
  const equipment = read('assets.html');
  const ui = read('assets/api.js');
  const workOrders = read('jobs.html');
  const contracts = read('service-contracts.html');
  assert.match(layout, /Solar Dashboard/);
  assert.match(layout, /solar-operations\.html/);
  assert.match(layout, /Solar Equipment/);
  assert.match(layout, /O&M Contracts/);
  assert.match(dashboard, /Open Solar Faults/);
  assert.match(equipment, /Solar Equipment/);
  assert.match(ui, /PV Module Count/);
  assert.match(workOrders, /inverter diagnostics/i);
  assert.match(contracts, /recurring inspections, cleaning visits/);
});

test('solar API exposes sites, readings, faults, overview, and default checklists', () => {
  const api = read('src/routes/api.js');
  for (const route of ['/solar/overview', '/solar/sites', '/solar/readings', '/solar/faults', '/solar/bootstrap']) assert.match(api, new RegExp(route.replaceAll('/', '\\/')));
  for (const service of ['Solar System Installation', 'Solar Site Assessment', 'Solar Preventive Maintenance', 'Inverter Diagnostics', 'PV Module Cleaning', 'Battery Health Assessment', 'Solar Fault Callout']) assert.match(api, new RegExp(service));
  assert.match(api, /Solar Installation and Commissioning/);
  assert.match(api, /Solar Plant Preventive Maintenance/);
  assert.match(api, /battery state of health percentage/i);
});

test('demo seed creates solar tenants and solar operating records', () => {
  const seed = read('prisma/seed.js');
  assert.match(seed, /verticalKey: 'solar-om'/);
  assert.match(seed, /jobTitle: 'Solar Technician'/);
  assert.match(seed, /prisma\.solarSiteProfile\.upsert/);
  assert.match(seed, /assetType: 'SOLAR_PLANT'/);
  assert.match(seed, /assetType: 'INVERTER'/);
  assert.match(seed, /assetType: 'BATTERY_BANK'/);
  assert.match(seed, /prisma\.solarReading\.upsert/);
});
