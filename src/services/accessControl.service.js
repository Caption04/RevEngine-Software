const { prisma } = require('../db');

const PERMISSION_CATALOG = [
  {
    key: 'Home',
    label: 'Home page',
    help: 'Choose which summaries they can see when they sign in.',
    permissions: [
      { key: 'dashboard.operational.view', label: 'View work summary', help: 'Jobs, workers, and today’s schedule.', targets: ['index.html', 'GET /api/dashboard'] },
      { key: 'dashboard.financial.view', label: 'View money summary', help: 'Money received and unpaid invoices.', targets: ['index.html', 'GET /api/dashboard'] }
    ]
  },
  {
    key: 'Customers',
    label: 'Customers',
    help: 'Choose what they can do with customer records.',
    permissions: [
      { key: 'customers.view', label: 'View customers', targets: ['customers.html', 'GET /api/customers'] },
      { key: 'customers.create', label: 'Add customers', targets: ['POST /api/customers'] },
      { key: 'customers.edit', label: 'Edit customers', targets: ['PATCH /api/customers/:id'] },
      { key: 'customers.delete', label: 'Delete customers', targets: ['DELETE /api/customers/:id'] }
    ]
  },
  {
    key: 'Leads',
    label: 'Leads',
    help: 'Choose what they can do with new sales enquiries.',
    permissions: [
      { key: 'leads.view', label: 'View leads', targets: ['leads.html', 'GET /api/leads'] },
      { key: 'leads.create', label: 'Add leads', targets: ['POST /api/leads'] },
      { key: 'leads.edit', label: 'Update leads', targets: ['PATCH /api/leads/:id', 'POST /api/leads/:id/activities'] },
      { key: 'leads.convert', label: 'Turn leads into work', help: 'Create a customer, quote, or job from a lead.', targets: ['POST /api/leads/:id/convert'] }
    ]
  },
  {
    key: 'Jobs',
    label: 'Jobs',
    help: 'Choose what they can do with jobs.',
    permissions: [
      { key: 'jobs.view', label: 'View jobs', targets: ['jobs.html', 'GET /api/jobs'] },
      { key: 'jobs.create', label: 'Add jobs', targets: ['POST /api/jobs'] },
      { key: 'jobs.edit', label: 'Edit jobs', targets: ['PATCH /api/jobs/:id'] },
      { key: 'jobs.assign', label: 'Assign jobs', targets: ['POST /api/jobs/:id/assign-worker'] },
      { key: 'job.reassign.after_dispatch', label: 'Move a dispatched job', help: 'Change the worker after dispatch.', targets: ['POST /api/jobs/:id/assign-worker'] }
    ]
  },
  {
    key: 'Scheduling',
    label: 'Schedule',
    help: 'Choose what they can do with the work calendar.',
    permissions: [
      { key: 'schedule.view', label: 'View the schedule', targets: ['schedule.html', 'GET /api/schedule'] },
      { key: 'schedule.manage', label: 'Change the schedule', targets: ['POST/PATCH/DELETE /api/schedule'] },
      { key: 'schedule.override', label: 'Ignore schedule warnings', help: 'Allow a job even when the system finds a clash.', targets: ['adminOverride on schedule actions'] }
    ]
  },
  {
    key: 'Workforce',
    label: 'Workers',
    help: 'Choose what they can see and change about workers.',
    permissions: [
      { key: 'workers.view', label: 'View workers', targets: ['GET /api/workers'] },
      { key: 'workers.manage', label: 'Manage workers', targets: ['POST/PATCH /api/workers'] },
      { key: 'workers.location.view', label: 'View worker locations', targets: ['map.html', 'GET /api/worker-location/latest'] }
    ]
  },
  {
    key: 'Bookings',
    label: 'Booking requests',
    help: 'Choose what they can do with new customer requests.',
    permissions: [
      { key: 'bookings.view', label: 'View booking requests', targets: ['booking-requests.html', 'GET /api/booking-requests'] },
      { key: 'bookings.manage', label: 'Manage booking requests', help: 'Review, decline, or turn a request into work.', targets: ['POST /api/booking-requests/:id/*'] }
    ]
  },
  {
    key: 'Quotes',
    label: 'Quotes',
    help: 'Choose what they can do with quotes.',
    permissions: [
      { key: 'quotes.view', label: 'View quotes', targets: ['quotes.html', 'GET /api/quotes'] },
      { key: 'quotes.create', label: 'Create quotes', targets: ['POST /api/quotes'] },
      { key: 'quotes.edit', label: 'Edit quotes', targets: ['PATCH /api/quotes/:id'] },
      { key: 'quotes.send', label: 'Send quotes', targets: ['POST /api/quotes/:id/send'] },
      { key: 'quote.discount.approve', label: 'Approve quote discounts', targets: ['quote discount approval'] }
    ]
  },
  {
    key: 'Invoices',
    label: 'Invoices',
    help: 'Choose what they can do with invoices.',
    permissions: [
      { key: 'invoices.view', label: 'View invoices', targets: ['invoices.html', 'GET /api/invoices'] },
      { key: 'invoices.create', label: 'Create invoices', targets: ['POST /api/invoices'] },
      { key: 'invoices.edit', label: 'Edit invoices', targets: ['PATCH /api/invoices/:id'] },
      { key: 'invoices.send', label: 'Send invoices', targets: ['POST /api/invoices/:id/send'] },
      { key: 'invoice.void', label: 'Cancel invoices', targets: ['POST /api/invoices/:id/void'] },
      { key: 'invoice.discount.approve', label: 'Approve invoice discounts', targets: ['invoice discount approval'] }
    ]
  },
  {
    key: 'Finance',
    label: 'Customer billing',
    help: 'Client invoices and payment history. This does not grant access to company-wide financial reports.',
    permissions: [
      { key: 'payments.view', label: 'View payments', targets: ['collections.html', 'GET /api/payments'] },
      { key: 'payments.manage', label: 'Manage payments', targets: ['POST/PATCH /api/payments'] },
      { key: 'payment.refund', label: 'Approve refunds', targets: ['POST /api/payments/:id/refund'] },
      { key: 'settings.finance.manage', label: 'Change finance settings', targets: ['settings.html#finance', 'PATCH /api/company/finance-settings'] },
      { key: 'finance.exports.manage', label: 'Export financial records', help: 'Company-wide export permission; do not grant this merely to view customer payment history.', targets: ['GET /api/finance/export/*', 'GET /api/reports/export'] },
      { key: 'finance.integrations.manage', label: 'Manage accounting connections', targets: ['settings.html#finance', 'GET/POST/PATCH /api/finance/integrations'] }
    ]
  },
  {
    key: 'Reports',
    label: 'Reports',
    help: 'Choose the business results they can see.',
    permissions: [
      { key: 'dashboard.executive.view', label: 'View business performance', help: 'Money, jobs, workers, sales, branches, and stock in one place.', targets: ['executive-dashboard.html', 'GET /api/analytics/*'] },
      { key: 'reports.money.view', label: 'View money reports', targets: ['reports.html', 'money report APIs'] },
      { key: 'reports.work.view', label: 'View job reports', targets: ['reports.html', 'job and SLA report APIs'] },
      { key: 'reports.workers.view', label: 'View worker reports', targets: ['reports.html', 'worker report APIs'] },
      { key: 'reports.sales.view', label: 'View sales and customer reports', targets: ['reports.html', 'sales report APIs'] },
      { key: 'reports.stock.view', label: 'View stock reports', targets: ['reports.html', 'stock report APIs'] }
    ]
  },
  {
    key: 'Inventory',
    label: 'Stock and buying',
    help: 'Choose what they can do with stock and orders.',
    permissions: [
      { key: 'inventory.view', label: 'View stock', targets: ['inventory.html', 'GET /api/inventory'] },
      { key: 'inventory.manage', label: 'Manage stock', targets: ['POST/PATCH/DELETE /api/inventory'] },
      { key: 'stock.adjust', label: 'Change stock counts', targets: ['POST /api/inventory/adjustments'] },
      { key: 'purchaseRequest.create', label: 'Create purchase requests', targets: ['purchase-requests.html', 'POST /api/purchase-requests'] },
      { key: 'purchaseRequest.approve', label: 'Approve purchase requests', targets: ['POST /api/purchase-requests/:id/approve'] },
      { key: 'purchaseOrder.manage', label: 'Manage purchase orders', targets: ['purchase-orders.html', 'GET/POST/PATCH /api/purchase-orders'] },
      { key: 'purchaseOrder.send', label: 'Send purchase orders', targets: ['POST /api/purchase-orders/:id/send'] },
      { key: 'purchaseOrder.approve', label: 'Approve purchase orders', targets: ['POST /api/purchase-orders/:id/approve'] }
    ]
  },
  {
    key: 'Company',
    label: 'Company settings',
    help: 'Choose which company settings they can see or change.',
    permissions: [
      { key: 'company.settings.view', label: 'View company settings', targets: ['settings.html'] },
      { key: 'company.settings.manage', label: 'Change company settings', targets: ['PATCH /api/company/profile', 'PATCH /api/company/scheduling-settings'] },
      { key: 'company.branding.manage', label: 'Change company brand', targets: ['PATCH /api/company/branding'] }
    ]
  },
  {
    key: 'People',
    label: 'Team access',
    help: 'Choose what they can do with company accounts and saved roles.',
    permissions: [
      { key: 'members.view', label: 'View company members', targets: ['members.html', 'GET /api/members'] },
      { key: 'members.invite', label: 'Invite members', targets: ['POST /api/member-invitations'] },
      { key: 'members.manage', label: 'Disable members and invites', targets: ['PATCH /api/members/:id/status', 'revoke invite'] },
      { key: 'roles.manage', label: 'Create saved roles', targets: ['POST /api/role-templates'] },
      { key: 'permissions.manage', label: 'Change member access', targets: ['PATCH /api/members/:id/access'] }
    ]
  },
  {
    key: 'Security',
    label: 'Security',
    help: 'Choose which company security records they can see.',
    permissions: [
      { key: 'security.view', label: 'View security activity', targets: ['security-center.html', 'GET /api/security/events'] },
      { key: 'audit.view', label: 'View company activity', targets: ['settings.html#admin-tools', 'GET /api/audit-logs'] }
    ]
  },
  {
    key: 'Messages',
    label: 'Sent messages',
    help: 'Choose who can check messages sent by Rev Engine.',
    permissions: [
      { key: 'notifications.view', label: 'View sent messages', targets: ['settings.html#notifications', 'GET /api/notification-logs'] }
    ]
  },
  {
    key: 'Integrations',
    label: 'Connected apps',
    help: 'Choose who can see or change connected services.',
    permissions: [
      { key: 'integration.view', label: 'View connected apps', targets: ['settings.html#integrations', 'GET /api/admin/integrations'] },
      { key: 'integration.manage', label: 'Manage connected apps', targets: ['POST/PATCH /api/admin/integrations'] }
    ]
  },
  {
    key: 'Organization',
    label: 'Branches and teams',
    help: 'Choose what they can do with branches and teams.',
    permissions: [
      { key: 'branch.view', label: 'View branches', targets: ['branches.html', 'GET /api/branches'] },
      { key: 'branch.manage', label: 'Manage branches', targets: ['POST/PATCH/DELETE /api/branches'] },
      { key: 'team.view', label: 'View teams', targets: ['GET /api/teams'] },
      { key: 'team.manage', label: 'Manage teams', targets: ['POST/PATCH /api/teams'] }
    ]
  },
  {
    key: 'Approvals',
    label: 'Approvals',
    help: 'Choose who can set rules or approve requests.',
    permissions: [
      { key: 'approval.policy.manage', label: 'Set approval rules', targets: ['POST/PATCH /api/approval-policies'] },
      { key: 'approval.request.decide', label: 'Approve or reject requests', targets: ['approvals.html', 'POST /api/approvals/:id/*'] }
    ]
  },
  {
    key: 'Enterprise',
    label: 'Advanced tools',
    help: 'Only turn these on when the person needs these tools.',
    permissions: [
      { key: 'mobile.sync.manage', label: 'Manage worker app sync', targets: ['mobile-sync.html', '/api/admin/mobile-sync/*'] },
      { key: 'contract.automation.manage', label: 'Manage assets and contracts', targets: ['assets.html', 'service-contracts.html', 'contract-automation.html'] },
      { key: 'contract.sla.override', label: 'Override service deadlines', targets: ['POST /api/jobs/:id/sla/waive'] }
    ]
  }
];

