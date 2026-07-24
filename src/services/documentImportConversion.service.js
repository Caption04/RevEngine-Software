'use strict';

const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { starterDesign, normalizeDesign } = require('./documentTemplate.service');

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const PDF_TYPE = 'application/pdf';
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function cleanText(value) {
  return String(value == null ? '' : value)
    .replace(/\u0000/g, '')
    .replace(/\r/g, '\n')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n[ ]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function xmlDecode(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function decodePdfLiteral(value) {
  let output = '';
  const input = String(value || '');
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character !== '\\') {
      output += character;
      continue;
    }
    const next = input[++index];
    if (next == null) break;
    const mapped = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }[next];
    if (mapped !== undefined) {
      output += mapped;
      continue;
    }
    if (/[0-7]/.test(next)) {
      let octal = next;
      while (octal.length < 3 && index + 1 < input.length && /[0-7]/.test(input[index + 1])) octal += input[++index];
      output += String.fromCharCode(Number.parseInt(octal, 8));
      continue;
    }
    if (next === '\n') continue;
    if (next === '\r') {
      if (input[index + 1] === '\n') index += 1;
      continue;
    }
    output += next;
  }
  return output;
}

function decodePdfHex(value) {
  const normalized = String(value || '').replace(/\s+/g, '');
  if (!normalized) return '';
  const even = normalized.length % 2 ? `${normalized}0` : normalized;
  const buffer = Buffer.from(even, 'hex');
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    let output = '';
    for (let index = 2; index + 1 < buffer.length; index += 2) output += String.fromCharCode(buffer.readUInt16BE(index));
    return output;
  }
  return buffer.toString('latin1');
}

function tokenizePdfContent(content) {
  const tokens = [];
  let index = 0;
  const input = Buffer.isBuffer(content) ? content.toString('latin1') : String(content || '');
  while (index < input.length) {
    const character = input[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === '%') {
      while (index < input.length && input[index] !== '\n' && input[index] !== '\r') index += 1;
      continue;
    }
    if (character === '(') {
      let depth = 1;
      let value = '';
      index += 1;
      while (index < input.length && depth > 0) {
        const current = input[index++];
        if (current === '\\') {
          value += current;
          if (index < input.length) value += input[index++];
          continue;
        }
        if (current === '(') depth += 1;
        else if (current === ')') {
          depth -= 1;
          if (depth === 0) break;
        }
        value += current;
      }
      tokens.push({ type: 'string', value: decodePdfLiteral(value) });
      continue;
    }
    if (character === '<' && input[index + 1] !== '<') {
      const end = input.indexOf('>', index + 1);
      if (end < 0) break;
      tokens.push({ type: 'string', value: decodePdfHex(input.slice(index + 1, end)) });
      index = end + 1;
      continue;
    }
    if (character === '[' || character === ']') {
      tokens.push({ type: character, value: character });
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < input.length && !/\s/.test(input[end]) && !'()<>[]%'.includes(input[end])) end += 1;
    const raw = input.slice(index, end);
    const number = Number(raw);
    tokens.push(Number.isFinite(number) && raw !== '' ? { type: 'number', value: number } : { type: 'operator', value: raw });
    index = end;
  }
  return tokens;
}

