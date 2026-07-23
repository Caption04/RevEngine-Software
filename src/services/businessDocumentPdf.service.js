'use strict';

const zlib = require('node:zlib');

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT = 48;
const RIGHT = 547;
const TOP = 794;
const BOTTOM = 52;

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

function darken(color, amount = 0.18) {
  return { r: Math.max(0, color.r * (1 - amount)), g: Math.max(0, color.g * (1 - amount)), b: Math.max(0, color.b * (1 - amount)) };
}

function commandText(x, y, size, value, bold = false, color = { r: 0.055, g: 0.102, b: 0.184 }) {
  return `${color.r.toFixed(3)} ${color.g.toFixed(3)} ${color.b.toFixed(3)} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET\n`;
}

function commandLine(x1, y1, x2, y2, width = 1, gray = 0.84) {
  return `${gray} G ${width} w ${x1} ${y1} m ${x2} ${y2} l S\n`;
}

function commandColorLine(x1, y1, x2, y2, width, color) {
  return `${color.r.toFixed(3)} ${color.g.toFixed(3)} ${color.b.toFixed(3)} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S\n`;
}

function commandRect(x, y, width, height, color) {
  return `${color.r.toFixed(3)} ${color.g.toFixed(3)} ${color.b.toFixed(3)} rg ${x} ${y} ${width} ${height} re f\n`;
}

function commandStrokeRect(x, y, width, height, color, lineWidth = 1) {
  return `${color.r.toFixed(3)} ${color.g.toFixed(3)} ${color.b.toFixed(3)} RG ${lineWidth} w ${x} ${y} ${width} ${height} re S\n`;
}

function commandImage(x, y, width, height) {
  return `q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Logo Do Q\n`;
}

function wrap(value, maxCharacters) {
  const words = ascii(value).split(' ').filter(Boolean);
  if (!words.length) return [];
  const rows = [];
  let current = '';
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxCharacters) current = next;
    else {
      if (current) rows.push(current);
      current = word.length > maxCharacters ? `${word.slice(0, Math.max(1, maxCharacters - 3))}...` : word;
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
  return [customer.name !== displayName ? customer.name : null, customer.email, customer.phone].filter(Boolean).join('  |  ');
}

function lineItems(record) {
  if (Array.isArray(record.lineItems) && record.lineItems.length) return record.lineItems;
  if (Array.isArray(record.serviceLines) && record.serviceLines.length) {
    return record.serviceLines.map((item) => ({
      description: item.description || item.name || item.service && item.service.name || 'Included service',
      quantity: item.includedQuantity || item.quantity || 1,
      unitPrice: item.unitPrice || 0,
      lineTotal: item.lineTotal || Number(item.includedQuantity || item.quantity || 1) * Number(item.unitPrice || 0)
    }));
  }
  return [{ description: record.title || record.number || 'Service', quantity: 1, unitPrice: record.amount || record.total || 0, lineTotal: record.total || record.amount || 0 }];
}

function initials(value) {
  return ascii(value).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'CO';
}

