'use strict';

const zlib = require('node:zlib');
const { cleanImportedPageAsset } = require('./importedDocumentRaster.service');

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

function pdfFontResource(fontFamily, bold, italic) {
  const family = String(fontFamily || '').toLowerCase();
  const isSans = /helvetica|arial|calibri|segoe|sans-serif/.test(family);
  const base = /courier|mono/.test(family) ? 'COURIER' : !isSans && /times|cambria|georgia|serif/.test(family) ? 'TIMES' : 'HELVETICA';
  if (base === 'TIMES') return bold && italic ? 'F8' : italic ? 'F7' : bold ? 'F6' : 'F5';
  if (base === 'COURIER') return bold && italic ? 'F12' : italic ? 'F11' : bold ? 'F10' : 'F9';
  return bold && italic ? 'F4' : italic ? 'F3' : bold ? 'F2' : 'F1';
}

function commandText(x, y, size, value, bold = false, color = { r: 0.055, g: 0.102, b: 0.184 }, options = {}) {
  const font = pdfFontResource(options.fontFamily, bold, options.italic === true);
  return `${color.r.toFixed(3)} ${color.g.toFixed(3)} ${color.b.toFixed(3)} rg BT /${font} ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET\n`;
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

function commandNamedImage(name, x, y, width, height) {
  const safeName = String(name || 'Image').replace(/[^A-Za-z0-9]/g, '') || 'Image';
  return `q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /${safeName} Do Q\n`;
}

function commandImage(x, y, width, height) {
  return commandNamedImage('Logo', x, y, width, height);
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

function fitText(value, maxCharacters) {
  const normalized = ascii(value);
  if (normalized.length <= maxCharacters) return normalized;
  return `${normalized.slice(0, Math.max(1, maxCharacters - 3)).trimEnd()}...`;
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
  const hasDetailedDesign = Boolean(design);
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
    hasDetailedDesign,
    showHeader: design ? design.header && design.header.visible !== false : input.documentHeaderVisible !== false,
    showPageNumbers: design ? design.page && design.page.showPageNumbers !== false : input.documentShowPageNumbers !== false,
    pageMargin: design && design.page && Number(design.page.margin) || 48,
    showDocumentLogo: design ? design.header && design.header.showLogo !== false : input.showDocumentLogo !== false,
    showLegalName: input.showLegalName !== false,
    showRegistrationNumber: input.showRegistrationNumber !== false,
    showTaxNumber: input.showTaxNumber !== false,
    showCompanyAddress: input.showCompanyAddress !== false,
    showCompanyEmail: input.showCompanyEmail !== false,
    showCompanyPhone: input.showCompanyPhone !== false,
    showCompanyWebsite: input.showCompanyWebsite !== false,
    showCustomerDetails: visible('CUSTOMER_DETAILS', !hasDetailedDesign),
    showDocumentDetails: visible('DOCUMENT_DETAILS', !hasDetailedDesign),
    showLineItems: visible('LINE_ITEMS', !hasDetailedDesign),
    showTotals: visible('TOTALS', !hasDetailedDesign),
    showTax: design ? visible('TOTALS', true) : input.showTax !== false,
    showPurchaseOrder: design ? visible('DOCUMENT_DETAILS', true) : input.showPurchaseOrder !== false,
    showNotes: design ? visible('TERMS', true) : input.showNotes !== false,
    showPaymentInstructions: design ? visible('PAYMENT_OPTIONS', true) : input.showPaymentInstructions !== false,
    primaryColor: design && design.theme && design.theme.primaryColor,
    accentColor: design && design.theme && design.theme.accentColor,
    textColor: design && design.theme && design.theme.textColor,
    mutedColor: design && design.theme && design.theme.mutedColor,
    tableHeaderColor: design && design.theme && design.theme.tableHeaderColor,
    borderColor: design && design.theme && design.theme.borderColor,
    bodySize: design && design.typography && Number(design.typography.bodySize) || 9,
    blocks,
    customerDetails: block('CUSTOMER_DETAILS'),
    documentDetails: block('DOCUMENT_DETAILS'),
    lineItemsBlock: block('LINE_ITEMS'),
    paymentOptions: block('PAYMENT_OPTIONS'),
    onlinePayment: block('ONLINE_PAYMENT'),
    terms: block('TERMS'),
    disclaimer: block('DISCLAIMER'),
    signatures: block('SIGNATURES'),
    footer: block('FOOTER'),
    contractBody: block('CONTRACT_BODY'),
    importedCanvas: design && design.importedCanvas || null
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

function renderCompanyDetailLines(x, startY, details, size = 8, gap = 12, color) {
  return details.map((value, index) => commandText(x, startY - index * gap, size, value, false, color)).join('');
}

function documentBounds(template) {
  const margin = Math.max(24, Math.min(72, Number(template && template.pageMargin) || 48));
  return {
    margin,
    left: margin,
    right: PAGE_WIDTH - margin,
    top: PAGE_HEIGHT - margin,
    bottom: margin,
    width: PAGE_WIDTH - margin * 2
  };
}

function companyDetailBottom(startY, details, gap = 12) {
  return details.length ? startY - (details.length - 1) * gap : startY;
}

function buildHeader({ kind, record, company, branding, localization, template, logoImage, bounds }) {
  const brand = branding || {};
  const page = bounds || documentBounds(template);
  const { left, right, top, bottom, width } = page;
  const primary = hexRgb(template.primaryColor || brand.primaryColor);
  const secondary = hexRgb(template.accentColor || brand.secondaryColor, '#263ff1');
  const textColor = hexRgb(template.textColor, '#0E1A2F');
  const mutedColor = hexRgb(template.mutedColor, '#60708A');
  const companyName = ascii(brand.brandName || company.tradingName || company.name || 'Company');
  const documentTitle = kind === 'quote' ? template.quoteLabel : kind === 'contract' ? template.contractLabel : template.invoiceLabel;
  const documentReference = record.number || record.contractNumber || (kind === 'quote' ? 'Quote' : kind === 'contract' ? 'Contract' : 'Invoice');
  const logoSize = { SMALL: 44, MEDIUM: 62, LARGE: 86 }[template.logoSize];
  const logoBoxWidth = logoSize * 1.7;
  const details = companyDetails(company, brand, localization, template, companyName);
  let output = '';
  let bodyStart = top - 100;

  if (!template.showHeader) return { output, bodyStart: top + 10, primary, secondary, textColor, mutedColor, bounds: page };

  if (template.template === 'MODERN') {
    output += commandRect(0, PAGE_HEIGHT - 18, PAGE_WIDTH, 18, primary);
    if (template.headerStyle === 'STACKED') {
      const logoX = template.logoPosition === 'RIGHT' ? right - logoBoxWidth : left;
      const nameY = top - logoSize - 12;
      const detailStartY = nameY - 18;
      output += drawLogoOrInitials({ x: logoX, y: top - logoSize + 4, size: logoSize, companyName, primary, logoImage, showLogo: template.showDocumentLogo, logoPosition: template.logoPosition });
      output += commandText(left, nameY, 18, fitText(companyName, 38), true, textColor);
      output += renderCompanyDetailLines(left, detailStartY, details, Math.max(7, template.bodySize - 1), 12, mutedColor);
      const stackedMetaX = template.logoPosition === 'RIGHT' ? left + width * 0.5 : left + width * 0.68;
      output += commandText(stackedMetaX, top - 4, 19, documentTitle, true, darken(primary));
      output += commandText(stackedMetaX, top - 27, 10, documentReference, true, textColor);
      output += commandText(stackedMetaX, top - 44, 8, `Status: ${String(record.status || 'DRAFT').replace(/_/g, ' ')}`, false, mutedColor);
      bodyStart = Math.min(top - logoSize - 86, companyDetailBottom(detailStartY, details) - 26);
    } else {
      const logoX = template.logoPosition === 'RIGHT' ? right - logoBoxWidth : left;
      const identityX = template.logoPosition === 'RIGHT' ? left : left + (template.showDocumentLogo ? logoBoxWidth + 12 : 0);
      const detailStartY = top - 21;
      output += drawLogoOrInitials({ x: logoX, y: top - logoSize + 4, size: logoSize, companyName, primary, logoImage, showLogo: template.showDocumentLogo, logoPosition: template.logoPosition });
      output += commandText(identityX, top - 2, template.headerStyle === 'COMPACT' ? 15 : logoSize >= 80 ? 15 : 18, fitText(companyName, logoSize >= 80 ? 24 : 31), true, textColor);
      output += renderCompanyDetailLines(identityX, detailStartY, details, template.headerStyle === 'COMPACT' ? 7.5 : Math.max(7, template.bodySize - 1), 12, mutedColor);
      const metaX = template.logoPosition === 'RIGHT' ? left + width * 0.52 : left + width * 0.75;
      output += commandText(metaX, top - 2, 19, documentTitle, true, darken(primary));
      output += commandText(metaX, top - 26, 10, documentReference, true, textColor);
      output += commandText(metaX, top - 43, 8, `Status: ${String(record.status || 'DRAFT').replace(/_/g, ' ')}`, false, mutedColor);
      const defaultBodyStart = template.headerStyle === 'COMPACT' ? top - 68 : top - 82;
      bodyStart = Math.min(defaultBodyStart, companyDetailBottom(detailStartY, details) - 26);
    }
    output += commandColorLine(left, bodyStart + 12, right, bodyStart + 12, 2, secondary);
  } else if (template.template === 'CLASSIC') {
    output += commandStrokeRect(left - 12, bottom - 10, right - left + 24, top - bottom + 44, primary, 1.2);
    const logoX = template.logoPosition === 'RIGHT' ? right - logoBoxWidth : left;
    const identityX = template.logoPosition === 'RIGHT' ? left : left + (template.showDocumentLogo ? logoBoxWidth + 12 : 0);
    const detailStartY = top - 21;
    output += drawLogoOrInitials({ x: logoX, y: top - logoSize + 2, size: logoSize, companyName, primary, logoImage, showLogo: template.showDocumentLogo, logoPosition: template.logoPosition });
    output += commandText(identityX, top - 1, logoSize >= 80 ? 15 : 18, fitText(companyName, logoSize >= 80 ? 24 : 31), true, textColor);
    output += renderCompanyDetailLines(identityX, detailStartY, details, Math.max(7, template.bodySize - 1), 12, mutedColor);
    const classicMetaX = template.logoPosition === 'RIGHT' ? left + width * 0.52 : left + width * 0.71;
    output += commandText(classicMetaX, top - 2, 18, documentTitle, true, darken(primary));
    output += commandText(classicMetaX, top - 25, 10, documentReference, true, textColor);
    output += commandText(classicMetaX, top - 42, 8, `Status: ${String(record.status || 'DRAFT').replace(/_/g, ' ')}`, false, mutedColor);
    bodyStart = Math.min(top - 82, companyDetailBottom(detailStartY, details) - 26);
    output += commandLine(left, bodyStart + 12, right, bodyStart + 12, 1, 0.7);
  } else {
    const logoX = template.logoPosition === 'RIGHT' ? right - logoBoxWidth : left;
    const identityX = template.logoPosition === 'RIGHT' ? left : left + (template.showDocumentLogo ? logoBoxWidth + 12 : 0);
    const detailStartY = top - 21;
    output += drawLogoOrInitials({ x: logoX, y: top - logoSize + 2, size: logoSize, companyName, primary, logoImage, showLogo: template.showDocumentLogo, logoPosition: template.logoPosition });
    output += commandText(identityX, top - 1, logoSize >= 80 ? 14 : 16, fitText(companyName, logoSize >= 80 ? 25 : 34), true, textColor);
    output += renderCompanyDetailLines(identityX, detailStartY, details, 7.5, 12, mutedColor);
    const minimalMetaX = template.logoPosition === 'RIGHT' ? left + width * 0.53 : left + width * 0.72;
    output += commandText(minimalMetaX, top - 1, 17, documentTitle, true, textColor);
    output += commandText(minimalMetaX, top - 23, 9, documentReference, true, textColor);
    bodyStart = Math.min(top - 62, companyDetailBottom(detailStartY, details) - 22);
    output += commandColorLine(left, bodyStart + 10, right, bodyStart + 10, 1.5, primary);
  }

  return { output, bodyStart, primary, secondary, textColor, mutedColor, bounds: page };
}

function buildPageCommands({ kind, record, company, branding, localization, items, pageIndex, pageCount, logoImage }) {
  const template = normalizeTemplate(localization);
  const bounds = documentBounds(template);
  const { left, right, bottom, width } = bounds;
  const header = buildHeader({ kind, record, company, branding, localization, template, logoImage, bounds });
  const textColor = header.textColor;
  const mutedColor = header.mutedColor;
  const bodySize = Math.max(7, Math.min(12, Number(template.bodySize) || 9));
  const smallText = Math.max(6.8, bodySize - 1);
  const headingSize = Math.max(8, bodySize);
  const metaLabelX = left + width * 0.62;
  const metaValueX = left + width * 0.77;
  const qtyX = left + width * 0.61;
  const unitX = left + width * 0.72;
  const totalX = left + width * 0.88;
  const totalsLabelX = left + width * 0.62;
  const totalsValueX = left + width * 0.84;
  let output = header.output;
  let y = header.bodyStart - 18;

  if (template.showCustomerDetails) {
    const customerHeading = template.customerDetails && template.customerDetails.label || (kind === 'contract' ? 'Customer' : 'Bill to');
    output += commandText(left, y, headingSize, customerHeading.toUpperCase(), true, darken(header.primary, 0.3));
    output += commandText(left, y - 20, bodySize + 3, customerName(record), true, textColor);
    wrap(customerContact(record), Math.max(38, Math.round(width / 8))).slice(0, 2).forEach((line, index) => {
      output += commandText(left, y - 39 - index * 14, smallText, line, false, mutedColor);
    });
  }

  const meta = kind === 'quote'
    ? [['Created', dateLabel(record.createdAt)], ['Valid until', dateLabel(record.validUntil)]]
    : kind === 'contract'
      ? [['Starts', dateLabel(record.startDate)], ['Ends', dateLabel(record.endDate)], ['Status', String(record.status || 'DRAFT').replace(/_/g, ' ')]]
      : [['Issued', dateLabel(record.createdAt)], ['Due', dateLabel(record.dueDate)], ...(template.showPurchaseOrder && record.purchaseOrderNumber ? [['Customer PO', record.purchaseOrderNumber]] : [])];
  if (template.showDocumentDetails) {
    const detailsHeading = template.documentDetails && template.documentDetails.label || 'Document details';
    output += commandText(metaLabelX, y, headingSize, detailsHeading.toUpperCase(), true, darken(header.primary, 0.3));
    meta.forEach(([itemLabel, value], index) => {
      output += commandText(metaLabelX, y - 20 - index * 18, smallText, `${itemLabel}:`, true, textColor);
      output += commandText(metaValueX, y - 20 - index * 18, smallText, value, false, textColor);
    });
  }

  y -= 96;
  if (kind === 'contract' && template.contractBody && template.contractBody.visible !== false && template.contractBody.body) {
    output += commandText(left, y, headingSize, template.contractBody.label || 'AGREEMENT', true, darken(header.primary, 0.3));
    const contractLines = wrap(template.contractBody.body, Math.max(64, Math.round(width / 5.3))).slice(0, 8);
    contractLines.forEach((line, index) => { output += commandText(left, y - 18 - index * 13, smallText, line, false, textColor); });
    y -= Math.max(50, Math.min(8, contractLines.length) * 13 + 30);
  }

  const tableHeaderColor = template.tableHeaderColor ? hexRgb(template.tableHeaderColor) : template.template === 'MINIMAL' ? { r: 1, g: 1, b: 1 } : { r: 0.94, g: 0.955, b: 0.98 };
  const configuredColumns = template.lineItemsBlock && Array.isArray(template.lineItemsBlock.columns) ? template.lineItemsBlock.columns : [];
  const columnLabels = [
    configuredColumns[0] || (kind === 'contract' ? 'SERVICE' : 'DESCRIPTION'),
    configuredColumns[1] || 'QTY',
    configuredColumns[2] || 'UNIT',
    configuredColumns[3] || 'TOTAL'
  ];
  if (template.showLineItems) {
    if (template.lineItemsBlock && template.lineItemsBlock.label) {
      output += commandText(left, y, headingSize, template.lineItemsBlock.label.toUpperCase(), true, darken(header.primary, 0.3));
      y -= 20;
    }
    if (template.template === 'MINIMAL') {
      output += commandColorLine(left, y + 5, right, y + 5, 1.2, header.primary);
      output += commandLine(left, y - 18, right, y - 18, 0.55, 0.72);
    } else {
      output += commandRect(left, y - 18, right - left, 25, tableHeaderColor);
      if (template.template === 'CLASSIC') output += commandStrokeRect(left, y - 18, right - left, 25, header.primary, 0.7);
    }
    output += commandText(left + 8, y - 11, smallText, columnLabels[0], true, textColor);
    output += commandText(qtyX, y - 11, smallText, columnLabels[1], true, textColor);
    output += commandText(unitX, y - 11, smallText, columnLabels[2], true, textColor);
    output += commandText(totalX, y - 11, smallText, columnLabels[3], true, textColor);
    y -= 37;
  }

  const rowHeight = template.tableDensity === 'COMPACT' ? 22 : 27;
  if (template.showLineItems) items.forEach((item) => {
    const description = wrap(item.description || item.service && item.service.name || 'Item', Math.max(30, Math.round(width / 11)))[0] || 'Item';
    output += commandText(left + 8, y, bodySize - 0.5, description, false, textColor);
    output += commandText(qtyX + 3, y, bodySize - 0.5, Number(item.quantity || 1).toFixed(2).replace(/\.00$/, ''), false, textColor);
    output += commandText(unitX, y, bodySize - 0.5, money(item.unitPrice || 0, localization), false, textColor);
    output += commandText(totalX, y, bodySize - 0.5, money(item.lineTotal != null ? item.lineTotal : Number(item.quantity || 1) * Number(item.unitPrice || 0), localization), false, textColor);
    output += commandLine(left, y - 8, right, y - 8, 0.45, 0.91);
    y -= rowHeight;
  });

  if (pageIndex === pageCount - 1) {
    let cursor = Math.max(y - 10, bottom + 168);
    const designedBlocks = Array.isArray(template.blocks)
      ? template.blocks.filter((item) => item && item.visible !== false && ['TOTALS', 'TERMS', 'PAYMENT_OPTIONS', 'ONLINE_PAYMENT', 'DISCLAIMER', 'SIGNATURES', 'FOOTER'].includes(item.type))
      : [];
    const fallbackBlocks = [];
    if (!template.hasDetailedDesign) {
      if (template.showTotals) fallbackBlocks.push({ type: 'TOTALS', label: 'Summary', visible: true });
      if (template.showNotes) fallbackBlocks.push({ type: 'TERMS', label: kind === 'quote' ? 'Notes' : 'Terms', body: kind === 'quote' ? record.description : record.paymentPlanNotes, visible: true });
      if ((kind === 'invoice' || kind === 'contract') && template.showPaymentInstructions) fallbackBlocks.push(template.paymentOptions || { type: 'PAYMENT_OPTIONS', label: 'Payment options', body: localization && localization.paymentInstructions, visible: true });
      if (kind === 'invoice' && template.onlinePayment) fallbackBlocks.push(template.onlinePayment);
      if (template.disclaimer) fallbackBlocks.push(template.disclaimer);
      if (kind === 'contract' && template.signatures) fallbackBlocks.push(template.signatures);
      fallbackBlocks.push(template.footer || { type: 'FOOTER', body: localization && localization.invoiceFooter || branding && (branding.invoiceFooter || branding.invoiceTerms), visible: true });
    }
    const postBlocks = template.hasDetailedDesign ? designedBlocks : fallbackBlocks;

    const drawHeading = (heading, atY, size = headingSize - 0.5) => commandText(left, atY, size, heading, true, darken(header.primary, 0.3));
    for (const section of postBlocks) {
      if (!section || section.visible === false || cursor < bottom + 16) continue;
      if (section.type === 'TOTALS') {
        const totals = [
          ['Subtotal', record.subtotal != null ? record.subtotal : record.amount || 0],
          ['Discount', record.discountTotal || 0],
          ...(template.showTax ? [[localization && localization.taxName || 'Tax', record.taxTotal || 0]] : []),
          ['Total', record.total != null ? record.total : record.contractValue != null ? record.contractValue : record.amount || 0]
        ];
        output += drawHeading(section.label || 'SUMMARY', cursor);
        cursor -= 20;
        totals.forEach(([itemLabel, value], index) => {
          const isTotal = index === totals.length - 1;
          if (isTotal) output += commandColorLine(totalsLabelX - 5, cursor + 12, right, cursor + 12, 1.2, header.primary);
          output += commandText(totalsLabelX, cursor, isTotal ? bodySize + 1.5 : smallText, itemLabel, isTotal, textColor);
          output += commandText(totalsValueX, cursor, isTotal ? bodySize + 1.5 : smallText, money(value, localization), isTotal, textColor);
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
        const lines = wrap(body, Math.max(64, Math.round(width / 5.2))).slice(0, 5);
        lines.forEach((line) => { output += commandText(left, cursor, smallText, line, false, textColor); cursor -= 11; });
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
        output += commandRect(left, cursor - 5, right - left, 19, template.tableHeaderColor ? hexRgb(template.tableHeaderColor) : { r: 0.93, g: 0.95, b: 0.98 });
        output += commandText(left + 7, cursor, headingSize - 0.5, section.label || 'PAYMENT OPTIONS', true, darken(header.primary, 0.25));
        cursor -= 23;
        wrap(body, Math.max(64, Math.round(width / 5.2))).slice(0, 3).forEach((line) => { output += commandText(left, cursor, Math.max(7, bodySize - 1.5), line, false, textColor); cursor -= 10; });
        const rowsForAccount = (account) => [
          ['Bank', account.bankName],
          ['Account name', account.accountName],
          ['Account number', account.accountNumber],
          ['Branch', account.branchName],
          ['Branch code', account.branchCode],
          ['SWIFT code', account.swiftCode]
        ].filter((row) => row[1]);
        if (section.accountLayout === 'COLUMNS' && accounts.length > 1) {
          const columnGap = 8;
          const columnWidth = (width - columnGap) / 2;
          const accountColumns = accounts.slice(0, 4);
          for (let accountIndex = 0; accountIndex < accountColumns.length; accountIndex += 2) {
            const pair = accountColumns.slice(accountIndex, accountIndex + 2).map((account) => ({ account, rows: rowsForAccount(account) }));
            const rowCount = Math.max(...pair.map((item) => item.rows.length), 0);
            if (!rowCount || cursor < bottom + 44) continue;
            pair.forEach((item, columnIndex) => {
              const columnLeft = left + columnIndex * (columnWidth + columnGap);
              output += commandRect(columnLeft, cursor - 4, columnWidth, 16, template.accentColor ? hexRgb(template.accentColor) : { r: 0.96, g: 0.89, b: 0.42 });
              output += commandText(columnLeft + 6, cursor, Math.max(7, bodySize - 1.7), fitText(item.account.label || 'Payment option', 34), true, darken(header.primary, 0.25));
            });
            cursor -= 18;
            for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
              if (cursor < bottom + 26) break;
              pair.forEach((item, columnIndex) => {
                const row = item.rows[rowIndex];
                if (!row) return;
                const columnLeft = left + columnIndex * (columnWidth + columnGap);
                output += commandStrokeRect(columnLeft, cursor - 4, columnWidth, 16, template.borderColor ? hexRgb(template.borderColor) : { r: 0.82, g: 0.86, b: 0.91 }, 0.45);
                output += commandText(columnLeft + 5, cursor, Math.max(6.5, bodySize - 2), fitText(row[0], 17), true, textColor);
                output += commandText(columnLeft + Math.min(78, columnWidth * 0.35), cursor, Math.max(6.5, bodySize - 2), fitText(row[1], 25), false, textColor);
              });
              cursor -= 16;
            }
          }
        } else {
          for (const account of accounts.slice(0, 4)) {
            const rows = rowsForAccount(account);
            if (!rows.length || cursor < bottom + 44) continue;
            output += commandRect(left, cursor - 4, right - left, 16, template.accentColor ? hexRgb(template.accentColor) : { r: 0.96, g: 0.89, b: 0.42 });
            output += commandText(left + 6, cursor, Math.max(7, bodySize - 1.7), account.label || 'Payment option', true, darken(header.primary, 0.25));
            cursor -= 18;
            for (const [rowLabel, value] of rows) {
              if (cursor < bottom + 26) break;
              output += commandStrokeRect(left, cursor - 4, right - left, 16, template.borderColor ? hexRgb(template.borderColor) : { r: 0.82, g: 0.86, b: 0.91 }, 0.45);
              output += commandText(left + 6, cursor, Math.max(7, bodySize - 1.8), rowLabel, true, textColor);
              output += commandText(left + Math.min(116, width * 0.23), cursor, Math.max(7, bodySize - 1.8), value, false, textColor);
              cursor -= 16;
            }
          }
        }
        if (section.referenceRule && cursor >= bottom + 20) {
          wrap(section.referenceRule, Math.max(64, Math.round(width / 5.2))).slice(0, 2).forEach((line, index) => {
            if (cursor < bottom + 12) return;
            output += commandText(left, cursor, Math.max(7, bodySize - 1.8), index === 0 ? `Reference: ${line}` : line, index === 0, textColor);
            cursor -= 10;
          });
        }
        cursor -= 8;
        continue;
      }

      if (section.type === 'ONLINE_PAYMENT' && kind === 'invoice') {
        const paymentUrl = section.urlMode === 'CUSTOM' ? section.customUrl : record.onlinePaymentUrl;
        const instructions = section.body || '';
        if (!paymentUrl && !instructions && !section.buttonLabel) continue;
        output += drawHeading(section.label || 'PAY ONLINE', cursor);
        cursor -= 16;
        wrap(instructions, Math.max(64, Math.round(width / 5.2))).slice(0, 5).forEach((line) => { output += commandText(left, cursor, Math.max(7, bodySize - 1.8), line, false, textColor); cursor -= 10; });
        if (paymentUrl) {
          wrap(`${section.buttonLabel || 'Make payment online'}: ${paymentUrl}`, Math.max(64, Math.round(width / 5.2))).slice(0, 2).forEach((line) => { output += commandText(left, cursor, Math.max(7, bodySize - 1.7), line, true, darken(header.primary, 0.15)); cursor -= 10; });
        } else if (section.buttonLabel && !instructions.includes(section.buttonLabel)) {
          output += commandText(left, cursor, Math.max(7, bodySize - 1.7), section.buttonLabel, true, darken(header.primary, 0.15));
          cursor -= 10;
        }
        cursor -= 8;
        continue;
      }

      if (section.type === 'DISCLAIMER') {
        if (!section.body) continue;
        output += drawHeading(section.label || 'IMPORTANT', cursor, Math.max(7.5, bodySize - 1));
        cursor -= 15;
        wrap(section.body, Math.max(70, Math.round(width / 4.8))).slice(0, 5).forEach((line) => { output += commandText(left, cursor, Math.max(6.5, bodySize - 2.5), line, false, textColor); cursor -= 9; });
        cursor -= 7;
        continue;
      }

      if (section.type === 'SIGNATURES' && kind === 'contract') {
        output += drawHeading(section.label || 'SIGNATURES', cursor);
        cursor -= 28;
        const leftSignatureEnd = left + width * 0.39;
        const rightSignatureStart = left + width * 0.59;
        output += commandLine(left, cursor, leftSignatureEnd, cursor, 0.7, 0.5);
        output += commandLine(rightSignatureStart, cursor, right, cursor, 0.7, 0.5);
        output += commandText(left, cursor - 13, Math.max(7, bodySize - 2), section.leftLabel || 'For the company', false, textColor);
        output += commandText(rightSignatureStart, cursor - 13, Math.max(7, bodySize - 2), section.rightLabel || 'For the customer', false, textColor);
        cursor -= 32;
        continue;
      }

      if (section.type === 'FOOTER') {
        const footer = section.body || localization && localization.invoiceFooter || branding && (branding.invoiceFooter || branding.invoiceTerms);
        if (!footer) continue;
        wrap(footer, Math.max(68, Math.round(width / 5))).slice(0, 2).forEach((line) => { output += commandText(left, Math.max(cursor, bottom - 10), Math.max(7, bodySize - 2), line, false, mutedColor); cursor -= 10; });
      }
    }
  }

  if (template.showPageNumbers) output += commandText(right - 54, Math.max(20, bottom - 25), 7, `Page ${pageIndex + 1} of ${pageCount}`, false, mutedColor);
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

function assemblePdf(pageCommands, logoImage, options = {}) {
  const objects = new Map();
  objects.set(1, Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'ascii'));
  const fonts = [
    'Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique', 'Helvetica-BoldOblique',
    'Times-Roman', 'Times-Bold', 'Times-Italic', 'Times-BoldItalic',
    'Courier', 'Courier-Bold', 'Courier-Oblique', 'Courier-BoldOblique'
  ];
  fonts.forEach((font, index) => objects.set(index + 3, Buffer.from(`<< /Type /Font /Subtype /Type1 /BaseFont /${font} >>`, 'ascii')));

  let nextId = 15;
  const imageObjects = new Map();
  const addImage = (name, image) => {
    if (!image || imageObjects.has(name)) return;
    const imageId = nextId++;
    let maskId = null;
    if (image.alpha) {
      maskId = nextId++;
      objects.set(maskId, streamObject(`/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, image.alpha));
    }
    const smask = maskId ? ` /SMask ${maskId} 0 R` : '';
    objects.set(imageId, streamObject(`/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /${image.colorSpace} /BitsPerComponent 8 /Filter /${image.filter}${smask}`, image.data));
    imageObjects.set(name, imageId);
  };
  addImage('Logo', logoImage);
  for (const entry of options.extraImages || []) addImage(entry.name, entry.image);

  const pageObjectIds = [];
  const contentObjectIds = [];
  pageCommands.forEach(() => {
    pageObjectIds.push(nextId++);
    contentObjectIds.push(nextId++);
  });
  objects.set(2, Buffer.from(`<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`, 'ascii'));
  pageCommands.forEach((commands, index) => {
    const pageSpec = options.pageSpecs && options.pageSpecs[index] || { width: PAGE_WIDTH, height: PAGE_HEIGHT };
    const xObject = imageObjects.size
      ? ` /XObject << ${Array.from(imageObjects.entries()).map(([name, id]) => `/${name} ${id} 0 R`).join(' ')} >>`
      : '';
    const fontResources = fonts.map((font, fontIndex) => `/F${fontIndex + 1} ${fontIndex + 3} 0 R`).join(' ');
    objects.set(pageObjectIds[index], Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageSpec.width} ${pageSpec.height}] /Resources << /Font << ${fontResources} >>${xObject} >> /Contents ${contentObjectIds[index]} 0 R >>`, 'ascii'));
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

function importedBindingValue(binding, context) {
  const { kind, record, company, branding, localization } = context;
  const customer = record && record.customer || {};
  const items = lineItems(record || {});
  const companyName = branding && branding.brandName || company.tradingName || company.name || '';
  const values = {
    COMPANY_NAME: companyName,
    COMPANY_LEGAL_NAME: company.legalName || companyName,
    COMPANY_ADDRESS: company.address || '',
    COMPANY_EMAIL: branding && branding.supportEmail || company.email || '',
    COMPANY_PHONE: branding && branding.supportPhone || company.phone || '',
    COMPANY_WEBSITE: branding && branding.websiteUrl || '',
    COMPANY_REGISTRATION: company.registrationNumber || '',
    COMPANY_TAX: company.taxNumber || '',
    CUSTOMER_NAME: customerName(record),
    CUSTOMER_CONTACT: customerContact(record),
    CUSTOMER_EMAIL: customer.email || '',
    CUSTOMER_PHONE: customer.phone || '',
    CUSTOMER_ADDRESS: customer.address || '',
    DOCUMENT_TITLE: kind === 'quote' ? 'QUOTE' : kind === 'contract' ? 'CONTRACT' : 'INVOICE',
    DOCUMENT_NUMBER: record.number || record.contractNumber || '',
    DOCUMENT_STATUS: record.status || '',
    DOCUMENT_ISSUE_DATE: dateLabel(record.createdAt || record.issuedAt || record.startDate),
    DOCUMENT_DUE_DATE: dateLabel(kind === 'quote' ? record.validUntil : kind === 'contract' ? record.endDate : record.dueDate),
    DOCUMENT_PO: record.purchaseOrderNumber || '',
    TOTAL_SUBTOTAL: money(record.subtotal != null ? record.subtotal : record.amount || 0, localization),
    TOTAL_DISCOUNT: money(record.discountTotal || 0, localization),
    TOTAL_TAX: money(record.taxTotal || 0, localization),
    TOTAL_TOTAL: money(record.total != null ? record.total : record.contractValue != null ? record.contractValue : record.amount || 0, localization),
    PAYMENT_REFERENCE: record.number || record.contractNumber || ''
  };
  const itemMatch = String(binding || '').match(/^ITEM_(\d+)_(DESCRIPTION|QTY|UNIT|TOTAL)$/);
  if (itemMatch) {
    const item = items[Number(itemMatch[1]) - 1] || {};
    if (itemMatch[2] === 'DESCRIPTION') return item.description || item.title || item.service && item.service.name || '';
    if (itemMatch[2] === 'QTY') return item.quantity == null ? '' : String(Number(item.quantity).toFixed(2).replace(/\.00$/, ''));
    if (itemMatch[2] === 'UNIT') return money(item.unitPrice || 0, localization);
    return money(item.lineTotal != null ? item.lineTotal : Number(item.quantity || 0) * Number(item.unitPrice || 0), localization);
  }
  return values[binding] == null ? '' : String(values[binding]);
}

function isImportedBinding(binding) {
  const value = String(binding || '').toUpperCase();
  return [
    'COMPANY_NAME', 'COMPANY_LEGAL_NAME', 'COMPANY_ADDRESS', 'COMPANY_EMAIL', 'COMPANY_PHONE', 'COMPANY_WEBSITE', 'COMPANY_REGISTRATION', 'COMPANY_TAX',
    'CUSTOMER_NAME', 'CUSTOMER_CONTACT', 'CUSTOMER_EMAIL', 'CUSTOMER_PHONE', 'CUSTOMER_ADDRESS',
    'DOCUMENT_TITLE', 'DOCUMENT_NUMBER', 'DOCUMENT_STATUS', 'DOCUMENT_ISSUE_DATE', 'DOCUMENT_DUE_DATE', 'DOCUMENT_PO',
    'TOTAL_SUBTOTAL', 'TOTAL_DISCOUNT', 'TOTAL_TAX', 'TOTAL_TOTAL', 'PAYMENT_REFERENCE'
  ].includes(value) || /^ITEM_[1-8]_(DESCRIPTION|QTY|UNIT|TOTAL)$/.test(value);
}

function interpolateImportedText(value, context) {
  return String(value || '').replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/gi, (token, binding) => {
    const normalized = String(binding || '').toUpperCase();
    return isImportedBinding(normalized) ? importedBindingValue(normalized, context) : token;
  });
}

function fittedImportedFontSize(value, width, preferred) {
  const text = ascii(value);
  if (!text) return Math.max(4, preferred);
  const estimated = text.length * preferred * 0.52;
  if (estimated <= width) return preferred;
  return Math.max(4, Math.min(preferred, width / Math.max(1, text.length * 0.52)));
}

function createImportedCanvasPdf({ kind, record, company, branding, localization, logoImage, importedAssets, template }) {
  const canvas = template.importedCanvas;
  const preparedLogo = prepareLogoImage(logoImage);
  const extraImages = [];
  const pageSpecs = [];
  const commands = [];
  const assetMap = importedAssets && typeof importedAssets === 'object' ? importedAssets : {};
  for (const [index, page] of canvas.pages.entries()) {
    const asset = assetMap[page.backgroundAsset];
    const cleanedAsset = asset && asset.buffer
      ? { ...asset, buffer: cleanImportedPageAsset(asset.buffer, page) }
      : null;
    const prepared = cleanedAsset ? prepareLogoImage(cleanedAsset) : null;
    if (!prepared) throw new Error('An imported document page is missing. Convert the original document again.');
    const imageName = `BG${index + 1}`;
    extraImages.push({ name: imageName, image: prepared });
    pageSpecs.push({ width: page.width, height: page.height });
    let output = commandNamedImage(imageName, 0, 0, page.width, page.height);
    for (const element of page.textElements || []) {
      const binding = String(element.binding || 'STATIC').toUpperCase();
      const x = Number(element.x || 0);
      const top = Number(element.y || 0);
      const boxWidth = Number(element.width || 1);
      const boxHeight = Number(element.height || 1);
      const y = page.height - top - boxHeight;
      if (element.hidden) continue;
      const context = { kind, record, company, branding, localization };
      const value = binding === 'STATIC' ? interpolateImportedText(element.text, context) : importedBindingValue(binding, context);
      if (!value) continue;
      const size = Math.max(4, Number(element.fontSize || 9));
      const estimatedWidth = ascii(value).length * size * 0.52;
      const align = String(element.align || 'LEFT').toUpperCase();
      const textX = align === 'RIGHT' ? x + boxWidth - estimatedWidth : align === 'CENTER' ? x + (boxWidth - estimatedWidth) / 2 : x;
      const baseline = y + Math.max(1, (boxHeight - size) * 0.42);
      output += commandText(
        Math.max(0, textX),
        baseline,
        size,
        value,
        element.bold === true,
        hexRgb(element.textColor, '#111827'),
        { fontFamily: element.fontFamily, italic: element.italic === true }
      );
    }
    const pageLogos = (Array.isArray(canvas.logos) && canvas.logos.length ? canvas.logos : canvas.logo ? [canvas.logo] : [])
      .filter((logo) => Number(logo.page || 1) === Number(page.pageNumber));
    for (const logo of pageLogos) {
      if (logo.mode === 'ORIGINAL') continue;
      const logoX = Number(logo.x || 0);
      const logoWidth = Number(logo.width || 1);
      const logoHeight = Number(logo.height || 1);
      const logoY = page.height - Number(logo.y || 0) - logoHeight;
      output += commandRect(logoX - 1, logoY - 1, logoWidth + 2, logoHeight + 2, hexRgb(logo.backgroundColor, '#FFFFFF'));
      if (logo.mode === 'COMPANY' && preparedLogo) {
        const inset = Math.max(2, Math.min(8, Math.min(logoWidth, logoHeight) * 0.04));
        const availableWidth = Math.max(1, logoWidth - (inset * 2));
        const availableHeight = Math.max(1, logoHeight - (inset * 2));
        const ratio = preparedLogo.width / preparedLogo.height;
        const boxRatio = availableWidth / availableHeight;
        const width = ratio >= boxRatio ? availableWidth : availableHeight * ratio;
        const height = ratio >= boxRatio ? availableWidth / ratio : availableHeight;
        output += commandImage(logoX + inset + (availableWidth - width) / 2, logoY + inset + (availableHeight - height) / 2, width, height);
      }
    }
    commands.push(output);
  }
  return assemblePdf(commands, preparedLogo, { extraImages, pageSpecs });
}

function createBusinessDocumentPdf({ kind, record, company, branding, localization, logoImage, importedAssets }) {
  if (!['quote', 'invoice', 'contract'].includes(kind)) throw new TypeError('Document kind must be quote, invoice, or contract.');
  const template = normalizeTemplate(localization);
  if (template.importedCanvas && Array.isArray(template.importedCanvas.pages) && template.importedCanvas.pages.length) {
    return createImportedCanvasPdf({ kind, record: record || {}, company: company || {}, branding: branding || {}, localization: localization || {}, logoImage, importedAssets, template });
  }
  const allItems = lineItems(record || {});
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