function parsePdfContent(content) {
  const tokens = tokenizePdfContent(content);
  const elements = [];
  const colors = [];
  const stack = [];
  let array = null;
  let inText = false;
  let x = 0;
  let y = 0;
  let fontSize = 10;
  let fill = [0, 0, 0];

  const pushText = (value) => {
    const text = cleanText(value);
    if (!text) return;
    elements.push({ text, x, y, fontSize, color: fill.slice() });
    x += text.length * fontSize * 0.48;
  };

  for (const token of tokens) {
    if (token.type === '[') {
      array = [];
      continue;
    }
    if (token.type === ']') {
      stack.push({ type: 'array', value: array || [] });
      array = null;
      continue;
    }
    if (array) {
      array.push(token);
      continue;
    }
    if (token.type !== 'operator') {
      stack.push(token);
      continue;
    }
    const operator = token.value;
    if (operator === 'BT') {
      inText = true;
      stack.length = 0;
      continue;
    }
    if (operator === 'ET') {
      inText = false;
      stack.length = 0;
      continue;
    }
    if (operator === 'rg' && stack.length >= 3) {
      const values = stack.splice(-3).map((item) => Number(item.value));
      if (values.every(Number.isFinite)) {
        fill = values.map((item) => Math.max(0, Math.min(1, item)));
        colors.push(fill.slice());
      }
      stack.length = 0;
      continue;
    }
    if (!inText) {
      stack.length = 0;
      continue;
    }
    if (operator === 'Tf' && stack.length >= 2) {
      const size = Number(stack[stack.length - 1].value);
      if (Number.isFinite(size) && size > 0) fontSize = size;
    } else if (operator === 'Tm' && stack.length >= 6) {
      const matrix = stack.splice(-6).map((item) => Number(item.value));
      if (matrix.every(Number.isFinite)) {
        x = matrix[4];
        y = matrix[5];
      }
    } else if ((operator === 'Td' || operator === 'TD') && stack.length >= 2) {
      const dy = Number(stack.pop().value);
      const dx = Number(stack.pop().value);
      if (Number.isFinite(dx)) x += dx;
      if (Number.isFinite(dy)) y += dy;
    } else if (operator === 'T*') {
      y -= fontSize * 1.2;
      x = 0;
    } else if (operator === 'Tj' && stack.length) {
      const value = stack.pop();
      if (value.type === 'string') pushText(value.value);
    } else if (operator === 'TJ' && stack.length) {
      const value = stack.pop();
      if (value.type === 'array') value.value.filter((item) => item.type === 'string').forEach((item) => pushText(item.value));
    } else if (operator === "'" && stack.length) {
      y -= fontSize * 1.2;
      x = 0;
      const value = stack.pop();
      if (value.type === 'string') pushText(value.value);
    } else if (operator === '"' && stack.length) {
      const value = stack.pop();
      y -= fontSize * 1.2;
      x = 0;
      if (value.type === 'string') pushText(value.value);
    }
    stack.length = 0;
  }
  return { elements, colors };
}

function inflatePdfStream(dictionary, data) {
  if (!/\/FlateDecode\b/.test(dictionary)) return data;
  try {
    return zlib.inflateSync(data);
  } catch {
    try {
      return zlib.inflateRawSync(data);
    } catch {
      return null;
    }
  }
}

function extractPdf(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('The selected PDF is not valid.');
  const source = buffer.toString('latin1');
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const elements = [];
  const colors = [];
  let match;
  while ((match = streamPattern.exec(source))) {
    const dictionaryStart = source.lastIndexOf('<<', match.index);
    const dictionaryEnd = source.lastIndexOf('>>', match.index);
    const dictionary = dictionaryStart >= 0 && dictionaryEnd >= dictionaryStart ? source.slice(dictionaryStart, dictionaryEnd + 2) : '';
    if (/\/Subtype\s*\/Image\b/.test(dictionary)) continue;
    const raw = Buffer.from(match[1], 'latin1');
    const decoded = inflatePdfStream(dictionary, raw);
    if (!decoded) continue;
    const parsed = parsePdfContent(decoded);
    elements.push(...parsed.elements);
    colors.push(...parsed.colors);
  }

  const sorted = elements
    .filter((item) => item.text && /[A-Za-z0-9]/.test(item.text))
    .sort((left, right) => {
      const yDifference = right.y - left.y;
      return Math.abs(yDifference) > Math.max(2, Math.min(left.fontSize, right.fontSize) * 0.55) ? yDifference : left.x - right.x;
    });
  const lines = [];
  for (const item of sorted) {
    const previous = lines[lines.length - 1];
    const tolerance = Math.max(2.5, item.fontSize * 0.65);
    if (previous && Math.abs(previous.y - item.y) <= tolerance) {
      previous.items.push(item);
      previous.text = cleanText(previous.items.sort((a, b) => a.x - b.x).map((part) => part.text).join(' '));
      previous.fontSize = Math.max(previous.fontSize, item.fontSize);
    } else {
      lines.push({ text: item.text, x: item.x, y: item.y, fontSize: item.fontSize, items: [item] });
    }
  }
  const internalText = cleanText(lines.map((line) => line.text).join('\n'));
  let externalText = '';
  try {
    const converted = spawnSync('pdftotext', ['-layout', '-', '-'], {
      input: buffer,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      timeout: 12000,
      windowsHide: true
    });
    if (!converted.error && converted.status === 0) externalText = cleanText(converted.stdout);
  } catch {
    externalText = '';
  }
  const internalLetters = (internalText.match(/[A-Za-z]/g) || []).length;
  const externalLetters = (externalText.match(/[A-Za-z]/g) || []).length;
  const useExternal = externalLetters >= 40;
  const text = useExternal ? externalText : internalText;
  return { text, lines, colors, pageCount: Math.max(1, (source.match(/\/Type\s*\/Page\b/g) || []).length), usedPdftotext: useExternal };
}

