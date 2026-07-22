const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('trusted devices use one persistent browser identity instead of one row per login', () => {
  const schema = read('prisma/schema.prisma');
  const api = read('src/routes/api.js');
  const securityPage = read('security-center.html');

  assert.match(schema, /deviceKey\s+String\?/);
  assert.match(schema, /deviceKey\s+String\?\s+@unique/);
  assert.match(api, /DEVICE_COOKIE_NAME/);
  assert.match(api, /where: \{ deviceKey \}/);
  assert.match(api, /groupedActiveSessions/);
  assert.match(api, /hide its ambiguous legacy rows/);
  assert.match(securityPage, /Trusted devices/);
});

test('lead and customer forms clearly support residential and business customers', () => {
  const schema = read('prisma/schema.prisma');
  const api = read('assets/api.js');
  const routes = read('src/routes/api.js');
  const booking = read('booking.html');

  assert.match(schema, /enum CustomerType\s*\{[\s\S]*RESIDENTIAL[\s\S]*BUSINESS/);
  assert.match(api, /Choose residential or business/);
  assert.match(api, /data-business-name-field/);
  assert.match(routes, /Enter the business name\./);
  assert.match(booking, /data-booking-customer-type/);
  assert.match(booking, /data-booking-business-name-field/);
});

test('forms use shared inline validation instead of browser validation popups', () => {
  const formUx = read('assets/form-ux.js');
  const api = read('assets/api.js');
  const solarOperations = read('assets/solar-operations.js');

  assert.match(formUx, /document\.addEventListener\('submit'/);
  assert.match(formUx, /event\.stopImmediatePropagation\(\)/);
  assert.match(api, /<form novalidate>/);
  assert.match(solarOperations, /<form novalidate>/);
});

test('solar operations uses installed capacity weighted performance and availability', () => {
  const page = read('solar-operations.html');
  const routes = read('src/routes/api.js');
  assert.match(page, /Capacity-weighted performance ratio/);
  assert.match(page, /Capacity-weighted availability/);
  assert.match(page, /installed kWp/);
  assert.match(routes, /capacityWeightedAverage/);
  assert.match(routes, /item\.value \* item\.capacity/);
  assert.match(routes, /performanceCalculation: 'CAPACITY_WEIGHTED'/);
});

test('lead, service request, and customer lists can filter residential and business records', () => {
  const api = read('assets/api.js');
  const leads = read('leads.html');
  const customers = read('customers.html');
  const bookings = read('booking-requests.html');
  const routes = read('src/routes/api.js');
  assert.match(api, /customerTypeFilters/);
  assert.match(api, /setupCustomerTypeFilter/);
  assert.match(leads, /data-customer-type-filter/);
  assert.match(customers, /data-customer-type-filter/);
  assert.match(bookings, /data-customer-type-filter/);
  assert.match(routes, /customerTypeFromQuery/);
});

test('reports provide customer segment filters and separate residential versus business results', () => {
  const api = read('assets/api.js');
  const reporting = read('src/services/reporting.service.js');
  assert.match(api, /Customer segment/);
  assert.match(api, /Residential and business results/);
  assert.match(reporting, /customerSegments/);
  assert.match(reporting, /label: customerType === 'BUSINESS' \? 'Business' : 'Residential'/);
  assert.match(reporting, /leads: segmentLeads\.length/);
  assert.match(reporting, /revenue: segmentPayments\.reduce/);
});

test('work-order completion requirements use accessible check cards', () => {
  const api = read('assets/api.js');
  const css = read('assets/app.css');
  assert.match(api, /completion-requirements-grid/);
  assert.match(api, /Choose what the technician must submit/);
  assert.match(css, /\.completion-option/);
});
