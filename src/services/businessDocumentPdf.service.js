'use strict';

const zlib = require('node:zlib');

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT = 48;
const RIGHT = 547;
const TOP = 790;
const BOTTOM = 56;

function ascii(value) {
  return String(value == null ? '' : value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pdfEscape(value) {
  return ascii(value).replace(/([\\()])/g, '\\$1');
}

function hexRgb(value, fallback = '#2363ff') {
  const input = /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback;
  return {
    r: Number.parseInt(input.slice(1, 3), 16) / 255,
    g: Number.parseInt(input.slice(3, 5), 16) / 255,
    b: Number.parseInt(input.slice(5, 7), 16) / 255
  };
}

function commandText(x, y, size, value, bold = false) {
  return `0.055 0.102 0.184 rg BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET\n`;
}

function commandLine(x1, y1, x2, y2, width = 1, gray = 0.84) {
  return `${gray} G ${width} w ${x1} ${y1} m ${x2} ${y2} l S\n`;
}

function commandRect(x, y, width, height, color) {
  return `${color.r.toFixed(3)} ${color.g.toFixed(3)} ${color.b.toFixed(3)} rg ${x} ${y} ${width} ${height} re f\n`;
}

function wrap(value, maxCharacters) {
  const words = ascii(value).split(' ').filter(Boolean);
  if (!words.length) return [''];
  const rows = [];
  let current = '';
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxCharacters) current = next;
    else {
      if (current) rows.push(current);
      current = word.length > maxCharacters ? `${word.slice(0, maxCharacters - 1)}…` : word;
    }
  });
  if (current) rows.push(current);
  return rows;
}

