'use strict';

const crypto = require('node:crypto');

const DOCUMENT_TYPES = ['QUOTE', 'INVOICE', 'CONTRACT'];
const SOURCE_TYPES = ['STARTER', 'BLANK', 'IMPORTED'];
const STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
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
  const theme = chosen === 'CLASSIC'
    ? { primaryColor: '#17365D', accentColor: '#D6A900', textColor: '#13213C', mutedColor: '#5B6574', borderColor: '#A7B0BE', tableHeaderColor: '#DCE5F1' }
    : chosen === 'MINIMAL'
      ? { primaryColor: '#111827', accentColor: '#6B7280', textColor: '#111827', mutedColor: '#6B7280', borderColor: '#D1D5DB', tableHeaderColor: '#F3F4F6' }
      : { primaryColor: '#1D65BC', accentColor: '#FFE386', textColor: '#11213D', mutedColor: '#60708A', borderColor: '#D8E1EE', tableHeaderColor: '#EDF4FC' };
  const included = chosen === 'BLANK' ? ['CUSTOMER_DETAILS', 'DOCUMENT_DETAILS'] : blockOrder(type);
  return normalizeDesign({
    version: 1,
    page: { size: 'A4', orientation: 'PORTRAIT', margin: 42 },
    typography: { fontFamily: 'HELVETICA', bodySize: 9, headingScale: 1.15 },
    theme,
    header: { layout: chosen === 'MINIMAL' ? 'COMPACT' : chosen === 'CLASSIC' ? 'STACKED' : 'SPLIT', logoPosition: 'LEFT', logoSize: 'MEDIUM', showLogo: true, showLegalName: true, showRegistrationNumber: true, showTaxNumber: true, showAddress: true, showEmail: true, showPhone: true, showWebsite: true },
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

function normalizeBlock(block, documentType) {
  const type = oneOf(block && block.type, BLOCK_TYPES, 'FOOTER');
  const fallback = defaultBlock(type, documentType);
  const columns = Array.isArray(block && block.columns)
    ? block.columns.map((item) => text(item, 30).toUpperCase()).filter(Boolean).slice(0, 6)
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
  return {
    version: 1,
    page: {
      size: 'A4',
      orientation: oneOf(source.page && source.page.orientation, ['PORTRAIT'], 'PORTRAIT'),
      margin: number(source.page && source.page.margin, 42, 24, 72)
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
    blocks: unique
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
    documentTemplate: template.sourceType === 'STARTER' && String(template.name || '').toLowerCase().includes('classic') ? 'CLASSIC' : 'MODERN',
    documentHeaderStyle: design.header.layout,
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
  const existing = await client.documentTemplate.count({ where: { companyId } });
  if (existing) return;
  const definitions = [
    ['Professional invoice', 'INVOICE', 'PROFESSIONAL', true],
    ['Professional quote', 'QUOTE', 'PROFESSIONAL', true],
    ['Professional contract', 'CONTRACT', 'PROFESSIONAL', true],
    ['Classic invoice', 'INVOICE', 'CLASSIC', false],
    ['Minimal quote', 'QUOTE', 'MINIMAL', false]
  ];
  for (const [name, documentType, variant, isDefault] of definitions) {
    const design = starterDesign(documentType, variant);
    const template = await client.documentTemplate.create({
      data: { companyId, name, documentType, sourceType: 'STARTER', status: 'PUBLISHED', isDefault, design, currentVersion: 1, publishedAt: new Date() }
    });
    await client.documentTemplateVersion.create({ data: { companyId, templateId: template.id, version: 1, design, publishedAt: new Date() } });
  }
}

module.exports = {
  BLOCK_TYPES,
  DOCUMENT_TYPES,
  SOURCE_TYPES,
  STATUSES,
  defaultBlock,
  designBlock,
  findDefaultTemplate,
  findTemplateVersion,
  normalizeDesign,
  rendererLocalization,
  seedStarterTemplates,
  starterDesign
};
