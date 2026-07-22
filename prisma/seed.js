const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { seedSystemRoleTemplates } = require('../src/services/accessControl.service');

const prisma = new PrismaClient();
const legacyEnvName = (suffix) => 'FIELD' + 'CORE_' + suffix;


const solarDefaultServices = [
  { key: 'system-installation', name: 'Solar System Installation', description: 'New residential or commercial solar system installation, testing, commissioning, and customer handover.' },
  { key: 'site-assessment', name: 'Solar Site Assessment', description: 'Site survey, system inventory, capacity capture, safety review, and baseline condition report.' },
  { key: 'preventive-maintenance', name: 'Solar Preventive Maintenance', description: 'Planned mechanical and electrical inspection of the complete solar plant.' },
  { key: 'inverter-diagnostics', name: 'Inverter Diagnostics', description: 'Alarm review, electrical measurements, firmware checks, and inverter fault diagnosis.' },
  { key: 'module-cleaning', name: 'PV Module Cleaning', description: 'Safe module cleaning with before-and-after condition evidence.' },
  { key: 'battery-health', name: 'Battery Health Assessment', description: 'Battery state-of-charge, state-of-health, voltage, temperature, and connection checks.' },
  { key: 'fault-callout', name: 'Solar Fault Callout', description: 'Reactive investigation and corrective work for an underperforming or offline solar site.' }
];

const solarChecklistDefinitions = [
  {
    serviceName: 'Solar System Installation',
    name: 'Solar Installation and Commissioning',
    description: 'Required safety, testing, commissioning, and handover checks for a new solar system.',
    items: [
      ['Confirm installed panels, inverter, batteries, and protection equipment match the approved job', 'PASS_FAIL', true, true],
      ['Inspect mounting, roof penetrations, cable routes, labels, and earthing', 'PASS_FAIL', true, true],
      ['Record DC voltage and polarity checks', 'TEXT', true, false],
      ['Record AC voltage and protection checks', 'TEXT', true, false],
      ['Configure inverter, battery, and monitoring settings', 'PASS_FAIL', true, false],
      ['Run commissioning test and record system output', 'TEXT', true, false],
      ['Capture equipment serial numbers and completed installation photos', 'PHOTO', true, true],
      ['Complete customer handover and explain safe system operation', 'YES_NO', true, false]
    ]
  },
  {
    serviceName: 'Solar Preventive Maintenance',
    name: 'Solar Plant Preventive Maintenance',
    description: 'Required field checks for a complete solar O&M visit.',
    items: [
      ['Confirm isolators, labels, guards, and access controls are safe', 'PASS_FAIL', true, false],
      ['Inspect modules for cracks, delamination, hotspots, shading, and soiling', 'PASS_FAIL', true, true],
      ['Inspect mounting structure, clamps, roof penetrations, and corrosion', 'PASS_FAIL', true, true],
      ['Inspect DC cabling, connectors, combiner boxes, and surge protection', 'PASS_FAIL', true, true],
      ['Record inverter alarms and operating state', 'TEXT', true, false],
      ['Record DC voltage', 'NUMBER', false, false],
      ['Record AC voltage', 'NUMBER', false, false],
      ['Record power output in kW', 'NUMBER', false, false],
      ['Record energy generated today in kWh', 'NUMBER', false, false],
      ['Capture final site condition photo', 'PHOTO', true, true]
    ]
  },
  {
    serviceName: 'Battery Health Assessment',
    name: 'Battery Health Assessment',
    description: 'Battery condition, electrical readings, and safety checks.',
    items: [
      ['Inspect battery enclosure, ventilation, cabling, and terminals', 'PASS_FAIL', true, true],
      ['Record battery state of charge percentage', 'NUMBER', true, false],
      ['Record battery state of health percentage', 'NUMBER', false, false],
      ['Record battery voltage', 'NUMBER', true, false],
      ['Check BMS alarms and communication status', 'PASS_FAIL', true, false],
      ['Capture battery bank condition photo', 'PHOTO', true, true]
    ]
  },
  {
    serviceName: 'PV Module Cleaning',
    name: 'PV Module Cleaning Proof',
    description: 'Cleaning quality and damage evidence.',
    items: [
      ['Record module condition before cleaning', 'PHOTO', true, true],
      ['Confirm approved water and cleaning method were used', 'YES_NO', true, false],
      ['Report cracked or damaged modules found during cleaning', 'TEXT', false, false],
      ['Record module condition after cleaning', 'PHOTO', true, true]
    ]
  }
];

