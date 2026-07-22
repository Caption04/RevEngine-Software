(function () {
  const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api';
  const page = document.body.dataset.page || '';

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
  }

  function asArray(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.data)) return data.data;
    return [];
  }

  function statusNode() {
    return document.querySelector('[data-status], #status, [data-api-status]');
  }

  function setStatus(message, ok) {
    const node = statusNode();
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('red', ok === false);
  }

  function notifyAction(message, ok = true) {
    if (window.RevEngineUI) window.RevEngineUI.notify(message, { type: ok ? 'success' : 'error' });
  }

  function badge(value) {
    return '<span class="badge">' + escapeHtml(String(value || '-').replace(/_/g, ' ')) + '</span>';
  }

  function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
  }

  async function api(path, options = {}) {
    const response = await fetch(API_BASE + path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error((payload.error && payload.error.message) || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload.data;
  }

  function formJson(form) {
    const data = {};
    const formData = new FormData(form);
    for (const [key, value] of formData.entries()) {
      if (value === '') continue;
      const input = form.elements[key];
      if (input && input.type === 'number') data[key] = Number(value);
      else if (value === 'true') data[key] = true;
      else if (value === 'false') data[key] = false;
      else data[key] = value;
    }
    return data;
  }

  function setRows(selector, rows, emptyColspan = 4) {
    const tbody = document.querySelector(selector);
    if (!tbody) return;
    tbody.innerHTML = rows.length ? rows.join('') : `<tr><td colspan="${emptyColspan}" class="muted">No records found.</td></tr>`;
  }

  function optionRows(items, labeler) {
    return '<option value="">Select...</option>' + items.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(labeler(item))}</option>`).join('');
  }

  function bindSubmit(selector, handler) {
    const form = document.querySelector(selector);
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await handler(form, formJson(form));
        form.reset();
        setStatus('Saved', true);
        notifyAction('Saved.');
      } catch (error) {
        setStatus(error.message || 'Action failed', false);
        notifyAction(error.message || 'Action failed', false);
      }
    });
  }

  let branchRecords = [];
  let editingBranchId = null;

  function branchContactMarkup(branch) {
    const items = [
      branch.phone ? `<span><strong>Phone</strong>${escapeHtml(branch.phone)}</span>` : '',
      branch.whatsappPhone ? `<span><strong>WhatsApp</strong>${escapeHtml(branch.whatsappPhone)}</span>` : '',
      branch.email ? `<span><strong>Email</strong>${escapeHtml(branch.email)}</span>` : ''
    ].filter(Boolean);
    return items.length ? items.join('') : '<span class="branch-contact-empty">No contact details added</span>';
  }

  function updateBranchSummary() {
    const total = branchRecords.length;
    const active = branchRecords.filter((branch) => branch.active !== false).length;
    const withContact = branchRecords.filter((branch) => branch.phone || branch.whatsappPhone || branch.email).length;
    const coverage = total ? Math.round((withContact / total) * 100) : 0;
    const totalNode = document.querySelector('[data-branch-total]');
    const activeNode = document.querySelector('[data-branch-active]');
    const contactNode = document.querySelector('[data-branch-contact-coverage]');
    if (totalNode) totalNode.textContent = String(total);
    if (activeNode) activeNode.textContent = String(active);
    if (contactNode) contactNode.textContent = `${coverage}%`;
  }

  async function loadBranches() {
    branchRecords = asArray(await api('/branches'));
    const directory = document.querySelector('[data-branches]');
    if (directory) {
      directory.innerHTML = branchRecords.length ? branchRecords.map((branch) => {
        const location = [branch.city, branch.region, branch.countryName || branch.country].filter(Boolean).join(', ') || 'Location not recorded';
        const state = branch.active === false ? 'Inactive' : 'Active';
        return `<article class="branch-card">
          <div class="branch-card-head">
            <div>
              <div class="branch-card-title-line"><h4>${escapeHtml(branch.name)}</h4><span class="branch-status ${branch.active === false ? 'inactive' : 'active'}">${state}</span></div>
              <p>${escapeHtml(location)}</p>
            </div>
            <button type="button" class="secondary-button compact" data-edit-branch="${escapeHtml(branch.id)}">Edit</button>
          </div>
          <div class="branch-card-meta">
            <span><strong>Branch code</strong>${escapeHtml(branch.code || 'Not set')}</span>
            <span><strong>Time zone</strong>${escapeHtml(branch.timezone || 'Not set')}</span>
          </div>
          <div class="branch-card-contacts">${branchContactMarkup(branch)}</div>
        </article>`;
      }).join('') : `<div class="branch-empty-state"><strong>No branches yet</strong><span>Add the first branch to keep customers, staff, and work tied to the right location.</span></div>`;
    }
    updateBranchSummary();
    setStatus(`${branchRecords.length} branch${branchRecords.length === 1 ? '' : 'es'}`, true);
  }

  function branchLocationPicker(form, payload) {
    const shell = form.querySelector('[data-branch-city-picker]');
    const search = form.querySelector('[data-branch-city-search]');
    const value = form.querySelector('[data-branch-city-value]');
    const menu = form.querySelector('[data-branch-city-options]');
    const toggle = form.querySelector('[data-branch-city-toggle]');
    const code = form.querySelector('[data-branch-code]');
    const timezone = form.querySelector('[data-branch-timezone]');
    const summary = form.querySelector('[data-branch-location-summary]');
    const summaryLabel = form.querySelector('[data-branch-location-label]');
    const countryHelp = form.querySelector('[data-branch-country-help]');
    const phone = form.querySelector('[name="phone"]');
    const whatsapp = form.querySelector('[name="whatsappPhone"]');
    const email = form.querySelector('[name="email"]');
    const phoneHelp = form.querySelector('[data-branch-phone-help]');
    const whatsappHelp = form.querySelector('[data-branch-whatsapp-help]');
    const locations = asArray(payload && payload.locations);
    const defaultTimezone = String(payload && payload.defaultTimezone || '');
    const phoneRules = payload && payload.phoneRules || {};
    let selected = null;

    if (countryHelp && payload && payload.countryName) countryHelp.textContent = `Showing cities in ${payload.countryName}.`;
    if (timezone) timezone.value = defaultTimezone;
    [phone, whatsapp].filter(Boolean).forEach((field) => {
      field.dataset.phoneCountry = String(payload && payload.country || '');
      field.dataset.phoneExample = String(phoneRules.phonePlaceholder || '');
    });
    if (phone) phone.placeholder = phoneRules.phonePlaceholder || 'Phone number';
    if (whatsapp) whatsapp.placeholder = phoneRules.whatsappPlaceholder || phoneRules.phonePlaceholder || 'WhatsApp number';
    if (phoneHelp) phoneHelp.textContent = phoneRules.helpText || 'Use a valid local mobile or landline number.';
    if (whatsappHelp) whatsappHelp.textContent = `Use a ${payload && payload.countryName || 'local'} number customers can message.`;
    if (!shell || !search || !value || !menu) return { reset() {}, chooseByCity() {} };

    const labelFor = (item) => `${item.city} — ${item.region}`;
    const close = () => {
      menu.hidden = true;
      search.setAttribute('aria-expanded', 'false');
      if (toggle) {
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Show city options');
      }
    };
    const choose = (item) => {
      selected = item;
      search.value = item.city;
      value.value = item.city;
      code.value = item.code;
      timezone.value = defaultTimezone || item.timezone;
      if (summary && summaryLabel) {
        summary.hidden = false;
        summaryLabel.textContent = labelFor(item);
      }
      if (email && !email.value) {
        const citySlug = item.city.toLowerCase().replace(/[^a-z0-9]+/g, '').replace(/^$|^the$/g, 'branch');
        const domain = payload && payload.country === 'ZA' ? 'company.co.za' : 'company.co.zw';
        email.placeholder = `${citySlug || 'branch'}@${domain}`;
      }
      close();
      search.classList.remove('field-input-invalid');
      search.removeAttribute('aria-invalid');
    };
    const matchingLocations = () => {
      const query = search.value.trim().toLowerCase();
      return locations.filter((item) => !query || `${item.city} ${item.region} ${item.code}`.toLowerCase().includes(query)).slice(0, 12);
    };
    const render = () => {
      const matches = matchingLocations();
      menu.innerHTML = matches.length
        ? matches.map((item) => `<button type="button" class="searchable-select-option" role="option" data-city="${escapeHtml(item.city)}"><span>${escapeHtml(item.city)}</span><small>${escapeHtml(item.region)} · ${escapeHtml(item.code)}</small></button>`).join('')
        : '<div class="searchable-select-empty">No matching city.</div>';
      menu.hidden = false;
      search.setAttribute('aria-expanded', 'true');
      if (toggle) {
        toggle.setAttribute('aria-expanded', 'true');
        toggle.setAttribute('aria-label', 'Hide city options');
      }
    };
    const clearSelection = () => {
      selected = null;
      value.value = '';
      code.value = '';
      timezone.value = defaultTimezone;
      if (summary) summary.hidden = true;
    };
    const reset = () => {
      selected = null;
      search.value = '';
      value.value = '';
      code.value = '';
      timezone.value = defaultTimezone;
      if (summary) summary.hidden = true;
      close();
    };

    toggle?.addEventListener('click', () => {
      if (menu.hidden) {
        search.focus({ preventScroll: true });
        render();
      } else {
        close();
      }
    });
    search.addEventListener('focus', render);
    search.addEventListener('input', () => {
      if (!selected || search.value !== selected.city) clearSelection();
      render();
    });
    search.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (menu.hidden) render();
        menu.querySelector('button')?.focus();
      }
      if (event.key === 'Enter' && !menu.hidden) {
        const first = matchingLocations()[0];
        if (first) {
          event.preventDefault();
          choose(first);
        }
      }
    });
    menu.addEventListener('click', (event) => {
      const option = event.target.closest('[data-city]');
      if (!option) return;
      const item = locations.find((candidate) => candidate.city === option.dataset.city);
      if (item) choose(item);
    });
    menu.addEventListener('keydown', (event) => {
      const current = event.target.closest('button');
      if (!current) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const options = Array.from(menu.querySelectorAll('button'));
        const index = options.indexOf(current);
        const next = event.key === 'ArrowDown' ? options[index + 1] || options[0] : options[index - 1] || options[options.length - 1];
        next?.focus();
      }
      if (event.key === 'Escape') {
        close();
        search.focus();
      }
    });
    document.addEventListener('click', (event) => {
      if (!shell.contains(event.target)) close();
    });
    search.addEventListener('blur', () => {
      window.setTimeout(() => {
        if (selected || menu.contains(document.activeElement)) return;
        const exact = locations.find((item) => item.city.toLowerCase() === search.value.trim().toLowerCase());
        if (exact) choose(exact);
        else if (search.value.trim()) {
          clearSelection();
          search.value = '';
        }
      }, 120);
    });
    return {
      reset,
      chooseByCity(city) {
        const item = locations.find((candidate) => candidate.city.toLowerCase() === String(city || '').trim().toLowerCase());
        if (item) choose(item);
      }
    };
  }

  async function initBranches() {
    const form = document.querySelector('[data-branch-form]');
    const modal = document.querySelector('[data-branch-modal]');
    const openButton = document.querySelector('[data-open-branch-modal]');
    const title = document.querySelector('[data-branch-form-title]');
    const help = document.querySelector('[data-branch-form-help]');
    const submitButton = document.querySelector('[data-branch-submit]');
    const cancelButton = document.querySelector('[data-branch-cancel]');
    let picker = null;
    let lastFocusedElement = null;

    const setFormMode = (branch = null) => {
      editingBranchId = branch && branch.id || null;
      if (title) title.textContent = branch ? 'Edit branch' : 'Add a branch';
      if (help) help.textContent = branch
        ? 'Update the branch location and contact details.'
        : 'Choose a city. Rev Engine fills in the branch code and time zone.';
      if (submitButton) submitButton.textContent = branch ? 'Save changes' : 'Create branch';
    };

    const resetForm = () => {
      if (!form) return;
      form.reset();
      picker?.reset();
      form.querySelectorAll('.field-input-invalid, .field-input-valid').forEach((node) => {
        node.classList.remove('field-input-invalid', 'field-input-valid');
        node.removeAttribute('aria-invalid');
      });
      form.querySelectorAll('.field-error').forEach((node) => {
        node.textContent = '';
        node.hidden = true;
      });
      setFormMode(null);
    };

    const closeModal = ({ restoreFocus = true } = {}) => {
      if (!modal || modal.hidden) return;
      modal.hidden = true;
      document.body.classList.remove('modal-open');
      resetForm();
      if (restoreFocus && lastFocusedElement && document.contains(lastFocusedElement)) lastFocusedElement.focus();
      lastFocusedElement = null;
    };

    const openModal = (branch = null) => {
      if (!modal || !form) return;
      lastFocusedElement = document.activeElement;
      resetForm();
      setFormMode(branch);
      if (branch) {
        form.elements.name.value = branch.name || '';
        form.elements.address.value = branch.address || '';
        form.elements.phone.value = branch.phone || '';
        form.elements.whatsappPhone.value = branch.whatsappPhone || '';
        form.elements.email.value = branch.email || '';
        picker?.chooseByCity(branch.city);
      }
      modal.hidden = false;
      document.body.classList.add('modal-open');
      window.RevEngineFormUX?.refresh(modal);
      window.setTimeout(() => form.elements.name.focus({ preventScroll: true }), 0);
    };

    try {
      const payload = await api('/branch-location-options');
      picker = form ? branchLocationPicker(form, payload) : null;
      if (form) {
        window.RevEngineFormUX?.refresh(form);
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          if (window.RevEngineFormUX && !window.RevEngineFormUX.validateForm(form)) return;
          const body = formJson(form);
          if (!body.city) {
            const search = form.querySelector('[data-branch-city-search]');
            if (search) {
              search.value = '';
              window.RevEngineFormUX?.validateForm(form);
            }
            return;
          }
          try {
            const wasEditing = Boolean(editingBranchId);
            const path = wasEditing ? `/branches/${editingBranchId}` : '/branches';
            const method = wasEditing ? 'PATCH' : 'POST';
            await api(path, { method, body: JSON.stringify(body) });
            const message = wasEditing ? 'Branch updated.' : 'Branch created.';
            closeModal({ restoreFocus: false });
            await loadBranches();
            setStatus(message.replace('.', ''), true);
            notifyAction(message);
            openButton?.focus();
          } catch (error) {
            setStatus(error.message || 'Could not save branch', false);
            notifyAction(error.message || 'Could not save branch', false);
          }
        });
      }
    } catch (error) {
      setStatus(error.message || 'Could not load branch locations', false);
      notifyAction(error.message || 'Could not load branch locations', false);
    }

    openButton?.addEventListener('click', () => openModal());
    cancelButton?.addEventListener('click', () => closeModal());
    modal?.querySelectorAll('[data-close-branch-modal]').forEach((button) => button.addEventListener('click', () => closeModal()));
    modal?.addEventListener('click', (event) => {
      if (event.target === modal) closeModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modal && !modal.hidden) closeModal();
    });
    document.querySelector('[data-branches]')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-edit-branch]');
      if (!button) return;
      const branch = branchRecords.find((item) => item.id === button.dataset.editBranch);
      openModal(branch);
    });
    document.querySelector('[data-refresh]')?.addEventListener('click', loadBranches);
    loadBranches().catch((error) => setStatus(error.message, false));
  }

  async function loadApprovals() {
    const rows = asArray(await api('/approvals/pending')).map((item) => `<tr><td>${escapeHtml(item.eventType || '-')}</td><td>${escapeHtml(item.entityType || '-')}<br><small>${escapeHtml(item.entityId || '')}</small></td><td>${escapeHtml(item.reason || '-')}</td><td>${formatDate(item.createdAt)}</td><td><button class="secondary-button compact" data-approve="${escapeHtml(item.id)}">Approve</button> <button class="secondary-button compact" data-reject="${escapeHtml(item.id)}">Reject</button></td></tr>`);
    setRows('[data-approvals]', rows, 5);
    setStatus(`Loaded ${rows.length} pending approval${rows.length === 1 ? '' : 's'}`, true);
  }

  function initApprovals() {
    bindSubmit('[data-policy-form]', async (form, body) => {
      await api('/approval-policies', { method: 'POST', body: JSON.stringify(body) });
      await loadApprovals();
    });
    bindSubmit('[data-approval-form]', async (form, body) => {
      await api('/approvals', { method: 'POST', body: JSON.stringify(body) });
      await loadApprovals();
    });
    document.querySelector('[data-refresh]')?.addEventListener('click', loadApprovals);
    document.addEventListener('click', async (event) => {
      const approve = event.target.closest('[data-approve]');
      const reject = event.target.closest('[data-reject]');
      if (!approve && !reject) return;
      try {
        const id = approve ? approve.dataset.approve : reject.dataset.reject;
        const route = approve ? 'approve' : 'reject';
        const body = approve ? { decisionNote: 'Approved from admin page' } : { reason: 'Rejected from admin page' };
        await api(`/approvals/${encodeURIComponent(id)}/${route}`, { method: 'POST', body: JSON.stringify(body) });
        await loadApprovals();
        notifyAction(approve ? 'Approval completed.' : 'Approval rejected.');
      } catch (error) { setStatus(error.message, false); notifyAction(error.message, false); }
    });
    loadApprovals().catch((error) => setStatus(error.message, false));
  }

  async function loadInventory() {
    const [items, locations, lowStock, movements] = await Promise.all([
      api('/inventory/items').catch(() => []),
      api('/stock-locations').catch(() => []),
      api('/inventory/low-stock').catch(() => []),
      api('/inventory/movements').catch(() => [])
    ]);
    const inventoryItems = asArray(items);
    const stockLocations = asArray(locations);
    const itemOptions = optionRows(inventoryItems, (item) => item.sku ? `${item.name} (${item.sku})` : item.name);
    const locationOptions = optionRows(stockLocations, (location) => `${location.name}${location.type ? ' · ' + location.type : ''}`);
    document.querySelectorAll('select[name="itemId"]').forEach((select) => { select.innerHTML = itemOptions; });
    document.querySelectorAll('select[name="locationId"]').forEach((select) => { select.innerHTML = locationOptions; });
    setRows('[data-inventory-items]', inventoryItems.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.sku || '-')}</td><td>${escapeHtml(item.unitOfMeasure || 'each')}</td><td>${escapeHtml(item.reorderPoint || '-')}</td></tr>`), 4);
    setRows('[data-low-stock]', asArray(lowStock).map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.availableQuantity ?? '-')}</td><td>${escapeHtml(item.reorderPoint ?? '-')}</td></tr>`), 3);
    setRows('[data-movements]', asArray(movements).slice(0, 20).map((movement) => `<tr><td>${escapeHtml(movement.movementType || movement.type || '-')}</td><td>${escapeHtml(movement.item && movement.item.name || movement.itemId || '-')}</td><td>${escapeHtml(movement.quantity || '-')}</td><td>${escapeHtml(movement.reason || '-')}</td></tr>`), 4);
    setStatus(`Loaded ${inventoryItems.length} inventory item${inventoryItems.length === 1 ? '' : 's'}`, true);
  }

  function initInventory() {
    bindSubmit('#itemForm', async (form, body) => { await api('/inventory/items', { method: 'POST', body: JSON.stringify(body) }); await loadInventory(); });
    bindSubmit('#locationForm', async (form, body) => { await api('/stock-locations', { method: 'POST', body: JSON.stringify(body) }); await loadInventory(); });
    bindSubmit('#adjustForm', async (form, body) => { await api('/inventory/adjustments', { method: 'POST', body: JSON.stringify(body) }); await loadInventory(); });
    loadInventory().catch((error) => setStatus(error.message, false));
  }

  async function loadPurchaseRequests() {
    const rows = asArray(await api('/purchase-requests')).map((item) => `<tr><td>${badge(item.status || 'REQUESTED')}</td><td>${escapeHtml(item.reason || '-')}</td><td>${escapeHtml(item.job && item.job.title || item.jobId || '-')}</td><td><button class="secondary-button compact" data-pr-approve="${escapeHtml(item.id)}">Approve</button> <button class="secondary-button compact" data-pr-reject="${escapeHtml(item.id)}">Reject</button></td></tr>`);
    setRows('[data-purchase-requests]', rows, 4);
    setStatus(`Loaded ${rows.length} request${rows.length === 1 ? '' : 's'}`, true);
  }

  function initPurchaseRequests() {
    bindSubmit('#requestForm', async (form, body) => { await api('/purchase-requests', { method: 'POST', body: JSON.stringify({ ...body, lines: [] }) }); await loadPurchaseRequests(); });
    document.addEventListener('click', async (event) => {
      const approve = event.target.closest('[data-pr-approve]');
      const reject = event.target.closest('[data-pr-reject]');
      if (!approve && !reject) return;
      try {
        if (approve) await api(`/purchase-requests/${encodeURIComponent(approve.dataset.prApprove)}/approve`, { method: 'POST', body: '{}' });
        if (reject) await api(`/purchase-requests/${encodeURIComponent(reject.dataset.prReject)}/reject`, { method: 'POST', body: JSON.stringify({ reason: 'Rejected from admin page' }) });
        await loadPurchaseRequests();
        notifyAction(approve ? 'Request approved.' : 'Request rejected.');
      } catch (error) { setStatus(error.message, false); notifyAction(error.message, false); }
    });
    loadPurchaseRequests().catch((error) => setStatus(error.message, false));
  }

  async function loadPurchaseOrders() {
    const [orders, suppliers, items] = await Promise.all([
      api('/purchase-orders').catch(() => []),
      api('/suppliers').catch(() => []),
      api('/inventory/items').catch(() => [])
    ]);
    const supplierSelect = document.querySelector('select[name="supplierId"]');
    const itemSelect = document.querySelector('select[name="itemId"]');
    if (supplierSelect) supplierSelect.innerHTML = optionRows(asArray(suppliers), (supplier) => supplier.name);
    if (itemSelect) itemSelect.innerHTML = optionRows(asArray(items), (item) => item.sku ? `${item.name} (${item.sku})` : item.name);
    const rows = asArray(orders).map((order) => `<tr><td>${escapeHtml(order.orderNumber || order.id)}</td><td>${badge(order.status || 'DRAFT')}</td><td>${escapeHtml(order.supplier && order.supplier.name || '-')}</td><td>${escapeHtml((order.lines || []).length || 0)}</td><td><button class="secondary-button compact" data-po-approve="${escapeHtml(order.id)}">Approve</button> <button class="secondary-button compact" data-po-send="${escapeHtml(order.id)}">Send</button></td></tr>`);
    setRows('[data-purchase-orders]', rows, 5);
    setStatus(`Loaded ${rows.length} order${rows.length === 1 ? '' : 's'}`, true);
  }

  function initPurchaseOrders() {
    bindSubmit('#supplierForm', async (form, body) => { await api('/suppliers', { method: 'POST', body: JSON.stringify(body) }); await loadPurchaseOrders(); });
    bindSubmit('#poForm', async (form, body) => {
      const payload = { supplierId: body.supplierId, lines: [{ itemId: body.itemId, quantity: body.quantity, unitCost: body.unitCost || 0 }] };
      await api('/purchase-orders', { method: 'POST', body: JSON.stringify(payload) });
      await loadPurchaseOrders();
    });
    document.addEventListener('click', async (event) => {
      const approve = event.target.closest('[data-po-approve]');
      const send = event.target.closest('[data-po-send]');
      if (!approve && !send) return;
      try {
        if (approve) await api(`/purchase-orders/${encodeURIComponent(approve.dataset.poApprove)}/approve`, { method: 'POST', body: '{}' });
        if (send) await api(`/purchase-orders/${encodeURIComponent(send.dataset.poSend)}/send`, { method: 'POST', body: '{}' });
        await loadPurchaseOrders();
        notifyAction(approve ? 'Order approved.' : 'Order sent.');
      } catch (error) { setStatus(error.message, false); notifyAction(error.message, false); }
    });
    loadPurchaseOrders().catch((error) => setStatus(error.message, false));
  }

  const securityEventLabels = {
    LOGIN_SUCCESS: 'Signed in successfully',
    FAILED_LOGIN: 'Failed sign-in attempt',
    LOGIN_LOCKOUT: 'Account temporarily locked after failed sign-ins',
    LOCKED_LOGIN_ATTEMPT: 'Sign-in attempt while account was locked',
    PASSWORD_CHANGED: 'Password changed',
    ROLE_CHANGED: 'Account access changed',
    SESSION_REVOKED: 'A signed-in device was removed',
    ALL_SESSIONS_REVOKED: 'All signed-in devices were removed',
    TWO_FACTOR_ENABLED: 'Two-step verification turned on',
    TWO_FACTOR_DISABLED: 'Two-step verification turned off',
    TWO_FACTOR_FAILURE: 'Two-step verification failed',
    TWO_FACTOR_RECOVERY_CODES_ROTATED: 'Recovery codes replaced',
    TWO_FACTOR_SETUP_REQUIRED: 'Two-step verification setup required',
    DATA_EXPORT_CREATED: 'Company data export created',
    IDENTITY_PROVIDER_CONFIG_CHANGED: 'Company sign-in settings changed'
  };

  function securityEventLabel(value) {
    const key = String(value || '').trim();
    if (securityEventLabels[key]) return securityEventLabels[key];
    return key ? key.replace(/_/g, ' ').toLowerCase().replace(/^./, (char) => char.toUpperCase()) : 'Account activity';
  }

  function deviceLabel(userAgent) {
    const value = String(userAgent || '');
    let browser = 'Browser';
    let device = 'device';
    if (/Edg\//i.test(value)) browser = 'Microsoft Edge';
    else if (/Chrome\//i.test(value)) browser = 'Chrome';
    else if (/Firefox\//i.test(value)) browser = 'Firefox';
    else if (/Safari\//i.test(value)) browser = 'Safari';
    if (/iPhone/i.test(value)) device = 'iPhone';
    else if (/iPad/i.test(value)) device = 'iPad';
    else if (/Android/i.test(value)) device = 'Android device';
    else if (/Windows/i.test(value)) device = 'Windows computer';
    else if (/Macintosh|Mac OS X/i.test(value)) device = 'Mac';
    else if (/Linux/i.test(value)) device = 'Linux computer';
    return `${browser} on ${device}`;
  }

  async function loadSecurityEvents() {
    const rows = asArray(await api('/security/events')).slice(0, 25).map((item) => `<tr><td>${formatDate(item.createdAt)}</td><td>${escapeHtml(securityEventLabel(item.eventType))}</td></tr>`);
    setRows('[data-events]', rows, 2);
  }

  async function loadSessions() {
    const node = document.querySelector('[data-sessions]');
    if (!node) return;
    try {
      const sessions = asArray(await api('/auth/sessions')).filter((session) => !session.revokedAt);
      node.innerHTML = sessions.length ? sessions.map((session) => `<div class="security-session-row">
        <div class="security-session-copy">
          <strong>${escapeHtml(deviceLabel(session.userAgent))}${session.current ? ' <span class="security-current-label">This device</span>' : ''}</strong>
          <span>${session.lastSeenAt ? `Last active ${formatDate(session.lastSeenAt)}` : `Signed in ${formatDate(session.createdAt)}`}</span>
        </div>
        ${session.current ? '' : `<button class="secondary-button compact" type="button" data-revoke-session="${escapeHtml(session.id)}">Sign out</button>`}
      </div>`).join('') : '<div class="security-empty-state"><strong>No trusted devices to review</strong><span>Devices will appear here after a successful sign-in.</span></div>';
    } catch (error) {
      node.innerHTML = '<div class="security-empty-state"><strong>Could not load trusted devices</strong><span>Try again in a moment.</span></div>';
    }
  }

  function renderTwoFactorResult(data) {
    const output = document.querySelector('[data-2fa-output]');
    if (!output) return;
    const recoveryCodes = asArray(data && data.recoveryCodes);
    output.hidden = false;
    output.innerHTML = `<strong>Two-step verification is on.</strong>
      <span>Keep these recovery codes somewhere safe. Each code can be used once.</span>
      ${recoveryCodes.length ? `<div class="security-recovery-codes">${recoveryCodes.map((code) => `<code>${escapeHtml(code)}</code>`).join('')}</div>` : ''}`;
  }

  function initSecurityCenter() {
    const passwordForm = document.querySelector('[data-password-form]');
    const passwordToggle = document.querySelector('[data-password-toggle]');
    const passwordCancel = document.querySelector('[data-password-cancel]');
    const passwordMessage = document.querySelector('[data-password-message]');

    const closePasswordForm = () => {
      if (!passwordForm) return;
      passwordForm.hidden = true;
      passwordForm.reset();
      if (passwordMessage) {
        passwordMessage.hidden = true;
        passwordMessage.textContent = '';
      }
      if (passwordToggle) passwordToggle.textContent = 'Change password';
    };

    passwordToggle?.addEventListener('click', () => {
      if (!passwordForm) return;
      const opening = passwordForm.hidden;
      passwordForm.hidden = !opening;
      passwordToggle.textContent = opening ? 'Close' : 'Change password';
      if (opening) passwordForm.querySelector('input')?.focus();
    });

    passwordCancel?.addEventListener('click', closePasswordForm);

    passwordForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(passwordForm).entries());
      if (passwordMessage) {
        passwordMessage.hidden = true;
        passwordMessage.textContent = '';
      }
      if (data.newPassword !== data.confirmPassword) {
        if (passwordMessage) {
          passwordMessage.textContent = 'The new passwords do not match.';
          passwordMessage.hidden = false;
        }
        return;
      }

      const submit = passwordForm.querySelector('button[type="submit"]');
      if (submit) submit.disabled = true;
      try {
        await api('/auth/me/password', {
          method: 'PATCH',
          body: JSON.stringify({
            currentPassword: data.currentPassword,
            newPassword: data.newPassword
          })
        });
        window.location.href = 'login.html?passwordChanged=1';
      } catch (error) {
        if (passwordMessage) {
          passwordMessage.textContent = error.message || 'Could not change your password.';
          passwordMessage.hidden = false;
        }
        if (submit) submit.disabled = false;
      }
    });

    document.querySelector('[data-load-events]')?.addEventListener('click', () => loadSecurityEvents().catch(() => {}));
    document.querySelector('[data-load-sessions]')?.addEventListener('click', () => loadSessions().catch(() => {}));
    document.querySelector('[data-sessions]')?.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-revoke-session]');
      if (!button) return;
      button.disabled = true;
      try {
        await api(`/auth/sessions/${encodeURIComponent(button.dataset.revokeSession)}/revoke`, { method: 'POST', body: '{}' });
        await loadSessions();
        notifyAction('Device signed out.');
      } catch (error) {
        button.disabled = false;
        setStatus(error.message || 'Could not sign out that device.', false);
        notifyAction(error.message || 'Could not sign out that device.', false);
      }
    });
    document.querySelector('[data-enable-2fa]')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const data = await api('/auth/2fa/enable', { method: 'POST', body: '{}' });
        renderTwoFactorResult(data);
        button.textContent = '2FA enabled';
        notifyAction('Two-step verification is on.');
      } catch (error) {
        const output = document.querySelector('[data-2fa-output]');
        if (output) {
          output.hidden = false;
          output.innerHTML = `<strong>Could not turn on two-step verification.</strong><span>${escapeHtml(error.message || 'Try again.')}</span>`;
        }
        button.disabled = false;
        notifyAction(error.message || 'Could not turn on two-step verification.', false);
      }
    });
    Promise.allSettled([loadSecurityEvents(), loadSessions()]);
  }

  async function loadMobileSync() {
    const [devices, conflicts] = await Promise.all([
      api('/admin/worker-devices').catch(() => []),
      api('/mobile-sync/conflicts').catch(() => [])
    ]);
    setRows('[data-device-rows]', asArray(devices).map((device) => `<tr><td>${escapeHtml(device.deviceName || device.deviceId || device.id)}</td><td>${escapeHtml(device.platform || '-')}</td><td>${escapeHtml(device.appVersion || '-')}</td><td>${badge(device.revokedAt ? 'REVOKED' : 'ACTIVE')}</td><td>${formatDate(device.lastSyncAt || device.updatedAt)}</td></tr>`), 5);
    setRows('[data-sync-rows]', asArray(conflicts).map((item) => `<tr><td>${badge(item.status || 'CONFLICT')}</td><td>${escapeHtml(item.action || item.actionType || '-')}</td><td>${escapeHtml(item.worker && item.worker.user && item.worker.user.name || item.workerId || '-')}</td><td>${escapeHtml(item.deviceId || '-')}</td><td>${escapeHtml(item.error || item.errorMessage || '-')}</td><td>${formatDate(item.createdAt)}</td></tr>`), 6);
    setStatus('Mobile sync loaded', true);
  }

  function initMobileSync() {
    document.querySelector('[data-refresh]')?.addEventListener('click', () => loadMobileSync().catch((error) => setStatus(error.message, false)));
    loadMobileSync().catch((error) => setStatus(error.message, false));
  }

  function businessMoney(value, currency) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currency || 'USD',
        maximumFractionDigits: 2
      }).format(Number(value || 0));
    } catch (error) {
      return `${currency || ''} ${Number(value || 0).toLocaleString()}`.trim();
    }
  }

  function businessPercent(value) {
    return value == null ? '-' : `${Number(value || 0).toLocaleString()}%`;
  }

  function businessMinutes(value) {
    return value == null ? '-' : `${Number(value || 0).toLocaleString()} min`;
  }

  function businessEmptyRow(columns, text) {
    return `<tr><td colspan="${columns}" class="muted">${escapeHtml(text)}</td></tr>`;
  }

  function businessSummaryRow(label, value) {
    return `<div class="business-summary-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  }

  async function initExecutiveDashboard() {
    const form = document.querySelector('[data-business-filters]');
    let firstLoad = true;

    const queryFromForm = () => {
      const params = new URLSearchParams();
      if (!form) return params;
      const startDate = form.elements.startDate && form.elements.startDate.value;
      const endDate = form.elements.endDate && form.elements.endDate.value;
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      return params;
    };

    const loadBusinessPerformance = async () => {
      setStatus('Loading...', true);
      const query = queryFromForm().toString();
      const suffix = query ? `?${query}` : '';
      try {
        const [overviewData, branchData, workerData, funnelData, serviceData, stockData] = await Promise.all([
          api(`/analytics/executive${suffix}`),
          api(`/analytics/branches${suffix}`),
          api(`/analytics/technicians${suffix}`),
          api(`/analytics/quote-to-cash${suffix}`),
          api(`/analytics/contracts-sla${suffix}`),
          api(`/analytics/inventory-procurement${suffix}`)
        ]);

        const currency = overviewData.currency || branchData.currency || 'USD';
        const overview = overviewData.overview || {};
        const overviewNode = document.querySelector('[data-business-overview]');
        if (overviewNode) {
          const cards = [
            ['Money this month', businessMoney(overview.mtdRevenue, currency), 'Confirmed payments'],
            ['Money in this period', businessMoney(overview.periodRevenue, currency), 'Confirmed payments'],
            ['Money still owed', businessMoney(overview.outstandingInvoiceTotal, currency), `${overview.outstandingInvoices || 0} unpaid invoices`],
            ['Solar work orders', String(overview.completedJobs || 0), 'Completed in this period'],
            ['Jobs at risk', String(overview.jobsAtRisk || 0), 'Late or close to late'],
            ['Quote success', businessPercent(overview.quoteAcceptanceRate), 'Accepted quotes'],
            ['Missing proof', String(overview.proofMissingCount || 0), 'Completed jobs missing proof'],
            ['Low stock items', String(overview.lowStockCriticalItems || 0), 'Need attention']
          ];
          overviewNode.innerHTML = cards.map(([label, value, note]) => `<article class="card stat-card"><div class="stat-label">${escapeHtml(label)}</div><div class="stat-value">${escapeHtml(value)}</div><div class="trend">${escapeHtml(note)}</div></article>`).join('');
        }

        const branches = branchData.branchPerformance || [];
        const branchBody = document.querySelector('[data-business-branches]');
        if (branchBody) {
          branchBody.innerHTML = branches.length ? branches.map((branch) => `<tr>
            <td>${escapeHtml(branch.branchName || 'Main business')}</td>
            <td>${escapeHtml(businessMoney(branch.revenue, currency))}</td>
            <td>${escapeHtml(branch.completedJobs || 0)}</td>
            <td>${escapeHtml(branch.overdueJobs || 0)}</td>
            <td>${escapeHtml(branch.slaBreaches || 0)}</td>
            <td>${escapeHtml(businessMoney(branch.stockValue, currency))}</td>
          </tr>`).join('') : businessEmptyRow(6, 'No branch results yet.');
        }

        const stageNames = {
          bookingRequest: 'Requests',
          quoteSent: 'Quotes sent',
          quoteAccepted: 'Quotes accepted',
          jobScheduled: 'Jobs booked',
          jobCompleted: 'Solar work orders',
          invoiceIssued: 'Invoices sent',
          paymentCollected: 'Payments received'
        };
        const funnel = funnelData.quoteToCash || {};
        const funnelNode = document.querySelector('[data-business-funnel]');
        if (funnelNode) {
          const stages = funnel.stages || [];
          funnelNode.innerHTML = stages.length ? stages.map((stage) => `<div class="business-stage-row">
            <span>${escapeHtml(stageNames[stage.stage] || String(stage.stage || '').replace(/([A-Z])/g, ' $1'))}</span>
            <strong>${escapeHtml(stage.count || 0)}</strong>
            <small>${escapeHtml(businessPercent(stage.conversionRate))}</small>
          </div>`).join('') : '<div class="empty-state compact-empty"><strong>No work flow data yet.</strong></div>';
        }

        const aging = overviewData.accountsReceivable && overviewData.accountsReceivable.agingBuckets || {};
        const agingNode = document.querySelector('[data-business-aging]');
        if (agingNode) {
          const rows = [
            ['Not due yet', aging.current],
            ['1 to 30 days late', aging.days1To30],
            ['31 to 60 days late', aging.days31To60],
            ['61 to 90 days late', aging.days61To90],
            ['More than 90 days late', aging.over90]
          ];
          agingNode.innerHTML = rows.map(([label, value]) => businessSummaryRow(label, businessMoney(value, currency))).join('');
        }

        const workers = workerData.technicianProductivity || [];
        const workerBody = document.querySelector('[data-business-workers]');
        if (workerBody) {
          workerBody.innerHTML = workers.length ? workers.map((worker) => `<tr>
            <td>${escapeHtml(worker.workerName || 'Worker')}</td>
            <td>${escapeHtml(worker.jobsCompleted || 0)}</td>
            <td>${escapeHtml(businessMinutes(worker.averageJobDurationMinutes))}</td>
            <td>${escapeHtml(businessPercent(worker.onTimeArrivalRate))}</td>
            <td>${escapeHtml(businessPercent(worker.proofCompletionRate))}</td>
            <td>${escapeHtml(worker.partsUsed || 0)}</td>
          </tr>`).join('') : businessEmptyRow(6, 'No worker results yet.');
        }

        const service = serviceData.contractsSla || {};
        const serviceNode = document.querySelector('[data-business-service]');
        if (serviceNode) {
          serviceNode.innerHTML = [
            businessSummaryRow('Active contracts', String(service.activeContracts || 0)),
            businessSummaryRow('Contracts ending soon', String(service.expiringContracts || 0)),
            businessSummaryRow('Planned work overdue', String(service.overduePlannedMaintenance || 0)),
            businessSummaryRow('Jobs at risk', String(service.slaAtRisk || 0)),
            businessSummaryRow('Missed service times', String(service.slaBreached || 0)),
            businessSummaryRow('Possible renewal value', businessMoney(service.renewalValue, currency))
          ].join('');
        }

        const stock = stockData.inventoryProcurement || {};
        const stockNode = document.querySelector('[data-business-stock]');
        if (stockNode) {
          stockNode.innerHTML = [
            businessSummaryRow('Low stock items', String(stock.lowStock || 0)),
            businessSummaryRow('Buying requests waiting', String(stock.pendingPurchaseRequests || 0)),
            businessSummaryRow('Open buying orders', String(stock.openPurchaseOrders || 0)),
            businessSummaryRow('Supplier delays', String(stock.supplierDelays || 0)),
            businessSummaryRow('Stock value', businessMoney(stock.stockValue, currency))
          ].join('');
        }

        if (firstLoad && form && overviewData.filters) {
          if (form.elements.startDate) form.elements.startDate.value = String(overviewData.filters.startDate || '').slice(0, 10);
          if (form.elements.endDate) form.elements.endDate.value = String(overviewData.filters.endDate || '').slice(0, 10);
        }
        firstLoad = false;
        setStatus('Results ready', true);
      } catch (error) {
        setStatus('Could not load results', false);
        notifyAction(error.message || 'Could not load business performance.', false);
      }
    };

    if (form) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        loadBusinessPerformance();
      });
    }
    loadBusinessPerformance();
  }

  function initProcurementCosting() {
    setStatus('Procurement costing ready', true);
  }

  function initOnboarding() {
    setStatus('Onboarding tools ready', true);
  }

  function init() {
    const initMap = {
      branches: initBranches,
      approvals: initApprovals,
      inventory: initInventory,
      'purchase-requests': initPurchaseRequests,
      'purchase-orders': initPurchaseOrders,
      'security-center': initSecurityCenter,
      'mobile-sync': initMobileSync,
      'executive-dashboard': initExecutiveDashboard,
      'procurement-costing': initProcurementCosting,
      onboarding: initOnboarding
    };
    if (initMap[page]) initMap[page]();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