function unzipEntry(buffer, wantedName) {
  const signature = 0x02014b50;
  let offset = 0;
  while (offset + 46 <= buffer.length) {
    const next = buffer.indexOf(Buffer.from('PK\x01\x02', 'binary'), offset);
    if (next < 0 || next + 46 > buffer.length) break;
    const compression = buffer.readUInt16LE(next + 10);
    const compressedSize = buffer.readUInt32LE(next + 20);
    const fileNameLength = buffer.readUInt16LE(next + 28);
    const extraLength = buffer.readUInt16LE(next + 30);
    const commentLength = buffer.readUInt16LE(next + 32);
    const localOffset = buffer.readUInt32LE(next + 42);
    const fileName = buffer.toString('utf8', next + 46, next + 46 + fileNameLength);
    if (fileName === wantedName) {
      if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('The Word document archive is damaged.');
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const data = buffer.subarray(start, start + compressedSize);
      if (compression === 0) return data;
      if (compression === 8) return zlib.inflateRawSync(data);
      throw new Error('This Word document uses an unsupported compression method.');
    }
    offset = next + 46 + fileNameLength + extraLength + commentLength;
  }
  return null;
}

function extractDocx(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) throw new Error('The selected Word document is not valid.');
  const documentXml = unzipEntry(buffer, 'word/document.xml');
  if (!documentXml) throw new Error('The Word document does not contain readable document content.');
  const xml = documentXml.toString('utf8');
  const paragraphs = [];
  const paragraphPattern = /<w:p\b[\s\S]*?<\/w:p>/gi;
  let match;
  while ((match = paragraphPattern.exec(xml))) {
    const paragraph = match[0];
    const parts = [];
    const textPattern = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gi;
    let textMatch;
    while ((textMatch = textPattern.exec(paragraph))) parts.push(xmlDecode(textMatch[1]));
    const text = cleanText(parts.join(''));
    if (!text) continue;
    const styleMatch = paragraph.match(/<w:pStyle[^>]*w:val="([^"]+)"/i);
    const alignMatch = paragraph.match(/<w:jc[^>]*w:val="([^"]+)"/i);
    const bold = /<w:b(?:\s*\/|\b[^>]*>)/i.test(paragraph);
    paragraphs.push({ text, style: styleMatch ? styleMatch[1] : '', alignment: alignMatch ? alignMatch[1] : '', bold });
  }
  return { text: cleanText(paragraphs.map((item) => item.text).join('\n')), paragraphs, pageCount: 1, colors: [] };
}

