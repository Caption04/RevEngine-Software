const fs = require('fs');
const path = require('path');

const CONNECTION_ERROR_CODES = new Set(['P1000', 'P1001', 'P1002', 'P1008', 'P1017']);
const SCHEMA_ERROR_CODES = new Set(['P2021', 'P2022']);
const SCHEMA_SQLSTATE_CODES = new Set(['42P01', '42703']);

function migrationDirectory(rootDir) {
  return path.join(rootDir, 'prisma', 'migrations');
}

function localMigrationNames(rootDir = path.resolve(__dirname, '../..')) {
  const directory = migrationDirectory(rootDir);
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

function schemaExpectations(dataModel) {
  const models = Array.isArray(dataModel)
    ? dataModel
    : dataModel && Array.isArray(dataModel.models)
      ? dataModel.models
      : [];

  return models.map((model) => ({
    tableName: model.dbName || model.name,
    columns: (model.fields || [])
      .filter((field) => field.kind === 'scalar' || field.kind === 'enum')
      .map((field) => field.dbName || field.name)
  }));
}

function errorCode(error) {
  return String(error && error.code || '');
}

function sqlState(error) {
  return String(error && error.meta && (error.meta.code || error.meta.database_error) || '');
}

function isConnectionError(error) {
  return CONNECTION_ERROR_CODES.has(errorCode(error));
}

function isSchemaError(error) {
  return SCHEMA_ERROR_CODES.has(errorCode(error))
    || SCHEMA_SQLSTATE_CODES.has(sqlState(error));
}

function migrationRowsToStatus(rows) {
  const applied = new Set();
  const failed = [];

  for (const row of rows || []) {
    const name = row.migrationName || row.migration_name;
    const finishedAt = row.finishedAt || row.finished_at;
    const rolledBackAt = row.rolledBackAt || row.rolled_back_at;
    if (!name || rolledBackAt) continue;
    if (finishedAt) applied.add(String(name));
    else failed.push(String(name));
  }

  return { applied, failed };
}

function missingSchemaItems(expectations, rows) {
  const actual = new Map();
  for (const row of rows || []) {
    const tableName = String(row.tableName || row.table_name || '');
    const columnName = String(row.columnName || row.column_name || '');
    if (!tableName || !columnName) continue;
    if (!actual.has(tableName)) actual.set(tableName, new Set());
    actual.get(tableName).add(columnName);
  }

  const missingTables = [];
  const missingColumns = [];
  for (const expectation of expectations) {
    const columns = actual.get(expectation.tableName);
    if (!columns) {
      missingTables.push(expectation.tableName);
      continue;
    }
    for (const columnName of expectation.columns) {
      if (!columns.has(columnName)) missingColumns.push(`${expectation.tableName}.${columnName}`);
    }
  }

  return { missingTables, missingColumns };
}

async function inspectDatabaseReadiness(database, options = {}) {
  const rootDir = options.rootDir || path.resolve(__dirname, '../..');
  const checkMigrations = options.checkMigrations !== false;
  const checkSchema = options.checkSchema !== false;
  const migrationNames = checkMigrations ? localMigrationNames(rootDir) : [];
  const expectations = checkSchema ? schemaExpectations(options.dataModel) : [];

  try {
    await database.$queryRawUnsafe('SELECT 1');
  } catch (error) {
    return {
      ready: false,
      reason: 'CONNECTION_FAILED',
      connectionError: true,
      pendingMigrations: [],
      failedMigrations: [],
      missingTables: [],
      missingColumns: [],
      causeCode: errorCode(error) || null
    };
  }

  let pendingMigrations = [];
  let failedMigrations = [];
  if (checkMigrations && migrationNames.length) {
    try {
      const rows = await database.$queryRawUnsafe(
        'SELECT "migration_name" AS "migrationName", "finished_at" AS "finishedAt", "rolled_back_at" AS "rolledBackAt" FROM "_prisma_migrations"'
      );
      const status = migrationRowsToStatus(rows);
      pendingMigrations = migrationNames.filter((name) => !status.applied.has(name));
      failedMigrations = status.failed;
    } catch (error) {
      return {
        ready: false,
        reason: isConnectionError(error) ? 'CONNECTION_FAILED' : 'MIGRATION_HISTORY_UNAVAILABLE',
        connectionError: isConnectionError(error),
        pendingMigrations: migrationNames,
        failedMigrations: [],
        missingTables: [],
        missingColumns: [],
        causeCode: errorCode(error) || sqlState(error) || null
      };
    }
  }

  let missingTables = [];
  let missingColumns = [];
  if (checkSchema && expectations.length) {
    try {
      const rows = await database.$queryRawUnsafe(
        'SELECT table_name AS "tableName", column_name AS "columnName" FROM information_schema.columns WHERE table_schema = current_schema()'
      );
      ({ missingTables, missingColumns } = missingSchemaItems(expectations, rows));
    } catch (error) {
      return {
        ready: false,
        reason: isConnectionError(error) ? 'CONNECTION_FAILED' : 'SCHEMA_INSPECTION_FAILED',
        connectionError: isConnectionError(error),
        pendingMigrations,
        failedMigrations,
        missingTables: [],
        missingColumns: [],
        causeCode: errorCode(error) || sqlState(error) || null
      };
    }
  }

  const ready = !pendingMigrations.length
    && !failedMigrations.length
    && !missingTables.length
    && !missingColumns.length;

  return {
    ready,
    reason: ready
      ? 'READY'
      : pendingMigrations.length
        ? 'PENDING_MIGRATIONS'
        : failedMigrations.length
          ? 'FAILED_MIGRATIONS'
          : 'SCHEMA_DRIFT',
    connectionError: false,
    pendingMigrations,
    failedMigrations,
    missingTables,
    missingColumns,
    causeCode: null
  };
}

function formatDatabaseReadinessFailure(result) {
  const lines = ['Database is not ready. Rev Engine was not started to prevent API 500 errors.'];

  if (result.connectionError) {
    lines.push('PostgreSQL could not be reached. Check that PostgreSQL is running and DATABASE_URL is correct.');
  }
  if (result.pendingMigrations && result.pendingMigrations.length) {
    lines.push('Pending migrations:');
    for (const name of result.pendingMigrations) lines.push(`  - ${name}`);
  }
  if (result.failedMigrations && result.failedMigrations.length) {
    lines.push('Failed migrations:');
    for (const name of result.failedMigrations) lines.push(`  - ${name}`);
  }
  if (result.missingTables && result.missingTables.length) {
    lines.push(`Missing tables: ${result.missingTables.slice(0, 12).join(', ')}`);
  }
  if (result.missingColumns && result.missingColumns.length) {
    lines.push(`Missing columns: ${result.missingColumns.slice(0, 20).join(', ')}`);
  }

  if (!result.connectionError) {
    lines.push('Apply the regional migrations with: npx prisma migrate deploy');
  }
  return lines.join('\n');
}

function databaseApiFailure(error) {
  const code = errorCode(error);
  const state = sqlState(error);

  if (CONNECTION_ERROR_CODES.has(code)) {
    return { status: 503, message: 'The database is temporarily unavailable. Try again shortly.', category: 'DATABASE_UNAVAILABLE' };
  }
  if (SCHEMA_ERROR_CODES.has(code) || SCHEMA_SQLSTATE_CODES.has(state)) {
    return { status: 503, message: 'A required database update has not been applied yet.', category: 'DATABASE_UPDATE_REQUIRED' };
  }
  if (code === 'P2000') {
    return { status: 400, message: 'One of the supplied values is too long.', category: 'INVALID_DATA' };
  }
  if (code === 'P2003') {
    return { status: 409, message: 'This record is still linked to other information.', category: 'RECORD_IN_USE' };
  }
  if (code === 'P2011' || code === 'P2012') {
    return { status: 400, message: 'A required value is missing.', category: 'INVALID_DATA' };
  }
  if (code === 'P2034') {
    return { status: 409, message: 'The record changed while this action was being saved. Try again.', category: 'WRITE_CONFLICT' };
  }
  return null;
}

module.exports = {
  databaseApiFailure,
  formatDatabaseReadinessFailure,
  inspectDatabaseReadiness,
  isConnectionError,
  isSchemaError,
  localMigrationNames,
  missingSchemaItems,
  schemaExpectations
};
