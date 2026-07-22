(function () {
  if (document.body.dataset.page !== 'workspaces') return;

  let state = null;
  const escapeHtml = (value) => String(value == null ? '' : value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

  async function api(path, options = {}) {
    const response = await fetch('/api' + path, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error && payload.error.message || `HTTP ${response.status}`);
    return payload.data;
  }

  function notify(text, ok = true) {
    if (window.RevEngineUI) window.RevEngineUI.notify(text, { type: ok ? 'success' : 'error' });
  }

  function formBody(form) {
    const body = Object.fromEntries(new FormData(form).entries());
    Object.keys(body).forEach((key) => { if (body[key] === '') delete body[key]; });
    return body;
  }

  async function fillMainBranchCities(form) {
    const country = form && form.querySelector('[data-workspace-country]');
    const city = form && form.querySelector('[data-main-branch-city]');
    if (!country || !city) return;
    const selected = city.value;
    city.disabled = true;
    city.innerHTML = '<option value="">Loading cities...</option>';
    try {
      const payload = await api(`/public/branch-location-options?countryCode=${encodeURIComponent(country.value)}`);
      const locations = payload && Array.isArray(payload.locations) ? payload.locations : [];
      city.innerHTML = '<option value="">Choose a city</option>' + locations.map((item) => `<option value="${escapeHtml(item.city)}">${escapeHtml(item.city)} — ${escapeHtml(item.region)}</option>`).join('');
      if (locations.some((item) => item.city === selected)) city.value = selected;
    } catch (error) {
      city.innerHTML = '<option value="">Could not load cities</option>';
      notify(error.message || 'Could not load cities.', false);
    } finally {
      city.disabled = false;
      window.RevEngineFormUX?.refresh(city);
    }
  }

  function isOwner() {
    return Boolean(state && state.group && state.group.role === 'OWNER');
  }

  async function switchWorkspace(companyId) {
    await api('/organization/switch-workspace', { method: 'POST', body: JSON.stringify({ companyId }) });
    window.location.reload();
  }

  function renderWorkspaces() {
    const workspaces = state && state.workspaces || [];
    document.querySelector('[data-workspace-count]').textContent = workspaces.length;
    document.querySelector('[data-workspace-grid]').innerHTML = workspaces.map((workspace) => `<article class="workspace-card${workspace.active ? ' is-active' : ''}">
      <div class="workspace-card-head"><div><h3>${escapeHtml(workspace.name)}</h3><p class="muted">${escapeHtml(workspace.legalName || workspace.countryName || 'Company')}</p></div><span class="badge ${workspace.active ? 'green' : workspace.onboardingState === 'COMPLETED' ? 'gray' : 'orange'}">${workspace.active ? 'Current' : workspace.onboardingState === 'COMPLETED' ? 'Available' : 'Setup required'}</span></div>
      <div class="workspace-card-meta">
        <div><strong>Country</strong><span>${escapeHtml(workspace.countryName || workspace.countryCode || '—')}</span></div>
        <div><strong>Currency</strong><span>${escapeHtml(workspace.currency || '—')}</span></div>
        <div><strong>Branches</strong><span>${escapeHtml(workspace.branchCount)}</span></div>
        <div><strong>Members</strong><span>${escapeHtml(workspace.memberCount)}</span></div>
      </div>
      <div class="fc-form-actions">${workspace.active ? '<a class="secondary-button" href="branches.html">Manage branches</a>' : `<button class="secondary-button" type="button" data-switch-workspace="${escapeHtml(workspace.id)}">Open company</button>`}</div>
    </article>`).join('') || '<div class="empty-state"><strong>No companies found</strong></div>';
    document.querySelectorAll('[data-switch-workspace]').forEach((button) => button.onclick = () => switchWorkspace(button.dataset.switchWorkspace).catch((error) => notify(error.message, false)));
  }

  function renderManagers() {
    const rows = state && state.managers || [];
    document.querySelector('[data-manager-count]').textContent = rows.length;
    document.querySelector('[data-managers-body]').innerHTML = rows.map((membership) => `<tr>
      <td><strong>${escapeHtml(membership.user && membership.user.name || 'Member')}</strong></td>
      <td>${escapeHtml(membership.user && membership.user.email || '—')}</td>
      <td>${escapeHtml(membership.user && membership.user.company && membership.user.company.name || '—')}</td>
      <td><span class="badge ${membership.role === 'OWNER' ? 'blue' : 'green'}">${membership.role === 'OWNER' ? 'Owner' : 'All-company manager'}</span></td>
      <td>${isOwner() && membership.role === 'MANAGER' ? `<button class="secondary-button compact danger" type="button" data-remove-manager="${escapeHtml(membership.user.id)}">Remove</button>` : '<span class="muted">Protected</span>'}</td>
    </tr>`).join('') || '<tr><td colspan="5">No managers have access to every company.</td></tr>';
    document.querySelectorAll('[data-remove-manager]').forEach((button) => button.onclick = async () => {
      const confirmed = await window.RevEngineUI.confirm({ title: 'Remove all-company access?', message: 'They will lose access to the other companies and will need to sign in again.', confirmLabel: 'Remove manager', danger: true });
      if (!confirmed) return;
      try {
        await api(`/organization/group-managers/${button.dataset.removeManager}`, { method: 'DELETE' });
        await load();
        notify('All-company access removed.');
      } catch (error) { notify(error.message, false); }
    });
  }

  function render() {
    document.querySelector('[data-group-name]').textContent = state && state.group && state.group.name || 'Your business';
    document.querySelectorAll('[data-owner-panel]').forEach((node) => { node.hidden = !isOwner(); });
    renderWorkspaces();
    renderManagers();
  }

  async function load() {
    state = await api('/organization');
    render();
  }

  const workspaceForm = document.querySelector('[data-workspace-form]');
  if (workspaceForm) {
    const country = workspaceForm.querySelector('[data-workspace-country]');
    country?.addEventListener('change', () => fillMainBranchCities(workspaceForm));
    fillMainBranchCities(workspaceForm);
  }
  if (workspaceForm) workspaceForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorNode = document.querySelector('[data-workspace-error]');
    errorNode.hidden = true;
    if (window.RevEngineFormUX && !window.RevEngineFormUX.validateForm(workspaceForm)) return;
    const button = workspaceForm.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await api('/organization/workspaces', { method: 'POST', body: JSON.stringify(formBody(workspaceForm)) });
      workspaceForm.reset();
      workspaceForm.mainBranchName.value = 'Main Branch';
      await fillMainBranchCities(workspaceForm);
      await load();
      notify('Company added.');
    } catch (error) {
      errorNode.textContent = error.message;
      errorNode.hidden = false;
    } finally { button.disabled = false; }
  });

  const managerForm = document.querySelector('[data-manager-form]');
  if (managerForm) managerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorNode = document.querySelector('[data-manager-error]');
    errorNode.hidden = true;
    const button = managerForm.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      await api('/organization/group-managers', { method: 'POST', body: JSON.stringify(formBody(managerForm)) });
      managerForm.reset();
      await load();
      notify('Access to all companies granted.');
    } catch (error) {
      errorNode.textContent = error.message;
      errorNode.hidden = false;
    } finally { button.disabled = false; }
  });

  load().catch((error) => {
    notify(error.message, false);
  });
})();