const PERMISSION_GROUPS = Object.fromEntries(PERMISSION_CATALOG.map((group) => [group.key, group.permissions.map((item) => item.key)]));
const FULL_ACCESS_ONLY_PERMISSION_KEYS = ['subscription.view', 'subscription.manage'];
const CURRENT_PERMISSION_KEYS = [...new Set(PERMISSION_CATALOG.flatMap((group) => group.permissions.map((item) => item.key)).concat(FULL_ACCESS_ONLY_PERMISSION_KEYS))];

// Old keys remain valid for saved roles, but they are never shown as new choices.
const LEGACY_PERMISSION_KEYS = [
  'finance.reports.view',
  'report.enterprise.view',
  'jobs.cancel',
  'jobs.review',
  'teams.manage',
  'security.manage'
];
const permissionKeys = [...new Set(CURRENT_PERMISSION_KEYS.concat(LEGACY_PERMISSION_KEYS))];
const delegatablePermissionKeys = [...CURRENT_PERMISSION_KEYS];

const PERMISSION_DEPENDENCIES = {
  'customers.create': ['customers.view'],
  'customers.edit': ['customers.view'],
  'customers.delete': ['customers.view'],
  'leads.create': ['leads.view'],
  'leads.edit': ['leads.view'],
  'leads.convert': ['leads.view'],
  'jobs.create': ['jobs.view'],
  'jobs.edit': ['jobs.view'],
  'jobs.assign': ['jobs.view', 'workers.view'],
  'job.reassign.after_dispatch': ['jobs.assign'],
  'schedule.manage': ['schedule.view', 'jobs.view', 'workers.view'],
  'schedule.override': ['schedule.manage'],
  'workers.manage': ['workers.view'],
  'workers.location.view': ['workers.view'],
  'bookings.manage': ['bookings.view'],
  'quotes.create': ['quotes.view'],
  'quotes.edit': ['quotes.view'],
  'quotes.send': ['quotes.view'],
  'quote.discount.approve': ['quotes.view'],
  'invoices.create': ['invoices.view'],
  'invoices.edit': ['invoices.view'],
  'invoices.send': ['invoices.view'],
  'invoice.void': ['invoices.view'],
  'invoice.discount.approve': ['invoices.view'],
  'payments.manage': ['payments.view'],
  'payment.refund': ['payments.manage'],
  'inventory.manage': ['inventory.view'],
  'stock.adjust': ['inventory.manage'],
  'purchaseRequest.approve': ['purchaseRequest.create'],
  'purchaseOrder.send': ['purchaseOrder.manage'],
  'purchaseOrder.approve': ['purchaseOrder.manage'],
  'company.settings.manage': ['company.settings.view'],
  'company.branding.manage': ['company.settings.view'],
  'members.invite': ['members.view'],
  'members.manage': ['members.view'],
  'roles.manage': ['members.view'],
  'permissions.manage': ['members.view'],
  'subscription.manage': ['subscription.view'],
  'integration.manage': ['integration.view'],
  'branch.manage': ['branch.view'],
  'team.manage': ['team.view'],
  'contract.sla.override': ['contract.automation.manage']
};