const saasPlans = [
  {
    id: 'starter',
    name: 'Basic',
    description: '10–15 field workers, one office team, and recurring commercial jobs.',
    price: 500,
    currency: 'USD',
    interval: 'month',
    isActive: true,
    limits: { maxUsers: 6, maxWorkers: 15, maxClients: 500, maxJobsPerMonth: 750, maxPublicBookingsPerMonth: 250, maxStorageMb: 10240, maxWhatsAppNotificationsPerMonth: 500, maxEmailNotificationsPerMonth: 2500 },
    features: { clientPortal: true, publicBookingPortal: true, whatsappNotifications: true, proofOfWork: true, advancedReports: false, customBranding: false, multiLocation: false, apiAccess: false, annualFirst: false, implementationFee: false, customPricing: false, regionalPrices: { ZW: { currency: 'USD', price: 500 }, SA: { currency: 'ZAR', price: 9500 } } }
  },
  {
    id: 'growth',
    name: 'Standard',
    description: '15–40 field workers, multi-site work, stronger reporting, and client portal usage.',
    price: 1500,
    currency: 'USD',
    interval: 'month',
    isActive: true,
    limits: { maxUsers: 20, maxWorkers: 40, maxClients: 2500, maxJobsPerMonth: 5000, maxPublicBookingsPerMonth: 1500, maxStorageMb: 51200, maxWhatsAppNotificationsPerMonth: 5000, maxEmailNotificationsPerMonth: 25000 },
    features: { clientPortal: true, publicBookingPortal: true, whatsappNotifications: true, proofOfWork: true, advancedReports: true, customBranding: true, multiLocation: true, apiAccess: false, annualFirst: true, implementationFee: true, customPricing: false, regionalPrices: { ZW: { currency: 'USD', price: 1500 }, SA: { currency: 'ZAR', price: 28500 } } }
  },
  {
    id: 'business',
    name: 'Enterprise',
    description: 'Multi-branch, high-volume operations with contracts, SLA controls, integrations, and onboarding.',
    price: 3500,
    currency: 'USD',
    interval: 'month',
    isActive: true,
    limits: { maxUsers: null, maxWorkers: null, maxClients: null, maxJobsPerMonth: null, maxPublicBookingsPerMonth: null, maxStorageMb: null, maxWhatsAppNotificationsPerMonth: null, maxEmailNotificationsPerMonth: null },
    features: { clientPortal: true, publicBookingPortal: true, whatsappNotifications: true, proofOfWork: true, advancedReports: true, customBranding: true, multiLocation: true, apiAccess: true, annualFirst: true, implementationFee: true, customPricing: true, advertisedPrice: 'Contact us', regionalPrices: { ZW: { currency: 'USD', price: null, label: 'Contact us' }, SA: { currency: 'ZAR', price: null, label: 'Contact us' } } }
  },
  {
    id: 'free-internal',
    name: 'Free Internal',
    description: 'Internal, demo, and test companies.',
    price: 0,
    currency: 'USD',
    interval: 'month',
    isActive: false,
    limits: { maxUsers: null, maxWorkers: null, maxClients: null, maxJobsPerMonth: null, maxPublicBookingsPerMonth: null, maxStorageMb: null, maxWhatsAppNotificationsPerMonth: null, maxEmailNotificationsPerMonth: null },
    features: { clientPortal: true, publicBookingPortal: true, whatsappNotifications: true, proofOfWork: true, advancedReports: true, customBranding: true, multiLocation: true, apiAccess: true }
  }
];

