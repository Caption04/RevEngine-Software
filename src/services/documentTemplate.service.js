'use strict';

const crypto = require('node:crypto');

const DOCUMENT_TYPES = ['QUOTE', 'INVOICE', 'CONTRACT'];
const SOURCE_TYPES = ['STARTER', 'BLANK', 'IMPORTED'];
const STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED', 'DELETED'];

const IMPORTED_BINDINGS = [
  'STATIC',
  'COMPANY_NAME', 'COMPANY_LEGAL_NAME', 'COMPANY_ADDRESS', 'COMPANY_EMAIL', 'COMPANY_PHONE', 'COMPANY_WEBSITE', 'COMPANY_REGISTRATION', 'COMPANY_TAX',
  'CUSTOMER_NAME', 'CUSTOMER_CONTACT', 'CUSTOMER_EMAIL', 'CUSTOMER_PHONE', 'CUSTOMER_ADDRESS',
  'DOCUMENT_TITLE', 'DOCUMENT_NUMBER', 'DOCUMENT_STATUS', 'DOCUMENT_ISSUE_DATE', 'DOCUMENT_DUE_DATE', 'DOCUMENT_PO',
  'TOTAL_SUBTOTAL', 'TOTAL_DISCOUNT', 'TOTAL_TAX', 'TOTAL_TOTAL', 'PAYMENT_REFERENCE',
  ...Array.from({ length: 8 }, (_, index) => [
    `ITEM_${index + 1}_DESCRIPTION`, `ITEM_${index + 1}_QTY`, `ITEM_${index + 1}_UNIT`, `ITEM_${index + 1}_TOTAL`
  ]).flat()
];

const BLOCK_TYPES = [
  'CUSTOMER_DETAILS',
  'DOCUMENT_DETAILS',
  'LINE_ITEMS',
  'TOTALS',
  'PAYMENT_OPTIONS',
  'ONLINE_PAYMENT',
  'TERMS',
  'DISCLAIMER',
  'SIGNATURES',
  'FOOTER',
  'CONTRACT_BODY'
];

function text(value, max = 5000) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function color(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toUpperCase() : fallback;
}