function rgbToHex(color) {
  if (!Array.isArray(color) || color.length !== 3) return null;
  return `#${color.map((item) => Math.round(Math.max(0, Math.min(1, item)) * 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function colorSaturation(color) {
  const max = Math.max(...color);
  const min = Math.min(...color);
  return max === 0 ? 0 : (max - min) / max;
}

function inferredColors(colors) {
  const counted = new Map();
  for (const color of colors || []) {
    if (!Array.isArray(color) || color.length !== 3 || color.some((item) => !Number.isFinite(item))) continue;
    if (colorSaturation(color) < 0.18) continue;
    const hex = rgbToHex(color);
    counted.set(hex, (counted.get(hex) || 0) + 1);
  }
  const ranked = Array.from(counted.entries()).sort((a, b) => b[1] - a[1]).map(([hex]) => hex);
  const brightness = (hex) => {
    const value = hex.slice(1);
    return (Number.parseInt(value.slice(0, 2), 16) * 299 + Number.parseInt(value.slice(2, 4), 16) * 587 + Number.parseInt(value.slice(4, 6), 16) * 114) / 1000;
  };
  const primary = ranked.slice().sort((a, b) => brightness(a) - brightness(b))[0] || null;
  const accent = ranked.find((item) => item !== primary && brightness(item) > brightness(primary || '#000000') + 45) || ranked.find((item) => item !== primary) || null;
  return { primary, accent };
}

function findAll(text, pattern) {
  const values = [];
  const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  let match;
  while ((match = regex.exec(text))) {
    values.push(cleanText(match[1] || match[0]));
    if (match.index === regex.lastIndex) regex.lastIndex += 1;
  }
  return values.filter(Boolean);
}

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function sectionBody(lines, headingPattern, stopPatterns) {
  const start = lines.findIndex((line) => headingPattern.test(line));
  if (start < 0) return '';
  const output = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (stopPatterns.some((pattern) => pattern.test(line))) break;
    output.push(line);
  }
  return cleanText(output.join('\n'));
}

function extractDisclaimer(text, lines) {
  const start = lines.findIndex((line) => /^(?:Given the rise in cybercrime|Before making (?:any )?payment|Payment disclaimer|Important payment notice)/i.test(line));
  if (start >= 0) {
    const output = [];
    for (let index = start; index < Math.min(lines.length, start + 18); index += 1) {
      const line = lines[index];
      if (index > start && /^(?:Page\s*\|?\s*\d+|Fee Statement|Invoice|Quote|Contract|Student Number|Creation Date)$/i.test(line)) break;
      output.push(line);
    }
    const known = cleanText(output.join('\n'));
    if (known.length >= 40) return known.slice(0, 1800);
  }
  return sectionBody(lines, /^(?:important|payment warning|fraud warning|disclaimer)/i, [/^(?:footer|signatures?|terms|total|summary)$/i]).slice(0, 1800);
}

function extractPaymentAccounts(text) {
  const accountNumbers = findAll(text, /Account\s*(?:Number|No\.?)[\s:|-]*([0-9][0-9 -]{4,30})/gi);
  const banks = [];
  for (const line of cleanText(text).split('\n')) {
    const bankingPattern = /(?:Banking Details|Bank Name)[\s:|-]*([A-Za-z][A-Za-z0-9 &.'-]*?)(?=\s+(?:Banking Details|Bank Name)\b|$)/gi;
    let match;
    while ((match = bankingPattern.exec(line))) banks.push(cleanText(match[1]));
    const simple = line.match(/^Bank\s*:[\s]*([A-Za-z][A-Za-z0-9 &.'-]{2,80})$/i);
    if (simple) banks.push(cleanText(simple[1]));
  }
  const branchCodes = findAll(text, /Branch\s*Code[\s:|-]*([A-Za-z0-9 -]{2,30}?)(?=\s+Branch\s*Code\b|\n|$)/gi);
  const swiftCodes = findAll(text, /(?:SWIFT|BIC)\s*(?:Code)?[\s:|-]*([A-Za-z0-9]{6,15})/gi);
  const labels = [];
  for (const pattern of [/Self[- ]funded Payments?/gi, /Sponsor Payments?/gi, /Bank transfer/gi, /Card Payments?/gi, /Mobile money/gi]) labels.push(...findAll(text, pattern));
  const length = Math.min(4, Math.max(accountNumbers.length, banks.length, branchCodes.length, swiftCodes.length));
  const accounts = [];
  for (let index = 0; index < length; index += 1) {
    accounts.push({
      id: `payment-account-${index + 1}`,
      label: labels[index] || (index === 0 ? 'Bank transfer' : `Payment option ${index + 1}`),
      bankName: banks[index] || banks[0] || '',
      accountName: '',
      accountNumber: accountNumbers[index] || '',
      branchName: '',
      branchCode: branchCodes[index] || branchCodes[0] || '',
      swiftCode: swiftCodes[index] || swiftCodes[0] || ''
    });
  }
  return accounts;
}

function inferDynamicFields(text, documentType) {
  const checks = [
    ['customer.name', /customer|client|student name|bill to/i],
    ['document.number', /invoice number|quote number|contract number|student number|reference number/i],
    ['document.issueDate', /issued|creation date|statement date/i],
    ['document.dueDate', /due date|valid until|bill from/i],
    ['lineItems', /description|unit code|quantity|qty|amount|charges/i],
    ['totals.total', /total due|grand total|balance due|total/i],
    ['payment.reference', /reference number|payment reference/i],
    ['signatures', /signature|signed by/i]
  ];
  const fields = checks.filter(([, pattern]) => pattern.test(text)).map(([field]) => field);
  if (documentType === 'CONTRACT' && !fields.includes('signatures')) fields.push('signatures');
  return fields;
}

function convertExtractedToDesign({ extracted, documentType, sourceFormat, fileName }) {
  const text = cleanText(extracted.text);
  const lines = text.split('\n').map(cleanText).filter(Boolean);
  const letterCount = (text.match(/[A-Za-z]/g) || []).length;
  const design = starterDesign(documentType, 'PROFESSIONAL');
  const warnings = [];
  const colors = inferredColors(extracted.colors);
  if (colors.primary) design.theme.primaryColor = colors.primary;
  if (colors.accent) design.theme.accentColor = colors.accent;

  const sizes = (extracted.lines || extracted.paragraphs || []).map((item) => Number(item.fontSize)).filter((item) => Number.isFinite(item) && item > 4 && item < 40);
  if (sizes.length) {
    sizes.sort((a, b) => a - b);
    const median = sizes[Math.floor(sizes.length / 2)];
    design.typography.bodySize = Math.max(7, Math.min(12, Math.round(median)));
  }

  if (letterCount < 40) {
    const blank = starterDesign(documentType, 'BLANK');
    blank.importAnalysis = {
      sourceFormat,
      fileName,
      pageCount: extracted.pageCount || 1,
      status: 'NEEDS_REVIEW',
      quality: 'LOW',
      extractedText: text.slice(0, 24000),
      detectedFields: [],
      warnings: ['No reliable text layer was found. This may be a scanned document or image. Rebuild it manually or upload a searchable PDF or DOCX file.'],
      convertedAt: new Date().toISOString()
    };
    return { design: normalizeDesign(blank, documentType), status: 'NEEDS_REVIEW', warnings: blank.importAnalysis.warnings };
  }

  const customer = design.blocks.find((block) => block.type === 'CUSTOMER_DETAILS');
  const details = design.blocks.find((block) => block.type === 'DOCUMENT_DETAILS');
  const items = design.blocks.find((block) => block.type === 'LINE_ITEMS');
  const totals = design.blocks.find((block) => block.type === 'TOTALS');
  const payment = design.blocks.find((block) => block.type === 'PAYMENT_OPTIONS');
  const online = design.blocks.find((block) => block.type === 'ONLINE_PAYMENT');
  const terms = design.blocks.find((block) => block.type === 'TERMS');
  const disclaimer = design.blocks.find((block) => block.type === 'DISCLAIMER');
  const contractBody = design.blocks.find((block) => block.type === 'CONTRACT_BODY');

  const heading = lines.find((line) => /invoice|quote|contract|agreement|statement/i.test(line));
  if (heading && details) details.label = heading.replace(/[^A-Za-z0-9 &/-]/g, '').slice(0, 80) || details.label;
  if (customer) {
    const customerHeading = lines.find((line) => /^(?:bill to|customer|client|student details?|account holder)/i.test(line));
    if (customerHeading) customer.label = customerHeading.slice(0, 80);
  }
  if (items) {
    const itemHeading = lines.find((line) => /^(?:items?|services?|charges?|transaction details?|fee details?|description)/i.test(line));
    if (itemHeading) items.label = itemHeading.slice(0, 80);
  }
  if (totals) {
    const summaryHeading = lines.find((line) => /^(?:summary|amount due|totals?|fees summary)/i.test(line));
    if (summaryHeading) totals.label = summaryHeading.slice(0, 80);
  }

  const accounts = extractPaymentAccounts(text);
  if (payment && accounts.length) {
    payment.accounts = accounts;
    payment.accountLayout = accounts.length > 1 ? 'COLUMNS' : 'STACKED';
  }
  if (payment) {
    const paymentHeading = lines.find((line) => /^payment (?:options?|details?|methods?)/i.test(line));
    if (paymentHeading) payment.label = paymentHeading.slice(0, 80);
    const reference = lines.find((line) => /reference (?:number|no\.?|must|use)/i.test(line));
    if (reference) payment.referenceRule = documentType === 'INVOICE'
      ? 'Use the invoice number as the payment reference.'
      : documentType === 'QUOTE'
        ? 'Use the quote number as the payment reference.'
        : 'Use the contract number as the payment reference.';
  }

  const onlineHeading = lines.find((line) => /online payment|pay online|make an online payment/i.test(line));
  if (online && onlineHeading) {
    online.label = /online payment/i.test(onlineHeading) ? 'Online payments' : 'Pay online';
    const actionLine = lines.find((line) => /make an online payment|pay now|click here/i.test(line));
    online.buttonLabel = (actionLine || onlineHeading).slice(0, 80);
    online.body = sectionBody(lines, /^online payments?$/i, [/^(?:Given the rise in cybercrime|Before making (?:any )?payment|Important payment notice|Payment disclaimer|Fee Statement|Page\s*\|?\s*\d+)/i]).slice(0, 1200);
    const url = text.match(/https?:\/\/[^\s)]+/i);
    if (url) {
      online.urlMode = 'CUSTOM';
      online.customUrl = url[0].slice(0, 1000);
    }
  }

  const disclaimerText = extractDisclaimer(text, lines);
  if (disclaimer && disclaimerText) disclaimer.body = disclaimerText;
  else if (documentType === 'INVOICE') warnings.push('No payment disclaimer was detected. Add or review one before publishing.');

  const termsBody = sectionBody(lines, /^(?:terms(?: and conditions)?|conditions|notes)$/i, [/^(?:payment options?|signatures?|footer|total|summary)$/i]);
  if (terms && termsBody) terms.body = termsBody.slice(0, 6000);

  if (documentType === 'CONTRACT' && contractBody) {
    const body = sectionBody(lines, /^(?:agreement|contract|scope|services|background|purpose)/i, [/^(?:terms(?: and conditions)?|signatures?|payment options?)/i]);
    contractBody.body = (body || text).slice(0, 6000);
  }

  const footer = design.blocks.find((block) => block.type === 'FOOTER');
  if (footer && !/thank you|kind regards|footer/i.test(text)) footer.visible = false;

  if (sourceFormat === 'PDF') warnings.push('PDF conversion preserves detected structure, text, colours, and payment details, but complex positioning should be reviewed.');
  if (sourceFormat === 'DOCX') warnings.push('Word content was converted into editable sections. Review tables, page breaks, and custom fonts before publishing.');

  design.importAnalysis = {
    sourceFormat,
    fileName,
    pageCount: extracted.pageCount || 1,
    status: 'CONVERTED_WITH_WARNINGS',
    quality: letterCount > 250 ? 'GOOD' : 'FAIR',
    extractedText: text.slice(0, 24000),
    detectedFields: inferDynamicFields(text, documentType),
    warnings,
    convertedAt: new Date().toISOString()
  };
  return { design: normalizeDesign(design, documentType), status: 'CONVERTED_WITH_WARNINGS', warnings };
}

function importFormat(mimeType, fileName) {
  if (mimeType === PDF_TYPE || String(fileName || '').toLowerCase().endsWith('.pdf')) return 'PDF';
  if (mimeType === DOCX_TYPE || String(fileName || '').toLowerCase().endsWith('.docx')) return 'DOCX';
  if (IMAGE_TYPES.has(mimeType)) return 'IMAGE';
  return 'UNKNOWN';
}

function convertImportedDocument({ buffer, mimeType, fileName, documentType }) {
  const format = importFormat(mimeType, fileName);
  if (format === 'IMAGE') {
    const design = starterDesign(documentType, 'BLANK');
    design.importAnalysis = {
      sourceFormat: 'IMAGE',
      fileName,
      pageCount: 1,
      status: 'NEEDS_REVIEW',
      quality: 'LOW',
      extractedText: '',
      detectedFields: [],
      warnings: ['Images are not recommended for reusable templates because they do not contain an editable text layer. Upload a searchable PDF or DOCX file when possible.'],
      convertedAt: new Date().toISOString()
    };
    return { design: normalizeDesign(design, documentType), status: 'NEEDS_REVIEW', warnings: design.importAnalysis.warnings };
  }
  if (format === 'PDF') return convertExtractedToDesign({ extracted: extractPdf(buffer), documentType, sourceFormat: 'PDF', fileName });
  if (format === 'DOCX') return convertExtractedToDesign({ extracted: extractDocx(buffer), documentType, sourceFormat: 'DOCX', fileName });
  throw new Error('Import a searchable PDF, DOCX, PNG, JPG, or WEBP file.');
}

module.exports = {
  DOCX_TYPE,
  IMAGE_TYPES,
  PDF_TYPE,
  cleanText,
  convertExtractedToDesign,
  convertImportedDocument,
  extractDocx,
  extractPdf,
  importFormat,
  tokenizePdfContent,
  unzipEntry
};