function normalizeTemplate(localization) {
  const input = localization || {};
  const design = input.documentDesign && typeof input.documentDesign === 'object' ? input.documentDesign : null;
  const blocks = design && Array.isArray(design.blocks) ? design.blocks : [];
  const visible = (type, fallback = true) => {
    const block = blocks.find((item) => item && item.type === type);
    return block ? block.visible !== false : fallback;
  };
  const block = (type) => blocks.find((item) => item && item.type === type) || null;
  const oneOf = (value, allowed, fallback) => allowed.includes(String(value || '').toUpperCase()) ? String(value).toUpperCase() : fallback;
  return {
    template: oneOf(input.documentTemplate, ['MODERN', 'CLASSIC', 'MINIMAL'], 'MODERN'),
    headerStyle: oneOf(input.documentHeaderStyle, ['SPLIT', 'STACKED', 'COMPACT'], 'SPLIT'),
    logoPosition: oneOf(input.documentLogoPosition, ['LEFT', 'RIGHT'], 'LEFT'),
    logoSize: oneOf(input.documentLogoSize, ['SMALL', 'MEDIUM', 'LARGE'], 'MEDIUM'),
    tableDensity: oneOf(input.documentTableDensity, ['COMPACT', 'COMFORTABLE'], 'COMFORTABLE'),
    quoteLabel: ascii(input.quoteLabel || 'QUOTE').slice(0, 30) || 'QUOTE',
    invoiceLabel: ascii(input.invoiceLabel || 'INVOICE').slice(0, 30) || 'INVOICE',
    contractLabel: ascii(input.contractLabel || 'CONTRACT').slice(0, 30) || 'CONTRACT',
    showDocumentLogo: design ? design.header && design.header.showLogo !== false : input.showDocumentLogo !== false,
    showLegalName: input.showLegalName !== false,
    showRegistrationNumber: input.showRegistrationNumber !== false,
    showTaxNumber: input.showTaxNumber !== false,
    showCompanyAddress: input.showCompanyAddress !== false,
    showCompanyEmail: input.showCompanyEmail !== false,
    showCompanyPhone: input.showCompanyPhone !== false,
    showCompanyWebsite: input.showCompanyWebsite !== false,
    showCustomerDetails: visible('CUSTOMER_DETAILS', true),
    showDocumentDetails: visible('DOCUMENT_DETAILS', true),
    showLineItems: visible('LINE_ITEMS', true),
    showTotals: visible('TOTALS', true),
    showTax: design ? visible('TOTALS', true) : input.showTax !== false,
    showPurchaseOrder: design ? visible('DOCUMENT_DETAILS', true) : input.showPurchaseOrder !== false,
    showNotes: design ? visible('TERMS', true) : input.showNotes !== false,
    showPaymentInstructions: design ? visible('PAYMENT_OPTIONS', true) : input.showPaymentInstructions !== false,
    primaryColor: design && design.theme && design.theme.primaryColor,
    accentColor: design && design.theme && design.theme.accentColor,
    tableHeaderColor: design && design.theme && design.theme.tableHeaderColor,
    borderColor: design && design.theme && design.theme.borderColor,
    bodySize: design && design.typography && Number(design.typography.bodySize) || 9,
    blocks,
    paymentOptions: block('PAYMENT_OPTIONS'),
    onlinePayment: block('ONLINE_PAYMENT'),
    terms: block('TERMS'),
    disclaimer: block('DISCLAIMER'),
    signatures: block('SIGNATURES'),
    footer: block('FOOTER'),
    contractBody: block('CONTRACT_BODY')
  };
}

function readUInt32(buffer, offset) {
  return buffer.readUInt32BE(offset);
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!Buffer.isBuffer(buffer) || !buffer.subarray(0, 8).equals(signature)) return null;
  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  let interlace;
  let palette = null;
  let transparency = null;
  const idat = [];
  while (offset + 12 <= buffer.length) {
    const length = readUInt32(buffer, offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = readUInt32(data, 0);
      height = readUInt32(data, 4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') transparency = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (!width || !height || bitDepth !== 8 || interlace !== 0 || !idat.length) return null;
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) return null;
  const rowBytes = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  if (raw.length < (rowBytes + 1) * height) return null;
  const rows = [];
  let inputOffset = 0;
  let previous = Buffer.alloc(rowBytes);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[inputOffset++];
    const source = raw.subarray(inputOffset, inputOffset + rowBytes);
    inputOffset += rowBytes;
    const row = Buffer.alloc(rowBytes);
    for (let x = 0; x < rowBytes; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = previous[x] || 0;
      const upperLeft = x >= channels ? previous[x - channels] || 0 : 0;
      let value = source[x];
      if (filter === 1) value = (value + left) & 255;
      else if (filter === 2) value = (value + up) & 255;
      else if (filter === 3) value = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) value = (value + paethPredictor(left, up, upperLeft)) & 255;
      else if (filter !== 0) return null;
      row[x] = value;
    }
    rows.push(row);
    previous = row;
  }
  const rgb = Buffer.alloc(width * height * 3);
  const alpha = Buffer.alloc(width * height, 255);
  let rgbOffset = 0;
  let alphaOffset = 0;
  for (const row of rows) {
    for (let x = 0; x < width; x += 1) {
      let r;
      let g;
      let b;
      let a = 255;
      const index = x * channels;
      if (colorType === 0) r = g = b = row[index];
      else if (colorType === 2) [r, g, b] = [row[index], row[index + 1], row[index + 2]];
      else if (colorType === 3) {
        const paletteIndex = row[index];
        if (!palette || paletteIndex * 3 + 2 >= palette.length) return null;
        r = palette[paletteIndex * 3];
        g = palette[paletteIndex * 3 + 1];
        b = palette[paletteIndex * 3 + 2];
        if (transparency && paletteIndex < transparency.length) a = transparency[paletteIndex];
      } else if (colorType === 4) {
        r = g = b = row[index];
        a = row[index + 1];
      } else if (colorType === 6) {
        [r, g, b, a] = [row[index], row[index + 1], row[index + 2], row[index + 3]];
      }
      rgb[rgbOffset++] = r;
      rgb[rgbOffset++] = g;
      rgb[rgbOffset++] = b;
      alpha[alphaOffset++] = a;
    }
  }
  const hasAlpha = alpha.some((value) => value !== 255);
  return { width, height, data: zlib.deflateSync(rgb), alpha: hasAlpha ? zlib.deflateSync(alpha) : null, filter: 'FlateDecode', colorSpace: 'DeviceRGB' };
}