function oneOf(value, allowed, fallback) {
  const normalized = String(value || '').toUpperCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function bool(value, fallback = true) {
  return value === undefined || value === null ? fallback : Boolean(value);
}

function number(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function blockId(type) {
  return `${String(type || 'block').toLowerCase()}-${crypto.randomUUID().slice(0, 8)}`;
}

function defaultBlock(type, documentType) {
  const blocks = {
    CUSTOMER_DETAILS: { label: 'Bill to', visible: true },
    DOCUMENT_DETAILS: { label: documentType === 'CONTRACT' ? 'Agreement details' : 'Document details', visible: true },
    LINE_ITEMS: { label: documentType === 'CONTRACT' ? 'Services included' : 'Items', visible: documentType !== 'CONTRACT', columns: ['DESCRIPTION', 'QTY', 'UNIT', 'TOTAL'] },
    TOTALS: { label: 'Summary', visible: documentType !== 'CONTRACT' },
    PAYMENT_OPTIONS: { label: 'Payment options', visible: documentType === 'INVOICE', body: '', accounts: [{ label: 'Bank transfer', bankName: '', accountName: '', accountNumber: '', branchName: '', branchCode: '', swiftCode: '' }], bankName: '', accountName: '', accountNumber: '', branchName: '', branchCode: '', swiftCode: '', referenceRule: 'Use the invoice number as the payment reference.' },
    ONLINE_PAYMENT: { label: 'Pay online', visible: documentType === 'INVOICE', buttonLabel: 'Make payment online', urlMode: 'AUTO', customUrl: '' },
    TERMS: { label: documentType === 'CONTRACT' ? 'Terms and conditions' : 'Terms', visible: documentType !== 'INVOICE', body: '' },
    DISCLAIMER: { label: 'Important payment notice', visible: documentType === 'INVOICE', body: 'Before making payment, confirm that the payment details match the details issued by this company. We will not communicate a change in bank details by email or instant message without separate verification.' },
    SIGNATURES: { label: 'Signatures', visible: documentType === 'CONTRACT', leftLabel: 'For the company', rightLabel: 'For the customer' },
    FOOTER: { label: 'Footer', visible: true, body: 'Thank you for choosing us.' },
    CONTRACT_BODY: { label: 'Agreement', visible: documentType === 'CONTRACT', body: 'This agreement records the services, responsibilities, payment terms, and service period accepted by both parties.' }
  };
  const base = blocks[type] || { label: type.replace(/_/g, ' '), visible: true };
  return { id: blockId(type), type, ...base };
}

function blockOrder(documentType) {
  if (documentType === 'CONTRACT') return ['CUSTOMER_DETAILS', 'DOCUMENT_DETAILS', 'CONTRACT_BODY', 'TERMS', 'PAYMENT_OPTIONS', 'DISCLAIMER', 'SIGNATURES', 'FOOTER'];
  if (documentType === 'QUOTE') return ['CUSTOMER_DETAILS', 'DOCUMENT_DETAILS', 'LINE_ITEMS', 'TOTALS', 'TERMS', 'FOOTER'];
  return ['CUSTOMER_DETAILS', 'DOCUMENT_DETAILS', 'LINE_ITEMS', 'TOTALS', 'PAYMENT_OPTIONS', 'ONLINE_PAYMENT', 'DISCLAIMER', 'FOOTER'];
}

function starterDesign(documentType = 'INVOICE', variant = 'PROFESSIONAL') {
  const type = oneOf(documentType, DOCUMENT_TYPES, 'INVOICE');
  const chosen = oneOf(variant, ['PROFESSIONAL', 'CLASSIC', 'MINIMAL', 'BLANK'], 'PROFESSIONAL');
  const isBlank = chosen === 'BLANK';
  const theme = chosen === 'CLASSIC'
    ? { primaryColor: '#17365D', accentColor: '#D6A900', textColor: '#13213C', mutedColor: '#5B6574', borderColor: '#7C8797', tableHeaderColor: '#E4D39A' }
    : chosen === 'MINIMAL'
      ? { primaryColor: '#111827', accentColor: '#111827', textColor: '#111827', mutedColor: '#6B7280', borderColor: '#D1D5DB', tableHeaderColor: '#FFFFFF' }
      : isBlank
        ? { primaryColor: '#111827', accentColor: '#D1D5DB', textColor: '#111827', mutedColor: '#6B7280', borderColor: '#E5E7EB', tableHeaderColor: '#F9FAFB' }
        : { primaryColor: '#1D65BC', accentColor: '#FFE386', textColor: '#11213D', mutedColor: '#60708A', borderColor: '#D8E1EE', tableHeaderColor: '#EDF4FC' };
  const included = isBlank ? [] : blockOrder(type);
  return normalizeDesign({
    version: 1,
    variant: chosen,
    page: { size: 'A4', orientation: 'PORTRAIT', margin: chosen === 'MINIMAL' ? 56 : 42, showPageNumbers: !isBlank },
    typography: { fontFamily: chosen === 'CLASSIC' ? 'HELVETICA_CONDENSED' : 'HELVETICA', bodySize: chosen === 'MINIMAL' ? 8 : 9, headingScale: chosen === 'CLASSIC' ? 1.25 : 1.15 },
    theme,
    header: {
      visible: !isBlank,
      layout: chosen === 'MINIMAL' ? 'COMPACT' : chosen === 'CLASSIC' ? 'STACKED' : 'SPLIT',
      logoPosition: chosen === 'CLASSIC' ? 'RIGHT' : 'LEFT',
      logoSize: chosen === 'MINIMAL' ? 'SMALL' : chosen === 'CLASSIC' ? 'LARGE' : 'MEDIUM',
      showLogo: !isBlank,
      showLegalName: !isBlank,
      showRegistrationNumber: !isBlank,
      showTaxNumber: !isBlank,
      showAddress: !isBlank,
      showEmail: !isBlank,
      showPhone: !isBlank,
      showWebsite: !isBlank
    },
    blocks: included.map((item) => defaultBlock(item, type))
  }, type);
}

function normalizePaymentAccount(account, index) {
  const source = account && typeof account === 'object' ? account : {};
  return {
    id: text(source.id, 80) || `payment-account-${index + 1}`,
    label: text(source.label, 100) || `Payment option ${index + 1}`,
    bankName: text(source.bankName, 160),
    accountName: text(source.accountName, 160),
    accountNumber: text(source.accountNumber, 120),
    branchName: text(source.branchName, 160),
    branchCode: text(source.branchCode, 80),
    swiftCode: text(source.swiftCode, 80)
  };
}

function normalizeImportAnalysis(input) {
  if (!input || typeof input !== 'object') return null;
  const allowedStatuses = ['CONVERTED', 'CONVERTED_WITH_WARNINGS', 'EXACT_LAYOUT', 'NEEDS_REVIEW', 'REVIEWED'];
  const allowedQualities = ['GOOD', 'FAIR', 'LOW'];
  return {
    sourceFormat: oneOf(input.sourceFormat, ['PDF', 'DOCX', 'IMAGE'], 'PDF'),
    fileName: text(input.fileName, 240),
    pageCount: number(input.pageCount, 1, 1, 500),
    status: oneOf(input.status, allowedStatuses, 'NEEDS_REVIEW'),
    quality: oneOf(input.quality, allowedQualities, 'LOW'),
    extractedText: text(input.extractedText, 24000),
    detectedFields: Array.isArray(input.detectedFields) ? input.detectedFields.map((item) => text(item, 80)).filter(Boolean).slice(0, 40) : [],
    warnings: Array.isArray(input.warnings) ? input.warnings.map((item) => text(item, 500)).filter(Boolean).slice(0, 12) : [],
    convertedAt: text(input.convertedAt, 80)
  };
}

function normalizeBlock(block, documentType) {
  const type = oneOf(block && block.type, BLOCK_TYPES, 'FOOTER');
  const fallback = defaultBlock(type, documentType);
  const columns = Array.isArray(block && block.columns)
    ? block.columns.map((item) => text(item, 30).toUpperCase()).filter(Boolean).slice(0, 4)
    : fallback.columns;
  const accountSource = Array.isArray(block && block.accounts)
    ? block.accounts
    : block && [block.bankName, block.accountName, block.accountNumber, block.branchName, block.branchCode, block.swiftCode].some(Boolean)
      ? [{ label: 'Bank transfer', bankName: block.bankName, accountName: block.accountName, accountNumber: block.accountNumber, branchName: block.branchName, branchCode: block.branchCode, swiftCode: block.swiftCode }]
      : fallback.accounts;
  return {
    ...fallback,
    ...(block || {}),
    id: text(block && block.id, 80) || fallback.id,
    type,
    label: text(block && block.label, 80) || fallback.label,
    visible: bool(block && block.visible, fallback.visible),
    body: text(block && block.body, 6000),
    columns,
    accounts: Array.isArray(accountSource) ? accountSource.slice(0, 4).map(normalizePaymentAccount) : [],
    accountLayout: oneOf(block && block.accountLayout, ['STACKED', 'COLUMNS'], 'STACKED'),
    bankName: text(block && block.bankName, 160),
    accountName: text(block && block.accountName, 160),
    accountNumber: text(block && block.accountNumber, 120),
    branchName: text(block && block.branchName, 160),
    branchCode: text(block && block.branchCode, 80),
    swiftCode: text(block && block.swiftCode, 80),
    referenceRule: text(block && block.referenceRule, 300),
    buttonLabel: text(block && block.buttonLabel, 80),
    urlMode: oneOf(block && block.urlMode, ['AUTO', 'CUSTOM'], 'AUTO'),
    customUrl: text(block && block.customUrl, 1000),
    leftLabel: text(block && block.leftLabel, 100),
    rightLabel: text(block && block.rightLabel, 100)
  };
}


function safeAssetName(value) {
  return text(value, 240).split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._-]/g, '');
}

