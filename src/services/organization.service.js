const { prisma } = require('../db');

const COUNTRY_CONFIG = {
  ZW: {
    code: 'ZW',
    name: 'Zimbabwe',
    market: 'ZW',
    currency: 'USD',
    timezone: 'Africa/Harare',
    numberFormat: 'en-ZW',
    taxName: 'VAT',
    taxRate: 15,
    allowedPaymentMethods: ['CASH', 'BANK_TRANSFER', 'PAYNOW']
  },
  ZA: {
    code: 'ZA',
    name: 'South Africa',
    market: 'SA',
    currency: 'ZAR',
    timezone: 'Africa/Johannesburg',
    numberFormat: 'en-ZA',
    taxName: 'VAT',
    taxRate: 15,
    allowedPaymentMethods: ['CASH', 'BANK_TRANSFER', 'OZOW', 'YOCO', 'PAYFAST', 'SNAPSCAN']
  }
};

function normalizeCountryCode(value) {
  const input = String(value || '').trim().toUpperCase().replace(/[._-]+/g, ' ').replace(/\s+/g, ' ');
  if (['ZW', 'ZIM', 'ZIMBABWE'].includes(input)) return 'ZW';
  if (['ZA', 'SA', 'RSA', 'SOUTH AFRICA'].includes(input)) return 'ZA';
  return null;
}

function countryConfig(value) {
  const code = normalizeCountryCode(value);
  return code ? COUNTRY_CONFIG[code] : null;
}

async function groupMembershipForCompany(userId, companyId, client = prisma) {
  if (!userId || !companyId || !client.businessGroupMembership) return null;
  const company = await client.company.findUnique({ where: { id: companyId }, select: { id: true, groupId: true } });
  if (!company || !company.groupId) return null;
  return client.businessGroupMembership.findFirst({
    where: { groupId: company.groupId, userId, active: true },
    include: { group: true }
  });
}

async function organizationContextForUser(user, client = prisma) {
  if (!user || !user.companyId) return null;
  const activeCompany = await client.company.findUnique({
    where: { id: user.companyId },
    include: { group: true, financeSettings: true }
  });
  if (!activeCompany) return null;

  const membership = activeCompany.groupId && client.businessGroupMembership
    ? await client.businessGroupMembership.findFirst({ where: { groupId: activeCompany.groupId, userId: user.id, active: true } })
    : null;

  const workspaceWhere = membership && activeCompany.groupId
    ? { groupId: activeCompany.groupId }
    : { id: activeCompany.id };
  const workspaces = await client.company.findMany({
    where: workspaceWhere,
    include: { financeSettings: true, _count: { select: { branches: true, users: true } } },
    orderBy: [{ createdAt: 'asc' }, { name: 'asc' }]
  });

  return {
    group: activeCompany.group ? {
      id: activeCompany.group.id,
      name: activeCompany.group.name,
      role: membership ? membership.role : null
    } : null,
    activeWorkspaceId: activeCompany.id,
    workspaces: workspaces.map((company) => {
      const code = normalizeCountryCode(company.financeSettings && company.financeSettings.country) || normalizeCountryCode(company.market);
      return {
        id: company.id,
        name: company.name,
        legalName: company.legalName || null,
        countryCode: code,
        countryName: code && COUNTRY_CONFIG[code] ? COUNTRY_CONFIG[code].name : null,
        currency: company.financeSettings && company.financeSettings.defaultCurrency || null,
        timezone: company.financeSettings && company.financeSettings.timezone || null,
        onboardingState: company.onboardingState || 'COMPLETED',
        branchCount: company._count && company._count.branches || 0,
        memberCount: company._count && company._count.users || 0,
        active: company.id === activeCompany.id
      };
    })
  };
}

module.exports = {
  COUNTRY_CONFIG,
  countryConfig,
  groupMembershipForCompany,
  normalizeCountryCode,
  organizationContextForUser
};
