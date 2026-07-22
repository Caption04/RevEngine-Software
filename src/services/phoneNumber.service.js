const PHONE_RULES = {
  ZW: {
    countryCode: '263',
    countryName: 'Zimbabwe',
    phonePlaceholder: '0242 123 456 or 077 123 4567',
    whatsappPlaceholder: '+263 77 123 4567',
    helpText: 'Use a Zimbabwe mobile or landline number.'
  },
  ZA: {
    countryCode: '27',
    countryName: 'South Africa',
    phonePlaceholder: '011 123 4567 or 082 123 4567',
    whatsappPlaceholder: '+27 82 123 4567',
    helpText: 'Use a South African mobile or landline number.'
  }
};

function normalizePhoneNumber(value, options = {}) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  let compact = raw.replace(/[\s().-]/g, '');
  if (compact.startsWith('00')) compact = '+' + compact.slice(2);

  if (!compact.startsWith('+')) {
    const configuredCountryCode = options.defaultCountryCode != null
      ? options.defaultCountryCode
      : process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '';
    const countryCode = String(configuredCountryCode).replace(/\D/g, '');
    if (!countryCode) return null;
    compact = compact.replace(/^0+/, '');
    if (!compact) return null;
    compact = '+' + countryCode + compact;
  }

  if (!/^\+[1-9]\d{7,14}$/.test(compact)) return null;
  return compact;
}
function normalizeCountryCode(value) {
  const input = String(value || '').trim().toUpperCase().replace(/[._-]+/g, ' ').replace(/\s+/g, ' ');
  if (['ZW', 'ZIM', 'ZIMBABWE'].includes(input)) return 'ZW';
  if (['ZA', 'SA', 'RSA', 'SOUTH AFRICA'].includes(input)) return 'ZA';
  return null;
}

function phoneRulesForCountry(value) {
  const code = normalizeCountryCode(value);
  return code && PHONE_RULES[code] ? { code, ...PHONE_RULES[code] } : null;
}

function cleanedPhone(value) {
  return String(value || '').trim().replace(/[\s().-]+/g, '');
}

function nationalDigits(value, countryCode) {
  const compact = cleanedPhone(value);
  if (!compact || !/^\+?\d+$/.test(compact)) return null;
  const digits = compact.replace(/^\+/, '');
  if (digits.startsWith(`00${countryCode}`)) return digits.slice(countryCode.length + 2);
  if (digits.startsWith(countryCode)) return digits.slice(countryCode.length);
  if (digits.startsWith('0')) return digits.slice(1);
  return null;
}

function isValidZimbabweNationalNumber(value) {
  // Mobile numbers use 71, 73, 77, or 78 followed by seven digits.
  if (/^(?:71|73|77|78)\d{7}$/.test(value)) return true;
  // Fixed and VoIP ranges vary in area-code length. Keep the accepted range strict
  // enough to reject random input while supporting Zimbabwe's geographic numbers.
  if (/^2\d{7,8}$/.test(value)) return true;
  if (/^[3-6]\d{6,8}$/.test(value)) return true;
  if (/^86\d{7}$/.test(value)) return true;
  return false;
}

function isValidSouthAfricaNationalNumber(value) {
  // ICASA's normal subscriber numbers are ten digits domestically, including the
  // leading zero. After removing that zero or +27, nine national digits remain.
  return /^[1-8]\d{8}$/.test(value);
}

function validatePhoneForCountry(value, country) {
  if (value == null || String(value).trim() === '') return true;
  const rules = phoneRulesForCountry(country);
  if (!rules) return false;
  const national = nationalDigits(value, rules.countryCode);
  if (!national) return false;
  return rules.code === 'ZW'
    ? isValidZimbabweNationalNumber(national)
    : isValidSouthAfricaNationalNumber(national);
}

function normalizePhoneForCountry(value, country) {
  if (value == null || String(value).trim() === '') return undefined;
  const rules = phoneRulesForCountry(country);
  if (!rules || !validatePhoneForCountry(value, rules.code)) return null;
  const national = nationalDigits(value, rules.countryCode);
  return `+${rules.countryCode}${national}`;
}

function phoneValidationMessage(country) {
  const rules = phoneRulesForCountry(country);
  if (!rules) return 'Enter a valid phone number.';
  return rules.code === 'ZW'
    ? 'Enter a Zimbabwe mobile or landline number, for example 077 123 4567 or 0242 123 456.'
    : 'Enter a South African mobile or landline number, for example 082 123 4567 or 011 123 4567.';
}

module.exports = {
  PHONE_RULES,
  normalizePhoneForCountry,
  normalizePhoneNumber,
  phoneRulesForCountry,
  phoneValidationMessage,
  validatePhoneForCountry
};