function normalizeImportedTextElement(input, pageNumber, index) {
  const source = input && typeof input === 'object' ? input : {};
  const originalText = text(source.originalText, 1200);
  return {
    id: text(source.id, 100) || `imported-text-${pageNumber}-${index + 1}`,
    page: number(source.page, pageNumber, 1, 500),
    x: number(source.x, 0, 0, 2000),
    y: number(source.y, 0, 0, 3000),
    width: number(source.width, 1, 0.5, 2000),
    height: number(source.height, 1, 0.5, 1000),
    originalText,
    text: text(source.text == null ? originalText : source.text, 1200),
    binding: oneOf(source.binding, IMPORTED_BINDINGS, 'STATIC'),
    suggestedBinding: oneOf(source.suggestedBinding, IMPORTED_BINDINGS, 'STATIC'),
    fontSize: number(source.fontSize, 9, 4, 72),
    fontFamily: text(source.fontFamily, 120) || 'Arial, Helvetica, sans-serif',
    bold: bool(source.bold, false),
    align: oneOf(source.align, ['LEFT', 'CENTER', 'RIGHT'], 'LEFT'),
    textColor: color(source.textColor, '#111827'),
    backgroundColor: color(source.backgroundColor, '#FFFFFF'),
    hidden: bool(source.hidden, false)
  };
}

