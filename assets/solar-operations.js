(function () {
  const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api';
  const state = { overview: null, customers: [], assets: [], jobs: [] };

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  async function api(path, options = {}) {
    const response = await fetch(API_BASE + path, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error && payload.error.message || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload.data;
  }

  function notify(message, ok = true) {
    if (window.RevEngineUI) window.RevEngineUI.notify(message, { type: ok ? 'success' : 'error' });
  }

  function number(value, digits = 1) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toLocaleString(undefined, { maximumFractionDigits: digits }) : '0';
  }

  function percent(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? `${parsed.toFixed(1)}%` : '—';
  }

  function dateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }

  function label(value) {
    return String(value || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function badge(value) {
    const key = String(value || 'UNKNOWN').toLowerCase();
    const tone = /critical|offline|open|degraded/.test(key) ? 'red' : /warning|maintenance|acknowledged|in progress/.test(key) ? 'orange' : /operational|normal|resolved/.test(key) ? 'green' : 'gray';
    return `<span class="badge ${tone}">${escapeHtml(label(value || 'Unknown'))}</span>`;
  }

  function setText(selector, value) {
    const node = document.querySelector(selector);
    if (node) node.textContent = value;
  }

  function render() {
    const overview = state.overview || { totals: {}, sites: [], faults: [], readings: [] };
    const totals = overview.totals || {};
    setText('[data-solar-stat="sites"]', number(totals.sites, 0));
    setText('[data-solar-stat="capacity"]', `${number(totals.installedCapacityKwp)} kWp`);
    setText('[data-solar-stat="energy"]', `${number(totals.energyTodayKwh)} kWh`);
    setText('[data-solar-stat="faults"]', number(totals.openFaults, 0));
    setText('[data-solar-stat="performance"]', percent(totals.averagePerformanceRatioPct));
    setText('[data-solar-stat="availability"]', percent(totals.averageAvailabilityPct));
    setText('[data-solar-stat="equipment"]', number(totals.equipment, 0));
    setText('[data-solar-stat="operational"]', number(totals.operationalSites, 0));
    setText('[data-solar-trend="sites"]', totals.sites ? `${totals.operationalSites || 0} operational` : 'No sites configured');
    setText('[data-solar-trend="faults"]', totals.criticalFaults ? `${totals.criticalFaults} critical` : totals.openFaults ? 'Needs attention' : 'No active faults');
    setText('[data-solar-fault-count]', `${totals.openFaults || 0} open`);

    const sitesRoot = document.querySelector('[data-solar-sites]');
    sitesRoot.innerHTML = (overview.sites || []).length ? overview.sites.map((site) => {
      const reading = site.latestReading || {};
      return `<article class="solar-site-row">
        <div class="solar-site-icon">☀</div>
        <div class="solar-site-main"><div class="solar-site-title"><strong>${escapeHtml(site.property && site.property.label || site.siteCode || 'Solar Site')}</strong>${badge(site.status)}</div><span>${escapeHtml(site.customer && site.customer.name || 'Client')} · ${escapeHtml(site.property && site.property.address || 'No address')}</span><small>${number(site.installedCapacityKwp)} kWp · ${site.equipmentCount || 0} equipment · ${site.openFaultCount || 0} open faults</small></div>
        <div class="solar-site-metrics"><span><small>Power</small><strong>${reading.powerKw == null ? '—' : number(reading.powerKw) + ' kW'}</strong></span><span><small>PR</small><strong>${percent(reading.performanceRatioPct)}</strong></span><span><small>Availability</small><strong>${percent(reading.availabilityPct)}</strong></span></div>
      </article>`;
    }).join('') : '<div class="empty-state"><div><strong>No solar sites yet</strong><span>Add the first solar site to start tracking plant health.</span></div></div>';

    const faultsRoot = document.querySelector('[data-solar-faults]');
    faultsRoot.innerHTML = (overview.faults || []).length ? overview.faults.map((fault) => `<article class="solar-fault-row">
      <div><div class="solar-fault-title"><strong>${escapeHtml(fault.title)}</strong>${badge(fault.severity)}</div><span>${escapeHtml(fault.property && fault.property.label || 'Solar site')} · ${escapeHtml(fault.asset && fault.asset.name || 'Site-wide')}</span><small>${escapeHtml(fault.faultCode || fault.category || 'No fault code')} · ${dateTime(fault.detectedAt)}</small></div>
      <div class="solar-fault-actions">${badge(fault.status)}${fault.status === 'OPEN' ? `<button class="text-button" type="button" data-fault-status="ACKNOWLEDGED" data-fault-id="${escapeHtml(fault.id)}">Acknowledge</button>` : ''}${fault.status !== 'RESOLVED' ? `<button class="text-button" type="button" data-fault-status="RESOLVED" data-fault-id="${escapeHtml(fault.id)}">Resolve</button>` : ''}</div>
    </article>`).join('') : '<div class="empty-state"><div><strong>No active faults</strong><span>Reported solar faults will appear here.</span></div></div>';

    const readingsRoot = document.querySelector('[data-solar-readings]');
    readingsRoot.innerHTML = (overview.readings || []).length ? overview.readings.map((reading) => `<tr><td>${escapeHtml(dateTime(reading.recordedAt))}</td><td>${escapeHtml(reading.property && reading.property.label || '—')}</td><td>${escapeHtml(reading.asset && reading.asset.name || 'Site')}</td><td>${reading.powerKw == null ? '—' : escapeHtml(number(reading.powerKw) + ' kW')}</td><td>${reading.energyTodayKwh == null ? '—' : escapeHtml(number(reading.energyTodayKwh) + ' kWh')}</td><td>${escapeHtml(percent(reading.performanceRatioPct))}</td><td>${escapeHtml(percent(reading.availabilityPct))}</td><td>${badge(reading.condition)}</td></tr>`).join('') : '<tr><td colspan="8"><div class="empty-state compact-empty"><div><strong>No readings recorded yet.</strong></div></div></td></tr>';
  }

  function option(value, text) { return `<option value="${escapeHtml(value)}">${escapeHtml(text)}</option>`; }
  function customerOptions() { return '<option value="">Select client</option>' + state.customers.map((item) => option(item.id, item.name)).join(''); }
  function siteOptions() { return '<option value="">Select solar site</option>' + (state.overview.sites || []).map((site) => option(site.propertyId, `${site.property && site.property.label || site.siteCode || 'Site'} — ${site.customer && site.customer.name || 'Client'}`)).join(''); }
  function assetOptions() { return '<option value="">Site-wide / no equipment</option>' + state.assets.map((asset) => option(asset.id, `${asset.name} — ${label(asset.assetType)}${asset.property && asset.property.label ? ' — ' + asset.property.label : ''}`)).join(''); }
  function jobOptions() { return '<option value="">No linked work order</option>' + state.jobs.filter((job) => !['COMPLETED', 'CANCELLED'].includes(job.status)).map((job) => option(job.id, job.title)).join(''); }
  function field(name, title, type = 'text', attrs = '') { return `<div class="field"><label>${escapeHtml(title)}</label><input name="${escapeHtml(name)}" type="${escapeHtml(type)}" ${attrs}></div>`; }
  function selectField(name, title, options, attrs = '') { return `<div class="field"><label>${escapeHtml(title)}</label><select name="${escapeHtml(name)}" ${attrs}>${options}</select></div>`; }
  function textarea(name, title) { return `<div class="field span-2"><label>${escapeHtml(title)}</label><textarea name="${escapeHtml(name)}" rows="3"></textarea></div>`; }

  function modalConfig(type) {
    if (type === 'site') return { title: 'New Solar Site', endpoint: '/solar/sites', fields: selectField('customerId', 'Client', customerOptions(), 'required') + field('label', 'Site Name', 'text', 'required') + field('siteCode', 'Site Code') + field('address', 'Site Address', 'text', 'required') + field('city', 'City') + selectField('status', 'Operating Status', ['COMMISSIONING', 'OPERATIONAL', 'DEGRADED', 'OFFLINE', 'MAINTENANCE'].map((value) => option(value, label(value))).join('')) + field('installedCapacityKwp', 'Installed DC Capacity (kWp)', 'number', 'min="0" step="0.001"') + field('acCapacityKw', 'AC Capacity (kW)', 'number', 'min="0" step="0.001"') + field('batteryCapacityKwh', 'Battery Capacity (kWh)', 'number', 'min="0" step="0.001"') + field('moduleCount', 'PV Module Count', 'number', 'min="0" step="1"') + field('inverterCount', 'Inverter Count', 'number', 'min="0" step="1"') + field('monitoringProvider', 'Monitoring Platform') + field('monitoringSiteId', 'Monitoring Site ID') + selectField('gridConnectionType', 'Connection Type', option('GRID_TIED', 'Grid-tied') + option('HYBRID', 'Hybrid') + option('OFF_GRID', 'Off-grid')) + field('targetPerformanceRatioPct', 'Target PR (%)', 'number', 'min="0" max="100" step="0.1" value="75"') + field('targetAvailabilityPct', 'Target Availability (%)', 'number', 'min="0" max="100" step="0.1" value="98"') + textarea('notes', 'Site Notes') };
    if (type === 'reading') return { title: 'Record Solar Reading', endpoint: '/solar/readings', fields: selectField('propertyId', 'Solar Site', siteOptions(), 'required') + selectField('assetId', 'Equipment', assetOptions()) + selectField('jobId', 'Linked Work Order', jobOptions()) + selectField('condition', 'Condition', option('NORMAL', 'Normal') + option('WARNING', 'Warning') + option('CRITICAL', 'Critical')) + field('recordedAt', 'Reading Time', 'datetime-local') + field('powerKw', 'Power (kW)', 'number', 'step="0.001" min="0"') + field('energyTodayKwh', 'Energy Today (kWh)', 'number', 'step="0.001" min="0"') + field('lifetimeEnergyKwh', 'Lifetime Energy (kWh)', 'number', 'step="0.001" min="0"') + field('irradianceWm2', 'Irradiance (W/m²)', 'number', 'step="0.1" min="0"') + field('performanceRatioPct', 'Performance Ratio (%)', 'number', 'step="0.1" min="0" max="100"') + field('availabilityPct', 'Availability (%)', 'number', 'step="0.1" min="0" max="100"') + field('dcVoltageV', 'DC Voltage (V)', 'number', 'step="0.001"') + field('dcCurrentA', 'DC Current (A)', 'number', 'step="0.001"') + field('acVoltageV', 'AC Voltage (V)', 'number', 'step="0.001"') + field('acCurrentA', 'AC Current (A)', 'number', 'step="0.001"') + field('batterySocPct', 'Battery SOC (%)', 'number', 'step="0.1" min="0" max="100"') + field('batterySohPct', 'Battery SOH (%)', 'number', 'step="0.1" min="0" max="100"') + textarea('notes', 'Reading Notes') };
    return { title: 'Report Solar Fault', endpoint: '/solar/faults', fields: selectField('propertyId', 'Solar Site', siteOptions(), 'required') + selectField('assetId', 'Affected Equipment', assetOptions()) + selectField('jobId', 'Linked Work Order', jobOptions()) + selectField('severity', 'Severity', ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => option(value, label(value))).join('')) + field('faultCode', 'Fault / Alarm Code') + field('category', 'Category', 'text', 'placeholder="Inverter, DC, AC, battery, monitoring..."') + field('title', 'Fault Title', 'text', 'required') + field('detectedAt', 'Detected At', 'datetime-local') + field('downtimeMinutes', 'Downtime (minutes)', 'number', 'min="0" step="1"') + field('estimatedEnergyLossKwh', 'Estimated Energy Loss (kWh)', 'number', 'min="0" step="0.001"') + textarea('description', 'What happened?') };
  }

  function openModal(type) {
    const config = modalConfig(type);
    const modal = document.createElement('div');
    modal.className = 'fc-modal';
    modal.innerHTML = `<div class="fc-dialog solar-dialog"><form><div class="panel-head"><h3>${escapeHtml(config.title)}</h3><button class="icon-button" type="button" data-close>&times;</button></div><div class="form-grid">${config.fields}</div><div class="fc-form-actions"><button class="secondary-button" type="button" data-close>Cancel</button><button class="primary-button" type="submit">Save</button></div><p class="fc-form-error" hidden></p></form></div>`;
    const close = () => modal.remove();
    modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-close]')) close(); });
    modal.querySelector('form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorNode = modal.querySelector('.fc-form-error');
      errorNode.hidden = true;
      const body = Object.fromEntries(new FormData(event.currentTarget).entries());
      Object.keys(body).forEach((key) => { if (body[key] === '') delete body[key]; });
      try {
        await api(config.endpoint, { method: 'POST', body: JSON.stringify(body) });
        close();
        notify(type === 'site' ? 'Solar site created.' : type === 'reading' ? 'Solar reading recorded.' : 'Solar fault reported.');
        await loadData();
      } catch (error) {
        errorNode.textContent = error.message;
        errorNode.hidden = false;
      }
    });
    document.body.appendChild(modal);
  }

  async function updateFault(id, status) {
    try {
      await api(`/solar/faults/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      notify(status === 'RESOLVED' ? 'Solar fault resolved.' : 'Solar fault acknowledged.');
      await loadData();
    } catch (error) { notify(error.message, false); }
  }

  async function loadData() {
    [state.overview, state.customers, state.assets, state.jobs] = await Promise.all([api('/solar/overview'), api('/customers'), api('/assets'), api('/jobs')]);
    render();
  }

  async function init() {
    try {
      await api('/auth/session');
      await loadData();
    } catch (error) {
      window.location.href = 'login.html?return=' + encodeURIComponent('solar-operations.html');
    }
  }

  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-solar-action]');
    if (action) openModal(action.dataset.solarAction);
    const fault = event.target.closest('[data-fault-status]');
    if (fault) updateFault(fault.dataset.faultId, fault.dataset.faultStatus);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