function decodeJpeg(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    const isSof = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker);
    if (isSof) {
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      const components = buffer[offset + 7];
      return { width, height, data: buffer, alpha: null, filter: 'DCTDecode', colorSpace: components === 1 ? 'DeviceGray' : components === 4 ? 'DeviceCMYK' : 'DeviceRGB' };
    }
    offset += length;
  }
  return null;
}

function prepareLogoImage(logoImage) {
  if (!logoImage || !Buffer.isBuffer(logoImage.buffer)) return null;
  try {
    return logoImage.type === 'jpeg' ? decodeJpeg(logoImage.buffer) : decodePng(logoImage.buffer);
  } catch {
    return null;
  }
}

function logoDimensions(image, desired) {
  const maxWidth = desired * 1.7;
  const maxHeight = desired;
  const ratio = image && image.width && image.height ? image.width / image.height : 1;
  const boxRatio = maxWidth / maxHeight;
  if (ratio >= boxRatio) return { width: maxWidth, height: maxWidth / ratio };
  return { width: maxHeight * ratio, height: maxHeight };
}

function companyDetails(company, brand, localization, template, companyName) {
  const rows = [];
  const legalName = ascii(company.legalName || '');
  if (template.showLegalName && legalName && legalName.toLowerCase() !== ascii(companyName).toLowerCase()) {
    rows.push(...wrap(legalName, 52).slice(0, 2));
  }

  const registration = template.showRegistrationNumber && company.registrationNumber ? `Reg No: ${company.registrationNumber}` : null;
  const taxLabel = ascii(localization && localization.taxName || 'Tax') || 'Tax';
  const tax = template.showTaxNumber && company.taxNumber ? `${taxLabel} No: ${company.taxNumber}` : null;
  if (registration || tax) rows.push([registration, tax].filter(Boolean).join('  |  '));

  if (template.showCompanyAddress && company.address) rows.push(...wrap(company.address, 52).slice(0, 2));

  const contact = [];
  if (template.showCompanyEmail) contact.push(brand.supportEmail || company.email || null);
  if (template.showCompanyPhone) contact.push(brand.supportPhone || company.phone || null);
  const contactLine = contact.filter(Boolean).join('  |  ');
  if (contactLine) rows.push(...wrap(contactLine, 52).slice(0, 2));

  if (template.showCompanyWebsite && brand.websiteUrl) rows.push(...wrap(brand.websiteUrl, 52).slice(0, 1));
  return rows.filter(Boolean);
}

function drawLogoOrInitials({ x, y, size, companyName, primary, logoImage, showLogo, logoPosition }) {
  if (!showLogo) return '';
  const boxWidth = size * 1.7;
  if (logoImage) {
    const dims = logoDimensions(logoImage, size);
    const imageX = logoPosition === 'RIGHT' ? x + boxWidth - dims.width : x;
    return commandImage(imageX, y + (size - dims.height) / 2, dims.width, dims.height);
  }
  const square = size;
  const squareX = logoPosition === 'RIGHT' ? x + boxWidth - square : x;
  let output = commandRect(squareX, y, square, square, primary);
  output += commandText(squareX + square * 0.18, y + square * 0.36, Math.max(9, square * 0.28), initials(companyName), true, { r: 1, g: 1, b: 1 });
  return output;
}

function renderCompanyDetailLines(x, startY, details, size = 8, gap = 12) {
  return details.map((value, index) => commandText(x, startY - index * gap, size, value)).join('');
}

function companyDetailBottom(startY, details, gap = 12) {
  return details.length ? startY - (details.length - 1) * gap : startY;
}