function expandPermissionDependencies(values) {
  const expanded = new Set((Array.isArray(values) ? values : []).filter((key) => permissionKeys.includes(key)));
  let changed = true;
  while (changed) {
    changed = false;
    for (const key of [...expanded]) {
      for (const dependency of PERMISSION_DEPENDENCIES[key] || []) {
        if (!expanded.has(dependency)) {
          expanded.add(dependency);
          changed = true;
        }
      }
    }
  }
  return [...expanded];
}

const operationsPermissions = delegatablePermissionKeys.filter((key) => !key.startsWith('subscription.') && !key.startsWith('security.') && !['dashboard.financial.view', 'dashboard.executive.view', 'reports.money.view', 'settings.finance.manage', 'finance.exports.manage', 'finance.integrations.manage', 'integration.manage', 'permissions.manage', 'roles.manage'].includes(key));
const financePermissions = delegatablePermissionKeys.filter((key) => key.startsWith('invoices.') || key.startsWith('payments.') || key === 'finance.exports.manage' || key === 'finance.integrations.manage' || key === 'reports.money.view' || key === 'settings.finance.manage' || key === 'dashboard.financial.view' || key === 'invoice.void' || key === 'invoice.discount.approve' || key === 'payment.refund');
const workerPermissions = ['dashboard.operational.view', 'jobs.view', 'schedule.view'];
const branchManagerPermissions = delegatablePermissionKeys.filter((key) => !key.startsWith('subscription.') && ![
  'company.settings.view',
  'company.settings.manage',
  'company.branding.manage',
  'settings.finance.manage',
  'finance.integrations.manage',
  'members.view',
  'members.invite',
  'members.manage',
  'roles.manage',
  'permissions.manage',
  'security.view',
  'audit.view',
  'integration.view',
  'integration.manage',
  'mobile.sync.manage'
].includes(key));