function money(value, localization) {
  const amount = Number(value || 0);
  const currency = localization && localization.defaultCurrency || 'USD';
  const locale = localization && localization.numberFormat || 'en-US';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function dateLabel(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function customerName(record) {
  const customer = record && record.customer || {};
  return customer.customerType === 'BUSINESS'
    ? customer.companyName || customer.name || 'Customer'
    : customer.name || customer.companyName || 'Customer';
}

function customerContact(record) {
  const customer = record && record.customer || {};
  const displayName = customerName(record);
  return [customer.name !== displayName ? customer.name : null, customer.email, customer.phone].filter(Boolean).join(' · ');
}

function lineItems(record) {
  if (Array.isArray(record.lineItems) && record.lineItems.length) return record.lineItems;
  return [{ description: record.title || record.number || 'Service', quantity: 1, unitPrice: record.amount || record.total || 0, lineTotal: record.total || record.amount || 0 }];
}

function buildPageCommands({ kind, record, company, branding, localization, items, pageIndex, pageCount }) {
  const brand = branding || {};
  const primary = hexRgb(brand.primaryColor);
  const companyName = ascii(brand.brandName || company.tradingName || company.name || 'Company');
  const documentTitle = kind === 'quote' ? 'QUOTE' : 'INVOICE';
  const documentReference = kind === 'quote'
    ? record.number || `Quote ${String(record.id || '').slice(-8).toUpperCase()}`
    : record.number || `Invoice ${String(record.id || '').slice(-8).toUpperCase()}`;
  let output = commandRect(0, PAGE_HEIGHT - 34, PAGE_WIDTH, 34, primary);
  output += commandText(LEFT, TOP, 19, companyName, true);
  const companyContact = [brand.supportEmail || company.email, brand.supportPhone || company.phone, company.address].filter(Boolean).join(' · ');
  const website = brand.websiteUrl || '';
  output += commandText(LEFT, TOP - 22, 9, companyContact);
  if (website) output += commandText(LEFT, TOP - 38, 8, website);
  output += commandText(405, TOP, 20, documentTitle, true);
  output += commandText(405, TOP - 24, 10, documentReference, true);
  output += commandText(405, TOP - 42, 9, `Status: ${String(record.status || 'DRAFT').replace(/_/g, ' ')}`);
  output += commandLine(LEFT, TOP - 62, RIGHT, TOP - 62, 1, 0.78);

  let y = TOP - 91;
  output += commandText(LEFT, y, 10, 'Bill to', true);
  output += commandText(LEFT, y - 18, 12, customerName(record), true);
  const contactLines = wrap(customerContact(record), 70).slice(0, 2);
  contactLines.forEach((line, index) => { output += commandText(LEFT, y - 36 - index * 15, 9, line); });

  const meta = kind === 'quote'
    ? [
        ['Created', dateLabel(record.createdAt)],
        ['Valid until', dateLabel(record.validUntil)]
      ]
    : [
        ['Issued', dateLabel(record.createdAt)],
        ['Due', dateLabel(record.dueDate)],
        ...(record.purchaseOrderNumber ? [['Customer PO', record.purchaseOrderNumber]] : [])
      ];
  meta.forEach(([label, value], index) => {
    output += commandText(390, y - index * 18, 9, `${label}:`, true);
    output += commandText(463, y - index * 18, 9, value);
  });

  y -= 86;
  output += commandRect(LEFT, y - 18, RIGHT - LEFT, 24, { r: 0.95, g: 0.96, b: 0.98 });
  output += commandText(LEFT + 8, y - 11, 9, 'Description', true);
  output += commandText(360, y - 11, 9, 'Qty', true);
  output += commandText(408, y - 11, 9, 'Unit', true);
  output += commandText(490, y - 11, 9, 'Total', true);
  y -= 36;

  items.forEach((item) => {
    const description = wrap(item.description || item.service && item.service.name || 'Item', 46)[0];
    output += commandText(LEFT + 8, y, 9, description);
    output += commandText(362, y, 9, Number(item.quantity || 1).toFixed(2).replace(/\.00$/, ''));
    output += commandText(408, y, 9, money(item.unitPrice || 0, localization));
    output += commandText(490, y, 9, money(item.lineTotal != null ? item.lineTotal : Number(item.quantity || 1) * Number(item.unitPrice || 0), localization));
    output += commandLine(LEFT, y - 8, RIGHT, y - 8, 0.5, 0.9);
    y -= 25;
  });

  if (pageIndex === pageCount - 1) {
    y = Math.max(y - 8, 180);
    const totals = [
      ['Subtotal', record.subtotal != null ? record.subtotal : record.amount || 0],
      ['Discount', record.discountTotal || 0],
      ['Tax', record.taxTotal || 0],
      ['Total', record.total != null ? record.total : record.amount || 0]
    ];
    totals.forEach(([label, value], index) => {
      const lineY = y - index * 20;
      output += commandText(400, lineY, index === totals.length - 1 ? 11 : 9, label, index === totals.length - 1);
      output += commandText(490, lineY, index === totals.length - 1 ? 11 : 9, money(value, localization), index === totals.length - 1);
    });
    const note = kind === 'quote' ? record.description : record.paymentPlanNotes;
    if (note) {
      output += commandText(LEFT, 135, 9, kind === 'quote' ? 'Notes' : 'Payment notes', true);
      wrap(note, 88).slice(0, 3).forEach((line, index) => { output += commandText(LEFT, 119 - index * 14, 8, line); });
    }
    const paymentInstructions = localization && localization.paymentInstructions;
    if (kind === 'invoice' && paymentInstructions) {
      output += commandText(LEFT, 101, 8, 'Payment instructions', true);
      wrap(paymentInstructions, 90).slice(0, 2).forEach((line, index) => { output += commandText(LEFT, 88 - index * 12, 7, line); });
    }
    const footer = localization && localization.invoiceFooter || brand.invoiceFooter || brand.invoiceTerms;
    if (footer) wrap(footer, 95).slice(0, 2).forEach((line, index) => { output += commandText(LEFT, 75 - index * 13, 7, line); });
  }

  output += commandText(RIGHT - 52, 30, 7, `Page ${pageIndex + 1} of ${pageCount}`);
  return output;
}

function assemblePdf(pageCommands) {
  const pageObjectIds = pageCommands.map((_, index) => 5 + index * 2);
  const objects = new Map();
  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objects.set(2, `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`);
  objects.set(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objects.set(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  pageCommands.forEach((commands, index) => {
    const pageId = pageObjectIds[index];
    const contentId = pageId + 1;
    objects.set(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.set(contentId, `<< /Length ${Buffer.byteLength(commands, 'ascii')} >>\nstream\n${commands}endstream`);
  });

  const maxId = Math.max(...objects.keys());
  let body = '%PDF-1.4\n%RevEngine\n';
  const offsets = [0];
  for (let id = 1; id <= maxId; id += 1) {
    offsets[id] = Buffer.byteLength(body, 'ascii');
    body += `${id} 0 obj\n${objects.get(id)}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body, 'ascii');
  body += `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id += 1) body += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(body, 'ascii');
}

function createBusinessDocumentPdf({ kind, record, company, branding, localization }) {
  if (!['quote', 'invoice'].includes(kind)) throw new TypeError('Document kind must be quote or invoice.');
  const allItems = lineItems(record);
  const chunks = [];
  const perPage = 17;
  for (let index = 0; index < allItems.length; index += perPage) chunks.push(allItems.slice(index, index + perPage));
  if (!chunks.length) chunks.push([]);
  const commands = chunks.map((items, pageIndex) => buildPageCommands({ kind, record, company, branding, localization, items, pageIndex, pageCount: chunks.length }));
  return assemblePdf(commands);
}

module.exports = { createBusinessDocumentPdf };