function buildHeader({ kind, record, company, branding, localization, template, logoImage }) {
  const brand = branding || {};
  const primary = hexRgb(template.primaryColor || brand.primaryColor);
  const secondary = hexRgb(template.accentColor || brand.secondaryColor, '#263ff1');
  const companyName = ascii(brand.brandName || company.tradingName || company.name || 'Company');
  const documentTitle = kind === 'quote' ? template.quoteLabel : kind === 'contract' ? template.contractLabel : template.invoiceLabel;
  const documentReference = record.number || record.contractNumber || (kind === 'quote' ? 'Quote' : kind === 'contract' ? 'Contract' : 'Invoice');
  const logoSize = { SMALL: 34, MEDIUM: 46, LARGE: 60 }[template.logoSize];
  const details = companyDetails(company, brand, localization, template, companyName);
  let output = '';
  let bodyStart = TOP - 100;

  if (template.template === 'MODERN') {
    output += commandRect(0, PAGE_HEIGHT - 18, PAGE_WIDTH, 18, primary);
    if (template.headerStyle === 'STACKED') {
      const logoX = template.logoPosition === 'RIGHT' ? RIGHT - logoSize * 1.7 : LEFT;
      const nameY = TOP - logoSize - 12;
      const detailStartY = nameY - 18;
      output += drawLogoOrInitials({ x: logoX, y: TOP - logoSize + 4, size: logoSize, companyName, primary, logoImage, showLogo: template.showDocumentLogo, logoPosition: template.logoPosition });
      output += commandText(LEFT, nameY, 18, companyName, true);
      output += renderCompanyDetailLines(LEFT, detailStartY, details);
      const stackedMetaX = template.logoPosition === 'RIGHT' ? 315 : 390;
      output += commandText(stackedMetaX, TOP - 4, 19, documentTitle, true, darken(primary));
      output += commandText(stackedMetaX, TOP - 27, 10, documentReference, true);
      output += commandText(stackedMetaX, TOP - 44, 8, `Status: ${String(record.status || 'DRAFT').replace(/_/g, ' ')}`);
      bodyStart = Math.min(TOP - logoSize - 86, companyDetailBottom(detailStartY, details) - 26);
    } else {
      const logoX = template.logoPosition === 'RIGHT' ? RIGHT - logoSize * 1.7 : LEFT;
      const identityX = template.logoPosition === 'RIGHT' ? LEFT : LEFT + (template.showDocumentLogo ? logoSize * 1.7 + 12 : 0);
      const detailStartY = TOP - 21;
      output += drawLogoOrInitials({ x: logoX, y: TOP - logoSize + 4, size: logoSize, companyName, primary, logoImage, showLogo: template.showDocumentLogo, logoPosition: template.logoPosition });
      output += commandText(identityX, TOP - 2, template.headerStyle === 'COMPACT' ? 16 : 19, companyName, true);
      output += renderCompanyDetailLines(identityX, detailStartY, details, template.headerStyle === 'COMPACT' ? 7.5 : 8);
      const metaX = template.logoPosition === 'RIGHT' ? 315 : 400;
      output += commandText(metaX, TOP - 2, 19, documentTitle, true, darken(primary));
      output += commandText(metaX, TOP - 26, 10, documentReference, true);
      output += commandText(metaX, TOP - 43, 8, `Status: ${String(record.status || 'DRAFT').replace(/_/g, ' ')}`);
      const defaultBodyStart = template.headerStyle === 'COMPACT' ? TOP - 68 : TOP - 82;
      bodyStart = Math.min(defaultBodyStart, companyDetailBottom(detailStartY, details) - 26);
    }
    output += commandColorLine(LEFT, bodyStart + 12, RIGHT, bodyStart + 12, 2, secondary);
  } else if (template.template === 'CLASSIC') {
    output += commandStrokeRect(LEFT - 12, BOTTOM - 10, RIGHT - LEFT + 24, TOP - BOTTOM + 44, primary, 1.2);
    const logoX = template.logoPosition === 'RIGHT' ? RIGHT - logoSize * 1.7 : LEFT;
    const identityX = template.logoPosition === 'RIGHT' ? LEFT : LEFT + (template.showDocumentLogo ? logoSize * 1.7 + 12 : 0);
    const detailStartY = TOP - 21;
    output += drawLogoOrInitials({ x: logoX, y: TOP - logoSize + 2, size: logoSize, companyName, primary, logoImage, showLogo: template.showDocumentLogo, logoPosition: template.logoPosition });
    output += commandText(identityX, TOP - 1, 18, companyName, true, darken(primary));
    output += renderCompanyDetailLines(identityX, detailStartY, details);
    const classicMetaX = template.logoPosition === 'RIGHT' ? 315 : 405;
    output += commandText(classicMetaX, TOP - 2, 18, documentTitle, true, darken(primary));
    output += commandText(classicMetaX, TOP - 25, 10, documentReference, true);
    output += commandText(classicMetaX, TOP - 42, 8, `Status: ${String(record.status || 'DRAFT').replace(/_/g, ' ')}`);
    bodyStart = Math.min(TOP - 82, companyDetailBottom(detailStartY, details) - 26);
    output += commandLine(LEFT, bodyStart + 12, RIGHT, bodyStart + 12, 1, 0.7);
  } else {
    const logoX = template.logoPosition === 'RIGHT' ? RIGHT - logoSize * 1.7 : LEFT;
    const identityX = template.logoPosition === 'RIGHT' ? LEFT : LEFT + (template.showDocumentLogo ? logoSize * 1.7 + 12 : 0);
    const detailStartY = TOP - 21;
    output += drawLogoOrInitials({ x: logoX, y: TOP - logoSize + 2, size: logoSize, companyName, primary, logoImage, showLogo: template.showDocumentLogo, logoPosition: template.logoPosition });
    output += commandText(identityX, TOP - 1, 17, companyName, true);
    output += renderCompanyDetailLines(identityX, detailStartY, details, 7.5);
    const minimalMetaX = template.logoPosition === 'RIGHT' ? 320 : 410;
    output += commandText(minimalMetaX, TOP - 1, 17, documentTitle, true);
    output += commandText(minimalMetaX, TOP - 23, 9, documentReference, true);
    bodyStart = Math.min(TOP - 62, companyDetailBottom(detailStartY, details) - 22);
    output += commandColorLine(LEFT, bodyStart + 10, RIGHT, bodyStart + 10, 1.5, primary);
  }

  return { output, bodyStart, primary, secondary };
}