const REGION_CONFIGS = {
  ZW: {
    market: 'ZW',
    companyId: 'revengine-zw-demo',
    companyName: 'Rev Engine Zimbabwe',
    legalName: 'Rev Engine Zimbabwe (Private) Limited',
    registrationNumber: 'ZW-REG-0001',
    taxNumber: 'ZW-VAT-0001',
    address: 'Harare, Zimbabwe',
    phone: '+263 000 000 000',
    supportEmail: 'support.zw@revengine.test',
    websiteUrl: 'https://zw.revengine.test',
    branch: { code: 'HARARE', name: 'Harare Operations', city: 'Harare', country: 'ZW', timezone: 'Africa/Harare' },
    finance: {
      country: 'ZW',
      timezone: 'Africa/Harare',
      defaultCurrency: 'USD',
      allowedCurrencies: ['USD'],
      taxName: 'VAT',
      taxRate: 15,
      numberFormat: 'en-ZW',
      allowedPaymentMethods: ['CASH', 'BANK_TRANSFER', 'PAYNOW'],
      paymentInstructions: 'Use the invoice number as your payment reference. Bank transfer proof of payment is required unless the business confirms otherwise.'
    },
    users: {
      owner: 'owner.zw@fieldcore.test',
      admin: 'admin.zw@fieldcore.test',
      worker: 'worker.zw@fieldcore.test',
      client: 'client.zw@fieldcore.test'
    },
    people: { owner: 'Zimbabwe Owner', admin: 'Zimbabwe Admin', worker: 'Tariro Technician', client: 'Harare Solar Client' },
    sample: { customerName: 'Harare Solar Client', customerPhone: '+263 000 000 120', customerAddress: 'Borrowdale, Harare', serviceName: 'Solar Preventive Maintenance', servicePrice: 450, invoiceNumber: 'ZW-INV-0001', siteName: 'Borrowdale Solar Site', siteCode: 'ZW-SOLAR-001', dcCapacityKwp: 24.8, acCapacityKw: 20, batteryCapacityKwh: 30, moduleCount: 40, inverterCount: 2 }
  },
  SA: {
    market: 'SA',
    companyId: 'revengine-sa-demo',
    companyName: 'Rev Engine South Africa',
    legalName: 'Rev Engine South Africa (Pty) Ltd',
    registrationNumber: 'SA-REG-0001',
    taxNumber: 'SA-VAT-0001',
    address: 'Johannesburg, South Africa',
    phone: '+27 000 000 000',
    supportEmail: 'support.sa@revengine.test',
    websiteUrl: 'https://sa.revengine.test',
    branch: { code: 'JHB', name: 'Johannesburg Operations', city: 'Johannesburg', country: 'ZA', timezone: 'Africa/Johannesburg' },
    finance: {
      country: 'ZA',
      timezone: 'Africa/Johannesburg',
      defaultCurrency: 'ZAR',
      allowedCurrencies: ['ZAR'],
      taxName: 'VAT',
      taxRate: 15,
      numberFormat: 'en-ZA',
      allowedPaymentMethods: ['CASH', 'BANK_TRANSFER', 'OZOW', 'YOCO', 'PAYFAST', 'SNAPSCAN'],
      paymentInstructions: 'Use the invoice number as your payment reference. Proof of payment is required for bank transfers unless the business confirms otherwise.'
    },
    users: {
      owner: 'owner.sa@fieldcore.test',
      admin: 'admin.sa@fieldcore.test',
      worker: 'worker.sa@fieldcore.test',
      client: 'client.sa@fieldcore.test'
    },
    people: { owner: 'South Africa Owner', admin: 'South Africa Admin', worker: 'Thabo Technician', client: 'Johannesburg Solar Client' },
    sample: { customerName: 'Johannesburg Solar Client', customerPhone: '+27 000 000 120', customerAddress: 'Rosebank, Johannesburg', serviceName: 'Solar Preventive Maintenance', servicePrice: 8500, invoiceNumber: 'SA-INV-0001', siteName: 'Rosebank Commercial Solar Plant', siteCode: 'SA-SOLAR-001', dcCapacityKwp: 120, acCapacityKw: 100, batteryCapacityKwh: 200, moduleCount: 192, inverterCount: 4 }
  }
};

