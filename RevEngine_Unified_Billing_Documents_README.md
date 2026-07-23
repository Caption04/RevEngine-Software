# Unified Billing & Documents

This patch removes the duplicate Invoice Defaults editor and makes Billing & Documents the single editable source for currency, tax, document numbering, quote expiry, invoice payment terms, payment instructions, and the document footer.

It also adds company-scoped quote numbers, uses the same finance settings in the settings preview and generated PDFs, hides empty PO rows, removes duplicated customer/company contact text, and uses the current company's footer/payment instructions in PDFs.

## Database changes

Migration: `20260723120000_unified_billing_documents`

- `CompanyFinanceSettings.quotePrefix`
- `CompanyInvoiceCounter.quoteNextNumber`
- `Quote.number` with a company-scoped unique index

Run the migration for both regional databases before starting the updated server.
