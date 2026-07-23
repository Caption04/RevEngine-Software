(function () {
  if (document.body.dataset.page !== 'document-templates') return;

  const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api';
  const state = {
    templates: [],
    blockTypes: [],
    filter: 'INVOICE',
    showArchived: false,
    selected: null,
    design: null,
    previewTimer: null,
    previewUrl: null,
    saving: false
  };

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
      PAYMENT_OPTIONS: { label: 'Payment options', body: '', accounts: [{ id: 'payment-account-1', label: 'Bank transfer', bankName: '', accountName: '', accountNumber: '', branchName: '', branchCode: '', swiftCode: '' }], bankName: '', accountName: '', accountNumber: '', branchName: '', branchCode: '', swiftCode: '', referenceRule: 'Use the invoice number as the payment reference.' },
      ONLINE_PAYMENT: { label: 'Pay online', buttonLabel: 'Make payment online', urlMode: 'AUTO', customUrl: '' },
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
      const source = template.isSystem ? 'System template' : template.sourceType === 'IMPORTED' && template.hasImportSource ? 'Imported reference' : template.sourceType === 'BLANK' ? 'Built from scratch' : 'Ready-made template';
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

  function showLibrary() {
    state.selected = null;
    state.design = null;
    libraryNodes.forEach((node) => { node.hidden = false; });
    editor.hidden = true;
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = null;
    previewFrame.removeAttribute('src');
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

    const importBanner = document.querySelector('[data-import-banner]');
    importBanner.hidden = !template.hasImportSource;
    const viewImport = document.querySelector('[data-view-import-source]');
    if (viewImport) viewImport.textContent = template.importFileName ? `View ${template.importFileName}` : 'View imported file';

    const management = document.querySelector('[data-template-management]');
    const managementActions = document.querySelector('[data-template-management-actions]');
    const managementCopy = document.querySelector('[data-template-management-copy]');
    if (management) management.classList.toggle('is-system', Boolean(template.isSystem));
    if (managementActions) managementActions.querySelectorAll('[data-archive-template], [data-delete-template]').forEach((button) => { button.hidden = Boolean(template.isSystem); });
    if (managementCopy) managementCopy.textContent = template.isSystem
      ? 'System templates stay available for every company. Duplicate this template to create a removable version.'
      : 'Archive it temporarily or delete it from your library. Issued documents keep their saved version.';

    syncControlValues();
    renderBlocks();
    schedulePreview(80);
    document.querySelector('[data-template-name]').focus({ preventScroll: true });
  }

  async function loadTemplates(selectId) {
    statusNode.textContent = 'Loading templates…';
    const suffix = state.showArchived ? '?status=ARCHIVED' : '';
    const data = await api(`/document-templates${suffix}`);
    state.templates = data.templates || [];
    state.blockTypes = data.blockTypes || Object.keys(BLOCK_LABELS);
    renderLibrary();
    if (selectId) {
      const selected = state.templates.find((template) => template.id === selectId);
      if (selected) openEditor(selected);
    }
  }

  function modalField(name, labelText, input, help = '') {
    return `<div class="field"><label for="templateModal-${escapeHtml(name)}">${escapeHtml(labelText)}</label>${input}${help ? `<small class="field-help">${escapeHtml(help)}</small>` : ''}</div>`;
  }

  function openModal({ title, copy, body, submitLabel = 'Continue', onSubmit, afterOpen }) {
    modalTitle.textContent = title;
    modalCopy.textContent = copy || '';
    modalForm.innerHTML = `${body}<div class="modal-actions"><button class="secondary-button" type="button" data-cancel-template-modal>Cancel</button><button class="primary-button" type="submit">${escapeHtml(submitLabel)}</button></div>`;
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
    modalForm.querySelector('[data-cancel-template-modal]').addEventListener('click', closeModal);
    if (typeof afterOpen === 'function') afterOpen(modalForm);
    window.setTimeout(() => {
      const first = modalForm.querySelector('input, select, textarea, button');
      if (first) first.focus();
    }, 0);
  }

  function closeModal() {
    modal.hidden = true;
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
      copy: 'Upload a PDF, Word document, or image. Rev Engine keeps it privately as a reference while you map its style into editable sections.',
      submitLabel: 'Import and map',
      body: `${modalField('name', 'Template name', '<input id="templateModal-name" name="name" minlength="2" maxlength="120" required placeholder="Example: Existing company invoice">')}${modalField('documentType', 'Document type', '<select id="templateModal-documentType" name="documentType" required><option value="INVOICE">Invoice</option><option value="QUOTE">Quote</option><option value="CONTRACT">Contract</option></select>')}${modalField('file', 'Document file', '<input id="templateModal-file" name="file" type="file" accept=".pdf,.docx,.png,.jpg,.jpeg,.webp" required>', 'PDF, DOCX, PNG, JPG, or WEBP. Maximum 12 MB.')}`,
      onSubmit: async (data) => {
        const created = await api('/document-templates/import', { method: 'POST', body: data });
        state.showArchived = false;
        await loadTemplates(created.id);
        notify('Document imported. Match its design using the editable sections.');
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
    const fields = [modalField('label', 'Section heading', `<input id="templateModal-label" name="label" maxlength="80" value="${escapeHtml(block.label || '')}">`)];
    const bodyTypes = new Set(['PAYMENT_OPTIONS', 'TERMS', 'DISCLAIMER', 'FOOTER', 'CONTRACT_BODY']);
    if (bodyTypes.has(block.type)) fields.push(modalField('body', block.type === 'CONTRACT_BODY' ? 'Main content' : 'Text', `<textarea id="templateModal-body" name="body" rows="6" maxlength="6000" placeholder="Enter the text shown on the document">${escapeHtml(block.body || '')}</textarea>`));
    if (block.type === 'PAYMENT_OPTIONS') {
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
      fields.push(modalField('columns', 'Column labels', `<input id="templateModal-columns" name="columns" maxlength="160" value="${escapeHtml(columns)}">`, 'Separate labels with commas. The table remains responsive when an invoice has many items.'));
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
        ['label', 'body', 'bankName', 'accountName', 'accountNumber', 'branchName', 'branchCode', 'swiftCode', 'referenceRule', 'buttonLabel', 'urlMode', 'customUrl', 'leftLabel', 'rightLabel'].forEach((field) => {
          if (data.has(field)) block[field] = String(data.get(field) || '').trim();
        });
        if (data.has('columns')) block.columns = String(data.get('columns') || '').split(',').map((item) => item.trim().toUpperCase()).filter(Boolean).slice(0, 6);
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
      renderBlocks();
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
    const url = `${API_BASE}/document-templates/${encodeURIComponent(state.selected.id)}/import-source`;
    const opened = window.open(url, '_blank');
    if (opened) opened.opener = null;
    else notify('Allow pop-ups for this site, then try again.', false);
  }

  async function removeImportedSource() {
    if (!state.selected || !state.selected.hasImportSource) return;
    const accepted = !window.RevEngineUI || await window.RevEngineUI.confirm({
      title: 'Remove imported file?',
      message: 'The editable template stays. Only the original reference file is removed.',
      confirmLabel: 'Remove file',
      danger: true
    });
    if (!accepted) return;
    const updated = await api(`/document-templates/${encodeURIComponent(state.selected.id)}/import-source`, { method: 'DELETE' });
    state.selected = deepClone(updated);
    const index = state.templates.findIndex((item) => item.id === updated.id);
    if (index >= 0) state.templates[index] = updated;
    document.querySelector('[data-import-banner]').hidden = true;
    renderLibrary();
    notify('Imported file removed.');
  }

  function schedulePreview(delay = 450) {
    window.clearTimeout(state.previewTimer);
    previewStatus.textContent = 'Updating preview…';
    state.previewTimer = window.setTimeout(updatePreview, delay);
  }

  async function updatePreview() {
    if (!state.selected || !state.design) return;
    try {
      const blob = await api('/document-templates/preview.pdf', { method: 'POST', body: JSON.stringify({ documentType: state.selected.documentType, design: state.design }), expectBlob: true });
      if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
      state.previewUrl = URL.createObjectURL(blob);
      previewFrame.src = state.previewUrl;
      previewStatus.textContent = 'Preview updated';
    } catch (error) {
      previewStatus.textContent = 'Preview unavailable';
      notify(error.message || 'The preview could not be created.', false);
    }
  }

  document.addEventListener('click', async (event) => {
    const open = event.target.closest('[data-template-open]');
    const duplicate = event.target.closest('[data-template-duplicate]');
    const restore = event.target.closest('[data-template-restore]');
    const deleteCard = event.target.closest('[data-template-delete]');
    const move = event.target.closest('[data-block-move]');
    try {
      if (open) {
        const template = state.templates.find((item) => item.id === open.dataset.templateOpen);
        if (template) openEditor(template);
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
      if (event.target.closest('[data-back-to-templates]')) { showLibrary(); return; }
      if (event.target.closest('[data-add-block]')) { addBlockModal(); return; }
      if (event.target.closest('[data-save-template]')) { await saveTemplate(); return; }
      if (event.target.closest('[data-publish-template]')) { await publishTemplate(); return; }
      if (event.target.closest('[data-duplicate-template]') && state.selected) { await duplicateTemplate(state.selected.id); return; }
      if (event.target.closest('[data-archive-template]')) { await archiveTemplate(); return; }
      if (event.target.closest('[data-delete-template]')) { await deleteTemplate(); return; }
      if (event.target.closest('[data-view-import-source]')) { viewImportedSource(); return; }
      if (event.target.closest('[data-remove-import-source]')) { await removeImportedSource(); return; }
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

  document.querySelector('[data-template-name]').addEventListener('input', (event) => {
    if (!state.selected) return;
    document.querySelector('[data-editor-title]').textContent = event.target.value.trim() || 'Untitled template';
  });

  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !modal.hidden) closeModal(); });
  window.addEventListener('beforeunload', () => { if (state.previewUrl) URL.revokeObjectURL(state.previewUrl); });

  loadTemplates().catch((error) => {
    statusNode.textContent = 'Templates could not be loaded';
    grid.innerHTML = '<div class="empty-state"><div><strong>Document Studio is unavailable</strong><span>Refresh the page or check your connection.</span></div></div>';
    notify(error.message || 'Document templates could not be loaded.', false);
  });
})();