const defaultPermissionBundles = {
  OWNER: delegatablePermissionKeys,
  ADMIN: delegatablePermissionKeys.filter((key) => !key.startsWith('subscription.') && !['integration.manage', 'permissions.manage', 'roles.manage'].includes(key)),
  WORKER: workerPermissions,
  CLIENT: []
};

const SYSTEM_ROLE_TEMPLATES = [
  { key: 'owner', name: 'Owner', description: 'Full company control, including ownership and access settings.', systemRole: 'OWNER', permissions: delegatablePermissionKeys, scope: 'COMPANY' },
  { key: 'workspace-manager', name: 'Workspace Manager', description: 'Full control of one company without ownership rights.', systemRole: 'ADMIN', permissions: delegatablePermissionKeys, scope: 'COMPANY' },
  { key: 'executive', name: 'Executive / COO', description: 'Senior company oversight without ownership rights.', systemRole: 'ADMIN', permissions: delegatablePermissionKeys, scope: 'COMPANY' },
  { key: 'service-manager', name: 'Service Manager', description: 'Runs O&M delivery, SLAs, jobs, faults, teams, contracts, and service performance.', systemRole: 'ADMIN', permissions: operationsPermissions.concat(['contract.automation.manage', 'contract.sla.override', 'reports.work.view', 'reports.workers.view', 'reports.stock.view', 'invoices.view', 'payments.view']), scope: 'COMPANY' },
  { key: 'field-supervisor', name: 'Field Supervisor', description: 'Supervises technicians, assigns work, reviews quality, faults, readings, and close-outs.', systemRole: 'ADMIN', permissions: ['dashboard.operational.view','customers.view','jobs.view','jobs.create','jobs.edit','jobs.assign','job.reassign.after_dispatch','schedule.view','schedule.manage','workers.view','workers.location.view','inventory.view','purchaseRequest.create','reports.work.view','reports.workers.view','contract.automation.manage','approval.request.decide'], scope: 'BRANCH' },
  { key: 'dispatcher', name: 'Scheduler / Dispatcher', description: 'Books, assigns, reschedules, and tracks field work.', systemRole: 'ADMIN', permissions: ['dashboard.operational.view','customers.view','jobs.view','jobs.create','jobs.edit','jobs.assign','job.reassign.after_dispatch','schedule.view','schedule.manage','workers.view','workers.location.view','bookings.view','bookings.manage','contract.automation.manage'], scope: 'BRANCH' },
  { key: 'customer-service', name: 'Customer Service Representative', description: 'Handles calls, customer records, service requests, bookings, and job updates.', systemRole: 'ADMIN', permissions: ['dashboard.operational.view','customers.view','customers.create','customers.edit','leads.view','leads.create','leads.edit','bookings.view','bookings.manage','jobs.view','jobs.create','jobs.edit','invoices.view','payments.view'], scope: 'BRANCH' },
  { key: 'site-inspector', name: 'Site Inspector', description: 'Inspects solar sites, records defects and readings, and signs off corrective work.', systemRole: 'WORKER', permissions: ['dashboard.operational.view','customers.view','jobs.view','jobs.edit','schedule.view','contract.automation.manage','reports.work.view'], scope: 'SELF' },
  { key: 'technician', name: 'Technician', description: 'Completes assigned inspections, maintenance, repairs, readings, photos, and parts use.', systemRole: 'WORKER', permissions: ['dashboard.operational.view','customers.view','jobs.view','jobs.edit','schedule.view','inventory.view','purchaseRequest.create','contract.automation.manage'], scope: 'SELF' },
  { key: 'installer', name: 'Installer / Commissioning Technician', description: 'Completes assigned replacement, retrofit, installation, testing, and commissioning work.', systemRole: 'WORKER', permissions: ['dashboard.operational.view','customers.view','jobs.view','jobs.edit','schedule.view','inventory.view','purchaseRequest.create','contract.automation.manage'], scope: 'SELF' },
  { key: 'sales-representative', name: 'Sales Representative', description: 'Manages assigned enquiries, customers, quotes, renewals, and customer payment status.', systemRole: 'ADMIN', permissions: ['leads.view','leads.create','leads.edit','leads.convert','customers.view','customers.create','customers.edit','quotes.view','quotes.create','quotes.edit','quotes.send','invoices.view','payments.view','reports.sales.view','contract.automation.manage'], scope: 'BRANCH' },
  { key: 'sales-manager', name: 'Sales Manager', description: 'Manages sales, quotes, renewals, and client payment history without company-wide finance access.', systemRole: 'ADMIN', permissions: ['leads.view','leads.create','leads.edit','leads.convert','customers.view','customers.create','customers.edit','quotes.view','quotes.create','quotes.edit','quotes.send','quote.discount.approve','invoices.view','payments.view','reports.sales.view','contract.automation.manage'], scope: 'COMPANY' },
  { key: 'accountant', name: 'Accountant', description: 'Manages customer billing and company financial records without operational customer access.', systemRole: 'ADMIN', permissions: ['dashboard.financial.view','invoices.view','invoices.create','invoices.edit','invoices.send','payments.view','payments.manage','reports.money.view','finance.exports.manage','finance.integrations.manage','settings.finance.manage'], scope: 'COMPANY' },
  { key: 'finance-manager', name: 'Finance Manager', description: 'Controls billing, refunds, finance settings, company reports, exports, and approvals.', systemRole: 'ADMIN', permissions: financePermissions.concat(['members.view','approval.request.decide']), scope: 'COMPANY' },
  { key: 'procurement', name: 'Procurement / Purchasing', description: 'Manages suppliers, purchase requests, orders, parts sourcing, and spend controls.', systemRole: 'ADMIN', permissions: ['jobs.view','inventory.view','inventory.manage','purchaseRequest.create','purchaseRequest.approve','purchaseOrder.manage','purchaseOrder.send','purchaseOrder.approve','reports.stock.view','reports.money.view','contract.automation.manage'], scope: 'COMPANY' },
  { key: 'warehouse-clerk', name: 'Warehouse / Stock Clerk', description: 'Receives, issues, counts, transfers, and kits stock for field work.', systemRole: 'ADMIN', permissions: ['jobs.view','inventory.view','inventory.manage','stock.adjust','reports.stock.view'], scope: 'BRANCH' },
  { key: 'company-admin', name: 'Company Administrator', description: 'Manages company records, users, branches, integrations, and operational setup; finance is optional.', systemRole: 'ADMIN', permissions: defaultPermissionBundles.ADMIN, scope: 'COMPANY' },
  { key: 'it-support', name: 'IT / System Support', description: 'Manages integrations, security, devices, audit records, and technical settings with limited business data.', systemRole: 'ADMIN', permissions: ['company.settings.view','integration.view','integration.manage','security.view','audit.view','mobile.sync.manage','members.view'], scope: 'COMPANY' },
  { key: 'branch-manager', name: 'Branch Manager', description: 'Runs all permitted O&M work in assigned branches without ownership rights.', systemRole: 'ADMIN', permissions: branchManagerPermissions, scope: 'BRANCH' },
  { key: 'general-manager', name: 'General Manager / COO', description: 'Broad company oversight without ownership transfer rights.', systemRole: 'ADMIN', permissions: defaultPermissionBundles.ADMIN, scope: 'COMPANY' }
];

