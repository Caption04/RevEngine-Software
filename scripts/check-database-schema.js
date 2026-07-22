require('dotenv').config();

const { Prisma } = require('@prisma/client');
const { prisma } = require('../src/db');
const { formatDatabaseReadinessFailure, inspectDatabaseReadiness } = require('../src/services/databaseReadiness.service');

async function main() {
  const readiness = await inspectDatabaseReadiness(prisma, {
    dataModel: Prisma.dmmf.datamodel.models
  });

  if (!readiness.ready) {
    console.error(formatDatabaseReadinessFailure(readiness));
    process.exitCode = 1;
    return;
  }

  console.log('Database schema is ready. No migrations or Prisma columns are missing.');
}

main()
  .catch((error) => {
    console.error('Database check failed:', String(error && error.message || error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