function parseSeedRegions() {
  const raw = process.env.REVENGINE_SEED_REGIONS || process.env.REVENGINE_SEED_REGION || process.env[legacyEnvName('SEED_REGIONS')] || process.env[legacyEnvName('SEED_REGION')] || 'ZW,SA';
  const normalized = String(raw || '').toUpperCase();
  if (normalized === 'ALL') return ['ZW', 'SA'];
  const regions = normalized.split(',').map((item) => item.trim()).filter(Boolean).map((item) => item === 'ZA' ? 'SA' : item);
  const unique = [...new Set(regions)].filter((item) => REGION_CONFIGS[item]);
  return unique.length ? unique : ['ZW', 'SA'];
}

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

async function seedPlans() {
  if (!prisma.saaSPlan) return;
  for (const plan of saasPlans) {
    await prisma.saaSPlan.upsert({ where: { id: plan.id }, update: plan, create: plan });
  }
}

async function upsertUser({ email, name, role, companyId, passwordHash }) {
  return prisma.user.upsert({
    where: { email },
    update: { name, role, companyId, passwordHash },
    create: { companyId, email, name, role, passwordHash }
  });
}


async function seedSolarDefaults(companyId) {
  const services = [];
  for (const definition of solarDefaultServices) {
    let service = await prisma.service.findFirst({ where: { companyId, name: definition.name } });
    if (!service) {
      service = await prisma.service.create({ data: { companyId, name: definition.name, description: definition.description, price: 0, active: true } });
    } else {
      service = await prisma.service.update({ where: { id: service.id }, data: { description: definition.description, active: true } });
    }
    services.push(service);
  }

  if (!prisma.jobChecklistTemplate || !prisma.jobChecklistItem) return services;
  for (const [templateIndex, definition] of solarChecklistDefinitions.entries()) {
    const service = services.find((item) => item.name === definition.serviceName);
    let template = await prisma.jobChecklistTemplate.findFirst({ where: { companyId, name: definition.name } });
    if (!template) {
      template = await prisma.jobChecklistTemplate.create({ data: { companyId, serviceId: service && service.id, name: definition.name, description: definition.description, active: true, requiredForCompletion: true, sortOrder: templateIndex } });
      for (const [itemIndex, [label, answerType, required, photoRequired]] of definition.items.entries()) {
        await prisma.jobChecklistItem.create({ data: { companyId, templateId: template.id, label, answerType, required, photoRequired, passFail: answerType === 'PASS_FAIL', sortOrder: itemIndex, active: true } });
      }
    }
  }
  return services;
}