function uniquePermissions(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((key) => permissionKeys.includes(key)))];
}

function isSubset(requested, allowed) {
  const allowedSet = new Set(allowed || []);
  return uniquePermissions(requested).every((key) => allowedSet.has(key));
}

function hasFullBusinessAccess(user, access) {
  if (!user || !access) return false;
  if (user.role === 'OWNER') return true;
  return user.fullBusinessAccess === true && access.scopeType === 'COMPANY';
}

function scopeContains(actorAccess, requested = {}) {
  if (!actorAccess) return false;
  if (actorAccess.scopeType === 'COMPANY') return true;
  if (requested.scopeType === 'SELF') return true;
  if (actorAccess.scopeType === 'SELF') return false;
  if (actorAccess.scopeType === 'BRANCH') {
    if (requested.scopeType !== 'BRANCH') return false;
    const allowed = new Set(actorAccess.branchIds || []);
    return (requested.branchIds || []).every((id) => allowed.has(id));
  }
  if (actorAccess.scopeType === 'TEAM') {
    if (requested.scopeType !== 'TEAM') return false;
    const allowed = new Set(actorAccess.teamIds || []);
    return (requested.teamIds || []).every((id) => allowed.has(id));
  }
  return false;
}

async function effectiveAccessForUser(user, options = {}) {
  if (!user) return { permissions: [], scopeType: 'SELF', branchIds: [], teamIds: [] };
  const companyId = options.companyId || user.companyId;
  const permissions = new Set(defaultPermissionBundles[user.role] || []);
  let scopeType = user.role === 'WORKER' ? 'SELF' : 'COMPANY';
  let templateApplied = false;

  if (user.roleTemplateId && prisma.permissionRoleTemplate) {
    const template = await prisma.permissionRoleTemplate.findFirst({ where: { id: user.roleTemplateId, active: true, OR: [{ companyId }, { companyId: null }] } });
    if (template) {
      templateApplied = true;
      permissions.clear();
      uniquePermissions(template.defaultPermissions).forEach((key) => permissions.add(key));
      scopeType = template.defaultScopeType || scopeType;
    }
  }

  const overrides = prisma.userPermissionOverride ? await prisma.userPermissionOverride.findMany({ where: { companyId, userId: user.id } }) : [];
  for (const override of overrides.filter((item) => !item.branchId || !options.branchId || item.branchId === options.branchId)) {
    if (!permissionKeys.includes(override.permissionKey)) continue;
    if (override.allowed) permissions.add(override.permissionKey);
    else permissions.delete(override.permissionKey);
  }

  const branchAccesses = prisma.userBranchAccess ? await prisma.userBranchAccess.findMany({ where: { companyId, userId: user.id, active: true } }) : [];
  const grants = prisma.userAccessGrant ? await prisma.userAccessGrant.findMany({ where: { companyId, userId: user.id, active: true } }) : [];
  const branchIds = [...new Set(branchAccesses.map((item) => item.branchId).concat(grants.filter((item) => item.scopeType === 'BRANCH' && item.branchId).map((item) => item.branchId)))];
  const teamIds = [...new Set(grants.filter((item) => item.scopeType === 'TEAM' && item.teamId).map((item) => item.teamId))];

  // Preserve the former broad ADMIN behavior only for old, unconfigured accounts.
  // Invited/configured members use a saved role, overrides, or scoped grants and therefore
  // receive only the access that was explicitly selected for them.
  const isUnconfiguredLegacyAdmin = user.role === 'ADMIN'
    && !templateApplied
    && overrides.length === 0
    && grants.length === 0
    && branchAccesses.length === 0;
  if (isUnconfiguredLegacyAdmin) permissions.add('integration.manage');

  // Grants may add capabilities, but they never widen the data scope by themselves.
  for (const grant of grants) uniquePermissions(grant.permissions).forEach((key) => permissions.add(key));
  if (grants.some((item) => item.scopeType === 'COMPANY')) scopeType = 'COMPANY';
  else if (teamIds.length) scopeType = 'TEAM';
  else if (branchIds.length) scopeType = 'BRANCH';
  else scopeType = user.defaultScopeType || scopeType;

  // Translate older saved permissions into current working access.
  if (permissions.has('finance.reports.view')) permissions.add('reports.money.view');
  if (permissions.has('report.enterprise.view')) {
    permissions.add('reports.work.view');
    permissions.add('reports.workers.view');
    permissions.add('reports.sales.view');
    permissions.add('reports.stock.view');
  }
  if (permissions.has('jobs.cancel') || permissions.has('jobs.review')) permissions.add('jobs.edit');
  if (permissions.has('teams.manage')) permissions.add('team.manage');
  if (permissions.has('security.manage')) permissions.add('security.view');

  if (user.role === 'OWNER') {
    delegatablePermissionKeys.forEach((key) => permissions.add(key));
    permissions.add('finance.integrations.manage');
    scopeType = 'COMPANY';
  } else if (user.fullBusinessAccess === true && scopeType === 'COMPANY') {
    delegatablePermissionKeys.forEach((key) => permissions.add(key));
  }
  return { permissions: expandPermissionDependencies([...permissions]).filter((key) => permissionKeys.includes(key)).sort(), scopeType, branchIds, teamIds };
}

