# Rev Engine invoice purchase-order enforcement

This patch completes the customer purchase-order workflow and hardens invoice ownership.

## Behaviour

- Adds `purchaseOrderNumber` to invoices.
- A customer marked **Purchase order required** cannot receive a new invoice without its PO number.
- An invoice cannot be sent if the required PO number is missing.
- Draft invoices provide an **Add/Edit Customer PO** action for late or corrected PO numbers.
- One-click invoice creation from a completed job asks for the PO number when required.
- Customer payment terms set the default invoice due date.
- The customer, quote, work order, invoice branch, and active company must agree.
- Invoice numbers, branding, currency, tax settings, and finance records come from the company currently open.
- Invoice actions enforce their individual permissions, including send, edit, void, and payment management.
- Accountants can select billing customers without receiving the full customer directory.
- PO numbers appear in invoice lists, client invoice details, and invoice CSV exports.

## Database

Migration: `20260723100000_invoice_customer_purchase_orders`

Apply it to both regional databases before restarting either server.