function normalizeImportedLogo(input, index = 0) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    id: text(source.id, 120) || `imported-logo-${number(source.page, index + 1, 1, 500)}-${index + 1}`,
    page: number(source.page, 1, 1, 500),
    x: number(source.x, 0, 0, 2000),
    y: number(source.y, 0, 0, 3000),
    width: number(source.width, 1, 1, 2000),
    height: number(source.height, 1, 1, 1000),
    mode: oneOf(source.mode, ['ORIGINAL', 'COMPANY', 'HIDDEN'], 'ORIGINAL'),
    backgroundColor: color(source.backgroundColor, '#FFFFFF')
  };
}

function normalizeImportedCanvas(input) {
  if (!input || typeof input !== 'object' || String(input.mode || '').toUpperCase() !== 'EXACT_PDF') return null;
  const pages = Array.isArray(input.pages) ? input.pages.slice(0, 20).map((page, index) => {
    const pageNumber = number(page && page.pageNumber, index + 1, 1, 500);
    return {
      pageNumber,
      width: number(page && page.width, 595, 100, 2000),
      height: number(page && page.height, 842, 100, 3000),
      backgroundAsset: safeAssetName(page && page.backgroundAsset),
      textElements: Array.isArray(page && page.textElements)
        ? page.textElements.slice(0, 900).map((item, itemIndex) => normalizeImportedTextElement(item, pageNumber, itemIndex))
        : []
    };
  }).filter((page) => page.backgroundAsset) : [];
  let logos = Array.isArray(input.logos)
    ? input.logos.slice(0, 80).map((logo, index) => normalizeImportedLogo(logo, index))
    : [];
  if (!logos.length && input.logo && typeof input.logo === 'object') {
    const legacy = normalizeImportedLogo(input.logo, 0);
    logos = pages.map((page, index) => ({
      ...legacy,
      id: `imported-logo-${page.pageNumber}-${index + 1}`,
      page: page.pageNumber
    }));
  }
  logos = logos.filter((logo) => pages.some((page) => Number(page.pageNumber) === Number(logo.page)));
  if (logos.length === 1 && pages.length > 1) {
    const base = logos[0];
    logos = pages.map((page, index) => ({
      ...base,
      id: Number(page.pageNumber) === Number(base.page) ? base.id : `imported-logo-${page.pageNumber}-${index + 1}`,
      page: page.pageNumber
    }));
  }
  return {
    mode: 'EXACT_PDF',
    sourceFileName: text(input.sourceFileName, 240),
    rasterDpi: number(input.rasterDpi, 144, 72, 300),
    pages,
    logos,
    logo: logos[0] || null,
    textEditable: bool(input.textEditable, pages.some((page) => page.textElements.length > 0))
  };
}