async function seedSystemRoleTemplates(client = prisma) {
  if (!client.permissionRoleTemplate) return [];
  const rows = [];
  for (const template of SYSTEM_ROLE_TEMPLATES) {
    const existing = await client.permissionRoleTemplate.findFirst({ where: { companyId: null, key: template.key, verticalKey: 'generic' } });
    const data = { key: template.key, name: template.name, description: template.description, verticalKey: 'generic', systemRole: template.systemRole, isSystemTemplate: true, isCustom: false, defaultPermissions: uniquePermissions(template.permissions), defaultScopeType: template.scope, active: true };
    rows.push(existing ? await client.permissionRoleTemplate.update({ where: { id: existing.id }, data }) : await client.permissionRoleTemplate.create({ data }));
  }
  return rows;
}

module.exports = {
  FULL_ACCESS_ONLY_PERMISSION_KEYS,
  PERMISSION_CATALOG,
  PERMISSION_DEPENDENCIES,
  PERMISSION_GROUPS,
  SYSTEM_ROLE_TEMPLATES,
  defaultPermissionBundles,
  delegatablePermissionKeys,
  effectiveAccessForUser,
  expandPermissionDependencies,
  hasFullBusinessAccess,
  isSubset,
  permissionKeys,
  scopeContains,
  seedSystemRoleTemplates,
  uniquePermissions
};