async function seedCompany(config, passwordHash, includeSampleData) {
  const company = await prisma.company.upsert({
    where: { id: config.companyId },
    update: {
      name: config.companyName,
      legalName: config.legalName,
      tradingName: config.companyName,
      registrationNumber: config.registrationNumber,
      taxNumber: config.taxNumber,
      address: config.address,
      phone: config.phone,
      email: config.supportEmail,
      market: config.market,
      verticalKey: 'solar-om',
      onboardingState: 'COMPLETED'
    },
    create: {
      id: config.companyId,
      name: config.companyName,
      legalName: config.legalName,
      tradingName: config.companyName,
      registrationNumber: config.registrationNumber,
      taxNumber: config.taxNumber,
      address: config.address,
      phone: config.phone,
      email: config.supportEmail,
      market: config.market,
      verticalKey: 'solar-om',
      onboardingState: 'COMPLETED'
    }
  });

  if (prisma.companySubscription) {
    await prisma.companySubscription.upsert({
      where: { companyId: company.id },
      update: {
        planId: 'free-internal',
        status: 'FREE_INTERNAL',
        provider: 'manual',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      },
      create: {
        companyId: company.id,
        planId: 'free-internal',
        status: 'FREE_INTERNAL',
        provider: 'manual',
        trialStartedAt: new Date(),
        trialEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      }
    });
  }

  await prisma.companyBranding.upsert({
    where: { companyId: company.id },
    update: {
      brandName: config.companyName,
      primaryColor: '#1d65bc',
      secondaryColor: '#ffe386',
      accentColor: '#12a96d',
      supportEmail: config.supportEmail,
      supportPhone: config.phone,
      websiteUrl: config.websiteUrl,
      invoiceFooter: `Thank you for choosing ${config.companyName}.`,
      invoiceTerms: 'Payment is due within the configured payment terms unless otherwise agreed.'
    },
    create: {
      companyId: company.id,
      brandName: config.companyName,
      primaryColor: '#1d65bc',
      secondaryColor: '#ffe386',
      accentColor: '#12a96d',
      supportEmail: config.supportEmail,
      supportPhone: config.phone,
      websiteUrl: config.websiteUrl,
      invoiceFooter: `Thank you for choosing ${config.companyName}.`,
      invoiceTerms: 'Payment is due within the configured payment terms unless otherwise agreed.'
    }
  });

  await prisma.companyFinanceSettings.upsert({
    where: { companyId: company.id },
    update: {
      ...config.finance,
      pricesIncludeTax: false,
      dateFormat: 'yyyy-MM-dd',
      invoicePrefix: config.market === 'SA' ? 'SA-INV' : 'ZW-INV',
      receiptPrefix: config.market === 'SA' ? 'SA-RCT' : 'ZW-RCT',
      quoteExpiryDays: 14,
      paymentTermsDays: 14,
      fiscalYearStartMonth: 1,
      invoiceFooter: `Thank you for choosing ${config.companyName}.`,
      bankTransferProofRequired: true,
      enforceQuoteDepositBeforeScheduling: false,
      defaultQuoteDepositPercent: 0,
      reminderThrottleHours: 24
    },
    create: {
      companyId: company.id,
      ...config.finance,
      pricesIncludeTax: false,
      dateFormat: 'yyyy-MM-dd',
      invoicePrefix: config.market === 'SA' ? 'SA-INV' : 'ZW-INV',
      receiptPrefix: config.market === 'SA' ? 'SA-RCT' : 'ZW-RCT',
      quoteExpiryDays: 14,
      paymentTermsDays: 14,
      fiscalYearStartMonth: 1,
      invoiceFooter: `Thank you for choosing ${config.companyName}.`,
      bankTransferProofRequired: true,
      enforceQuoteDepositBeforeScheduling: false,
      defaultQuoteDepositPercent: 0,
      reminderThrottleHours: 24
    }
  });

  await prisma.companySchedulingSettings.upsert({
    where: { companyId: company.id },
    update: { timezone: config.branch.timezone, defaultJobDurationMinutes: 90, defaultTravelBufferMinutes: 30, allowOverbooking: false, defaultJobStatus: 'NEW', requireCompletionNotes: true, requireProofPhotos: true, requireLocation: true, workingDayStart: '08:00', workingDayEnd: '17:00' },
    create: { companyId: company.id, timezone: config.branch.timezone, defaultJobDurationMinutes: 90, defaultTravelBufferMinutes: 30, allowOverbooking: false, defaultJobStatus: 'NEW', requireCompletionNotes: true, requireProofPhotos: true, requireLocation: true, workingDayStart: '08:00', workingDayEnd: '17:00' }
  });

  const solarServices = await seedSolarDefaults(company.id);

  const branch = await prisma.branch.upsert({
    where: { companyId_code: { companyId: company.id, code: config.branch.code } },
    update: { name: config.branch.name, country: config.branch.country, city: config.branch.city, timezone: config.branch.timezone, active: true },
    create: { companyId: company.id, name: config.branch.name, code: config.branch.code, country: config.branch.country, city: config.branch.city, timezone: config.branch.timezone, active: true }
  });

  const ownerTemplate = await prisma.permissionRoleTemplate.findFirst({ where: { companyId: null, key: 'owner', verticalKey: 'generic' } });
  const adminTemplate = await prisma.permissionRoleTemplate.findFirst({ where: { companyId: null, key: 'general-manager', verticalKey: 'generic' } });
  const workerTemplate = await prisma.permissionRoleTemplate.findFirst({ where: { companyId: null, key: 'field-worker', verticalKey: 'generic' } });
  const owner = await upsertUser({ email: config.users.owner, name: config.people.owner, role: 'OWNER', companyId: company.id, passwordHash });
  await prisma.user.update({ where: { id: owner.id }, data: { jobTitle: 'Company Owner', roleTemplateId: ownerTemplate && ownerTemplate.id, defaultScopeType: 'COMPANY', fullBusinessAccess: true } });
  const adminUser = await upsertUser({ email: config.users.admin, name: config.people.admin, role: 'ADMIN', companyId: company.id, passwordHash });
  await prisma.user.update({ where: { id: adminUser.id }, data: { jobTitle: 'General Manager', roleTemplateId: adminTemplate && adminTemplate.id, defaultScopeType: 'COMPANY', fullBusinessAccess: false } });
  const workerUser = await upsertUser({ email: config.users.worker, name: config.people.worker, role: 'WORKER', companyId: company.id, passwordHash });
  await prisma.user.update({ where: { id: workerUser.id }, data: { jobTitle: 'Solar Technician', roleTemplateId: workerTemplate && workerTemplate.id, defaultScopeType: 'SELF', fullBusinessAccess: false } });

  const role = await prisma.workerRole.upsert({
    where: { companyId_name: { companyId: company.id, name: 'Solar Technician' } },
    update: { active: true },
    create: { companyId: company.id, name: 'Solar Technician', active: true }
  });

  const worker = await prisma.workerProfile.upsert({
    where: { userId: workerUser.id },
    update: { companyId: company.id, branchId: branch.id, roleId: role.id, title: 'Solar Technician', phone: config.phone, active: true },
    create: { companyId: company.id, branchId: branch.id, userId: workerUser.id, roleId: role.id, title: 'Solar Technician', phone: config.phone, active: true }
  });

  await prisma.workerDevice.upsert({
    where: { companyId_deviceId: { companyId: company.id, deviceId: `${config.market.toLowerCase()}-demo-worker-device` } },
    update: { workerId: worker.id, userId: workerUser.id, lastSeenAt: new Date(), active: true },
    create: { companyId: company.id, workerId: worker.id, userId: workerUser.id, platform: 'ANDROID', deviceName: `${config.market} Technician Phone`, deviceId: `${config.market.toLowerCase()}-demo-worker-device`, lastSeenAt: new Date(), active: true }
  });

  if (includeSampleData) {
    const customer = await prisma.customer.upsert({
      where: { id: `${config.companyId}-customer` },
      update: { companyId: company.id, branchId: branch.id, name: config.sample.customerName, email: config.users.client, phone: config.sample.customerPhone, address: config.sample.customerAddress },
      create: { id: `${config.companyId}-customer`, companyId: company.id, branchId: branch.id, name: config.sample.customerName, email: config.users.client, phone: config.sample.customerPhone, address: config.sample.customerAddress, notes: 'Solar O&M customer.' }
    });

    const clientAccount = await prisma.clientAccount.upsert({
      where: { companyId_email: { companyId: company.id, email: config.users.client } },
      update: { customerId: customer.id, name: config.people.client, phone: config.sample.customerPhone, passwordHash, status: 'ACTIVE' },
      create: { companyId: company.id, customerId: customer.id, name: config.people.client, email: config.users.client, phone: config.sample.customerPhone, passwordHash, status: 'ACTIVE' }
    });

    const service = solarServices.find((item) => item.name === config.sample.serviceName) || solarServices[0];
    await prisma.service.update({ where: { id: service.id }, data: { price: config.sample.servicePrice, active: true } });

    const property = await prisma.customerProperty.upsert({
      where: { id: `${config.companyId}-solar-site` },
      update: { companyId: company.id, branchId: branch.id, customerId: customer.id, clientAccountId: clientAccount.id, label: config.sample.siteName, address: config.sample.customerAddress, city: config.branch.city, notes: 'Solar O&M site.', isDefault: true },
      create: { id: `${config.companyId}-solar-site`, companyId: company.id, branchId: branch.id, customerId: customer.id, clientAccountId: clientAccount.id, label: config.sample.siteName, address: config.sample.customerAddress, city: config.branch.city, notes: 'Solar O&M site.', isDefault: true }
    });

    await prisma.solarSiteProfile.upsert({
      where: { propertyId: property.id },
      update: { companyId: company.id, customerId: customer.id, siteCode: config.sample.siteCode, status: 'OPERATIONAL', installedCapacityKwp: config.sample.dcCapacityKwp, acCapacityKw: config.sample.acCapacityKw, batteryCapacityKwh: config.sample.batteryCapacityKwh, moduleCount: config.sample.moduleCount, inverterCount: config.sample.inverterCount, monitoringProvider: 'Solar Monitoring Portal', monitoringSiteId: config.sample.siteCode, gridConnectionType: 'HYBRID', targetPerformanceRatioPct: 75, targetAvailabilityPct: 98 },
      create: { companyId: company.id, customerId: customer.id, propertyId: property.id, siteCode: config.sample.siteCode, status: 'OPERATIONAL', installedCapacityKwp: config.sample.dcCapacityKwp, acCapacityKw: config.sample.acCapacityKw, batteryCapacityKwh: config.sample.batteryCapacityKwh, moduleCount: config.sample.moduleCount, inverterCount: config.sample.inverterCount, monitoringProvider: 'Solar Monitoring Portal', monitoringSiteId: config.sample.siteCode, gridConnectionType: 'HYBRID', targetPerformanceRatioPct: 75, targetAvailabilityPct: 98 }
    });

    const plant = await prisma.asset.upsert({
      where: { id: `${config.companyId}-solar-plant` },
      update: { companyId: company.id, branchId: branch.id, customerId: customer.id, propertyId: property.id, serviceId: service.id, name: config.sample.siteName, assetType: 'SOLAR_PLANT', assetTag: `${config.market}-PLANT-001`, monitoringIdentifier: config.sample.siteCode, locationLabel: config.sample.customerAddress, dcCapacityKw: config.sample.dcCapacityKwp, acCapacityKw: config.sample.acCapacityKw, batteryCapacityKwh: config.sample.batteryCapacityKwh, moduleCount: config.sample.moduleCount, status: 'ACTIVE' },
      create: { id: `${config.companyId}-solar-plant`, companyId: company.id, branchId: branch.id, customerId: customer.id, propertyId: property.id, serviceId: service.id, name: config.sample.siteName, assetType: 'SOLAR_PLANT', assetTag: `${config.market}-PLANT-001`, monitoringIdentifier: config.sample.siteCode, locationLabel: config.sample.customerAddress, dcCapacityKw: config.sample.dcCapacityKwp, acCapacityKw: config.sample.acCapacityKw, batteryCapacityKwh: config.sample.batteryCapacityKwh, moduleCount: config.sample.moduleCount, status: 'ACTIVE' }
    });

    const inverter = await prisma.asset.upsert({
      where: { id: `${config.companyId}-inverter-01` },
      update: { companyId: company.id, branchId: branch.id, customerId: customer.id, propertyId: property.id, serviceId: service.id, parentAssetId: plant.id, name: 'Main Inverter 01', assetType: 'INVERTER', assetTag: `${config.market}-INV-001`, serialNumber: `${config.market}-INVERTER-SN-001`, monitoringIdentifier: `${config.sample.siteCode}-INV-01`, acCapacityKw: config.sample.acCapacityKw / config.sample.inverterCount, status: 'ACTIVE' },
      create: { id: `${config.companyId}-inverter-01`, companyId: company.id, branchId: branch.id, customerId: customer.id, propertyId: property.id, serviceId: service.id, parentAssetId: plant.id, name: 'Main Inverter 01', assetType: 'INVERTER', assetTag: `${config.market}-INV-001`, serialNumber: `${config.market}-INVERTER-SN-001`, monitoringIdentifier: `${config.sample.siteCode}-INV-01`, acCapacityKw: config.sample.acCapacityKw / config.sample.inverterCount, status: 'ACTIVE' }
    });

    await prisma.asset.upsert({
      where: { id: `${config.companyId}-battery-bank` },
      update: { companyId: company.id, branchId: branch.id, customerId: customer.id, propertyId: property.id, serviceId: service.id, parentAssetId: plant.id, name: 'Main Battery Bank', assetType: 'BATTERY_BANK', assetTag: `${config.market}-BAT-001`, batteryCapacityKwh: config.sample.batteryCapacityKwh, status: 'ACTIVE' },
      create: { id: `${config.companyId}-battery-bank`, companyId: company.id, branchId: branch.id, customerId: customer.id, propertyId: property.id, serviceId: service.id, parentAssetId: plant.id, name: 'Main Battery Bank', assetType: 'BATTERY_BANK', assetTag: `${config.market}-BAT-001`, batteryCapacityKwh: config.sample.batteryCapacityKwh, status: 'ACTIVE' }
    });

    await prisma.solarReading.upsert({
      where: { id: `${config.companyId}-solar-reading` },
      update: { customerId: customer.id, propertyId: property.id, assetId: inverter.id, capturedById: owner.id, source: 'MANUAL', condition: 'NORMAL', recordedAt: new Date(), powerKw: config.sample.acCapacityKw * 0.72, energyTodayKwh: config.sample.dcCapacityKwp * 3.5, performanceRatioPct: 78.4, availabilityPct: 99.2, batterySocPct: 82 },
      create: { id: `${config.companyId}-solar-reading`, companyId: company.id, customerId: customer.id, propertyId: property.id, assetId: inverter.id, capturedById: owner.id, source: 'MANUAL', condition: 'NORMAL', recordedAt: new Date(), powerKw: config.sample.acCapacityKw * 0.72, energyTodayKwh: config.sample.dcCapacityKwp * 3.5, performanceRatioPct: 78.4, availabilityPct: 99.2, batterySocPct: 82 }
    });

    await prisma.companyInvoiceCounter.upsert({
      where: { companyId: company.id },
      update: { nextNumber: 2 },
      create: { companyId: company.id, nextNumber: 2 }
    });

    const invoice = await prisma.invoice.upsert({
      where: { companyId_number: { companyId: company.id, number: config.sample.invoiceNumber } },
      update: { branchId: branch.id, customerId: customer.id, serviceId: service.id, amount: config.sample.servicePrice, subtotal: config.sample.servicePrice, total: config.sample.servicePrice, balanceDue: config.sample.servicePrice, status: 'SENT' },
      create: { companyId: company.id, branchId: branch.id, customerId: customer.id, serviceId: service.id, number: config.sample.invoiceNumber, status: 'SENT', amount: config.sample.servicePrice, subtotal: config.sample.servicePrice, total: config.sample.servicePrice, balanceDue: config.sample.servicePrice, dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), sentAt: new Date() }
    });

    await prisma.invoiceLineItem.upsert({
      where: { id: `${config.companyId}-invoice-line` },
      update: { serviceId: service.id, description: config.sample.serviceName, unitPrice: config.sample.servicePrice, lineTotal: config.sample.servicePrice },
      create: { id: `${config.companyId}-invoice-line`, companyId: company.id, invoiceId: invoice.id, serviceId: service.id, description: config.sample.serviceName, quantity: 1, unitPrice: config.sample.servicePrice, lineTotal: config.sample.servicePrice }
    });
  }

  await prisma.auditLog.create({ data: { companyId: company.id, userId: owner.id, action: 'SEED', entity: 'Company', entityId: company.id, metadata: { market: config.market, sampleData: includeSampleData } } });

  return { company, users: config.users };
}