function normalizeDesign(input, documentType = 'INVOICE') {
  const type = oneOf(documentType, DOCUMENT_TYPES, 'INVOICE');
  const source = input && typeof input === 'object' ? input : {};
  const blocks = Array.isArray(source.blocks) ? source.blocks.slice(0, 24).map((block) => normalizeBlock(block, type)) : blockOrder(type).map((item) => defaultBlock(item, type));
  const unique = [];
  const seen = new Set();
  for (const block of blocks) {
    if (seen.has(block.id)) block.id = blockId(block.type);
    seen.add(block.id);
    unique.push(block);
  }
  const inferredVariant = source.variant || (source.header && source.header.layout === 'STACKED' ? 'CLASSIC' : source.header && source.header.layout === 'COMPACT' ? 'MINIMAL' : 'PROFESSIONAL');
  return {
    version: 1,
    variant: oneOf(inferredVariant, ['PROFESSIONAL', 'CLASSIC', 'MINIMAL', 'BLANK'], 'PROFESSIONAL'),
    page: {
      size: 'A4',
      orientation: oneOf(source.page && source.page.orientation, ['PORTRAIT'], 'PORTRAIT'),
      margin: number(source.page && source.page.margin, 42, 24, 72),
      showPageNumbers: bool(source.page && source.page.showPageNumbers, true)
    },
    typography: {
      fontFamily: oneOf(source.typography && source.typography.fontFamily, ['HELVETICA', 'HELVETICA_CONDENSED'], 'HELVETICA'),
      bodySize: number(source.typography && source.typography.bodySize, 9, 7, 12),
      headingScale: number(source.typography && source.typography.headingScale, 1.15, 1, 1.6)
    },
    theme: {
      primaryColor: color(source.theme && source.theme.primaryColor, '#1D65BC'),
      accentColor: color(source.theme && source.theme.accentColor, '#FFE386'),
      textColor: color(source.theme && source.theme.textColor, '#11213D'),
      mutedColor: color(source.theme && source.theme.mutedColor, '#60708A'),
      borderColor: color(source.theme && source.theme.borderColor, '#D8E1EE'),
      tableHeaderColor: color(source.theme && source.theme.tableHeaderColor, '#EDF4FC')
    },
    header: {
      visible: bool(source.header && source.header.visible, true),
      layout: oneOf(source.header && source.header.layout, ['SPLIT', 'STACKED', 'COMPACT'], 'SPLIT'),
      logoPosition: oneOf(source.header && source.header.logoPosition, ['LEFT', 'RIGHT'], 'LEFT'),
      logoSize: oneOf(source.header && source.header.logoSize, ['SMALL', 'MEDIUM', 'LARGE'], 'MEDIUM'),
      showLogo: bool(source.header && source.header.showLogo, true),
      showLegalName: bool(source.header && source.header.showLegalName, true),
      showRegistrationNumber: bool(source.header && source.header.showRegistrationNumber, true),
      showTaxNumber: bool(source.header && source.header.showTaxNumber, true),
      showAddress: bool(source.header && source.header.showAddress, true),
      showEmail: bool(source.header && source.header.showEmail, true),
      showPhone: bool(source.header && source.header.showPhone, true),
      showWebsite: bool(source.header && source.header.showWebsite, true)
    },
    blocks: unique,
    importAnalysis: normalizeImportAnalysis(source.importAnalysis),
    importedCanvas: normalizeImportedCanvas(source.importedCanvas)
  };
}

function designBlock(design, type) {
  const normalized = normalizeDesign(design);
  return normalized.blocks.find((block) => block.type === type && block.visible) || null;
}