function buildPageCommands({ kind, record, company, branding, localization, items, pageIndex, pageCount, logoImage }) {
  const template = normalizeTemplate(localization);
  const header = buildHeader({ kind, record, company, branding, localization, template, logoImage });
  let output = header.output;
  let y = header.bodyStart - 18;

  if (template.showCustomerDetails) {
    output += commandText(LEFT, y, 9, kind === 'contract' ? 'CUSTOMER' : 'BILL TO', true, darken(header.primary, 0.3));
    output += commandText(LEFT, y - 19, 12, customerName(record), true);
    wrap(customerContact(record), 62).slice(0, 2).forEach((line, index) => { output += commandText(LEFT, y - 37 - index * 14, 8, line); });
  }

  const meta = kind === 'quote'
    ? [['Created', dateLabel(record.createdAt)], ['Valid until', dateLabel(record.validUntil)]]
    : kind === 'contract'
      ? [['Starts', dateLabel(record.startDate)], ['Ends', dateLabel(record.endDate)], ['Status', String(record.status || 'DRAFT').replace(/_/g, ' ')]]
      : [['Issued', dateLabel(record.createdAt)], ['Due', dateLabel(record.dueDate)], ...(template.showPurchaseOrder && record.purchaseOrderNumber ? [['Customer PO', record.purchaseOrderNumber]] : [])];
  if (template.showDocumentDetails) {
    meta.forEach(([label, value], index) => {
      output += commandText(390, y - index * 18, 8, `${label}:`, true);
      output += commandText(462, y - index * 18, 8, value);
    });
  }

  y -= 82;
  if (kind === 'contract' && template.contractBody && template.contractBody.visible !== false && template.contractBody.body) {
    output += commandText(LEFT, y, 9, template.contractBody.label || 'AGREEMENT', true, darken(header.primary, 0.3));
    wrap(template.contractBody.body, 94).slice(0, 8).forEach((line, index) => { output += commandText(LEFT, y - 18 - index * 13, template.bodySize - 1, line); });
    y -= Math.max(50, Math.min(8, wrap(template.contractBody.body, 94).length) * 13 + 30);
  }

  const tableHeaderColor = template.tableHeaderColor ? hexRgb(template.tableHeaderColor) : template.template === 'MINIMAL' ? { r: 0.965, g: 0.97, b: 0.98 } : { r: 0.94, g: 0.955, b: 0.98 };
  if (template.showLineItems) {
    output += commandRect(LEFT, y - 18, RIGHT - LEFT, 25, tableHeaderColor);
    output += commandText(LEFT + 8, y - 11, 8, kind === 'contract' ? 'SERVICE' : 'DESCRIPTION', true);
    output += commandText(355, y - 11, 8, 'QTY', true);
    output += commandText(407, y - 11, 8, 'UNIT', true);
    output += commandText(488, y - 11, 8, 'TOTAL', true);
    y -= 37;
  }

  const rowHeight = template.tableDensity === 'COMPACT' ? 22 : 27;
  if (template.showLineItems) items.forEach((item) => {
    const description = wrap(item.description || item.service && item.service.name || 'Item', 44)[0] || 'Item';
    output += commandText(LEFT + 8, y, 8.5, description);
    output += commandText(358, y, 8.5, Number(item.quantity || 1).toFixed(2).replace(/\.00$/, ''));
    output += commandText(407, y, 8.5, money(item.unitPrice || 0, localization));
    output += commandText(488, y, 8.5, money(item.lineTotal != null ? item.lineTotal : Number(item.quantity || 1) * Number(item.unitPrice || 0), localization));
    output += commandLine(LEFT, y - 8, RIGHT, y - 8, 0.45, 0.91);
    y -= rowHeight;
  });

  if (pageIndex === pageCount - 1) {
    let cursor = Math.max(y - 10, 220);
    const designedBlocks = Array.isArray(template.blocks) && template.blocks.length
      ? template.blocks.filter((item) => item && item.visible !== false && ['TOTALS', 'TERMS', 'PAYMENT_OPTIONS', 'ONLINE_PAYMENT', 'DISCLAIMER', 'SIGNATURES', 'FOOTER'].includes(item.type))
      : [];
    const fallbackBlocks = [];
    if (!designedBlocks.length) {
      if (template.showTotals) fallbackBlocks.push({ type: 'TOTALS', label: 'Summary', visible: true });
      if (template.showNotes) fallbackBlocks.push({ type: 'TERMS', label: kind === 'quote' ? 'Notes' : 'Terms', body: kind === 'quote' ? record.description : record.paymentPlanNotes, visible: true });
      if ((kind === 'invoice' || kind === 'contract') && template.showPaymentInstructions) fallbackBlocks.push(template.paymentOptions || { type: 'PAYMENT_OPTIONS', label: 'Payment options', body: localization && localization.paymentInstructions, visible: true });
      if (kind === 'invoice' && template.onlinePayment) fallbackBlocks.push(template.onlinePayment);
      if (template.disclaimer) fallbackBlocks.push(template.disclaimer);
      if (kind === 'contract' && template.signatures) fallbackBlocks.push(template.signatures);
      fallbackBlocks.push(template.footer || { type: 'FOOTER', body: localization && localization.invoiceFooter || branding && (branding.invoiceFooter || branding.invoiceTerms), visible: true });
    }
    const postBlocks = designedBlocks.length ? designedBlocks : fallbackBlocks;

    const drawHeading = (heading, atY, size = 8.5) => commandText(LEFT, atY, size, heading, true, darken(header.primary, 0.3));
    for (const section of postBlocks) {
      if (!section || section.visible === false || cursor < 68) continue;
      if (section.type === 'TOTALS') {
        const totals = [
          ['Subtotal', record.subtotal != null ? record.subtotal : record.amount || 0],
          ['Discount', record.discountTotal || 0],
          ...(template.showTax ? [[localization && localization.taxName || 'Tax', record.taxTotal || 0]] : []),
          ['Total', record.total != null ? record.total : record.contractValue != null ? record.contractValue : record.amount || 0]
        ];
        output += drawHeading(section.label || 'SUMMARY', cursor);
        cursor -= 20;
        totals.forEach(([label, value], index) => {
          const isTotal = index === totals.length - 1;
          if (isTotal) output += commandColorLine(350, cursor + 12, RIGHT, cursor + 12, 1.2, header.primary);
          output += commandText(355, cursor, isTotal ? 10.5 : 8.2, label, isTotal);
          output += commandText(472, cursor, isTotal ? 10.5 : 8.2, money(value, localization), isTotal);
          cursor -= isTotal ? 25 : 18;
        });
        cursor -= 6;
        continue;
      }

      if (section.type === 'TERMS') {
        const body = section.body || (kind === 'quote' ? record.description : kind === 'contract' ? record.description || record.notes : record.paymentPlanNotes);
        if (!body) continue;
        output += drawHeading(section.label || (kind === 'quote' ? 'NOTES' : 'TERMS'), cursor);
        cursor -= 17;
        const lines = wrap(body, 96).slice(0, 5);
        lines.forEach((line) => { output += commandText(LEFT, cursor, Math.max(6.8, template.bodySize - 1), line); cursor -= 11; });
        cursor -= 8;
        continue;
      }

      if (section.type === 'PAYMENT_OPTIONS' && (kind === 'invoice' || kind === 'contract')) {
        const legacyAccount = {
          label: 'Bank transfer',
          bankName: section.bankName,
          accountName: section.accountName,
          accountNumber: section.accountNumber,
          branchName: section.branchName,
          branchCode: section.branchCode,
          swiftCode: section.swiftCode
        };
        const accountHasDetails = (account) => [account.bankName, account.accountName, account.accountNumber, account.branchName, account.branchCode, account.swiftCode].some(Boolean);
        const configuredAccounts = Array.isArray(section.accounts) ? section.accounts.filter(accountHasDetails) : [];
        const accounts = configuredAccounts.length ? configuredAccounts : accountHasDetails(legacyAccount) ? [legacyAccount] : (Array.isArray(section.accounts) ? section.accounts : [legacyAccount]);
        const hasAccountDetails = accounts.some(accountHasDetails);
        const body = section.body || (!designedBlocks.length && localization && localization.paymentInstructions) || '';
        if (!hasAccountDetails && !body && !section.referenceRule) continue;
        output += commandRect(LEFT, cursor - 5, RIGHT - LEFT, 19, template.tableHeaderColor ? hexRgb(template.tableHeaderColor) : { r: 0.93, g: 0.95, b: 0.98 });
        output += commandText(LEFT + 7, cursor, 8.5, section.label || 'PAYMENT OPTIONS', true, darken(header.primary, 0.25));
        cursor -= 23;
        wrap(body, 96).slice(0, 3).forEach((line) => { output += commandText(LEFT, cursor, 7.2, line); cursor -= 10; });
        for (const account of accounts.slice(0, 4)) {
          const rows = [
            ['Bank', account.bankName],
            ['Account name', account.accountName],
            ['Account number', account.accountNumber],
            ['Branch', account.branchName],
            ['Branch code', account.branchCode],
            ['SWIFT code', account.swiftCode]
          ].filter((row) => row[1]);
          if (!rows.length || cursor < 96) continue;
          output += commandRect(LEFT, cursor - 4, RIGHT - LEFT, 16, template.accentColor ? hexRgb(template.accentColor) : { r: 0.96, g: 0.89, b: 0.42 });
          output += commandText(LEFT + 6, cursor, 7.3, account.label || 'Payment option', true, darken(header.primary, 0.25));
          cursor -= 18;
          for (const [rowLabel, value] of rows) {
            if (cursor < 78) break;
            output += commandStrokeRect(LEFT, cursor - 4, RIGHT - LEFT, 16, template.borderColor ? hexRgb(template.borderColor) : { r: 0.82, g: 0.86, b: 0.91 }, 0.45);
            output += commandText(LEFT + 6, cursor, 7.2, rowLabel, true);
            output += commandText(154, cursor, 7.2, value);
            cursor -= 16;
          }
        }
        if (section.referenceRule && cursor >= 72) {
          wrap(section.referenceRule, 94).slice(0, 2).forEach((line, index) => {
            if (cursor < 64) return;
            output += commandText(LEFT, cursor, 7.2, index === 0 ? `Reference: ${line}` : line, index === 0);
            cursor -= 10;
          });
        }
        cursor -= 8;
        continue;
      }

      if (section.type === 'ONLINE_PAYMENT' && kind === 'invoice') {
        const paymentUrl = section.urlMode === 'CUSTOM' ? section.customUrl : record.onlinePaymentUrl;
        if (!paymentUrl) continue;
        output += drawHeading(section.label || 'PAY ONLINE', cursor);
        cursor -= 16;
        wrap(`${section.buttonLabel || 'Make payment online'}: ${paymentUrl}`, 96).slice(0, 2).forEach((line) => { output += commandText(LEFT, cursor, 7.3, line, true, darken(header.primary, 0.15)); cursor -= 10; });
        cursor -= 8;
        continue;
      }

      if (section.type === 'DISCLAIMER') {
        if (!section.body) continue;
        output += drawHeading(section.label || 'IMPORTANT', cursor, 7.8);
        cursor -= 15;
        wrap(section.body, 105).slice(0, 5).forEach((line) => { output += commandText(LEFT, cursor, 6.5, line); cursor -= 9; });
        cursor -= 7;
        continue;
      }

      if (section.type === 'SIGNATURES' && kind === 'contract') {
        output += drawHeading(section.label || 'SIGNATURES', cursor);
        cursor -= 28;
        output += commandLine(LEFT, cursor, 250, cursor, 0.7, 0.5);
        output += commandLine(345, cursor, RIGHT, cursor, 0.7, 0.5);
        output += commandText(LEFT, cursor - 13, 7, section.leftLabel || 'For the company');
        output += commandText(345, cursor - 13, 7, section.rightLabel || 'For the customer');
        cursor -= 32;
        continue;
      }

      if (section.type === 'FOOTER') {
        const footer = section.body || localization && localization.invoiceFooter || branding && (branding.invoiceFooter || branding.invoiceTerms);
        if (!footer) continue;
        wrap(footer, 100).slice(0, 2).forEach((line) => { output += commandText(LEFT, Math.max(cursor, 42), 7, line, false, { r: 0.34, g: 0.39, b: 0.48 }); cursor -= 10; });
      }
    }
  }

  output += commandText(RIGHT - 54, 27, 7, `Page ${pageIndex + 1} of ${pageCount}`, false, { r: 0.4, g: 0.45, b: 0.54 });
  return output;
}

