const { AppError } = require('../errors');

const PAYMENT_TERM_DAYS = Object.freeze({
  DUE_ON_RECEIPT: 0,
  NET_7: 7,
  NET_14: 14,
  NET_30: 30,
  NET_60: 60
});

function normalizePurchaseOrderNumber(value) {
  const clean = String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  if (!clean) return null;
  if (clean.length > 120) throw new AppError(400, 'Purchase-order number must be 120 characters or fewer.');
  if (!/[A-Za-z0-9]/.test(clean)) throw new AppError(400, 'Enter a valid customer purchase-order number.');
  return clean;
}

function requirePurchaseOrderNumber(customer, value, action = 'create') {
  const purchaseOrderNumber = normalizePurchaseOrderNumber(value);
  if (customer && customer.purchaseOrderRequired && !purchaseOrderNumber) {
    const verb = action === 'send' ? 'sending' : 'creating';
    throw new AppError(400, `Enter the customer purchase-order number before ${verb} this invoice.`);
  }
  return purchaseOrderNumber;
}

function paymentTermsDays(customer, fallbackDays = 0) {
  const value = customer && customer.paymentTerms;
  return Object.prototype.hasOwnProperty.call(PAYMENT_TERM_DAYS, value)
    ? PAYMENT_TERM_DAYS[value]
    : Math.max(Number(fallbackDays) || 0, 0);
}

function resolveInvoiceBranch({ customer, job, quote, requestedBranchId }) {
  if (job && customer && job.customerId !== customer.id) {
    throw new AppError(400, 'The selected work order belongs to a different customer.');
  }
  if (quote && customer && quote.customerId !== customer.id) {
    throw new AppError(400, 'The selected quote belongs to a different customer.');
  }
  if (quote && job && quote.jobId && quote.jobId !== job.id) {
    throw new AppError(400, 'The selected quote belongs to a different work order.');
  }

  const sources = [
    ['customer', customer && customer.branchId],
    ['work order', job && job.branchId],
    ['quote', quote && quote.branchId],
    ['invoice', requestedBranchId]
  ].filter((entry) => Boolean(entry[1]));
  const branchIds = [...new Set(sources.map((entry) => entry[1]))];
  if (branchIds.length > 1) {
    throw new AppError(400, 'The customer, work order, quote, and invoice must use the same branch.');
  }
  return branchIds[0] || null;
}

module.exports = {
  PAYMENT_TERM_DAYS,
  normalizePurchaseOrderNumber,
  paymentTermsDays,
  requirePurchaseOrderNumber,
  resolveInvoiceBranch
};
