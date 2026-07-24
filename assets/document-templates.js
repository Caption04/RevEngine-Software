(function () {
  if (document.body.dataset.page !== 'document-templates') return;

  const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api';
  const routeParams = new URLSearchParams(window.location.search);
  const editorRoute = document.body.dataset.documentEditorRoute === 'true';
  const routeTemplateId = String(routeParams.get('template') || '').trim();
  const requestedFilter = String(routeParams.get('type') || '').toUpperCase();
  const initialFilter = ['INVOICE', 'QUOTE', 'CONTRACT'].includes(requestedFilter) ? requestedFilter : 'INVOICE';
  const state = {
    templates: [],
    blockTypes: [],
    filter: 'INVOICE',
    showArchived: false,
    selected: null,
    design: null,
    previewTimer: null,
    previewUrl: null,
    previewRequest: 0,
    previewController: null,
    modalPreviewUrl: null,
    saving: false,
    editorContext: {},
    importedTextSearch: '',
    importedPage: 'ALL',
    importedMode: 'EDIT',
    importedZoom: 1,
    selectedImportedElementId: null,
    selectedImportedLogoId: null,
    importedCaretOffset: null,
    importedUndoStack: [],
    importedRedoStack: [],
    importedTypingSnapshot: null
  };

  state.filter = initialFilter;

  const BLOCK_LABELS = {
    CUSTOMER_DETAILS: 'Customer details',
    DOCUMENT_DETAILS: 'Document details',
    LINE_ITEMS: 'Line items table',
    TOTALS: 'Totals and tax',
    PAYMENT_OPTIONS: 'Payment options',
    ONLINE_PAYMENT: 'Online payment link',
    TERMS: 'Terms and conditions',
    DISCLAIMER: 'Payment disclaimer',
    SIGNATURES: 'Signatures',
    FOOTER: 'Footer message',
    CONTRACT_BODY: 'Contract body'
  };
  const CORE_BLOCKS = new Set(['CUSTOMER_DETAILS', 'DOCUMENT_DETAILS', 'LINE_ITEMS', 'CONTRACT_BODY']);
  const IMPORTED_BINDING_GROUPS = [
    ['Typed text', [['STATIC', 'Use the text entered here']]],
    ['Company', [
      ['COMPANY_NAME', 'Trading name'], ['COMPANY_LEGAL_NAME', 'Legal company name'], ['COMPANY_ADDRESS', 'Company address'],
      ['COMPANY_EMAIL', 'Company email'], ['COMPANY_PHONE', 'Company phone'], ['COMPANY_WEBSITE', 'Company website'],
      ['COMPANY_REGISTRATION', 'Registration number'], ['COMPANY_TAX', 'Tax or VAT number']
    ]],
    ['Customer', [
      ['CUSTOMER_NAME', 'Customer name'], ['CUSTOMER_CONTACT', 'Customer contact'], ['CUSTOMER_EMAIL', 'Customer email'],
      ['CUSTOMER_PHONE', 'Customer phone'], ['CUSTOMER_ADDRESS', 'Customer address']
    ]],
    ['Document', [
      ['DOCUMENT_TITLE', 'Document title'], ['DOCUMENT_NUMBER', 'Document number'], ['DOCUMENT_STATUS', 'Status'],
      ['DOCUMENT_ISSUE_DATE', 'Issue date'], ['DOCUMENT_DUE_DATE', 'Due or valid-until date'], ['DOCUMENT_PO', 'Customer purchase order']
    ]],
    ['Totals', [
      ['TOTAL_SUBTOTAL', 'Subtotal'], ['TOTAL_DISCOUNT', 'Discount'], ['TOTAL_TAX', 'Tax'], ['TOTAL_TOTAL', 'Total'],
      ['PAYMENT_REFERENCE', 'Payment reference']
    ]],
    ['Line items', Array.from({ length: 8 }, (_, index) => [
      [`ITEM_${index + 1}_DESCRIPTION`, `Item ${index + 1} description`],
      [`ITEM_${index + 1}_QTY`, `Item ${index + 1} quantity`],
      [`ITEM_${index + 1}_UNIT`, `Item ${index + 1} unit price`],
      [`ITEM_${index + 1}_TOTAL`, `Item ${index + 1} total`]
    ]).flat()]
  ];
  const IMPORTED_BINDING_LABELS = Object.fromEntries(IMPORTED_BINDING_GROUPS.flatMap((group) => group[1]));

  const libraryNodes = Array.from(document.querySelectorAll('[data-template-library-view]'));
  const editor = document.querySelector('[data-template-editor]');
  const grid = document.querySelector('[data-template-grid]');
  const statusNode = document.querySelector('[data-template-status]');
  const blockList = document.querySelector('[data-block-list]');
  const previewFrame = document.querySelector('[data-template-preview-frame]');
  const previewStatus = document.querySelector('[data-preview-status]');
  const modal = document.querySelector('[data-template-modal]');
  const modalForm = document.querySelector('[data-template-modal-form]');
  const modalTitle = document.querySelector('[data-template-modal-title]');
  const modalCopy = document.querySelector('[data-template-modal-copy]');
  const importedCanvasControls = document.querySelector('[data-imported-canvas-controls]');
  const importedTextList = document.querySelector('[data-imported-text-list]');
  const importedTextSummary = document.querySelector('[data-imported-text-summary]');
  const importedPageFilter = document.querySelector('[data-imported-page-filter]');
  const importedTextSearch = document.querySelector('[data-imported-text-search]');
  const importedLogoMode = document.querySelector('[data-import-logo-mode]');
  const structuredWorkspace = document.querySelector('[data-structured-workspace]');
  const importedInlineEditor = document.querySelector('[data-imported-inline-editor]');
  const importedDocumentStage = document.querySelector('[data-imported-document-stage]');
  const importedDocumentPages = document.querySelector('[data-imported-document-pages]');
  const importedContextbar = document.querySelector('[data-imported-contextbar]');
  const importedEmptyContext = document.querySelector('[data-imported-empty-context]');
  const importedTextContextControls = document.querySelector('[data-imported-text-context-controls]');
  const importedLogoContextControls = document.querySelector('[data-imported-logo-context-controls]');
  const importedInlineBinding = document.querySelector('[data-imported-inline-binding]');
  const importedInlineColour = document.querySelector('[data-imported-inline-colour]');
  const importedInlineLogoMode = document.querySelector('[data-imported-inline-logo-mode]');
  const importedDataPreview = document.querySelector('[data-imported-data-preview]');
  const importedPreviewFrame = document.querySelector('[data-imported-preview-frame]');
  const importedPreviewStatus = document.querySelector('[data-imported-preview-status]');
  const importedZoomValue = document.querySelector('[data-imported-zoom="fit"]');
  const importedUndoButton = document.querySelector('[data-imported-undo]');
  const importedRedoButton = document.querySelector('[data-imported-redo]');

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function label(value) {
    return String(value || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function notify(message, ok = true) {
    if (window.RevEngineUI) window.RevEngineUI.notify(message, { type: ok ? 'success' : 'error' });
  }

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    if (!isFormData && options.body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const response = await fetch(API_BASE + path, { credentials: 'include', ...options, headers });
    if (options.expectBlob) {
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error && payload.error.message || `HTTP ${response.status}`);
      }
      return response.blob();
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error && payload.error.message || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload.data;
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getPath(object, path) {
    return String(path).split('.').reduce((value, key) => value && value[key], object);
  }

  function setPath(object, path, value) {
    const keys = String(path).split('.');
    let target = object;
    keys.slice(0, -1).forEach((key) => {
      if (!target[key] || typeof target[key] !== 'object') target[key] = {};
      target = target[key];
    });
    target[keys[keys.length - 1]] = value;
  }

  function emptyBlock(type) {
    const documentType = state.selected && state.selected.documentType || 'INVOICE';
    const defaults = {
      CUSTOMER_DETAILS: { label: documentType === 'CONTRACT' ? 'Customer' : 'Bill to' },
      DOCUMENT_DETAILS: { label: documentType === 'CONTRACT' ? 'Agreement details' : 'Document details' },
      LINE_ITEMS: { label: documentType === 'CONTRACT' ? 'Services included' : 'Items', columns: ['DESCRIPTION', 'QTY', 'UNIT', 'TOTAL'] },
      TOTALS: { label: 'Summary' },
      PAYMENT_OPTIONS: { label: 'Payment options', body: '', accountLayout: 'STACKED', accounts: [{ id: 'payment-account-1', label: 'Bank transfer', bankName: '', accountName: '', accountNumber: '', branchName: '', branchCode: '', swiftCode: '' }], bankName: '', accountName: '', accountNumber: '', branchName: '', branchCode: '', swiftCode: '', referenceRule: 'Use the invoice number as the payment reference.' },
      ONLINE_PAYMENT: { label: 'Pay online', body: '', buttonLabel: 'Make payment online', urlMode: 'AUTO', customUrl: '' },
      TERMS: { label: 'Terms and conditions', body: '' },
      DISCLAIMER: { label: 'Important payment notice', body: 'Before making payment, confirm that the payment details match the details issued by this company.' },
      SIGNATURES: { label: 'Signatures', leftLabel: 'For the company', rightLabel: 'For the customer' },
      FOOTER: { label: 'Footer', body: 'Thank you for choosing us.' },
      CONTRACT_BODY: { label: 'Agreement', body: 'Write the agreement, responsibilities, service period, and accepted terms here.' }
    };
    return { id: `${type.toLowerCase()}-${Date.now().toString(36)}`, type, visible: true, ...(defaults[type] || { label: label(type) }) };
  }

  function templateTone(template) {
    if (template.isDefault) return 'green';
    if (template.status === 'PUBLISHED') return 'blue';
    return 'gray';
  }

  function templateVariant(template) {
    const design = template && template.design || {};
    const variant = design.variant;
    if (['PROFESSIONAL', 'CLASSIC', 'MINIMAL', 'BLANK'].includes(variant)) return variant;
    if (design.header && design.header.layout === 'STACKED') return 'CLASSIC';
    if (design.header && design.header.layout === 'COMPACT') return 'MINIMAL';
    return 'PROFESSIONAL';
  }

  function syncArchivedToggle() {
    const button = document.querySelector('[data-toggle-archived]');
    if (!button) return;
    button.textContent = state.showArchived ? 'Back to active' : 'View archived';
    button.classList.toggle('active', state.showArchived);
  }

  function renderLibrary() {
    const visible = state.templates.filter((template) => template.documentType === state.filter);
    statusNode.textContent = state.showArchived
      ? `${visible.length} archived ${visible.length === 1 ? 'template' : 'templates'}`
      : `${visible.length} ${visible.length === 1 ? 'template' : 'templates'}`;
    syncArchivedToggle();
    if (!visible.length) {
      grid.innerHTML = state.showArchived
        ? '<div class="empty-state"><div><strong>No archived templates</strong><span>Templates you archive will appear here and can be restored.</span></div></div>'
        : '<div class="empty-state"><div><strong>No templates in this group</strong><span>Create one from scratch, use a ready-made design, or import an existing document.</span></div></div>';
      document.dispatchEvent(new Event('revengine:section-search-refresh'));
      return;
    }
    grid.innerHTML = visible.map((template) => {
      const sourceFormat = template.design && template.design.importAnalysis && template.design.importAnalysis.sourceFormat;
      const source = template.isSystem ? 'System template' : template.design && template.design.importedCanvas ? 'Imported PDF layout' : template.sourceType === 'IMPORTED' && template.hasImportSource ? `Imported ${sourceFormat || 'document'}` : template.sourceType === 'BLANK' ? 'Built from scratch' : 'Ready-made template';
      const version = template.currentVersion ? `Version ${template.currentVersion}` : 'Not published yet';
      const variant = templateVariant(template);
      const activeActions = `<button class="secondary-button compact" type="button" data-template-open="${escapeHtml(template.id)}">Edit template</button><button class="text-button" type="button" data-template-duplicate="${escapeHtml(template.id)}">Duplicate</button>`;
      const archivedActions = `<button class="secondary-button compact" type="button" data-template-restore="${escapeHtml(template.id)}">Restore</button>${template.isSystem ? '' : `<button class="text-button danger-text" type="button" data-template-delete="${escapeHtml(template.id)}">Delete</button>`}`;
      const primary = template.design && template.design.theme && template.design.theme.primaryColor || '#1D65BC';
      return `<article class="card document-template-card variant-${variant.toLowerCase()}" data-template-card="${escapeHtml(template.id)}" data-template-variant="${escapeHtml(variant)}" style="--template-primary:${escapeHtml(primary)}">
        <div class="document-template-card-preview"${state.showArchived ? '' : ` data-template-open="${escapeHtml(template.id)}"`}>
          <div class="document-template-paper">
            <div class="document-template-mini-header"><i style="background:${escapeHtml(template.design && template.design.theme && template.design.theme.primaryColor || '#1D65BC')}"></i><span></span></div>
            <div class="document-template-mini-lines"><i></i><i></i><i></i><i></i></div>
            <div class="document-template-mini-table"><i></i><i></i><i></i></div>
          </div>
        </div>
        <div class="document-template-card-body">
          <div class="document-template-card-title"><div><small>${escapeHtml(label(template.documentType))}${template.isSystem ? ' · System' : ''}</small><strong>${escapeHtml(template.name)}</strong></div><span class="badge ${templateTone(template)}">${escapeHtml(state.showArchived ? 'Archived' : template.isDefault ? 'Default' : label(template.status))}</span></div>
          <p>${escapeHtml(source)} · ${escapeHtml(version)}</p>
          <div class="document-template-card-actions">${state.showArchived ? archivedActions : activeActions}</div>
        </div>
      </article>`;
    }).join('');
    document.dispatchEvent(new Event('revengine:section-search-refresh'));
  }

  function templateLibraryUrl(documentType) {
    const type = String(documentType || state.filter || 'INVOICE').toUpperCase();
    return `document-templates.html?type=${encodeURIComponent(type)}`;
  }

  function importedEditorUrl(template) {
    return `imported-document-editor.html?template=${encodeURIComponent(template.id)}&type=${encodeURIComponent(template.documentType || state.filter || 'INVOICE')}`;
  }

  function returnToTemplateLibrary() {
    window.location.href = templateLibraryUrl(state.selected && state.selected.documentType);
  }

  function showLibrary() {
    if (editorRoute) {
      returnToTemplateLibrary();
      return;
    }
    state.selected = null;
    state.design = null;
    state.selectedImportedElementId = null;
    state.selectedImportedLogoId = null;
    state.importedCaretOffset = null;
    state.importedUndoStack = [];
    state.importedRedoStack = [];
    state.importedTypingSnapshot = null;
    updateImportedHistoryButtons();
    window.clearTimeout(state.previewTimer);
    if (state.previewController) state.previewController.abort();
    state.previewController = null;
    state.previewRequest += 1;
    libraryNodes.forEach((node) => { node.hidden = false; });
    editor.hidden = true;
    editor.classList.remove('is-imported-inline');
    document.body.classList.remove('document-inline-editing');
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = null;
    if (previewFrame) previewFrame.removeAttribute('src');
    if (importedPreviewFrame) importedPreviewFrame.removeAttribute('src');
    setImportedPreviewStatus('Waiting for changes…');
  }

  function syncHeaderDependentControls() {
    const visible = getPath(state.design, 'header.visible') !== false;
    document.querySelectorAll('[data-header-dependent]').forEach((control) => { control.disabled = !visible; });
    const group = document.querySelector('[data-header-dependent-group]');
    if (group) group.classList.toggle('is-disabled', !visible);
  }

  function syncControlValues() {
    document.querySelector('[data-template-name]').value = state.selected.name || '';
    document.querySelectorAll('[data-design-path]').forEach((control) => {
      const value = getPath(state.design, control.dataset.designPath);
      if (control.type === 'checkbox') control.checked = value !== false;
      else control.value = value == null ? '' : String(value);
    });
    syncHeaderDependentControls();
  }

  function renderBlocks() {
    const blocks = state.design && Array.isArray(state.design.blocks) ? state.design.blocks : [];
    if (!blocks.length) {
      blockList.innerHTML = '<div class="empty-state compact-empty"><div><strong>No sections yet</strong><span>Add the first section to this template.</span></div></div>';
      return;
    }
    blockList.innerHTML = blocks.map((block, index) => {
      const fixed = CORE_BLOCKS.has(block.type);
      return `<article class="document-block-row${block.visible === false ? ' is-hidden' : ''}" data-block-id="${escapeHtml(block.id)}">
        <div class="document-block-order" aria-hidden="true">${index + 1}</div>
        <div class="document-block-copy"><strong>${escapeHtml(block.label || BLOCK_LABELS[block.type] || label(block.type))}</strong><span>${escapeHtml(BLOCK_LABELS[block.type] || label(block.type))}${fixed ? ' · fixed document area' : ''}</span></div>
        <div class="document-block-actions">
          ${!fixed ? `<button class="icon-button" type="button" title="Move up" aria-label="Move up" data-block-move="up" data-block-id="${escapeHtml(block.id)}"${index === 0 ? ' disabled' : ''}>↑</button><button class="icon-button" type="button" title="Move down" aria-label="Move down" data-block-move="down" data-block-id="${escapeHtml(block.id)}"${index === blocks.length - 1 ? ' disabled' : ''}>↓</button>` : ''}
          <button class="text-button" type="button" data-block-edit="${escapeHtml(block.id)}">Edit</button>
          <button class="text-button" type="button" data-block-toggle="${escapeHtml(block.id)}">${block.visible === false ? 'Show' : 'Hide'}</button>
        </div>
      </article>`;
    }).join('');
  }

  function exactImportedCanvas() {
    const canvas = state.design && state.design.importedCanvas;
    return canvas && canvas.mode === 'EXACT_PDF' && Array.isArray(canvas.pages) ? canvas : null;
  }

  function ensureImportedLogoCollection() {
    const canvas = exactImportedCanvas();
    if (!canvas) return [];
    let logos = Array.isArray(canvas.logos) ? canvas.logos.filter(Boolean) : [];
    if (!logos.length && canvas.logo) {
      const base = { ...canvas.logo };
      logos = canvas.pages.map((page) => ({
        ...base,
        id: `imported-logo-${page.pageNumber}`,
        page: Number(page.pageNumber || 1)
      }));
    }
    logos = logos.map((logo, index) => ({
      ...logo,
      id: String(logo.id || `imported-logo-${logo.page || index + 1}-${index + 1}`),
      page: Number(logo.page || 1)
    }));
    if (logos.length === 1 && canvas.pages.length > 1) {
      const base = logos[0];
      logos = canvas.pages.map((page, index) => ({
        ...base,
        id: Number(page.pageNumber) === Number(base.page) ? base.id : `imported-logo-${page.pageNumber}-${index + 1}`,
        page: Number(page.pageNumber || 1)
      }));
    }
    canvas.logos = logos;
    canvas.logo = logos[0] ? { ...logos[0] } : null;
    return logos;
  }

  function selectedImportedLogo() {
    if (!state.selectedImportedLogoId) return null;
    return ensureImportedLogoCollection().find((logo) => logo.id === state.selectedImportedLogoId) || null;
  }

  function syncImportedLogoCompatibility() {
    const canvas = exactImportedCanvas();
    if (!canvas) return;
    const logos = ensureImportedLogoCollection();
    canvas.logo = logos[0] ? { ...logos[0] } : null;
  }

  function importedHistorySnapshot() {
    const canvas = exactImportedCanvas();
    return canvas ? deepClone(canvas) : null;
  }

  function updateImportedHistoryButtons() {
    if (importedUndoButton) importedUndoButton.disabled = state.importedUndoStack.length === 0;
    if (importedRedoButton) importedRedoButton.disabled = state.importedRedoStack.length === 0;
  }

  function rememberImportedChange(snapshot = importedHistorySnapshot()) {
    if (!snapshot) return;
    state.importedUndoStack.push(snapshot);
    if (state.importedUndoStack.length > 60) state.importedUndoStack.shift();
    state.importedRedoStack = [];
    updateImportedHistoryButtons();
  }

  function restoreImportedHistory(snapshot) {
    if (!snapshot || !state.design) return;
    state.design.importedCanvas = deepClone(snapshot);
    ensureImportedLogoCollection();
    state.selectedImportedElementId = null;
    state.selectedImportedLogoId = null;
    state.importedCaretOffset = null;
    state.importedTypingSnapshot = null;
    renderImportedInlineEditor({ preserveScroll: true });
    schedulePreview(120);
  }

  function undoImportedChange() {
    if (!state.importedUndoStack.length) return;
    const current = importedHistorySnapshot();
    const previous = state.importedUndoStack.pop();
    if (current) state.importedRedoStack.push(current);
    restoreImportedHistory(previous);
    updateImportedHistoryButtons();
  }

  function redoImportedChange() {
    if (!state.importedRedoStack.length) return;
    const current = importedHistorySnapshot();
    const next = state.importedRedoStack.pop();
    if (current) state.importedUndoStack.push(current);
    restoreImportedHistory(next);
    updateImportedHistoryButtons();
  }

  function importedTextElements() {
    const canvas = exactImportedCanvas();
    if (!canvas) return [];
    return canvas.pages.flatMap((page) => (page.textElements || []).map((element) => ({ page, element })));
  }

  function importedBindingOptions(selected, includeStatic = true) {
    return IMPORTED_BINDING_GROUPS.map(([group, options]) => {
      const visible = includeStatic ? options : options.filter(([value]) => value !== 'STATIC');
      if (!visible.length) return '';
      return `<optgroup label="${escapeHtml(group)}">${visible.map(([value, text]) => `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(text)}</option>`).join('')}</optgroup>`;
    }).join('');
  }

  function importedMergeToken(binding) {
    return `{{${String(binding || '').toUpperCase()}}}`;
  }

  const IMPORTED_SAMPLE_VALUES = {
    COMPANY_NAME: 'Rev Engine Zimbabwe Demo',
    COMPANY_LEGAL_NAME: 'Rev Engine Zimbabwe (Private) Limited',
    COMPANY_ADDRESS: 'Harare, Zimbabwe',
    COMPANY_EMAIL: 'support.zw@revengine.test',
    COMPANY_PHONE: '+263 000 000 000',
    COMPANY_WEBSITE: 'https://zw.revengine.test',
    COMPANY_REGISTRATION: 'ZW-REG-0001',
    COMPANY_TAX: 'ZW-VAT-0001',
    CUSTOMER_NAME: 'Sample Solar Customer',
    CUSTOMER_CONTACT: 'Accounts Team',
    CUSTOMER_EMAIL: 'accounts@example.com',
    CUSTOMER_PHONE: '+263 77 000 0000',
    CUSTOMER_ADDRESS: 'Harare, Zimbabwe',
    DOCUMENT_TITLE: 'INVOICE',
    DOCUMENT_NUMBER: 'ZW-INV-0001',
    DOCUMENT_STATUS: 'DRAFT',
    DOCUMENT_ISSUE_DATE: '24 Jul 2026',
    DOCUMENT_DUE_DATE: '07 Aug 2026',
    DOCUMENT_PO: 'PO-1042',
    TOTAL_SUBTOTAL: 'US$1,250.00',
    TOTAL_DISCOUNT: 'US$0.00',
    TOTAL_TAX: 'US$187.50',
    TOTAL_TOTAL: 'US$1,437.50',
    PAYMENT_REFERENCE: 'ZW-INV-0001'
  };
  for (let index = 1; index <= 8; index += 1) {
    IMPORTED_SAMPLE_VALUES[`ITEM_${index}_DESCRIPTION`] = index === 1 ? 'Solar panel inspection and cleaning' : index === 2 ? 'Inverter performance test' : '';
    IMPORTED_SAMPLE_VALUES[`ITEM_${index}_QTY`] = index <= 2 ? '1' : '';
    IMPORTED_SAMPLE_VALUES[`ITEM_${index}_UNIT`] = index === 1 ? 'US$850.00' : index === 2 ? 'US$400.00' : '';
    IMPORTED_SAMPLE_VALUES[`ITEM_${index}_TOTAL`] = index === 1 ? 'US$850.00' : index === 2 ? 'US$400.00' : '';
  }

  function importedSampleValue(binding) {
    return IMPORTED_SAMPLE_VALUES[String(binding || '').toUpperCase()] || IMPORTED_BINDING_LABELS[String(binding || '').toUpperCase()] || '';
  }

  function interpolateImportedSample(value) {
    return String(value || '').replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/gi, (token, binding) => importedSampleValue(binding) || token);
  }

  function importedElementDisplayValue(element) {
    if (!element || element.hidden) return '';
    const binding = String(element.binding || 'STATIC').toUpperCase();
    if (binding !== 'STATIC') return importedSampleValue(binding);
    return interpolateImportedSample(element.text == null ? element.originalText : element.text);
  }

  function importedElementChanged(element) {
    return Boolean(element && (
      String(element.binding || 'STATIC').toUpperCase() !== 'STATIC'
      || String(element.text == null ? element.originalText : element.text) !== String(element.originalText || '')
      || element.hidden === true
    ));
  }

  function importedCanvasAssetUrl(page) {
    if (!state.selected || !page || !page.backgroundAsset) return '';
    return `${API_BASE}/document-templates/${encodeURIComponent(state.selected.id)}/canvas-assets/${encodeURIComponent(page.backgroundAsset)}`;
  }

  function selectedImportedText() {
    if (!state.selectedImportedElementId) return null;
    return findImportedTextElement(state.selectedImportedElementId);
  }

  function setImportedPreviewStatus(value) {
    if (previewStatus) previewStatus.textContent = value;
    if (importedPreviewStatus) importedPreviewStatus.textContent = value;
  }

  function updateImportedZoomLabel() {
    if (importedZoomValue) importedZoomValue.textContent = `${Math.round(state.importedZoom * 100)}%`;
  }

  function fitImportedDocument() {
    const canvas = exactImportedCanvas();
    if (!canvas || !importedDocumentStage || !canvas.pages.length) return;
    const widest = Math.max(...canvas.pages.map((page) => Number(page.width || 595)));
    const available = Math.max(320, importedDocumentStage.clientWidth - (editorRoute ? 40 : 72));
    const maximumZoom = editorRoute ? 1.75 : 1.35;
    state.importedZoom = Math.max(0.55, Math.min(maximumZoom, available / widest));
    renderImportedInlineEditor({ preserveScroll: true });
  }

  function importedTextNode(id) {
    return importedDocumentPages && importedDocumentPages.querySelector(`[data-imported-inline-text="${CSS.escape(String(id || ''))}"]`);
  }

  function setCaretAtEnd(node) {
    if (!node || !node.isContentEditable) return;
    const range = document.createRange();
    const selection = window.getSelection();
    range.selectNodeContents(node);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function currentCaretOffset(node) {
    const selection = window.getSelection();
    if (!node || !selection || !selection.rangeCount || !node.contains(selection.anchorNode)) return null;
    const range = selection.getRangeAt(0).cloneRange();
    range.selectNodeContents(node);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    return range.toString().length;
  }

  function syncImportedContextbar() {
    if (!importedContextbar) return;
    const match = selectedImportedText();
    const logo = selectedImportedLogo();
    const hasSelection = Boolean(match || logo);
    if (editorRoute) {
      importedContextbar.hidden = false;
      importedContextbar.classList.toggle('has-selection', hasSelection);
      if (importedEmptyContext) importedEmptyContext.hidden = hasSelection;
    } else {
      importedContextbar.hidden = !hasSelection;
      if (importedEmptyContext) importedEmptyContext.hidden = hasSelection;
    }
    if (importedTextContextControls) importedTextContextControls.hidden = !match;
    if (importedLogoContextControls) importedLogoContextControls.hidden = !logo;
    const title = importedContextbar.querySelector('[data-imported-context-title]');
    const copy = importedContextbar.querySelector('[data-imported-context-copy]');
    if (!hasSelection) {
      if (title) title.textContent = 'Formatting';
      if (copy) copy.textContent = 'Select text or a logo on the page.';
      return;
    }
    if (logo) {
      if (title) title.textContent = `Logo on page ${logo.page}`;
      if (copy) copy.textContent = 'Keep the imported logo, replace it with the company logo, or hide it.';
      if (importedInlineLogoMode) importedInlineLogoMode.value = logo.mode || 'ORIGINAL';
      return;
    }
    const element = match.element;
    if (title) title.textContent = `Text on page ${match.page.pageNumber}`;
    if (copy) copy.textContent = element.hidden ? 'This text is hidden. Show or reset it to edit again.' : 'Type directly on the page or connect this text to live Rev Engine data.';
    if (importedInlineBinding) {
      importedInlineBinding.innerHTML = importedBindingOptions(String(element.binding || 'STATIC').toUpperCase());
      importedInlineBinding.value = String(element.binding || 'STATIC').toUpperCase();
    }
    if (importedInlineColour) importedInlineColour.value = element.textColor || '#111827';
    const bold = importedContextbar.querySelector('[data-imported-inline-bold]');
    if (bold) bold.classList.toggle('is-active', element.bold === true);
    importedContextbar.querySelectorAll('[data-imported-inline-align]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.importedInlineAlign === String(element.align || 'LEFT').toUpperCase());
    });
    const hide = importedContextbar.querySelector('[data-imported-inline-hide]');
    if (hide) hide.textContent = element.hidden ? 'Show' : 'Hide';
  }

  function clearImportedSelection() {
    state.selectedImportedElementId = null;
    state.selectedImportedLogoId = null;
    state.importedCaretOffset = null;
    importedDocumentPages && importedDocumentPages.querySelectorAll('.is-selected').forEach((node) => node.classList.remove('is-selected'));
    syncImportedContextbar();
  }

  function selectImportedText(id, node) {
    state.selectedImportedElementId = id;
    state.selectedImportedLogoId = null;
    importedDocumentPages && importedDocumentPages.querySelectorAll('.is-selected').forEach((item) => item.classList.remove('is-selected'));
    if (node) node.classList.add('is-selected');
    syncImportedContextbar();
  }

  function selectImportedLogo(node) {
    state.selectedImportedElementId = null;
    state.selectedImportedLogoId = node && node.dataset ? node.dataset.importedInlineLogo : null;
    importedDocumentPages && importedDocumentPages.querySelectorAll('.is-selected').forEach((item) => item.classList.remove('is-selected'));
    if (node) node.classList.add('is-selected');
    syncImportedContextbar();
  }

  function importedLogoOverlays(page, zoom) {
    const logos = ensureImportedLogoCollection().filter((logo) => Number(logo.page || 1) === Number(page.pageNumber));
    if (!logos.length) return '';
    const companyLogoUrl = state.editorContext && state.editorContext.companyLogoUrl;
    return logos.map((logo) => {
      const mode = String(logo.mode || 'ORIGINAL').toUpperCase();
      const style = [
        `left:${Number(logo.x || 0) * zoom}px`, `top:${Number(logo.y || 0) * zoom}px`,
        `width:${Math.max(8, Number(logo.width || 1) * zoom)}px`, `height:${Math.max(8, Number(logo.height || 1) * zoom)}px`,
        `--imported-cover:${escapeHtml(logo.backgroundColor || '#FFFFFF')}`
      ].join(';');
      const replacement = mode === 'COMPANY'
        ? companyLogoUrl ? `<span class="imported-logo-image-frame"><img src="${escapeHtml(companyLogoUrl)}" alt="Company logo"></span>` : '<span>Company logo</span>'
        : mode === 'HIDDEN' ? '<span>Logo hidden</span>' : '';
      const selected = state.selectedImportedLogoId === logo.id ? ' is-selected' : '';
      return `<button class="imported-inline-logo mode-${mode.toLowerCase()}${selected}" type="button" style="${style}" data-imported-inline-logo="${escapeHtml(logo.id)}" aria-label="Edit logo on page ${page.pageNumber}">${replacement}</button>`;
    }).join('');
  }

  function renderImportedInlineEditor(options = {}) {
    const canvas = exactImportedCanvas();
    if (!canvas || !importedDocumentPages) return;
    ensureImportedLogoCollection();
    const preserveScroll = options.preserveScroll === true;
    const scrollTop = preserveScroll && importedDocumentStage ? importedDocumentStage.scrollTop : 0;
    const scrollLeft = preserveScroll && importedDocumentStage ? importedDocumentStage.scrollLeft : 0;
    const zoom = state.importedZoom;
    const editable = canvas.textEditable !== false;
    importedDocumentPages.innerHTML = canvas.pages.map((page) => {
      const width = Number(page.width || 595) * zoom;
      const height = Number(page.height || 842) * zoom;
      const elements = (page.textElements || []).map((element) => {
        const binding = String(element.binding || 'STATIC').toUpperCase();
        const changed = importedElementChanged(element);
        const display = element.hidden ? 'Hidden text' : importedElementDisplayValue(element);
        const canType = editable && !element.hidden && binding === 'STATIC';
        const coverX = Math.max(0, Number(element.x || 0) - 1.75);
        const coverY = Math.max(0, Number(element.y || 0) - 1.35);
        const coverWidth = Number(element.width || 1) + 3.5;
        const coverHeight = Number(element.height || 1) + 2.7;
        const classes = [
          'imported-inline-text',
          'is-rendered-text',
          changed ? 'is-replacement' : '',
          binding !== 'STATIC' ? 'is-live-field' : '',
          element.hidden ? 'is-hidden-text' : '',
          state.selectedImportedElementId === element.id ? 'is-selected' : ''
        ].filter(Boolean).join(' ');
        const style = [
          `left:${coverX * zoom}px`, `top:${coverY * zoom}px`,
          `width:${Math.max(4, coverWidth * zoom)}px`, `height:${Math.max(4, coverHeight * zoom)}px`,
          `padding:${Math.max(.5, 1.35 * zoom)}px ${Math.max(.5, 1.75 * zoom)}px`,
          `font-size:${Math.max(4, Number(element.fontSize || 9) * zoom)}px`,
          `font-family:${escapeHtml(element.fontFamily || 'Arial, Helvetica, sans-serif')}`,
          `font-weight:${element.bold ? '700' : '400'}`, `text-align:${String(element.align || 'LEFT').toLowerCase()}`,
          `--imported-text:${escapeHtml(element.textColor || '#111827')}`, `--imported-cover:${escapeHtml(element.backgroundColor || '#FFFFFF')}`
        ].join(';');
        return `<div class="${classes}" style="${style}" data-imported-inline-text="${escapeHtml(element.id)}" data-binding="${escapeHtml(binding)}" contenteditable="${canType ? 'plaintext-only' : 'false'}" spellcheck="false" role="textbox" aria-label="Editable text on page ${page.pageNumber}">${escapeHtml(display)}</div>`;
      }).join('');
      return `<article class="imported-edit-page" data-imported-page="${page.pageNumber}" style="width:${width}px;height:${height}px">
        <span class="imported-page-number">Page ${page.pageNumber}</span>
        <div class="imported-edit-page-canvas" style="width:${width}px;height:${height}px">
          <img src="${escapeHtml(importedCanvasAssetUrl(page))}" alt="Imported document page ${page.pageNumber}" draggable="false">
          ${elements}
          ${importedLogoOverlays(page, zoom)}
        </div>
      </article>`;
    }).join('');
    updateImportedZoomLabel();
    syncImportedContextbar();
    updateImportedHistoryButtons();
    if (importedDocumentStage && preserveScroll) {
      importedDocumentStage.scrollTop = scrollTop;
      importedDocumentStage.scrollLeft = scrollLeft;
    }
    if (!editable) {
      const guidance = document.querySelector('[data-imported-editor-guidance]');
      if (guidance) guidance.innerHTML = '<strong>This document has no editable text layer.</strong><span>Its pages are preserved, but this appears to be a scan. Import a searchable PDF or DOCX for click-to-edit text.</span>';
    }
  }

  function setImportedMode(mode) {
    state.importedMode = mode === 'PREVIEW' ? 'PREVIEW' : 'EDIT';
    document.querySelectorAll('[data-imported-editor-mode]').forEach((button) => button.classList.toggle('active', button.dataset.importedEditorMode === state.importedMode));
    if (importedDocumentStage) importedDocumentStage.hidden = state.importedMode !== 'EDIT';
    if (importedDataPreview) importedDataPreview.hidden = state.importedMode !== 'PREVIEW';
    if (state.importedMode === 'PREVIEW') {
      clearImportedSelection();
      updatePreview();
    }
  }

  function refreshImportedInlineEditor({ focus = false } = {}) {
    const selectedId = state.selectedImportedElementId;
    renderImportedInlineEditor({ preserveScroll: true });
    if (!focus || !selectedId) return;
    window.setTimeout(() => {
      const node = importedTextNode(selectedId);
      if (!node || node.contentEditable === 'false') return;
      node.focus({ preventScroll: true });
      setCaretAtEnd(node);
    }, 0);
  }

  function openImportedFieldPicker() {
    const match = selectedImportedText();
    if (!match) return;
    openModal({
      title: 'Insert live data',
      copy: 'The field is inserted into this exact line. The document position and surrounding design stay locked.',
      submitLabel: 'Insert field',
      body: `<div class="field"><label for="importedInlineField">Rev Engine field</label><select id="importedInlineField" name="binding"><option value="">Choose a field</option>${importedBindingOptions('', false)}</select></div>`,
      onSubmit: async (data) => {
        const binding = String(data.get('binding') || '');
        if (!binding) throw new Error('Choose a field to insert.');
        const element = match.element;
        rememberImportedChange();
        const current = String(element.text == null ? element.originalText : element.text);
        const offset = Math.max(0, Math.min(current.length, Number.isFinite(state.importedCaretOffset) ? state.importedCaretOffset : current.length));
        const token = importedMergeToken(binding);
        element.binding = 'STATIC';
        element.hidden = false;
        element.text = `${current.slice(0, offset)}${token}${current.slice(offset)}`;
        state.importedCaretOffset = offset + token.length;
        refreshImportedInlineEditor({ focus: true });
        schedulePreview(500);
      }
    });
  }

  function updateImportedTextFormatting(action, value) {
    const match = selectedImportedText();
    if (!match) return;
    rememberImportedChange();
    const element = match.element;
    if (action === 'bold') element.bold = !element.bold;
    if (action === 'align') element.align = value;
    if (action === 'colour') element.textColor = value;
    if (action === 'hide') element.hidden = !element.hidden;
    if (action === 'reset') {
      element.text = element.originalText;
      element.binding = 'STATIC';
      element.hidden = false;
    }
    refreshImportedInlineEditor();
    schedulePreview(400);
  }

  function renderImportedCanvasControls() {
    const canvas = exactImportedCanvas();
    if (!canvas) return;
    const pages = canvas.pages || [];
    const logo = canvas.logo;
    const notice = document.querySelector('[data-imported-canvas-notice]');
    if (notice) notice.innerHTML = canvas.textEditable === false
      ? '<strong>Visual layout preserved, but the text is not editable.</strong><span>This appears to be a scan. Use a searchable PDF or DOCX for an editable import.</span>'
      : '<strong>The original PDF is the template.</strong><span>Its pages, colours, spacing, text, and logo stay untouched until you deliberately edit or map something.</span>';
    if (importedLogoMode) {
      importedLogoMode.value = logo && logo.mode || 'ORIGINAL';
      importedLogoMode.disabled = !logo;
    }
    const adjustLogo = document.querySelector('[data-adjust-import-logo]');
    if (adjustLogo) {
      adjustLogo.disabled = !pages.length;
      adjustLogo.textContent = logo ? 'Adjust logo area' : 'Mark logo area';
    }
    if (importedPageFilter) {
      const previous = state.importedPage;
      importedPageFilter.innerHTML = `<option value="ALL">All pages</option>${pages.map((page) => `<option value="${page.pageNumber}">Page ${page.pageNumber}</option>`).join('')}`;
      importedPageFilter.value = pages.some((page) => String(page.pageNumber) === String(previous)) ? String(previous) : 'ALL';
      state.importedPage = importedPageFilter.value;
    }
    if (importedTextSearch) importedTextSearch.value = state.importedTextSearch;
    const query = state.importedTextSearch.trim().toLowerCase();
    const all = importedTextElements();
    const filtered = all.filter(({ page, element }) => {
      if (state.importedPage !== 'ALL' && String(page.pageNumber) !== String(state.importedPage)) return false;
      const haystack = `${element.originalText || ''} ${element.text || ''} ${IMPORTED_BINDING_LABELS[element.binding] || ''}`.toLowerCase();
      return !query || haystack.includes(query);
    });
    if (importedTextSummary) importedTextSummary.textContent = canvas.textEditable === false
      ? `${pages.length} ${pages.length === 1 ? 'page' : 'pages'} preserved · no searchable text layer`
      : `${all.length} editable text ${all.length === 1 ? 'line' : 'lines'} · showing ${filtered.length}`;
    if (!importedTextList) return;
    if (!filtered.length) {
      importedTextList.innerHTML = `<div class="empty-state compact-empty"><div><strong>${canvas.textEditable === false ? 'No editable text found' : 'No matching text'}</strong><span>${canvas.textEditable === false ? 'The original pages still remain visible in the PDF preview.' : 'Try another search or page.'}</span></div></div>`;
      return;
    }
    importedTextList.innerHTML = filtered.slice(0, 140).map(({ page, element }) => {
      const binding = String(element.binding || 'STATIC').toUpperCase();
      const current = binding === 'STATIC' ? (element.text == null ? element.originalText : element.text) : IMPORTED_BINDING_LABELS[binding] || label(binding);
      const changed = binding !== 'STATIC' || String(element.text || '') !== String(element.originalText || '') || element.hidden;
      const suggestion = binding === 'STATIC' && element.suggestedBinding && element.suggestedBinding !== 'STATIC'
        ? `<span class="imported-text-suggestion">Possible field: ${escapeHtml(IMPORTED_BINDING_LABELS[element.suggestedBinding] || label(element.suggestedBinding))}</span>`
        : '';
      return `<article class="imported-text-row${changed ? ' is-edited' : ''}${element.hidden ? ' is-hidden' : ''}">
        <span class="imported-text-page">Page ${page.pageNumber}</span>
        <div class="imported-text-copy"><strong>${escapeHtml(current || '(blank)')}</strong><span>${binding === 'STATIC' ? 'Editable text' : `Uses ${escapeHtml(IMPORTED_BINDING_LABELS[binding] || label(binding))}`}</span>${suggestion}</div>
        <button class="secondary-button compact" type="button" data-edit-imported-text="${escapeHtml(element.id)}">Edit</button>
      </article>`;
    }).join('') + (filtered.length > 140 ? '<p class="imported-text-limit">Refine the search to see the remaining text.</p>' : '');
  }

  function findImportedTextElement(id) {
    const match = importedTextElements().find(({ element }) => element.id === id);
    return match || null;
  }

  function editImportedText(id) {
    const match = findImportedTextElement(id);
    if (!match) return;
    const element = match.element;
    const currentBinding = String(element.binding || 'STATIC').toUpperCase();
    const suggested = element.suggestedBinding && element.suggestedBinding !== 'STATIC'
      ? `Rev Engine noticed this may be ${IMPORTED_BINDING_LABELS[element.suggestedBinding] || label(element.suggestedBinding)}, but it will not map it unless you choose that field.`
      : 'Keep the wording fixed, map the whole line to live data, or insert live fields inside your own wording.';
    openModal({
      title: `Edit text on page ${match.page.pageNumber}`,
      copy: suggested,
      submitLabel: 'Apply change',
      wide: true,
      body: `<div class="field"><label for="importedTextValue">Text</label><textarea id="importedTextValue" name="text" rows="4">${escapeHtml(element.text == null ? element.originalText : element.text)}</textarea><small class="field-help">Original: ${escapeHtml(element.originalText || '(blank)')}</small></div>
        <div class="imported-merge-field-row"><div class="field"><label for="importedMergeField">Insert a live field into the text</label><select id="importedMergeField" name="mergeField"><option value="">Choose a field</option>${importedBindingOptions('', false)}</select></div><button class="secondary-button" type="button" data-insert-imported-field>Insert field</button></div>
        <div class="document-modal-grid">
          <div class="field"><label for="importedTextBinding">Use live data</label><select id="importedTextBinding" name="binding">${importedBindingOptions(currentBinding)}</select></div>
          <div class="field"><label for="importedTextAlign">Alignment</label><select id="importedTextAlign" name="align"><option value="LEFT"${element.align === 'LEFT' ? ' selected' : ''}>Left</option><option value="CENTER"${element.align === 'CENTER' ? ' selected' : ''}>Centre</option><option value="RIGHT"${element.align === 'RIGHT' ? ' selected' : ''}>Right</option></select></div>
          <div class="field"><label for="importedTextSize">Text size</label><input id="importedTextSize" name="fontSize" type="number" min="4" max="42" step="0.5" value="${escapeHtml(element.fontSize || 9)}"></div>
          <div class="field"><label for="importedTextColor">Text colour</label><input id="importedTextColor" name="textColor" type="color" value="${escapeHtml(element.textColor || '#111827')}"></div>
        </div>
        <div class="document-detail-options imported-text-options"><label><input type="checkbox" name="bold"${element.bold ? ' checked' : ''}><span>Bold</span></label><label><input type="checkbox" name="hidden"${element.hidden ? ' checked' : ''}><span>Hide this text</span></label></div>`,
      onSubmit: async (data) => {
        rememberImportedChange();
        element.text = String(data.get('text') || '');
        element.binding = String(data.get('binding') || 'STATIC');
        element.align = String(data.get('align') || 'LEFT');
        element.fontSize = Math.max(4, Math.min(42, Number(data.get('fontSize')) || 9));
        element.textColor = String(data.get('textColor') || '#111827');
        element.bold = data.get('bold') === 'on';
        element.hidden = data.get('hidden') === 'on';
        renderImportedCanvasControls();
        schedulePreview(80);
      },
      afterOpen: (form) => {
        const binding = form.querySelector('[name="binding"]');
        const text = form.querySelector('[name="text"]');
        const insertField = form.querySelector('[name="mergeField"]');
        const insertButton = form.querySelector('[data-insert-imported-field]');
        const sync = () => { text.disabled = binding.value !== 'STATIC'; };
        binding.addEventListener('change', sync);
        if (insertButton) insertButton.addEventListener('click', () => {
          if (!insertField.value) return;
          binding.value = 'STATIC';
          sync();
          const token = importedMergeToken(insertField.value);
          const start = Number.isFinite(text.selectionStart) ? text.selectionStart : text.value.length;
          const end = Number.isFinite(text.selectionEnd) ? text.selectionEnd : start;
          text.value = `${text.value.slice(0, start)}${token}${text.value.slice(end)}`;
          text.focus();
          text.setSelectionRange(start + token.length, start + token.length);
          insertField.value = '';
        });
        sync();
      }
    });
  }

  function adjustImportedLogo() {
    const canvas = exactImportedCanvas();
    if (!canvas || !canvas.pages.length) return;
    const logos = ensureImportedLogoCollection();
    const selected = selectedImportedLogo();
    const logo = selected || logos[0] || null;
    const pageNumber = Number(logo && logo.page || 1);
    const page = canvas.pages.find((item) => Number(item.pageNumber) === pageNumber) || canvas.pages[0];
    const draft = logo || {
      id: `imported-logo-${page.pageNumber}-${Date.now().toString(36)}`,
      page: Number(page.pageNumber || 1),
      x: 24,
      y: 24,
      width: Math.min(180, page.width / 3),
      height: 80,
      mode: 'ORIGINAL',
      backgroundColor: '#FFFFFF'
    };
    openModal({
      title: logo ? `Adjust logo area on page ${page.pageNumber}` : `Mark a logo area on page ${page.pageNumber}`,
      copy: 'The full company logo is fitted inside this area without cropping. Each page can have its own selectable logo area.',
      submitLabel: 'Save logo area',
      body: `<div class="document-modal-grid">
        ${modalField('x', 'Left position', `<input id="templateModal-x" name="x" type="number" min="0" max="${page.width}" step="1" value="${draft.x}">`)}
        ${modalField('y', 'Top position', `<input id="templateModal-y" name="y" type="number" min="0" max="${page.height}" step="1" value="${draft.y}">`)}
        ${modalField('width', 'Width', `<input id="templateModal-width" name="width" type="number" min="8" max="${page.width}" step="1" value="${draft.width}">`)}
        ${modalField('height', 'Height', `<input id="templateModal-height" name="height" type="number" min="8" max="${page.height}" step="1" value="${draft.height}">`)}
        ${modalField('backgroundColor', 'Background colour', `<input id="templateModal-backgroundColor" name="backgroundColor" type="color" value="${draft.backgroundColor || '#FFFFFF'}">`)}
      </div>`,
      onSubmit: async (data) => {
        rememberImportedChange();
        const next = {
          ...draft,
          page: Number(page.pageNumber || 1),
          x: Math.max(0, Number(data.get('x')) || 0),
          y: Math.max(0, Number(data.get('y')) || 0),
          width: Math.max(8, Number(data.get('width')) || 80),
          height: Math.max(8, Number(data.get('height')) || 40),
          mode: importedInlineLogoMode && importedInlineLogoMode.value || importedLogoMode && importedLogoMode.value || draft.mode || 'ORIGINAL',
          backgroundColor: String(data.get('backgroundColor') || '#FFFFFF')
        };
        const index = logos.findIndex((item) => item.id === next.id);
        if (index >= 0) logos[index] = next;
        else logos.push(next);
        canvas.logos = logos;
        state.selectedImportedLogoId = next.id;
        syncImportedLogoCompatibility();
        renderImportedInlineEditor({ preserveScroll: true });
        schedulePreview(80);
      }
    });
  }

  function openEditor(template) {
    state.selected = deepClone(template);
    state.design = deepClone(template.design || {});
    if (!state.design.variant) state.design.variant = templateVariant(template);
    libraryNodes.forEach((node) => { node.hidden = true; });
    editor.hidden = false;
    document.querySelector('[data-editor-type]').textContent = `${label(template.documentType)} template`;
    document.querySelector('[data-editor-title]').textContent = template.name;
    document.querySelector('[data-editor-status]').textContent = template.isDefault ? 'Published default' : template.isSystem ? 'System template' : label(template.status);
    document.querySelector('[data-editor-status]').className = `badge ${templateTone(template)}`;
    if (editorRoute) {
      const backButton = document.querySelector('[data-back-to-templates]');
      if (backButton) backButton.textContent = '← Templates';
      document.title = `${template.name} · Rev Engine Document Editor`;
    }

    const canvas = exactImportedCanvas();
    const exactImport = Boolean(canvas);
    if (editorRoute && !exactImport) {
      window.location.replace(templateLibraryUrl(template.documentType));
      return;
    }
    state.importedTextSearch = '';
    state.importedPage = 'ALL';
    state.importedMode = 'EDIT';
    state.importedZoom = 1;
    state.selectedImportedElementId = null;
    state.selectedImportedLogoId = null;
    state.importedCaretOffset = null;
    state.importedUndoStack = [];
    state.importedRedoStack = [];
    state.importedTypingSnapshot = null;
    if (exactImport) ensureImportedLogoCollection();
    updateImportedHistoryButtons();
    editor.classList.toggle('is-imported-inline', exactImport);
    document.body.classList.toggle('document-inline-editing', exactImport);
    document.querySelectorAll('[data-structured-design-controls]').forEach((node) => { node.hidden = exactImport; });
    if (structuredWorkspace) structuredWorkspace.hidden = exactImport;
    if (importedInlineEditor) importedInlineEditor.hidden = !exactImport;
    if (importedCanvasControls) importedCanvasControls.hidden = true;

    const importBanner = document.querySelector('[data-import-banner]');
    importBanner.hidden = exactImport || !template.hasImportSource;
    document.querySelectorAll('[data-view-import-source], [data-reconvert-import-source], [data-remove-import-source]').forEach((button) => {
      button.hidden = !template.hasImportSource;
    });
    const viewImport = document.querySelector('[data-view-import-source]');
    if (viewImport) viewImport.textContent = exactImport ? 'Original PDF' : 'Preview original';
    const importHeading = document.querySelector('[data-import-heading]');
    const importCopy = document.querySelector('[data-import-copy]');
    const analysis = template.design && template.design.importAnalysis || {};
    if (importHeading) importHeading.textContent = template.importStatus === 'NEEDS_REVIEW' ? 'This file needs manual rebuilding.' : 'Imported content is ready to review.';
    if (importCopy) {
      const warning = Array.isArray(analysis.warnings) && analysis.warnings[0];
      importCopy.textContent = warning || 'Preview the original beside the live PDF, then review the editable content before publishing.';
    }

    const management = document.querySelector('[data-template-management]');
    const managementCopy = document.querySelector('[data-template-management-copy]');
    if (management) management.classList.toggle('is-system', Boolean(template.isSystem));
    document.querySelectorAll('[data-archive-template], [data-delete-template]').forEach((button) => { button.hidden = Boolean(template.isSystem); });
    if (managementCopy) managementCopy.textContent = template.isSystem
      ? 'System templates stay available for every company. Duplicate this template to create a removable version.'
      : 'Archive it temporarily or delete it from your library. Issued documents keep their saved version.';

    syncControlValues();
    if (exactImport) {
      renderImportedInlineEditor();
      setImportedMode('EDIT');
      window.requestAnimationFrame(() => window.requestAnimationFrame(fitImportedDocument));
    } else {
      renderBlocks();
      schedulePreview(80);
      document.querySelector('[data-template-name]').focus({ preventScroll: true });
    }
  }

  async function loadTemplates(selectId) {
    statusNode.textContent = 'Loading templates…';
    const suffix = state.showArchived ? '?status=ARCHIVED' : '';
    const data = await api(`/document-templates${suffix}`);
    state.templates = data.templates || [];
    state.blockTypes = data.blockTypes || Object.keys(BLOCK_LABELS);
    state.editorContext = data.editorContext || {};
    renderLibrary();
    if (selectId) {
      const selected = state.templates.find((template) => template.id === selectId);
      if (selected && selected.design && selected.design.importedCanvas && !editorRoute) {
        window.location.href = importedEditorUrl(selected);
      } else if (selected) {
        openEditor(selected);
      } else if (editorRoute) {
        window.location.replace(templateLibraryUrl(state.filter));
      }
    }
  }

  function modalField(name, labelText, input, help = '') {
    return `<div class="field"><label for="templateModal-${escapeHtml(name)}">${escapeHtml(labelText)}</label>${input}${help ? `<small class="field-help">${escapeHtml(help)}</small>` : ''}</div>`;
  }

  function openModal({ title, copy, body, submitLabel = 'Continue', cancelLabel = 'Cancel', showCancel = true, wide = false, onSubmit, afterOpen }) {
    modalTitle.textContent = title;
    modalCopy.textContent = copy || '';
    modal.querySelector('.document-template-modal-card').classList.toggle('is-wide', wide);
    modalForm.innerHTML = `${body}<div class="modal-actions">${showCancel ? `<button class="secondary-button" type="button" data-cancel-template-modal>${escapeHtml(cancelLabel)}</button>` : ''}<button class="primary-button" type="submit">${escapeHtml(submitLabel)}</button></div>`;
    modal.hidden = false;
    document.body.classList.add('modal-open');
    modalForm.onsubmit = async (event) => {
      event.preventDefault();
      const submit = modalForm.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        await onSubmit(new FormData(modalForm));
        closeModal();
      } catch (error) {
        notify(error.message || 'The action could not be completed.', false);
      } finally {
        submit.disabled = false;
      }
    };
    const cancel = modalForm.querySelector('[data-cancel-template-modal]');
    if (cancel) cancel.addEventListener('click', closeModal);
    if (typeof afterOpen === 'function') afterOpen(modalForm);
    window.setTimeout(() => {
      const first = modalForm.querySelector('input, select, textarea, button');
      if (first) first.focus();
    }, 0);
  }

  function closeModal() {
    if (state.modalPreviewUrl) URL.revokeObjectURL(state.modalPreviewUrl);
    state.modalPreviewUrl = null;
    modal.hidden = true;
    modal.querySelector('.document-template-modal-card').classList.remove('is-wide');
    modalForm.innerHTML = '';
    modalForm.onsubmit = null;
    document.body.classList.remove('modal-open');
  }

  function createTemplateModal(blank) {
    const title = blank ? 'Start from scratch' : 'Use a ready-made template';
    const copy = blank ? 'Begin with only the essential document areas, then add the sections you need.' : 'Choose a professionally structured starting point and customise every detail.';
    const variants = blank ? '' : modalField('starterVariant', 'Starting style', '<select id="templateModal-starterVariant" name="starterVariant"><option value="PROFESSIONAL">Professional</option><option value="CLASSIC">Classic</option><option value="MINIMAL">Minimal</option></select>');
    openModal({
      title,
      copy,
      submitLabel: 'Create template',
      body: `${modalField('name', 'Template name', '<input id="templateModal-name" name="name" minlength="2" maxlength="120" required placeholder="Example: Zimbabwe invoice">')}${modalField('documentType', 'Document type', '<select id="templateModal-documentType" name="documentType" required><option value="INVOICE">Invoice</option><option value="QUOTE">Quote</option><option value="CONTRACT">Contract</option></select>')}${variants}`,
      onSubmit: async (data) => {
        const created = await api('/document-templates', { method: 'POST', body: JSON.stringify({ name: data.get('name'), documentType: data.get('documentType'), startingPoint: blank ? 'BLANK' : 'STARTER', starterVariant: data.get('starterVariant') || 'PROFESSIONAL' }) });
        state.showArchived = false;
        await loadTemplates(created.id);
        notify('Template created.');
      }
    });
  }

  function importTemplateModal() {
    openModal({
      title: 'Import an existing document',
      copy: 'A searchable PDF keeps its original pages, logo, colours, spacing, and text. You can then edit the text or map it to live customer and document data.',
      submitLabel: 'Import document',
      wide: true,
      body: `<div class="document-import-recommendation"><strong>Best results: searchable PDF or DOCX</strong><span>Images and scanned documents are not recommended. They do not have a reliable editable text layer and may need to be rebuilt manually.</span></div><div class="document-modal-grid">${modalField('name', 'Template name', '<input id="templateModal-name" name="name" minlength="2" maxlength="120" required placeholder="Example: Existing company invoice">')}${modalField('documentType', 'Document type', '<select id="templateModal-documentType" name="documentType" required><option value="INVOICE">Invoice</option><option value="QUOTE">Quote</option><option value="CONTRACT">Contract</option></select>')}</div>${modalField('file', 'Document file', '<input id="templateModal-file" name="file" type="file" accept=".pdf,.docx,.png,.jpg,.jpeg,.webp" required>', 'Maximum 12 MB. Choose a searchable PDF or DOCX whenever possible.')}<div class="document-import-file-warning" data-import-file-warning hidden></div><section class="document-upload-preview" data-upload-preview><div class="document-upload-preview-empty"><strong>Document preview</strong><span>Select a file to check it before conversion.</span></div></section>`,
      afterOpen: (form) => {
        const input = form.querySelector('#templateModal-file');
        const preview = form.querySelector('[data-upload-preview]');
        const warning = form.querySelector('[data-import-file-warning]');
        input.addEventListener('change', () => {
          if (state.modalPreviewUrl) URL.revokeObjectURL(state.modalPreviewUrl);
          state.modalPreviewUrl = null;
          const file = input.files && input.files[0];
          warning.hidden = true;
          warning.textContent = '';
          if (!file) {
            preview.innerHTML = '<div class="document-upload-preview-empty"><strong>Document preview</strong><span>Select a file to check it before conversion.</span></div>';
            return;
          }
          const name = escapeHtml(file.name);
          const isImage = /^image\//.test(file.type);
          const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
          const isDocx = /\.docx$/i.test(file.name);
          if (isImage) {
            warning.hidden = false;
            warning.textContent = 'Image imports are allowed, but they usually require manual rebuilding. A searchable PDF or DOCX will convert more reliably.';
          }
          state.modalPreviewUrl = URL.createObjectURL(file);
          if (isPdf) preview.innerHTML = `<iframe title="Preview of ${name}" src="${state.modalPreviewUrl}"></iframe>`;
          else if (isImage) preview.innerHTML = `<img alt="Preview of ${name}" src="${state.modalPreviewUrl}">`;
          else if (isDocx) preview.innerHTML = `<div class="document-upload-preview-empty"><strong>${name}</strong><span>Word content will be converted into editable sections after upload. The converted preview will open automatically.</span></div>`;
          else preview.innerHTML = `<div class="document-upload-preview-empty"><strong>${name}</strong><span>This file cannot be previewed in the browser.</span></div>`;
        });
      },
      onSubmit: async (data) => {
        const created = await api('/document-templates/import', { method: 'POST', body: data });
        state.showArchived = false;
        await loadTemplates(created.id);
        notify(created.importStatus === 'NEEDS_REVIEW' ? 'Document imported, but no editable text layer was found.' : 'Document imported with its original PDF layout preserved.');
      }
    });
  }

  function paymentAccountMarkup(account, index) {
    const value = (key) => escapeHtml(account && account[key] || '');
    return `<section class="payment-account-editor" data-payment-account-row>
      <div class="payment-account-editor-heading"><strong>Payment option ${index + 1}</strong><button class="text-button" type="button" data-remove-payment-account>Remove</button></div>
      <input type="hidden" name="paymentAccountId" value="${value('id') || `payment-account-${index + 1}`}">
      <div class="document-modal-grid">
        ${modalField(`paymentAccountLabel-${index}`, 'Option name', `<input id="templateModal-paymentAccountLabel-${index}" name="paymentAccountLabel" maxlength="100" value="${value('label')}" placeholder="Example: Self-funded payments">`)}
        ${modalField(`paymentBankName-${index}`, 'Bank name', `<input id="templateModal-paymentBankName-${index}" name="paymentBankName" maxlength="160" value="${value('bankName')}">`)}
        ${modalField(`paymentAccountName-${index}`, 'Account name', `<input id="templateModal-paymentAccountName-${index}" name="paymentAccountName" maxlength="160" value="${value('accountName')}">`)}
        ${modalField(`paymentAccountNumber-${index}`, 'Account number', `<input id="templateModal-paymentAccountNumber-${index}" name="paymentAccountNumber" maxlength="120" value="${value('accountNumber')}">`)}
        ${modalField(`paymentBranchName-${index}`, 'Branch', `<input id="templateModal-paymentBranchName-${index}" name="paymentBranchName" maxlength="160" value="${value('branchName')}">`)}
        ${modalField(`paymentBranchCode-${index}`, 'Branch code', `<input id="templateModal-paymentBranchCode-${index}" name="paymentBranchCode" maxlength="80" value="${value('branchCode')}">`)}
        ${modalField(`paymentSwiftCode-${index}`, 'SWIFT code', `<input id="templateModal-paymentSwiftCode-${index}" name="paymentSwiftCode" maxlength="80" value="${value('swiftCode')}">`)}
      </div>
    </section>`;
  }

  function paymentAccountsForBlock(block) {
    if (Array.isArray(block.accounts) && block.accounts.length) return block.accounts;
    return [{ id: 'payment-account-1', label: 'Bank transfer', bankName: block.bankName || '', accountName: block.accountName || '', accountNumber: block.accountNumber || '', branchName: block.branchName || '', branchCode: block.branchCode || '', swiftCode: block.swiftCode || '' }];
  }

  function wirePaymentAccountEditor(form) {
    const list = form.querySelector('[data-payment-account-list]');
    if (!list) return;
    const refresh = () => {
      const rows = Array.from(list.querySelectorAll('[data-payment-account-row]'));
      rows.forEach((row, index) => {
        const heading = row.querySelector('.payment-account-editor-heading strong');
        if (heading) heading.textContent = `Payment option ${index + 1}`;
        const remove = row.querySelector('[data-remove-payment-account]');
        if (remove) remove.hidden = rows.length === 1;
      });
      const add = form.querySelector('[data-add-payment-account]');
      if (add) add.disabled = rows.length >= 4;
    };
    form.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-remove-payment-account]');
      if (remove) {
        const rows = list.querySelectorAll('[data-payment-account-row]');
        if (rows.length > 1) remove.closest('[data-payment-account-row]').remove();
        refresh();
        return;
      }
      if (event.target.closest('[data-add-payment-account]')) {
        const count = list.querySelectorAll('[data-payment-account-row]').length;
        if (count >= 4) return;
        list.insertAdjacentHTML('beforeend', paymentAccountMarkup({ id: `payment-account-${Date.now().toString(36)}`, label: `Payment option ${count + 1}` }, count));
        refresh();
      }
    });
    refresh();
  }

  function blockEditorFields(block) {
    const fields = block.type === 'FOOTER'
      ? []
      : [modalField('label', 'Section heading', `<input id="templateModal-label" name="label" maxlength="80" value="${escapeHtml(block.label || '')}">`)];
    const bodyTypes = new Set(['PAYMENT_OPTIONS', 'ONLINE_PAYMENT', 'TERMS', 'DISCLAIMER', 'FOOTER', 'CONTRACT_BODY']);
    if (bodyTypes.has(block.type)) fields.push(modalField('body', block.type === 'CONTRACT_BODY' ? 'Main content' : 'Text', `<textarea id="templateModal-body" name="body" rows="6" maxlength="6000" placeholder="Enter the text shown on the document">${escapeHtml(block.body || '')}</textarea>`));
    if (block.type === 'PAYMENT_OPTIONS') {
      fields.push(modalField('accountLayout', 'Payment option layout', `<select id="templateModal-accountLayout" name="accountLayout"><option value="STACKED"${block.accountLayout !== 'COLUMNS' ? ' selected' : ''}>Stacked</option><option value="COLUMNS"${block.accountLayout === 'COLUMNS' ? ' selected' : ''}>Side by side</option></select>`));
      fields.push(`<div class="payment-account-editor-list" data-payment-account-list>${paymentAccountsForBlock(block).slice(0, 4).map(paymentAccountMarkup).join('')}</div>`);
      fields.push('<button class="secondary-button compact" type="button" data-add-payment-account>+ Add another payment option</button>');
      fields.push(modalField('referenceRule', 'Payment reference instruction', `<input id="templateModal-referenceRule" name="referenceRule" maxlength="300" value="${escapeHtml(block.referenceRule || '')}">`));
    }
    if (block.type === 'ONLINE_PAYMENT') {
      fields.push(modalField('buttonLabel', 'Link label', `<input id="templateModal-buttonLabel" name="buttonLabel" maxlength="80" value="${escapeHtml(block.buttonLabel || '')}">`));
      fields.push(modalField('urlMode', 'Payment link source', `<select id="templateModal-urlMode" name="urlMode"><option value="AUTO"${block.urlMode !== 'CUSTOM' ? ' selected' : ''}>Use invoice payment link automatically</option><option value="CUSTOM"${block.urlMode === 'CUSTOM' ? ' selected' : ''}>Use a fixed web address</option></select>`));
      fields.push(modalField('customUrl', 'Fixed web address', `<input id="templateModal-customUrl" name="customUrl" type="url" maxlength="1000" value="${escapeHtml(block.customUrl || '')}" placeholder="https://">`));
    }
    if (block.type === 'SIGNATURES') {
      fields.push('<div class="document-modal-grid">');
      fields.push(modalField('leftLabel', 'Left signature label', `<input id="templateModal-leftLabel" name="leftLabel" maxlength="100" value="${escapeHtml(block.leftLabel || '')}">`));
      fields.push(modalField('rightLabel', 'Right signature label', `<input id="templateModal-rightLabel" name="rightLabel" maxlength="100" value="${escapeHtml(block.rightLabel || '')}">`));
      fields.push('</div>');
    }
    if (block.type === 'LINE_ITEMS') {
      const columns = Array.isArray(block.columns) ? block.columns.join(', ') : 'DESCRIPTION, QTY, UNIT, TOTAL';
      fields.push(modalField('columns', 'Column labels', `<input id="templateModal-columns" name="columns" maxlength="160" value="${escapeHtml(columns)}">`, 'Enter four labels separated by commas: description, quantity, unit price, and total.'));
    }
    return fields.join('');
  }

  function editBlock(id) {
    const block = state.design.blocks.find((item) => item.id === id);
    if (!block) return;
    openModal({
      title: `Edit ${BLOCK_LABELS[block.type] || label(block.type)}`,
      copy: 'Changes appear in the live PDF preview before you publish them.',
      submitLabel: 'Apply changes',
      body: blockEditorFields(block),
      afterOpen: (form) => { if (block.type === 'PAYMENT_OPTIONS') wirePaymentAccountEditor(form); },
      onSubmit: async (data) => {
        ['label', 'body', 'accountLayout', 'bankName', 'accountName', 'accountNumber', 'branchName', 'branchCode', 'swiftCode', 'referenceRule', 'buttonLabel', 'urlMode', 'customUrl', 'leftLabel', 'rightLabel'].forEach((field) => {
          if (data.has(field)) block[field] = String(data.get(field) || '').trim();
        });
        if (data.has('columns')) block.columns = String(data.get('columns') || '').split(',').map((item) => item.trim().toUpperCase()).filter(Boolean).slice(0, 4);
        if (block.type === 'PAYMENT_OPTIONS') {
          const ids = data.getAll('paymentAccountId');
          const labels = data.getAll('paymentAccountLabel');
          const bankNames = data.getAll('paymentBankName');
          const accountNames = data.getAll('paymentAccountName');
          const accountNumbers = data.getAll('paymentAccountNumber');
          const branchNames = data.getAll('paymentBranchName');
          const branchCodes = data.getAll('paymentBranchCode');
          const swiftCodes = data.getAll('paymentSwiftCode');
          block.accounts = ids.slice(0, 4).map((id, index) => ({
            id: String(id || `payment-account-${index + 1}`),
            label: String(labels[index] || `Payment option ${index + 1}`).trim(),
            bankName: String(bankNames[index] || '').trim(),
            accountName: String(accountNames[index] || '').trim(),
            accountNumber: String(accountNumbers[index] || '').trim(),
            branchName: String(branchNames[index] || '').trim(),
            branchCode: String(branchCodes[index] || '').trim(),
            swiftCode: String(swiftCodes[index] || '').trim()
          }));
          const first = block.accounts[0] || {};
          Object.assign(block, { bankName: first.bankName || '', accountName: first.accountName || '', accountNumber: first.accountNumber || '', branchName: first.branchName || '', branchCode: first.branchCode || '', swiftCode: first.swiftCode || '' });
        }
        renderBlocks();
        schedulePreview();
      }
    });
  }

  function addBlockModal() {
    const existing = new Set(state.design.blocks.map((block) => block.type));
    const allowed = state.blockTypes.filter((type) => !existing.has(type)).filter((type) => {
      if (state.selected.documentType !== 'CONTRACT' && ['CONTRACT_BODY', 'SIGNATURES'].includes(type)) return false;
      return true;
    });
    if (!allowed.length) {
      notify('Every available section is already in this template.', false);
      return;
    }
    openModal({
      title: 'Add document section',
      copy: 'Choose another structured section. You can edit and arrange it after adding it.',
      submitLabel: 'Add section',
      body: modalField('type', 'Section', `<select id="templateModal-type" name="type">${allowed.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(BLOCK_LABELS[type] || label(type))}</option>`).join('')}</select>`),
      onSubmit: async (data) => {
        state.design.blocks.push(emptyBlock(String(data.get('type'))));
        renderBlocks();
        schedulePreview();
      }
    });
  }

  function moveBlock(id, direction) {
    const index = state.design.blocks.findIndex((block) => block.id === id);
    if (index < 0 || CORE_BLOCKS.has(state.design.blocks[index].type)) return;
    const next = direction === 'up' ? index - 1 : index + 1;
    if (next < 0 || next >= state.design.blocks.length || CORE_BLOCKS.has(state.design.blocks[next].type)) return;
    [state.design.blocks[index], state.design.blocks[next]] = [state.design.blocks[next], state.design.blocks[index]];
    renderBlocks();
    schedulePreview();
  }

  function toggleBlock(id) {
    const block = state.design.blocks.find((item) => item.id === id);
    if (!block) return;
    block.visible = block.visible === false;
    renderBlocks();
    schedulePreview();
  }

  async function saveTemplate(showNotice = true) {
    if (!state.selected || state.saving) return null;
    state.saving = true;
    const button = document.querySelector('[data-save-template]');
    button.disabled = true;
    try {
      const name = document.querySelector('[data-template-name]').value.trim();
      if (name.length < 2) throw new Error('Enter a template name with at least two characters.');
      const saved = await api(`/document-templates/${encodeURIComponent(state.selected.id)}`, { method: 'PATCH', body: JSON.stringify({ name, design: state.design }) });
      state.selected = deepClone(saved);
      state.design = deepClone(saved.design);
      const index = state.templates.findIndex((item) => item.id === saved.id);
      if (index >= 0) state.templates[index] = saved;
      renderLibrary();
      document.querySelector('[data-editor-title]').textContent = saved.name;
      if (exactImportedCanvas()) renderImportedInlineEditor({ preserveScroll: true });
      else renderBlocks();
      if (showNotice) notify('Draft saved.');
      return saved;
    } finally {
      state.saving = false;
      button.disabled = false;
    }
  }

  async function publishTemplate() {
    const saved = await saveTemplate(false);
    if (!saved) return;
    const accepted = !window.RevEngineUI || await window.RevEngineUI.confirm({
      title: `Publish ${saved.name}?`,
      message: `This becomes the default ${label(saved.documentType).toLowerCase()} design. Documents already issued keep their original version.`,
      confirmLabel: 'Publish as default'
    });
    if (!accepted) return;
    const published = await api(`/document-templates/${encodeURIComponent(saved.id)}/publish`, { method: 'POST' });
    await loadTemplates(published.id);
    notify(`Published version ${published.currentVersion}.`);
  }

  async function duplicateTemplate(id) {
    const duplicate = await api(`/document-templates/${encodeURIComponent(id)}/duplicate`, { method: 'POST' });
    state.showArchived = false;
    await loadTemplates(duplicate.id);
    notify('Template duplicated.');
  }

  async function archiveTemplate() {
    if (!state.selected || state.selected.isSystem) return;
    const accepted = !window.RevEngineUI || await window.RevEngineUI.confirm({
      title: `Archive ${state.selected.name}?`,
      message: 'You can restore it later from Archived templates. Documents already issued will not change.',
      confirmLabel: 'Archive template',
      danger: true
    });
    if (!accepted) return;
    await api(`/document-templates/${encodeURIComponent(state.selected.id)}/archive`, { method: 'POST' });
    showLibrary();
    await loadTemplates();
    notify('Template archived.');
  }

  async function restoreTemplate(id) {
    const restored = await api(`/document-templates/${encodeURIComponent(id)}/restore`, { method: 'POST' });
    await loadTemplates();
    notify(`${restored.name} restored.`);
  }

  async function deleteTemplate(id = state.selected && state.selected.id) {
    const template = state.templates.find((item) => item.id === id) || state.selected;
    if (!template || template.isSystem) return;
    const accepted = !window.RevEngineUI || await window.RevEngineUI.confirm({
      title: `Delete ${template.name}?`,
      message: 'This removes the template from your library. Documents already issued keep the exact saved version.',
      confirmLabel: 'Delete template',
      danger: true
    });
    if (!accepted) return;
    await api(`/document-templates/${encodeURIComponent(template.id)}`, { method: 'DELETE' });
    if (state.selected && state.selected.id === template.id) showLibrary();
    await loadTemplates();
    notify('Template deleted.');
  }

  function viewImportedSource() {
    if (!state.selected || !state.selected.hasImportSource) return;
    const url = `${API_BASE}/document-templates/${encodeURIComponent(state.selected.id)}/import-preview`;
    openModal({
      title: 'Original document',
      copy: state.selected.importFileName || 'Compare the original file with the editable live PDF before publishing.',
      body: `<section class="document-source-preview"><iframe title="Original imported document" src="${escapeHtml(url)}"></iframe></section>`,
      submitLabel: 'Close',
      showCancel: false,
      wide: true,
      onSubmit: async () => {}
    });
  }

  async function removeImportedSource() {
    if (!state.selected || !state.selected.hasImportSource) return;
    const accepted = !window.RevEngineUI || await window.RevEngineUI.confirm({
      title: 'Remove imported file?',
      message: 'The editable imported canvas stays. Only the separate original upload used for comparison is removed.',
      confirmLabel: 'Remove file',
      danger: true
    });
    if (!accepted) return;
    const updated = await api(`/document-templates/${encodeURIComponent(state.selected.id)}/import-source`, { method: 'DELETE' });
    state.selected = deepClone(updated);
    const index = state.templates.findIndex((item) => item.id === updated.id);
    if (index >= 0) state.templates[index] = updated;
    document.querySelector('[data-import-banner]').hidden = true;
    document.querySelectorAll('[data-view-import-source], [data-reconvert-import-source], [data-remove-import-source]').forEach((button) => { button.hidden = true; });
    renderLibrary();
    notify('Original comparison file removed. The imported layout remains.');
  }

  async function reconvertImportedSource() {
    if (!state.selected || !state.selected.hasImportSource) return;
    const accepted = !window.RevEngineUI || await window.RevEngineUI.confirm({
      title: 'Convert the original again?',
      message: 'This restores the original PDF pages and rebuilds the editable text layer. Your current working edits will be replaced. Published versions and issued documents will not change.',
      confirmLabel: 'Convert again'
    });
    if (!accepted) return;
    const updated = await api(`/document-templates/${encodeURIComponent(state.selected.id)}/reconvert`, { method: 'POST' });
    await loadTemplates(updated.id);
    notify(updated.importStatus === 'NEEDS_REVIEW' ? 'The pages were preserved, but no reliable editable text layer was found.' : 'Original PDF layout restored with editable text.');
  }

  function schedulePreview(delay = 450) {
    if (!state.selected || !state.design) return;
    window.clearTimeout(state.previewTimer);
    setImportedPreviewStatus('Updating preview…');
    state.previewTimer = window.setTimeout(updatePreview, delay);
  }

  async function updatePreview() {
    if (!state.selected || !state.design) return;
    const request = ++state.previewRequest;
    if (state.previewController) state.previewController.abort();
    const controller = new AbortController();
    state.previewController = controller;
    try {
      const blob = await api('/document-templates/preview.pdf', {
        method: 'POST',
        body: JSON.stringify({ documentType: state.selected.documentType, design: state.design }),
        expectBlob: true,
        signal: controller.signal
      });
      if (request !== state.previewRequest || controller.signal.aborted) return;
      if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
      state.previewUrl = URL.createObjectURL(blob);
      if (previewFrame) previewFrame.src = state.previewUrl;
      if (importedPreviewFrame) importedPreviewFrame.src = state.previewUrl;
      setImportedPreviewStatus('Preview updated');
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      if (request !== state.previewRequest) return;
      setImportedPreviewStatus('Preview unavailable');
      notify(error.message || 'The preview could not be created.', false);
    } finally {
      if (state.previewController === controller) state.previewController = null;
    }
  }

  document.addEventListener('click', async (event) => {
    const openEditorMenu = event.target.closest('[data-imported-editor-menu]');
    document.querySelectorAll('[data-imported-editor-menu][open]').forEach((menu) => {
      if (!openEditorMenu || menu !== openEditorMenu || event.target.closest('.imported-file-menu-item')) menu.removeAttribute('open');
    });
    const open = event.target.closest('[data-template-open]');
    const duplicate = event.target.closest('[data-template-duplicate]');
    const restore = event.target.closest('[data-template-restore]');
    const deleteCard = event.target.closest('[data-template-delete]');
    const move = event.target.closest('[data-block-move]');
    try {
      if (event.target.closest('[data-imported-undo]')) { undoImportedChange(); return; }
      if (event.target.closest('[data-imported-redo]')) { redoImportedChange(); return; }
      const importedMode = event.target.closest('[data-imported-editor-mode]');
      if (importedMode) { setImportedMode(importedMode.dataset.importedEditorMode); return; }
      const importedZoom = event.target.closest('[data-imported-zoom]');
      if (importedZoom) {
        const action = importedZoom.dataset.importedZoom;
        if (action === 'fit') fitImportedDocument();
        else {
          const next = state.importedZoom + (action === 'in' ? 0.1 : -0.1);
          state.importedZoom = Math.max(0.5, Math.min(1.8, Number(next.toFixed(2))));
          renderImportedInlineEditor({ preserveScroll: true });
        }
        return;
      }
      const inlineText = event.target.closest('[data-imported-inline-text]');
      if (inlineText) { selectImportedText(inlineText.dataset.importedInlineText, inlineText); return; }
      const inlineLogo = event.target.closest('[data-imported-inline-logo]');
      if (inlineLogo) { selectImportedLogo(inlineLogo); return; }
      if (event.target.closest('[data-imported-inline-bold]')) { updateImportedTextFormatting('bold'); return; }
      const inlineAlign = event.target.closest('[data-imported-inline-align]');
      if (inlineAlign) { updateImportedTextFormatting('align', inlineAlign.dataset.importedInlineAlign); return; }
      if (event.target.closest('[data-imported-inline-reset]')) { updateImportedTextFormatting('reset'); return; }
      if (event.target.closest('[data-imported-inline-hide]')) { updateImportedTextFormatting('hide'); return; }
      if (event.target.closest('[data-imported-inline-insert-field]')) { openImportedFieldPicker(); return; }
      if (state.importedMode === 'EDIT' && event.target.closest('[data-imported-document-stage]') && !event.target.closest('[data-imported-contextbar]')) clearImportedSelection();
      if (open) {
        const template = state.templates.find((item) => item.id === open.dataset.templateOpen);
        if (template && template.design && template.design.importedCanvas && !editorRoute) {
          window.location.href = importedEditorUrl(template);
        } else if (template) {
          openEditor(template);
        }
        return;
      }
      if (duplicate) { await duplicateTemplate(duplicate.dataset.templateDuplicate); return; }
      if (restore) { await restoreTemplate(restore.dataset.templateRestore); return; }
      if (deleteCard) { await deleteTemplate(deleteCard.dataset.templateDelete); return; }
      if (event.target.closest('[data-toggle-archived]')) {
        state.showArchived = !state.showArchived;
        await loadTemplates();
        return;
      }
      if (event.target.closest('[data-import-template]')) { importTemplateModal(); return; }
      if (event.target.closest('[data-create-blank]')) { createTemplateModal(true); return; }
      if (event.target.closest('[data-create-starter]')) { createTemplateModal(false); return; }
      if (event.target.closest('[data-back-to-templates]')) { editorRoute ? returnToTemplateLibrary() : showLibrary(); return; }
      if (event.target.closest('[data-add-block]')) { addBlockModal(); return; }
      if (event.target.closest('[data-save-template]')) { await saveTemplate(); return; }
      if (event.target.closest('[data-publish-template]')) { await publishTemplate(); return; }
      if (event.target.closest('[data-duplicate-template]') && state.selected) { await duplicateTemplate(state.selected.id); return; }
      if (event.target.closest('[data-archive-template]')) { await archiveTemplate(); return; }
      if (event.target.closest('[data-delete-template]')) { await deleteTemplate(); return; }
      if (event.target.closest('[data-view-import-source]')) { viewImportedSource(); return; }
      if (event.target.closest('[data-reconvert-import-source]')) { await reconvertImportedSource(); return; }
      if (event.target.closest('[data-remove-import-source]')) { await removeImportedSource(); return; }
      const importedTextEdit = event.target.closest('[data-edit-imported-text]');
      if (importedTextEdit) { editImportedText(importedTextEdit.dataset.editImportedText); return; }
      if (event.target.closest('[data-adjust-import-logo]')) { adjustImportedLogo(); return; }
      if (event.target.closest('[data-close-template-modal]')) { closeModal(); return; }
      const edit = event.target.closest('[data-block-edit]');
      if (edit) { editBlock(edit.dataset.blockEdit); return; }
      const toggle = event.target.closest('[data-block-toggle]');
      if (toggle) { toggleBlock(toggle.dataset.blockToggle); return; }
      if (move) { moveBlock(move.dataset.blockId, move.dataset.blockMove); }
    } catch (error) {
      notify(error.message || 'The action could not be completed.', false);
    }
  });

  document.querySelectorAll('[data-document-filter]').forEach((button) => button.addEventListener('click', () => {
    state.filter = button.dataset.documentFilter;
    document.querySelectorAll('[data-document-filter]').forEach((item) => item.classList.toggle('active', item === button));
    renderLibrary();
  }));

  document.querySelectorAll('[data-design-path]').forEach((control) => {
    const update = () => {
      if (!state.design) return;
      let value = control.type === 'checkbox' ? control.checked : control.value;
      if (['typography.bodySize', 'page.margin'].includes(control.dataset.designPath)) value = Number(value);
      setPath(state.design, control.dataset.designPath, value);
      if (control.dataset.designPath === 'header.visible') syncHeaderDependentControls();
      schedulePreview();
    };
    control.addEventListener(control.type === 'color' ? 'input' : 'change', update);
  });

  if (importedLogoMode) importedLogoMode.addEventListener('change', () => {
    const logos = ensureImportedLogoCollection();
    if (!logos.length) return;
    rememberImportedChange();
    logos.forEach((logo) => { logo.mode = importedLogoMode.value; });
    syncImportedLogoCompatibility();
    renderImportedInlineEditor({ preserveScroll: true });
    schedulePreview(80);
  });

  if (importedTextSearch) importedTextSearch.addEventListener('input', () => {
    state.importedTextSearch = importedTextSearch.value;
    renderImportedCanvasControls();
  });

  if (importedPageFilter) importedPageFilter.addEventListener('change', () => {
    state.importedPage = importedPageFilter.value;
    renderImportedCanvasControls();
  });

  if (importedInlineBinding) importedInlineBinding.addEventListener('change', () => {
    const match = selectedImportedText();
    if (!match) return;
    rememberImportedChange();
    const element = match.element;
    element.binding = importedInlineBinding.value || 'STATIC';
    element.hidden = false;
    if (element.binding === 'STATIC' && element.text == null) element.text = element.originalText;
    refreshImportedInlineEditor({ focus: element.binding === 'STATIC' });
    schedulePreview(400);
  });

  if (importedInlineColour) importedInlineColour.addEventListener('change', () => {
    updateImportedTextFormatting('colour', importedInlineColour.value);
  });

  if (importedInlineLogoMode) importedInlineLogoMode.addEventListener('change', () => {
    const logo = selectedImportedLogo();
    if (!logo) return;
    rememberImportedChange();
    logo.mode = importedInlineLogoMode.value;
    syncImportedLogoCompatibility();
    refreshImportedInlineEditor();
    schedulePreview(300);
  });

  document.addEventListener('focusin', (event) => {
    const node = event.target.closest && event.target.closest('[data-imported-inline-text]');
    if (!node) return;
    const match = findImportedTextElement(node.dataset.importedInlineText);
    if (!match) return;
    selectImportedText(match.element.id, node);
    state.importedTypingSnapshot = importedHistorySnapshot();
    if (String(match.element.binding || 'STATIC').toUpperCase() === 'STATIC' && !match.element.hidden) {
      node.classList.add('is-active');
      const editableValue = String(match.element.text == null ? match.element.originalText : match.element.text);
      if (node.textContent !== editableValue) {
        node.textContent = editableValue;
        window.setTimeout(() => setCaretAtEnd(node), 0);
      }
    }
  });

  document.addEventListener('input', (event) => {
    const node = event.target.closest && event.target.closest('[data-imported-inline-text]');
    if (!node) return;
    const match = findImportedTextElement(node.dataset.importedInlineText);
    if (!match) return;
    const value = String(node.innerText || node.textContent || '').replace(/[\r\n]+/g, ' ');
    if (state.importedTypingSnapshot) {
      rememberImportedChange(state.importedTypingSnapshot);
      state.importedTypingSnapshot = null;
    }
    match.element.text = value;
    match.element.binding = 'STATIC';
    match.element.hidden = false;
    state.importedCaretOffset = currentCaretOffset(node);
    node.classList.remove('is-original', 'is-live-field', 'is-hidden-text');
    node.classList.add('is-replacement', 'is-active');
    syncImportedContextbar();
    schedulePreview(800);
  });

  document.addEventListener('focusout', (event) => {
    const node = event.target.closest && event.target.closest('[data-imported-inline-text]');
    if (!node) return;
    const match = findImportedTextElement(node.dataset.importedInlineText);
    if (!match) return;
    node.classList.remove('is-active');
    state.importedTypingSnapshot = null;
    node.textContent = match.element.hidden ? 'Hidden text' : importedElementDisplayValue(match.element);
  });

  document.addEventListener('keyup', (event) => {
    const node = event.target.closest && event.target.closest('[data-imported-inline-text]');
    if (node) state.importedCaretOffset = currentCaretOffset(node);
  });

  document.addEventListener('mouseup', (event) => {
    const node = event.target.closest && event.target.closest('[data-imported-inline-text]');
    if (node) state.importedCaretOffset = currentCaretOffset(node);
  });

  document.addEventListener('keydown', (event) => {
    const shortcut = (event.ctrlKey || event.metaKey) ? String(event.key || '').toLowerCase() : '';
    if (editorRoute && shortcut === 's') {
      event.preventDefault();
      saveTemplate().catch((error) => notify(error.message || 'The template could not be saved.', false));
      return;
    }
    if (editorRoute && shortcut === 'z') {
      event.preventDefault();
      if (event.shiftKey) redoImportedChange();
      else undoImportedChange();
      return;
    }
    if (editorRoute && shortcut === 'y') {
      event.preventDefault();
      redoImportedChange();
      return;
    }
    const node = event.target.closest && event.target.closest('[data-imported-inline-text]');
    if (!node) return;
    if (event.key === 'Enter') event.preventDefault();
    if (event.key === 'Escape') node.blur();
  });

  document.addEventListener('paste', (event) => {
    const node = event.target.closest && event.target.closest('[data-imported-inline-text]');
    if (!node) return;
    event.preventDefault();
    const text = String(event.clipboardData && event.clipboardData.getData('text/plain') || '').replace(/[\r\n]+/g, ' ');
    document.execCommand('insertText', false, text);
  });

  document.querySelector('[data-template-name]').addEventListener('input', (event) => {
    if (!state.selected) return;
    document.querySelector('[data-editor-title]').textContent = event.target.value.trim() || 'Untitled template';
  });

  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) closeModal(); });
  window.addEventListener('beforeunload', () => {
    if (state.previewController) state.previewController.abort();
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  });

  document.querySelectorAll('[data-document-filter]').forEach((button) => {
    button.classList.toggle('active', button.dataset.documentFilter === state.filter);
  });

  if (editorRoute && !routeTemplateId) {
    window.location.replace(templateLibraryUrl(state.filter));
    return;
  }

  loadTemplates(editorRoute ? routeTemplateId : null).catch((error) => {
    statusNode.textContent = 'Templates could not be loaded';
    grid.innerHTML = '<div class="empty-state"><div><strong>Document Studio is unavailable</strong><span>Refresh the page or check your connection.</span></div></div>';
    notify(error.message || 'Document templates could not be loaded.', false);
  });
})();
