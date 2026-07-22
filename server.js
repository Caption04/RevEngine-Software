const { Prisma } = require('@prisma/client');
const { app } = require('./src/app');
const { prisma } = require('./src/db');
const { processPaymentNotificationOutbox } = require('./src/services/payments/paymentNotificationOutbox.service');
const { reconcileDuePaymentLinks } = require('./src/services/payments/paymentReconciliation.service');
const { formatDatabaseReadinessFailure, inspectDatabaseReadiness } = require('./src/services/databaseReadiness.service');

const PORT = Number(process.env.PORT || 3000);

let server = null;
let paymentJobTimer = null;
let paymentJobsRunning = false;
const paymentJobIntervalMs = Math.max(60_000, Number(process.env.PAYMENT_RECONCILIATION_INTERVAL_MS || 60_000));

async function runPaymentJobs() {
  if (paymentJobsRunning || process.env.DISABLE_PAYMENT_BACKGROUND_JOBS === 'true') return;
  paymentJobsRunning = true;
  try {
    await reconcileDuePaymentLinks(prisma, { limit: Number(process.env.PAYMENT_RECONCILIATION_BATCH_SIZE || 20) });
    await processPaymentNotificationOutbox(prisma, { limit: Number(process.env.PAYMENT_NOTIFICATION_BATCH_SIZE || 25) });
  } catch (error) {
    console.error('[payment-jobs]', String(error && error.message || error).replace(/[\r\n\t]+/g, ' ').slice(0, 240));
  } finally {
    paymentJobsRunning = false;
  }
}

async function start() {
  const readiness = await inspectDatabaseReadiness(prisma, {
    dataModel: Prisma.dmmf.datamodel.models
  });

  if (!readiness.ready) {
    console.error(formatDatabaseReadinessFailure(readiness));
    await prisma.$disconnect();
    process.exitCode = 1;
    return null;
  }

  server = app.listen(PORT, () => {
    console.log(`Rev Engine server running at http://localhost:${PORT}`);
  });

  paymentJobTimer = setInterval(runPaymentJobs, paymentJobIntervalMs);
  paymentJobTimer.unref();
  setTimeout(runPaymentJobs, 5_000).unref();
  return server;
}

async function shutdown() {
  if (paymentJobTimer) clearInterval(paymentJobTimer);
  if (!server) {
    await prisma.$disconnect();
    process.exit(0);
    return;
  }
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start().catch(async (error) => {
  console.error('[startup-error]', String(error && error.stack || error));
  await prisma.$disconnect().catch(() => {});
  process.exitCode = 1;
});

module.exports = { start };
