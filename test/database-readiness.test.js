const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  databaseApiFailure,
  inspectDatabaseReadiness,
  missingSchemaItems,
  schemaExpectations
} = require('../src/services/databaseReadiness.service');
const { errorHandler } = require('../src/errors');

function tempRepo(migrations) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'revengine-db-ready-'));
  const directory = path.join(root, 'prisma', 'migrations');
  fs.mkdirSync(directory, { recursive: true });
  for (const name of migrations) fs.mkdirSync(path.join(directory, name));
  return root;
}

function fakeDatabase({ migrationRows = [], columnRows = [], connectionError = null, migrationError = null } = {}) {
  let call = 0;
  return {
    async $queryRawUnsafe(query) {
      call += 1;
      if (call === 1) {
        if (connectionError) throw connectionError;
        return [{ ok: 1 }];
      }
      if (query.includes('_prisma_migrations')) {
        if (migrationError) throw migrationError;
        return migrationRows;
      }
      if (query.includes('information_schema.columns')) return columnRows;
      throw new Error(`Unexpected query: ${query}`);
    }
  };
}

const dataModel = [
  {
    name: 'Customer',
    fields: [
      { name: 'id', kind: 'scalar' },
      { name: 'status', kind: 'enum' },
      { name: 'branch', kind: 'object' }
    ]
  },
  {
    name: 'Branch',
    fields: [
      { name: 'id', kind: 'scalar' },
      { name: 'phone', kind: 'scalar' }
    ]
  }
];

test('database readiness detects pending migrations before routes can return 500', async () => {
  const rootDir = tempRepo(['20260722160000_customer_account_details', '20260722180000_branch_location_contacts']);
  const database = fakeDatabase({
    migrationRows: [{ migrationName: '20260722160000_customer_account_details', finishedAt: new Date(), rolledBackAt: null }],
    columnRows: [
      { tableName: 'Customer', columnName: 'id' },
      { tableName: 'Customer', columnName: 'status' },
      { tableName: 'Branch', columnName: 'id' },
      { tableName: 'Branch', columnName: 'phone' }
    ]
  });

  const result = await inspectDatabaseReadiness(database, { rootDir, dataModel });
  assert.equal(result.ready, false);
  assert.equal(result.reason, 'PENDING_MIGRATIONS');
  assert.deepEqual(result.pendingMigrations, ['20260722180000_branch_location_contacts']);
});

test('database readiness detects migrations marked applied while columns are still missing', async () => {
  const rootDir = tempRepo(['20260722180000_branch_location_contacts']);
  const database = fakeDatabase({
    migrationRows: [{ migrationName: '20260722180000_branch_location_contacts', finishedAt: new Date(), rolledBackAt: null }],
    columnRows: [
      { tableName: 'Customer', columnName: 'id' },
      { tableName: 'Customer', columnName: 'status' },
      { tableName: 'Branch', columnName: 'id' }
    ]
  });

  const result = await inspectDatabaseReadiness(database, { rootDir, dataModel });
  assert.equal(result.ready, false);
  assert.equal(result.reason, 'SCHEMA_DRIFT');
  assert.deepEqual(result.missingColumns, ['Branch.phone']);
});

test('database readiness accepts a fully migrated matching schema', async () => {
  const rootDir = tempRepo(['20260722180000_branch_location_contacts']);
  const database = fakeDatabase({
    migrationRows: [{ migrationName: '20260722180000_branch_location_contacts', finishedAt: new Date(), rolledBackAt: null }],
    columnRows: [
      { tableName: 'Customer', columnName: 'id' },
      { tableName: 'Customer', columnName: 'status' },
      { tableName: 'Branch', columnName: 'id' },
      { tableName: 'Branch', columnName: 'phone' }
    ]
  });

  const result = await inspectDatabaseReadiness(database, { rootDir, dataModel });
  assert.equal(result.ready, true);
  assert.equal(result.reason, 'READY');
});

test('Prisma missing-column and connection failures become service unavailable instead of generic 500', () => {
  assert.deepEqual(databaseApiFailure({ code: 'P2022' }), {
    status: 503,
    message: 'A required database update has not been applied yet.',
    category: 'DATABASE_UPDATE_REQUIRED'
  });
  assert.equal(databaseApiFailure({ code: 'P1001' }).status, 503);

  const response = {
    statusCode: 0,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  errorHandler({ code: 'P2022', message: 'The column Branch.phone does not exist' }, { method: 'GET', path: '/api/branches' }, response, () => {});
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.error.message, 'A required database update has not been applied yet.');
});

test('schema expectations include scalar and enum fields but exclude relations', () => {
  assert.deepEqual(schemaExpectations(dataModel), [
    { tableName: 'Customer', columns: ['id', 'status'] },
    { tableName: 'Branch', columns: ['id', 'phone'] }
  ]);
  assert.deepEqual(missingSchemaItems(schemaExpectations(dataModel), [
    { tableName: 'Customer', columnName: 'id' },
    { tableName: 'Branch', columnName: 'id' }
  ]), {
    missingTables: [],
    missingColumns: ['Customer.status', 'Branch.phone']
  });
});