function rendererLocalization(finance, template) {
  if (!template || !template.design) return finance;
  const design = normalizeDesign(template.design, template.documentType);
  const visible = (type) => Boolean(design.blocks.find((block) => block.type === type && block.visible));
  return {
    ...(finance || {}),
    documentDesign: design,
    documentTemplate: design.variant === 'CLASSIC' ? 'CLASSIC' : design.variant === 'MINIMAL' ? 'MINIMAL' : 'MODERN',
    documentDesignVariant: design.variant,
    documentHeaderVisible: design.header.visible,
    documentHeaderStyle: design.header.layout,
    documentShowPageNumbers: design.page.showPageNumbers,
    documentLogoPosition: design.header.logoPosition,
    documentLogoSize: design.header.logoSize,
    showDocumentLogo: design.header.showLogo,
    showLegalName: design.header.showLegalName,
    showRegistrationNumber: design.header.showRegistrationNumber,
    showTaxNumber: design.header.showTaxNumber,
    showCompanyAddress: design.header.showAddress,
    showCompanyEmail: design.header.showEmail,
    showCompanyPhone: design.header.showPhone,
    showCompanyWebsite: design.header.showWebsite,
    showTax: visible('TOTALS'),
    showPurchaseOrder: visible('DOCUMENT_DETAILS'),
    showNotes: visible('TERMS'),
    showPaymentInstructions: visible('PAYMENT_OPTIONS') || visible('ONLINE_PAYMENT'),
    paymentInstructions: designBlock(design, 'PAYMENT_OPTIONS') && designBlock(design, 'PAYMENT_OPTIONS').body || finance && finance.paymentInstructions,
    invoiceFooter: designBlock(design, 'FOOTER') && designBlock(design, 'FOOTER').body || finance && finance.invoiceFooter
  };
}

async function findDefaultTemplate(client, companyId, documentType) {
  if (!client || !client.documentTemplate) return null;
  const type = oneOf(documentType, DOCUMENT_TYPES, 'INVOICE');
  const template = await client.documentTemplate.findFirst({
    where: { companyId, documentType: type, status: 'PUBLISHED', isDefault: true },
    include: { versions: { where: { publishedAt: { not: null } }, orderBy: { version: 'desc' }, take: 1 } },
    orderBy: { updatedAt: 'desc' }
  });
  if (!template) return null;
  const version = template.versions && template.versions[0];
  return { ...template, design: version && version.design || template.design, resolvedVersion: version && version.version || template.currentVersion || 0 };
}

async function findTemplateVersion(client, companyId, templateId, version) {
  if (!client || !client.documentTemplateVersion || !templateId || !version) return null;
  const snapshot = await client.documentTemplateVersion.findFirst({ where: { companyId, templateId, version } });
  if (!snapshot) return null;
  const template = client.documentTemplate
    ? await client.documentTemplate.findFirst({ where: { id: templateId, companyId } })
    : null;
  return template ? { ...template, design: snapshot.design, resolvedVersion: snapshot.version } : { id: templateId, companyId, design: snapshot.design, resolvedVersion: snapshot.version };
}

async function seedStarterTemplates(client, companyId) {
  if (!client || !client.documentTemplate || !client.documentTemplateVersion) return;
  const definitions = [
    ['Professional invoice', 'INVOICE', 'PROFESSIONAL', true],
    ['Professional quote', 'QUOTE', 'PROFESSIONAL', true],
    ['Professional contract', 'CONTRACT', 'PROFESSIONAL', true],
    ['Classic invoice', 'INVOICE', 'CLASSIC', false],
    ['Minimal quote', 'QUOTE', 'MINIMAL', false]
  ];
  for (const [name, documentType, variant, preferredDefault] of definitions) {
    const existing = await client.documentTemplate.findFirst({ where: { companyId, name, documentType, isSystem: true } });
    if (existing) continue;
    const design = starterDesign(documentType, variant);
    const hasDefault = await client.documentTemplate.count({ where: { companyId, documentType, isDefault: true, status: 'PUBLISHED' } });
    const isDefault = preferredDefault && !hasDefault;
    const template = await client.documentTemplate.create({
      data: { companyId, name, documentType, sourceType: 'STARTER', status: 'PUBLISHED', isDefault, isSystem: true, design, currentVersion: 1, publishedAt: new Date() }
    });
    await client.documentTemplateVersion.create({ data: { companyId, templateId: template.id, version: 1, design, publishedAt: new Date() } });
  }
}

module.exports = {
  IMPORTED_BINDINGS,
  BLOCK_TYPES,
  DOCUMENT_TYPES,
  SOURCE_TYPES,
  STATUSES,
  defaultBlock,
  designBlock,
  findDefaultTemplate,
  findTemplateVersion,
  normalizeDesign,
  normalizeImportedCanvas,
  rendererLocalization,
  seedStarterTemplates,
  starterDesign
};
