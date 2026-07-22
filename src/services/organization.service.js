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

const BRANCH_LOCATION_CATALOG = {
  ZW: [
    { city: 'Harare', region: 'Harare Province', code: 'HRE', timezone: 'Africa/Harare' },
    { city: 'Bulawayo', region: 'Bulawayo Province', code: 'BYO', timezone: 'Africa/Harare' },
    { city: 'Chitungwiza', region: 'Harare Province', code: 'CHI', timezone: 'Africa/Harare' },
    { city: 'Mutare', region: 'Manicaland', code: 'UTA', timezone: 'Africa/Harare' },
    { city: 'Gweru', region: 'Midlands', code: 'GWE', timezone: 'Africa/Harare' },
    { city: 'Kwekwe', region: 'Midlands', code: 'KWE', timezone: 'Africa/Harare' },
    { city: 'Masvingo', region: 'Masvingo Province', code: 'MSV', timezone: 'Africa/Harare' },
    { city: 'Kadoma', region: 'Mashonaland West', code: 'KAD', timezone: 'Africa/Harare' },
    { city: 'Chinhoyi', region: 'Mashonaland West', code: 'CHY', timezone: 'Africa/Harare' },
    { city: 'Victoria Falls', region: 'Matabeleland North', code: 'VFA', timezone: 'Africa/Harare' },
    { city: 'Hwange', region: 'Matabeleland North', code: 'HWG', timezone: 'Africa/Harare' },
    { city: 'Marondera', region: 'Mashonaland East', code: 'MAR', timezone: 'Africa/Harare' },
    { city: 'Bindura', region: 'Mashonaland Central', code: 'BIN', timezone: 'Africa/Harare' },
    { city: 'Beitbridge', region: 'Matabeleland South', code: 'BBR', timezone: 'Africa/Harare' },
    { city: 'Zvishavane', region: 'Midlands', code: 'ZVI', timezone: 'Africa/Harare' }
  ],
  ZA: [
    { city: 'Johannesburg', region: 'Gauteng', code: 'JHB', timezone: 'Africa/Johannesburg' },
    { city: 'Pretoria', region: 'Gauteng', code: 'PTA', timezone: 'Africa/Johannesburg' },
    { city: 'Centurion', region: 'Gauteng', code: 'CEN', timezone: 'Africa/Johannesburg' },
    { city: 'Midrand', region: 'Gauteng', code: 'MID', timezone: 'Africa/Johannesburg' },
    { city: 'Sandton', region: 'Gauteng', code: 'SND', timezone: 'Africa/Johannesburg' },
    { city: 'Cape Town', region: 'Western Cape', code: 'CPT', timezone: 'Africa/Johannesburg' },
    { city: 'Stellenbosch', region: 'Western Cape', code: 'STB', timezone: 'Africa/Johannesburg' },
    { city: 'George', region: 'Western Cape', code: 'GRJ', timezone: 'Africa/Johannesburg' },
    { city: 'Durban', region: 'KwaZulu-Natal', code: 'DBN', timezone: 'Africa/Johannesburg' },
    { city: 'Pietermaritzburg', region: 'KwaZulu-Natal', code: 'PZB', timezone: 'Africa/Johannesburg' },
    { city: 'Gqeberha', region: 'Eastern Cape', code: 'GQE', timezone: 'Africa/Johannesburg' },
    { city: 'East London', region: 'Eastern Cape', code: 'ELS', timezone: 'Africa/Johannesburg' },
    { city: 'Bloemfontein', region: 'Free State', code: 'BFN', timezone: 'Africa/Johannesburg' },
    { city: 'Polokwane', region: 'Limpopo', code: 'PTG', timezone: 'Africa/Johannesburg' },
    { city: 'Mbombela', region: 'Mpumalanga', code: 'MBM', timezone: 'Africa/Johannesburg' },
    { city: 'Rustenburg', region: 'North West', code: 'RST', timezone: 'Africa/Johannesburg' },
    { city: 'Kimberley', region: 'Northern Cape', code: 'KIM', timezone: 'Africa/Johannesburg' }
  ]
};

function branchLocationsForCountry(value) {
  const code = normalizeCountryCode(value);
  return code ? (BRANCH_LOCATION_CATALOG[code] || []).map((item) => ({ ...item })) : [];
}

function branchLocationForCountry(value, city) {
  const normalizedCity = String(city || '').trim().toLowerCase();
  if (!normalizedCity) return null;
  return branchLocationsForCountry(value).find((item) => item.city.toLowerCase() === normalizedCity) || null;
}

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
    include: { group: true, financeSettings: true, branding: true }
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
    include: { financeSettings: true, branding: true, _count: { select: { branches: true, users: true } } },
    orderBy: [{ createdAt: 'asc' }, { name: 'asc' }]
  });

  const mappedWorkspaces = workspaces.map((company) => {
    const code = normalizeCountryCode(company.financeSettings && company.financeSettings.country) || normalizeCountryCode(company.market);
    return {
      id: company.id,
      name: company.name,
      legalName: company.legalName || null,
      countryCode: code,
      countryName: code && COUNTRY_CONFIG[code] ? COUNTRY_CONFIG[code].name : null,
      currency: company.financeSettings && company.financeSettings.defaultCurrency || null,
      timezone: company.financeSettings && company.financeSettings.timezone || null,
      branding: {
        brandName: company.branding && company.branding.brandName || null,
        logoUrl: company.branding && company.branding.logoUrl || null,
        primaryColor: company.branding && company.branding.primaryColor || '#2363ff',
        secondaryColor: company.branding && company.branding.secondaryColor || '#263ff1',
        accentColor: company.branding && company.branding.accentColor || '#12a96d'
      },
      onboardingState: company.onboardingState || 'COMPLETED',
      branchCount: company._count && company._count.branches || 0,
      memberCount: company._count && company._count.users || 0,
      active: company.id === activeCompany.id
    };
  });
  const activeWorkspace = mappedWorkspaces.find((company) => company.id === activeCompany.id) || mappedWorkspaces[0] || null;

  return {
    group: activeCompany.group ? {
      id: activeCompany.group.id,
      name: activeCompany.group.name,
      role: membership ? membership.role : null
    } : null,
    activeWorkspaceId: activeCompany.id,
    activeCompany: activeWorkspace,
    workspaces: mappedWorkspaces
  };
}

module.exports = {
  BRANCH_LOCATION_CATALOG,
  COUNTRY_CONFIG,
  branchLocationForCountry,
  branchLocationsForCountry,
  countryConfig,
  groupMembershipForCompany,
  normalizeCountryCode,
  organizationContextForUser
};