function streamObject(dictionary, data) {
  const body = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'ascii');
  return Buffer.concat([
    Buffer.from(`<< ${dictionary} /Length ${body.length} >>\nstream\n`, 'ascii'),
    body,
    Buffer.from('\nendstream', 'ascii')
  ]);
}

function assemblePdf(pageCommands, logoImage) {
  const objects = new Map();
  objects.set(1, Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'ascii'));
  objects.set(3, Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', 'ascii'));
  objects.set(4, Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>', 'ascii'));

  let nextId = 5;
  let imageId = null;
  if (logoImage) {
    imageId = nextId++;
    let maskId = null;
    if (logoImage.alpha) {
      maskId = nextId++;
      objects.set(maskId, streamObject(`/Type /XObject /Subtype /Image /Width ${logoImage.width} /Height ${logoImage.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, logoImage.alpha));
    }
    const smask = maskId ? ` /SMask ${maskId} 0 R` : '';
    objects.set(imageId, streamObject(`/Type /XObject /Subtype /Image /Width ${logoImage.width} /Height ${logoImage.height} /ColorSpace /${logoImage.colorSpace} /BitsPerComponent 8 /Filter /${logoImage.filter}${smask}`, logoImage.data));
  }

  const pageObjectIds = [];
  const contentObjectIds = [];
  pageCommands.forEach(() => {
    pageObjectIds.push(nextId++);
    contentObjectIds.push(nextId++);
  });
  objects.set(2, Buffer.from(`<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`, 'ascii'));
  pageCommands.forEach((commands, index) => {
    const xObject = imageId ? ` /XObject << /Logo ${imageId} 0 R >>` : '';
    objects.set(pageObjectIds[index], Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xObject} >> /Contents ${contentObjectIds[index]} 0 R >>`, 'ascii'));
    objects.set(contentObjectIds[index], streamObject('', Buffer.from(commands, 'ascii')));
  });

  const maxId = nextId - 1;
  const chunks = [Buffer.from('%PDF-1.4\n%RevEngine\n', 'ascii')];
  const offsets = [0];
  let length = chunks[0].length;
  for (let id = 1; id <= maxId; id += 1) {
    offsets[id] = length;
    const object = objects.get(id);
    if (!object) throw new Error(`Missing PDF object ${id}`);
    const chunk = Buffer.concat([Buffer.from(`${id} 0 obj\n`, 'ascii'), object, Buffer.from('\nendobj\n', 'ascii')]);
    chunks.push(chunk);
    length += chunk.length;
  }
  const xrefOffset = length;
  let trailer = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id += 1) trailer += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  trailer += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  chunks.push(Buffer.from(trailer, 'ascii'));
  return Buffer.concat(chunks);
}

