(function () {
  const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3000/api' : '/api';
  const root = document.querySelector('[data-customer-profile]');
  const customerId = new URLSearchParams(window.location.search).get('id');
  const state = { profile: null, activeTab: 'overview', selectedSiteId: null, selectedSiteTab: 'system' };

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  async function api(path, options = {}) {
    const response = await fetch(API_BASE + path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error && payload.error.message || 'Something went wrong.');
      error.status = response.status;
      error.details = payload.error && payload.error.details;
      throw error;
    }
    return payload.data;
  }

  function notify(message, type) {
    if (window.RevEngineUI) window.RevEngineUI.notify(message, { type: type || 'success' });
  }

  function formatDate(value, withTime) {
    if (!value) return 'Not recorded';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not recorded';
    return new Intl.DateTimeFormat(undefined, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(date);
  }

  function money(value) {
    const config = state.profile && state.profile.money;
    return new Intl.NumberFormat(config && config.numberFormat || 'en-US', { style: 'currency', currency: config && config.currency || 'USD' }).format(Number(value || 0));
  }

  function label(value) {
    return String(value || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function badge(value) {
    const text = label(value || 'Unknown');
    const key = String(value || '').toLowerCase().replace(/_/g, '-');
    return '<span class="profile-badge ' + escapeHtml(key) + '">' + escapeHtml(text) + '</span>';
  }

  function emptyState(title, text, action) {
    return '<div class="customer-profile-empty"><strong>' + escapeHtml(title) + '</strong><span>' + escapeHtml(text || '') + '</span>' + (action || '') + '</div>';
  }

  function customerTitle() {
    const customer = state.profile.customer;
    return customer.customerType === 'BUSINESS' ? customer.companyName || customer.name : customer.name;
  }

  function summaryCard(labelText, value, note) {
    return '<article class="card customer-summary-card"><span>' + escapeHtml(labelText) + '</span><strong>' + escapeHtml(value) + '</strong><small>' + escapeHtml(note || '') + '</small></article>';
  }

  function detailRow(name, value) {
    return '<div class="customer-detail-row"><span>' + escapeHtml(name) + '</span><strong>' + escapeHtml(value || 'Not recorded') + '</strong></div>';
  }

  function renderHeader() {
    const profile = state.profile;
    const customer = profile.customer;
    const access = profile.access;
    return '<div class="customer-profile-header">' +
      '<div class="customer-profile-heading">' +
        '<a class="back-link" href="customers.html"><span aria-hidden="true">‹</span> Customers</a>' +
        '<div class="customer-profile-title-row"><div><p class="eyebrow">' + escapeHtml(customer.customerType === 'BUSINESS' ? 'Business customer' : 'Residential customer') + '</p><h2>' + escapeHtml(customerTitle()) + '</h2><p>' + escapeHtml([customer.customerType === 'BUSINESS' ? customer.name : null, customer.email, customer.phone].filter(Boolean).join(' · ') || 'No contact details recorded') + '</p></div>' +
        '<div class="customer-profile-actions">' +
          (access.canEditCustomer ? '<button class="secondary-button" type="button" data-profile-action="edit-customer">Edit customer</button>' : '') +
          (access.canCreateSite ? '<button class="primary-button" type="button" data-profile-action="add-site">+ Add solar site</button>' : '') +
        '</div></div>' +
      '</div>' +
      '<section class="customer-summary-grid">' +
        summaryCard('Solar sites', String(profile.summary.siteCount || 0), 'Locations under this customer') +
        summaryCard('Solar equipment', String(profile.summary.equipmentCount || 0), 'Panels, inverters, batteries, and more') +
        summaryCard('Open faults', String(profile.summary.openFaultCount || 0), profile.summary.openFaultCount ? 'Needs attention' : 'No unresolved faults') +
        summaryCard('Last service', profile.summary.lastServiceAt ? formatDate(profile.summary.lastServiceAt) : 'No service yet', profile.summary.activeContractCount + ' active O&M contract' + (profile.summary.activeContractCount === 1 ? '' : 's')) +
      '</section>' +
    '</div>';
  }

  const tabDefinitions = [
    ['overview', 'Overview'],
    ['contacts', 'Contacts'],
    ['sites', 'Solar Sites'],
    ['work', 'Work History'],
    ['commercial', 'Quotes & Contracts'],
    ['documents', 'Documents & Notes'],
    ['money', 'Money']
  ];

  function renderTabs() {
    return '<div class="customer-profile-tabs" role="tablist">' + tabDefinitions.filter(([key]) => key !== 'money' || state.profile.access.canViewMoney).map(([key, text]) => '<button class="customer-profile-tab' + (state.activeTab === key ? ' active' : '') + '" type="button" role="tab" data-profile-tab="' + key + '">' + escapeHtml(text) + '</button>').join('') + '</div>';
  }

  function renderOverview() {
    const profile = state.profile;
    const customer = profile.customer;
    const latestJobs = profile.workHistory.slice(0, 5);
    const urgentFaults = profile.sites.flatMap((site) => site.faults.map((fault) => ({ ...fault, siteLabel: site.label }))).filter((fault) => !['RESOLVED', 'CLOSED'].includes(fault.status)).slice(0, 5);
    return '<div class="customer-profile-layout">' +
      '<section class="card customer-profile-panel"><div class="profile-panel-head"><div><h3>Customer details</h3><p>The main information staff need when working with this customer.</p></div></div><div class="customer-detail-grid">' +
        detailRow('Customer type', customer.customerType === 'BUSINESS' ? 'Business' : 'Residential') +
        (customer.customerType === 'BUSINESS' ? detailRow('Business name', customer.companyName) : '') +
        detailRow('Main contact', customer.name) +
        detailRow('Email', customer.email) +
        detailRow('Phone', customer.phone) +
        detailRow('Billing address', customer.address) +
        detailRow('Branch', customer.branch && customer.branch.name) +
        detailRow('Customer since', formatDate(customer.createdAt)) +
      '</div></section>' +
      '<section class="card customer-profile-panel"><div class="profile-panel-head"><div><h3>Needs attention</h3><p>Open faults and customer issues that should not be missed.</p></div></div>' +
        (urgentFaults.length ? '<div class="profile-list">' + urgentFaults.map((fault) => '<article class="profile-list-item"><div><strong>' + escapeHtml(fault.title) + '</strong><small>' + escapeHtml(fault.siteLabel + ' · ' + formatDate(fault.detectedAt)) + '</small></div>' + badge(fault.severity) + '</article>').join('') + '</div>' : emptyState('Nothing urgent', 'No open solar faults are recorded for this customer.')) +
      '</section>' +
      '<section class="card customer-profile-panel span-2"><div class="profile-panel-head"><div><h3>Recent work</h3><p>The latest installations, inspections, maintenance, and repairs.</p></div><button class="text-button" type="button" data-profile-tab-jump="work">View all work</button></div>' +
        (latestJobs.length ? '<div class="profile-list">' + latestJobs.map(renderJobRow).join('') + '</div>' : emptyState('No work history yet', 'Create a work order when this customer is ready for service.')) +
      '</section>' +
    '</div>';
  }

  function renderContactCard(contact) {
    return '<article class="card customer-contact-card"><div class="contact-card-head"><div><strong>' + escapeHtml(contact.name) + '</strong><span>' + escapeHtml(contact.role || (contact.isPrimary ? 'Primary contact' : 'Contact')) + '</span></div>' + (contact.isPrimary ? '<span class="profile-badge active">Primary</span>' : '') + '</div><div class="customer-contact-details">' + detailRow('Email', contact.email) + detailRow('Phone', contact.phone) + (contact.notes ? detailRow('Notes', contact.notes) : '') + '</div></article>';
  }

  function renderCommunicationRow(item) {
    const when = item.readAt || item.deliveredAt || item.sentAt || item.createdAt;
    return '<article class="profile-list-item"><div><strong>' + escapeHtml(label(item.channel) + ' · ' + label(item.direction)) + '</strong><small>' + escapeHtml([item.templateName, item.recipientMasked || item.senderMasked, formatDate(when, true)].filter(Boolean).join(' · ')) + '</small></div>' + badge(item.status) + '</article>';
  }

  function renderContacts() {
    const profile = state.profile;
    return '<div class="customer-profile-stack">' +
      '<section class="customer-section-head"><div><h3>Contact people</h3><p>People the office and technicians may need to call or email.</p></div>' + (profile.access.canAddContact ? '<button class="primary-button compact" type="button" data-profile-action="add-contact">+ Add contact</button>' : '') + '</section>' +
      (profile.contacts.length ? '<div class="customer-contact-grid">' + profile.contacts.map(renderContactCard).join('') + '</div>' : emptyState('No contacts recorded', 'Add the people the team should speak to.')) +
      '<section class="card customer-profile-panel"><div class="profile-panel-head"><div><h3>Communication history</h3><p>Recent WhatsApp, email, and other customer messages.</p></div></div>' +
        (profile.communication.length ? '<div class="profile-list">' + profile.communication.map(renderCommunicationRow).join('') + '</div>' : emptyState('No messages recorded', 'Messages connected to this customer will appear here.')) +
      '</section>' +
    '</div>';
  }

  function siteStatusText(site) {
    return site.system && site.system.status || 'NOT_CONFIGURED';
  }

  function renderSiteCard(site) {
    const capacity = site.system && site.system.installedCapacityKwp != null ? Number(site.system.installedCapacityKwp) + ' kWp' : 'Capacity not recorded';
    const openFaults = site.faults.filter((fault) => !['RESOLVED', 'CLOSED'].includes(fault.status)).length;
    return '<article class="card customer-site-card' + (state.selectedSiteId === site.id ? ' selected' : '') + '"><div class="site-card-head"><div><strong>' + escapeHtml(site.label) + '</strong><span>' + escapeHtml([site.address, site.city].filter(Boolean).join(', ') || 'Address not recorded') + '</span></div>' + badge(siteStatusText(site)) + '</div><div class="site-card-metrics"><span><strong>' + escapeHtml(capacity) + '</strong><small>Installed capacity</small></span><span><strong>' + site.equipment.length + '</strong><small>Equipment records</small></span><span><strong>' + openFaults + '</strong><small>Open faults</small></span></div><button class="secondary-button compact" type="button" data-open-site="' + escapeHtml(site.id) + '">' + (state.selectedSiteId === site.id ? 'Close site details' : 'Open site') + '</button></article>';
  }

  const siteTabs = [
    ['system', 'System Overview'],
    ['equipment', 'Equipment'],
    ['faults', 'Faults'],
    ['readings', 'Readings'],
    ['maintenance', 'Maintenance'],
    ['photos', 'Photos'],
    ['documents', 'Documents']
  ];

  function renderEquipmentItem(item) {
    return '<article class="profile-list-item"><div><strong>' + escapeHtml(item.name) + '</strong><small>' + escapeHtml([label(item.assetType), item.manufacturer, item.modelNumber, item.serialNumber && 'S/N ' + item.serialNumber].filter(Boolean).join(' · ')) + '</small></div>' + badge(item.status) + '</article>';
  }

  function renderFaultItem(item) {
    return '<article class="profile-list-item"><div><strong>' + escapeHtml(item.title) + '</strong><small>' + escapeHtml([item.faultCode, item.asset && item.asset.name, formatDate(item.detectedAt), item.rootCause].filter(Boolean).join(' · ')) + '</small></div><div class="profile-row-badges">' + badge(item.severity) + badge(item.status) + '</div></article>';
  }

  function renderReadingItem(item) {
    const readings = [
      item.powerKw != null && item.powerKw + ' kW',
      item.energyTodayKwh != null && item.energyTodayKwh + ' kWh today',
      item.performanceRatioPct != null && item.performanceRatioPct + '% PR',
      item.availabilityPct != null && item.availabilityPct + '% available',
      item.batterySocPct != null && item.batterySocPct + '% battery'
    ].filter(Boolean);
    return '<article class="profile-list-item"><div><strong>' + escapeHtml(item.asset && item.asset.name || 'Site reading') + '</strong><small>' + escapeHtml([formatDate(item.recordedAt, true), ...readings].join(' · ')) + '</small></div>' + badge(item.condition) + '</article>';
  }

  function renderJobRow(job) {
    const worker = job.worker && job.worker.user && job.worker.user.name;
    return '<article class="profile-list-item"><div><strong>' + escapeHtml(job.title) + '</strong><small>' + escapeHtml([job.service && job.service.name, worker, formatDate(job.completedAt || job.scheduledStart || job.createdAt, true)].filter(Boolean).join(' · ')) + '</small></div>' + badge(job.status) + '</article>';
  }

  function renderContractRow(contract) {
    return '<article class="profile-list-item"><div><strong>' + escapeHtml(contract.contractNumber || contract.name) + '</strong><small>' + escapeHtml([contract.name, contract.startDate && formatDate(contract.startDate), contract.endDate && 'Ends ' + formatDate(contract.endDate), contract.responseSlaHours && contract.responseSlaHours + 'h response'].filter(Boolean).join(' · ')) + '</small></div>' + badge(contract.status) + '</article>';
  }

  function renderPhoto(photo) {
    return '<a class="customer-photo-card" href="' + escapeHtml(photo.url) + '" target="_blank" rel="noopener"><img src="' + escapeHtml(photo.url) + '" alt="' + escapeHtml(photo.caption || photo.filename || 'Work photo') + '"><span>' + escapeHtml(photo.caption || photo.jobTitle || label(photo.category)) + '</span></a>';
  }

  function renderDocument(item) {
    const body = '<div><strong>' + escapeHtml(item.fileName || 'Document') + '</strong><small>' + escapeHtml([item.mimeType, item.sizeBytes ? Math.ceil(item.sizeBytes / 1024) + ' KB' : null, formatDate(item.createdAt)].filter(Boolean).join(' · ')) + '</small></div>';
    return item.url ? '<a class="profile-list-item profile-document-link" href="' + escapeHtml(item.url) + '" target="_blank" rel="noopener">' + body + '<span>Open</span></a>' : '<article class="profile-list-item">' + body + '<span>Unavailable</span></article>';
  }

  function renderSitePanel(site) {
    if (!site) return '';
    let content = '';
    if (state.selectedSiteTab === 'system') {
      const system = site.system || {};
      content = '<div class="customer-detail-grid">' +
        detailRow('Site status', label(system.status || 'Not configured')) +
        detailRow('Site code', system.siteCode) +
        detailRow('Installed capacity', system.installedCapacityKwp != null ? system.installedCapacityKwp + ' kWp' : null) +
        detailRow('AC capacity', system.acCapacityKw != null ? system.acCapacityKw + ' kW' : null) +
        detailRow('Battery capacity', system.batteryCapacityKwh != null ? system.batteryCapacityKwh + ' kWh' : null) +
        detailRow('PV modules', system.moduleCount != null ? String(system.moduleCount) : null) +
        detailRow('Inverters', system.inverterCount != null ? String(system.inverterCount) : null) +
        detailRow('Connection type', label(system.gridConnectionType)) +
        detailRow('Monitoring platform', system.monitoringProvider) +
        detailRow('Monitoring site ID', system.monitoringSiteId) +
        detailRow('Last inspection', formatDate(system.lastInspectionAt)) +
        detailRow('Next inspection', formatDate(system.nextInspectionDueAt)) +
      '</div>';
    }
    if (state.selectedSiteTab === 'equipment') content = site.equipment.length ? '<div class="profile-list">' + site.equipment.map(renderEquipmentItem).join('') + '</div>' : emptyState('No equipment recorded', 'Add panels, inverters, batteries, meters, and gateways for this site.');
    if (state.selectedSiteTab === 'faults') content = site.faults.length ? '<div class="profile-list">' + site.faults.map(renderFaultItem).join('') + '</div>' : emptyState('No faults recorded', 'Faults reported for this site will appear here.');
    if (state.selectedSiteTab === 'readings') content = site.readings.length ? '<div class="profile-list">' + site.readings.map(renderReadingItem).join('') + '</div>' : emptyState('No readings recorded', 'Technician and monitoring readings will appear here.');
    if (state.selectedSiteTab === 'maintenance') content = '<div class="customer-profile-stack">' + (site.contracts.length ? '<div><h4>O&M coverage</h4><div class="profile-list">' + site.contracts.map(renderContractRow).join('') + '</div></div>' : '') + (site.maintenance.length ? '<div><h4>Service history</h4><div class="profile-list">' + site.maintenance.map(renderJobRow).join('') + '</div></div>' : emptyState('No site maintenance yet', 'Completed and scheduled maintenance linked to this site will appear here.')) + '</div>';
    if (state.selectedSiteTab === 'photos') content = site.photos.length ? '<div class="customer-photo-grid">' + site.photos.map(renderPhoto).join('') + '</div>' : emptyState('No site photos yet', 'Before, after, and proof-of-work photos will appear here.');
    if (state.selectedSiteTab === 'documents') content = site.documents.length ? '<div class="profile-list">' + site.documents.map(renderDocument).join('') + '</div>' : emptyState('No site documents yet', 'Documents connected to work at this site will appear here.');
    return '<section class="card customer-site-detail"><div class="profile-panel-head"><div><p class="eyebrow">Solar site</p><h3>' + escapeHtml(site.label) + '</h3><p>' + escapeHtml([site.address, site.city].filter(Boolean).join(', ')) + '</p></div><button class="icon-button" type="button" data-close-site aria-label="Close site details">×</button></div><div class="customer-site-tabs">' + siteTabs.map(([key, text]) => '<button class="customer-site-tab' + (state.selectedSiteTab === key ? ' active' : '') + '" type="button" data-site-tab="' + key + '">' + escapeHtml(text) + '</button>').join('') + '</div><div class="customer-site-content">' + content + '</div></section>';
  }

  function renderSites() {
    const sites = state.profile.sites;
    const selected = sites.find((site) => site.id === state.selectedSiteId);
    return '<div class="customer-profile-stack"><section class="customer-section-head"><div><h3>Solar sites</h3><p>Each site keeps its own system, equipment, faults, readings, maintenance, photos, and documents.</p></div>' + (state.profile.access.canCreateSite ? '<button class="primary-button compact" type="button" data-profile-action="add-site">+ Add solar site</button>' : '') + '</section>' + (sites.length ? '<div class="customer-site-grid">' + sites.map(renderSiteCard).join('') + '</div>' : emptyState('No solar sites yet', 'Add the first location where this customer has a solar system.', state.profile.access.canCreateSite ? '<button class="primary-button compact" type="button" data-profile-action="add-site">Add solar site</button>' : '')) + renderSitePanel(selected) + '</div>';
  }

  function renderWork() {
    const jobs = state.profile.workHistory;
    return '<section class="card customer-profile-panel"><div class="profile-panel-head"><div><h3>Work history</h3><p>Every installation, inspection, repair, cleaning, and maintenance visit for this customer.</p></div></div>' + (jobs.length ? '<div class="profile-list">' + jobs.map(renderJobRow).join('') + '</div>' : emptyState('No work orders yet', 'Work orders connected to this customer will appear here.')) + '</section>';
  }

  function renderQuoteRow(quote) {
    return '<article class="profile-list-item"><div><strong>' + escapeHtml(quote.title) + '</strong><small>' + escapeHtml([quote.service && quote.service.name, formatDate(quote.createdAt), quote.total != null ? money(quote.total) : quote.amount != null ? money(quote.amount) : null].filter(Boolean).join(' · ')) + '</small></div>' + badge(quote.status) + '</article>';
  }

  function renderCommercial() {
    const profile = state.profile;
    return '<div class="customer-profile-layout">' +
      (profile.access.canViewQuotes ? '<section class="card customer-profile-panel"><div class="profile-panel-head"><div><h3>Quotes</h3><p>Sales proposals prepared for this customer.</p></div></div>' + (profile.quotes.length ? '<div class="profile-list">' + profile.quotes.map(renderQuoteRow).join('') + '</div>' : emptyState('No quotes yet', 'Quotes for this customer will appear here.')) + '</section>' : '<section class="card customer-profile-panel">' + emptyState('Quotes are hidden', 'Your account does not need access to customer prices and sales documents.') + '</section>') +
      '<section class="card customer-profile-panel"><div class="profile-panel-head"><div><h3>O&M contracts</h3><p>Coverage, service dates, and response commitments.</p></div></div>' + (profile.contracts.length ? '<div class="profile-list">' + profile.contracts.map(renderContractRow).join('') + '</div>' : emptyState('No O&M contracts yet', 'Maintenance agreements for this customer will appear here.')) + '</section>' +
    '</div>';
  }

  function renderNote(note) {
    return '<article class="customer-note-card"><div><strong>' + escapeHtml(label(note.category || 'GENERAL')) + '</strong><span>' + escapeHtml(note.note) + '</span><small>' + escapeHtml([note.createdBy && note.createdBy.name, formatDate(note.createdAt, true), note.technicianVisible ? 'Visible to technicians' : 'Management only'].filter(Boolean).join(' · ')) + '</small></div></article>';
  }

  function renderDocuments() {
    const profile = state.profile;
    return '<div class="customer-profile-layout">' +
      '<section class="card customer-profile-panel"><div class="profile-panel-head"><div><h3>Documents</h3><p>Customer files, reports, and documents saved against their work.</p></div></div>' + (profile.documents.length ? '<div class="profile-list">' + profile.documents.map(renderDocument).join('') + '</div>' : emptyState('No documents yet', 'Documents connected to this customer will appear here.')) + '</section>' +
      '<section class="card customer-profile-panel"><div class="profile-panel-head"><div><h3>Customer notes</h3><p>Useful information for future visits and customer care.</p></div>' + (profile.access.canAddNote ? '<button class="primary-button compact" type="button" data-profile-action="add-note">+ Add note</button>' : '') + '</div>' + (profile.notes.length ? '<div class="customer-note-list">' + profile.notes.map(renderNote).join('') + '</div>' : emptyState('No notes yet', 'Add access instructions, preferences, warnings, or important context.')) + '</section>' +
    '</div>';
  }

  function renderInvoiceRow(invoice) {
    return '<article class="profile-list-item"><div><strong>' + escapeHtml(invoice.number || 'Invoice') + '</strong><small>' + escapeHtml([formatDate(invoice.createdAt), invoice.dueDate && 'Due ' + formatDate(invoice.dueDate), money(invoice.total || invoice.amount || 0), 'Balance ' + money(invoice.balanceDue || 0)].filter(Boolean).join(' · ')) + '</small></div>' + badge(invoice.status) + '</article>';
  }

  function renderMoney() {
    const profile = state.profile;
    if (!profile.access.canViewMoney || !profile.money) return emptyState('Money is hidden', 'Your role does not include invoices, payments, or balances.');
    return '<div class="customer-profile-stack"><section class="customer-summary-grid money-summary">' + summaryCard('Invoiced', money(profile.money.invoiceTotal), 'Total customer billing') + summaryCard('Paid', money(profile.money.paid), 'Confirmed payments') + summaryCard('Outstanding', money(profile.money.outstanding), 'Still owed') + '</section><section class="card customer-profile-panel"><div class="profile-panel-head"><div><h3>Invoices and payments</h3><p>Customer billing history. Technicians never see this section.</p></div></div>' + (profile.money.invoices.length ? '<div class="profile-list">' + profile.money.invoices.map(renderInvoiceRow).join('') + '</div>' : emptyState('No invoices yet', 'Invoices for this customer will appear here.')) + '</section></div>';
  }

  function renderActiveTab() {
    const renderers = { overview: renderOverview, contacts: renderContacts, sites: renderSites, work: renderWork, commercial: renderCommercial, documents: renderDocuments, money: renderMoney };
    return '<div class="customer-profile-tab-content" role="tabpanel">' + (renderers[state.activeTab] || renderOverview)() + '</div>';
  }

  function render() {
    if (!state.profile) return;
    root.innerHTML = renderHeader() + renderTabs() + renderActiveTab();
  }

  function field(name, text, type, value, attrs) {
    return '<div class="field"><label for="profile-' + escapeHtml(name) + '">' + escapeHtml(text) + '</label><input id="profile-' + escapeHtml(name) + '" name="' + escapeHtml(name) + '" type="' + escapeHtml(type || 'text') + '" value="' + escapeHtml(value || '') + '" ' + (attrs || '') + '></div>';
  }

  function selectField(name, text, options, value, attrs) {
    return '<div class="field"><label for="profile-' + escapeHtml(name) + '">' + escapeHtml(text) + '</label><select id="profile-' + escapeHtml(name) + '" name="' + escapeHtml(name) + '" ' + (attrs || '') + '>' + options.map(([optionValue, optionLabel]) => '<option value="' + escapeHtml(optionValue) + '"' + (optionValue === value ? ' selected' : '') + '>' + escapeHtml(optionLabel) + '</option>').join('') + '</select></div>';
  }

  function textareaField(name, text, value, attrs) {
    return '<div class="field span-2"><label for="profile-' + escapeHtml(name) + '">' + escapeHtml(text) + '</label><textarea id="profile-' + escapeHtml(name) + '" name="' + escapeHtml(name) + '" ' + (attrs || '') + '>' + escapeHtml(value || '') + '</textarea></div>';
  }

  function openFormModal(config) {
    const modal = document.createElement('div');
    modal.className = 'fc-modal';
    modal.innerHTML = '<div class="fc-dialog customer-profile-dialog"><form novalidate><div class="panel-head"><div><h3>' + escapeHtml(config.title) + '</h3><p class="modal-copy">' + escapeHtml(config.copy || '') + '</p></div><button class="icon-button" type="button" data-close aria-label="Close">×</button></div><div class="form-grid">' + config.fields + '</div><div class="fc-form-actions"><button class="secondary-button" type="button" data-close>Cancel</button><button class="primary-button" type="submit">' + escapeHtml(config.submitLabel || 'Save') + '</button></div><p class="fc-form-error" hidden></p></form></div>';
    const form = modal.querySelector('form');
    const close = () => { modal.remove(); document.body.classList.toggle('modal-open', Boolean(document.querySelector('.fc-modal'))); };
    modal.addEventListener('click', (event) => { if (event.target === modal || event.target.closest('[data-close]')) close(); });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (window.RevEngineFormUX && !window.RevEngineFormUX.validateForm(form)) return;
      const submit = form.querySelector('[type="submit"]');
      const error = form.querySelector('.fc-form-error');
      submit.disabled = true;
      error.hidden = true;
      try {
        const body = Object.fromEntries(new FormData(form).entries());
        Object.keys(body).forEach((key) => { if (body[key] === '') delete body[key]; });
        await config.onSubmit(body, form);
        close();
      } catch (failure) {
        error.textContent = failure.message;
        error.hidden = false;
      } finally {
        submit.disabled = false;
      }
    });
    document.body.appendChild(modal);
    document.body.classList.add('modal-open');
    if (window.RevEngineFormUX) window.RevEngineFormUX.refresh(form);
    const first = form.querySelector('input:not([type="hidden"]), select, textarea');
    if (first) first.focus();
  }

  function editCustomer() {
    const customer = state.profile.customer;
    openFormModal({
      title: 'Edit customer',
      copy: 'Update the customer and main contact details.',
      fields: selectField('customerType', 'Customer Type', [['RESIDENTIAL', 'Residential customer'], ['BUSINESS', 'Business customer']], customer.customerType, 'required') + field('companyName', 'Business Name', 'text', customer.companyName) + field('name', 'Contact Name', 'text', customer.name, 'required maxlength="200"') + field('email', 'Email', 'email', customer.email) + field('phone', 'Phone', 'text', customer.phone) + field('address', 'Billing Address', 'text', customer.address) + textareaField('notes', 'General Notes', customer.notes, 'maxlength="3000"'),
      onSubmit: async (body) => {
        if (body.customerType !== 'BUSINESS') delete body.companyName;
        await api('/customers/' + encodeURIComponent(customerId), { method: 'PATCH', body: JSON.stringify(body) });
        notify('Customer details updated.');
        await loadProfile();
      }
    });
  }

  function addContact() {
    openFormModal({
      title: 'Add contact',
      copy: 'Add another person the team may need to speak to.',
      fields: field('name', 'Contact Name', 'text', '', 'required maxlength="200"') + field('role', 'Role or Relationship', 'text', '') + field('email', 'Email', 'email', '') + field('phone', 'Phone', 'text', '') + '<label class="profile-checkbox span-2"><input type="checkbox" name="isPrimary" value="true"><span><strong>Make this the primary contact</strong><small>This person becomes the main customer contact.</small></span></label>' + textareaField('notes', 'Contact Notes', '', 'maxlength="1000"'),
      onSubmit: async (body, form) => {
        body.isPrimary = Boolean(form.elements.isPrimary.checked);
        await api('/customer-profiles/' + encodeURIComponent(customerId) + '/contacts', { method: 'POST', body: JSON.stringify(body) });
        notify('Contact added.');
        state.activeTab = 'contacts';
        await loadProfile();
      }
    });
  }

  function addNote() {
    const technician = state.profile.access.technician;
    openFormModal({
      title: 'Add customer note',
      copy: 'Save information that will help the team serve this customer.',
      fields: selectField('category', 'Note Type', [['GENERAL', 'General'], ['ACCESS', 'Site access'], ['SAFETY', 'Safety warning'], ['PREFERENCE', 'Customer preference'], ['TECHNICAL', 'Technical context']], 'GENERAL') + (technician ? '' : '<label class="profile-checkbox"><input type="checkbox" name="technicianVisible" value="true" checked><span><strong>Visible to technicians</strong><small>Show this note when technicians open the profile.</small></span></label>') + textareaField('note', 'Note', '', 'required maxlength="3000" rows="5"'),
      onSubmit: async (body, form) => {
        body.technicianVisible = technician ? true : Boolean(form.elements.technicianVisible && form.elements.technicianVisible.checked);
        await api('/customer-profiles/' + encodeURIComponent(customerId) + '/notes', { method: 'POST', body: JSON.stringify(body) });
        notify('Customer note added.');
        state.activeTab = 'documents';
        await loadProfile();
      }
    });
  }

  function addSite() {
    openFormModal({
      title: 'Add solar site',
      copy: 'Create the location first. Equipment and readings can be added afterwards.',
      fields: field('label', 'Site Name', 'text', '', 'required maxlength="200"') + field('siteCode', 'Site Code', 'text', '') + field('address', 'Site Address', 'text', '', 'required maxlength="500"') + field('city', 'City or Area', 'text', '') + selectField('status', 'Site Status', [['COMMISSIONING', 'Commissioning'], ['OPERATIONAL', 'Operational'], ['DEGRADED', 'Needs attention'], ['OFFLINE', 'Offline'], ['MAINTENANCE', 'Under maintenance']], 'COMMISSIONING') + field('installedCapacityKwp', 'Installed Capacity (kWp)', 'number', '', 'min="0" step="0.001"') + field('acCapacityKw', 'AC Capacity (kW)', 'number', '', 'min="0" step="0.001"') + field('batteryCapacityKwh', 'Battery Capacity (kWh)', 'number', '', 'min="0" step="0.001"') + field('moduleCount', 'PV Module Count', 'number', '', 'min="0" step="1"') + field('inverterCount', 'Inverter Count', 'number', '', 'min="0" step="1"') + selectField('gridConnectionType', 'Connection Type', [['GRID_TIED', 'Grid-tied'], ['HYBRID', 'Hybrid'], ['OFF_GRID', 'Off-grid']], 'GRID_TIED') + field('monitoringProvider', 'Monitoring Platform', 'text', '') + field('monitoringSiteId', 'Monitoring Site ID', 'text', '') + textareaField('notes', 'Site Notes', '', 'maxlength="2000"'),
      submitLabel: 'Add site',
      onSubmit: async (body) => {
        body.customerId = customerId;
        ['installedCapacityKwp', 'acCapacityKw', 'batteryCapacityKwh'].forEach((key) => { if (body[key] !== undefined) body[key] = Number(body[key]); });
        ['moduleCount', 'inverterCount'].forEach((key) => { if (body[key] !== undefined) body[key] = Number(body[key]); });
        const site = await api('/solar/sites', { method: 'POST', body: JSON.stringify(body) });
        notify('Solar site added.');
        state.activeTab = 'sites';
        state.selectedSiteId = site.propertyId || site.property && site.property.id || null;
        await loadProfile();
      }
    });
  }

  async function loadProfile() {
    if (!customerId) {
      root.innerHTML = emptyState('Customer not found', 'Open a customer from the customer list.');
      return;
    }
    state.profile = await api('/customer-profiles/' + encodeURIComponent(customerId));
    if (state.activeTab === 'money' && !state.profile.access.canViewMoney) state.activeTab = 'overview';
    if (state.selectedSiteId && !state.profile.sites.some((site) => site.id === state.selectedSiteId)) state.selectedSiteId = null;
    render();
  }

  root.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-profile-tab]');
    if (tab) {
      state.activeTab = tab.dataset.profileTab;
      render();
      return;
    }
    const jump = event.target.closest('[data-profile-tab-jump]');
    if (jump) {
      state.activeTab = jump.dataset.profileTabJump;
      render();
      return;
    }
    const site = event.target.closest('[data-open-site]');
    if (site) {
      state.selectedSiteId = state.selectedSiteId === site.dataset.openSite ? null : site.dataset.openSite;
      state.selectedSiteTab = 'system';
      render();
      return;
    }
    if (event.target.closest('[data-close-site]')) {
      state.selectedSiteId = null;
      render();
      return;
    }
    const siteTab = event.target.closest('[data-site-tab]');
    if (siteTab) {
      state.selectedSiteTab = siteTab.dataset.siteTab;
      render();
      return;
    }
    const action = event.target.closest('[data-profile-action]');
    if (!action) return;
    if (action.dataset.profileAction === 'edit-customer') editCustomer();
    if (action.dataset.profileAction === 'add-contact') addContact();
    if (action.dataset.profileAction === 'add-note') addNote();
    if (action.dataset.profileAction === 'add-site') addSite();
  });

  loadProfile().catch((error) => {
    root.innerHTML = emptyState(error.status === 403 ? 'You cannot open this customer' : 'Customer profile could not load', error.message);
    notify(error.message, 'error');
  });
})();