async function main() {
  const password = process.env.DEMO_PASSWORD || 'FieldCoreDemo2026!';
  const hash = await bcrypt.hash(password, 12);
  const regions = parseSeedRegions();
  const includeSampleData = boolEnv('REVENGINE_SEED_SAMPLE_DATA', boolEnv(legacyEnvName('SEED_SAMPLE_DATA'), false));

  await seedPlans();
  await seedSystemRoleTemplates(prisma);
  const seeded = [];
  for (const region of regions) seeded.push(await seedCompany(REGION_CONFIGS[region], hash, includeSampleData));

  console.log('Seeded Rev Engine clean regional data.');
  console.log(`Password for all seeded logins: ${password}`);
  for (const item of seeded) {
    const market = item.company.id === REGION_CONFIGS.SA.companyId ? 'South Africa' : 'Zimbabwe';
    console.log(`\n${market} tenant: ${item.company.name}`);
    console.log(`Owner:  ${item.users.owner}`);
    console.log(`Admin:  ${item.users.admin}`);
    console.log(`Worker: ${item.users.worker}`);
    if (includeSampleData) console.log(`Client: ${item.users.client}`);
  }
  if (!includeSampleData) console.log('\nNo sample customers/invoices were seeded. Set REVENGINE_SEED_SAMPLE_DATA=true if you want one clean client invoice per region for QA.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