function createBusinessDocumentPdf({ kind, record, company, branding, localization, logoImage }) {
  if (!['quote', 'invoice', 'contract'].includes(kind)) throw new TypeError('Document kind must be quote, invoice, or contract.');
  const allItems = lineItems(record || {});
  const template = normalizeTemplate(localization);
  const hasDetailedDesign = Array.isArray(template.blocks) && template.blocks.length > 0;
  const perPage = hasDetailedDesign ? (template.tableDensity === 'COMPACT' ? 7 : 5) : (template.tableDensity === 'COMPACT' ? 13 : 11);
  const chunks = [];
  for (let index = 0; index < allItems.length; index += perPage) chunks.push(allItems.slice(index, index + perPage));
  if (!chunks.length) chunks.push([]);
  const preparedLogo = template.showDocumentLogo ? prepareLogoImage(logoImage) : null;
  const pages = chunks.map((items, pageIndex) => buildPageCommands({ kind, record: record || {}, company: company || {}, branding: branding || {}, localization: localization || {}, items, pageIndex, pageCount: chunks.length, logoImage: preparedLogo }));
  return assemblePdf(pages, preparedLogo);
}

module.exports = {
  createBusinessDocumentPdf,
  normalizeTemplate,
  prepareLogoImage,
  decodePng,
  decodeJpeg
};
