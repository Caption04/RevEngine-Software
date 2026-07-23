(function () {
  'use strict';

  const NEW_PASSWORD_MIN_LENGTH = 12;
  const processedPasswordInputs = new WeakSet();
  const fieldErrors = new WeakMap();
  const ERROR_SLOT_TYPES = new Set(['email', 'url', 'number', 'date', 'datetime-local', 'time', 'month', 'week', 'password']);

  function fieldLabel(input) {
    const explicit = input.id ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`) : null;
    const wrapping = input.closest('label');
    const text = (explicit || wrapping) && (explicit || wrapping).textContent;
    const cleaned = String(text || input.getAttribute('aria-label') || input.name || 'this field')
      .replace(/\s+/g, ' ')
      .replace(/\*$/, '')
      .trim()
      .toLowerCase();
    return cleaned || 'this field';
  }

  function canShowInlineError(input) {
    if (!input || !input.form || input.disabled || input.type === 'hidden') return false;
    if (['button', 'submit', 'reset', 'image', 'checkbox', 'radio'].includes(input.type)) return false;
    if (input.required || /confirm/i.test(input.name || input.id || '')) return true;
    if (input.tagName === 'SELECT') return false;
    if (ERROR_SLOT_TYPES.has(input.type)) return true;
    return input.minLength > 0 || input.maxLength > 0 || Boolean(input.pattern) ||
      input.hasAttribute('min') || input.hasAttribute('max') || input.hasAttribute('step');
  }

  function errorNode(input) {
    if (fieldErrors.has(input)) return fieldErrors.get(input);
    const anchor = input.closest('.password-input-shell') || input;
    const existing = anchor.nextElementSibling && anchor.nextElementSibling.classList.contains('field-error')
      ? anchor.nextElementSibling
      : input.parentElement && input.parentElement.querySelector(':scope > .field-error');
    if (existing) {
      fieldErrors.set(input, existing);
      return existing;
    }
    const node = document.createElement('small');
    node.className = 'field-error';
    node.hidden = true;
    node.setAttribute('aria-live', 'polite');
    anchor.insertAdjacentElement('afterend', node);
    fieldErrors.set(input, node);
    return node;
  }

  function ensureErrorSlot(input) {
    if (canShowInlineError(input)) errorNode(input);
  }

  function isVisible(input) {
    return !input.disabled && input.type !== 'hidden' && !input.closest('[hidden]');
  }

  function matchingPassword(input) {
    const form = input.form || input.closest('form') || document;
    if (/confirm/i.test(input.name || input.id || '')) {
      return form.querySelector('input[name="newPassword"], input[name="password"]');
    }
    return null;
  }

  function nationalPhoneDigits(value, countryCode) {
    const compact = String(value || '').trim().replace(/[\s().-]+/g, '');
    if (!compact || !/^\+?\d+$/.test(compact)) return null;
    const digits = compact.replace(/^\+/, '');
    if (digits.startsWith(`00${countryCode}`)) return digits.slice(countryCode.length + 2);
    if (digits.startsWith(countryCode)) return digits.slice(countryCode.length);
    if (digits.startsWith('0')) return digits.slice(1);
    return null;
  }

  function internationalPhone(value) {
    let compact = String(value || '').trim().replace(/[\s().-]+/g, '');
    if (compact.startsWith('00')) compact = '+' + compact.slice(2);
    return /^\+[1-9]\d{7,14}$/.test(compact);
  }

  function countryPhoneValidation(input, value) {
    const country = String(input.dataset.phoneCountry || '').toUpperCase();
    const allowInternational = input.dataset.allowInternational === 'true';
    const raw = String(value || '').trim();
    if (allowInternational && (/^\+/.test(raw) || /^00/.test(raw)) && internationalPhone(raw)) return '';
    if (!country) return allowInternational ? (internationalPhone(raw) ? '' : 'Use a valid international number beginning with + and the country code.') : null;
    const code = country === 'ZA' || country === 'SA' ? '27' : country === 'ZW' ? '263' : '';
    if (!code) return null;
    const national = nationalPhoneDigits(value, code);
    const valid = country === 'ZW'
      ? Boolean(national && (/^(?:71|73|77|78)\d{7}$/.test(national) || /^2\d{7,8}$/.test(national) || /^[3-6]\d{6,8}$/.test(national) || /^86\d{7}$/.test(national)))
      : Boolean(national && /^[1-8]\d{8}$/.test(national));
    if (valid) return '';
    const localMessage = country === 'ZW'
      ? 'Enter a Zimbabwe mobile or landline number, for example 077 123 4567 or 0242 123 456.'
      : 'Enter a South African mobile or landline number, for example 082 123 4567 or 011 123 4567.';
    return allowInternational ? localMessage + ' For a foreign number, begin with + and the country code.' : localMessage;
  }

  function meaningfulTextValidation(input, value) {
    const mode = input.dataset.meaningfulText;
    if (!mode) return '';
    const text = String(value || '').trim();
    if (!text) return '';
    const letters = text.match(/\p{L}/gu) || [];
    const words = text.match(/[\p{L}\p{N}]+/gu) || [];
    if (letters.length < 2 || words.length < 1) return 'Enter clear words, not random characters.';
    if (/(.)\1{4,}/iu.test(text)) return 'Enter clear words, not repeated characters.';
    const symbols = text.replace(/[\p{L}\p{N}\s&+'.,()\-\/]/gu, '');
    if (symbols.length) return 'Remove unusual symbols and enter clear text.';
    if (mode === 'person-name' && /\d/.test(text)) return 'Enter the person’s name without numbers.';
    return '';
  }

  function referenceValidation(input, value) {
    if (input.dataset.referenceField !== 'true') return '';
    const text = String(value || '').trim();
    if (!text) return '';
    const useful = text.match(/[A-Za-z0-9]/g) || [];
    if (useful.length < 2 || /(.)\1{5,}/i.test(text)) return 'Enter a valid reference number.';
    if (!/^[A-Za-z0-9 ._\-/]+$/.test(text)) return 'Use letters, numbers, spaces, hyphens, slashes, dots, or underscores only.';
    return '';
  }

  function validationMessage(input) {
    if (!isVisible(input)) return '';
    const value = String(input.value || '');
    const label = fieldLabel(input);

    const preferredMethod = input.form && input.form.elements && input.form.elements.preferredContactMethod
      ? String(input.form.elements.preferredContactMethod.value || '')
      : '';
    if (input.required && !value.trim()) {
      return input.tagName === 'SELECT' ? `Choose ${label}.` : `Enter ${label}.`;
    }
    if (input.name === 'phone' && ['PHONE', 'WHATSAPP'].includes(preferredMethod) && !value.trim()) {
      return preferredMethod === 'WHATSAPP' ? 'Enter the WhatsApp number.' : 'Enter the phone number.';
    }
    if (input.name === 'email' && preferredMethod === 'EMAIL' && !value.trim()) return 'Enter the email address.';
    if (!value) return '';
    if (input.type === 'email') {
      const normalizedEmail = value.trim();
      const emailPattern = /^[^\s@]+@(?:[^\s@.]+\.)+[A-Za-z]{2,24}$/;
      if (input.validity.typeMismatch || !emailPattern.test(normalizedEmail)) return 'Enter a valid email address.';
    }
    if (input.dataset.phoneField === 'true') {
      const countryMessage = countryPhoneValidation(input, value);
      if (countryMessage !== null) {
        if (countryMessage) return countryMessage;
      } else {
        const digits = value.replace(/\D/g, '');
        if (!/^\+?[0-9 ().-]+$/.test(value.trim()) || digits.length < 7 || digits.length > 15) {
          return 'Enter a valid phone number with 7 to 15 digits.';
        }
      }
    }
    const meaningfulMessage = meaningfulTextValidation(input, value);
    if (meaningfulMessage) return meaningfulMessage;
    const referenceMessage = referenceValidation(input, value);
    if (referenceMessage) return referenceMessage;
    if (input.dataset.addressField === 'true') {
      const address = value.trim();
      const letters = address.match(/\p{L}/gu) || [];
      if (address.length < 5 || letters.length < 2 || /[@<>]/.test(address) || /(.)\1{5,}/iu.test(address)) {
        return 'Enter a clear street or billing address.';
      }
    }
    if (input.minLength > 0 && value.length < input.minLength) return `Use at least ${input.minLength} characters.`;
    if (input.maxLength > 0 && value.length > input.maxLength) return `Use no more than ${input.maxLength} characters.`;
    if (input.validity.patternMismatch) return `Check ${label} and try again.`;

    const original = matchingPassword(input);
    if (original && value !== original.value) return 'Passwords do not match.';

    return '';
  }

  function validateInput(input, showSuccess) {
    if (!input || !isVisible(input)) return true;
    if ((input.type === 'checkbox' || input.type === 'radio') && !input.required) {
      input.classList.remove('field-input-invalid', 'field-input-valid');
      input.removeAttribute('aria-invalid');
      return true;
    }
    const message = validationMessage(input);
    const node = errorNode(input);
    node.textContent = message;
    node.hidden = !message;
    input.classList.toggle('field-input-invalid', Boolean(message));
    const showConfirmedSuccess = input.dataset.showValid === 'true' && showSuccess && !message && String(input.value || '').length;
    input.classList.toggle('field-input-valid', Boolean(showConfirmedSuccess));
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    return !message;
  }

  function eyeIcon(hidden) {
    return hidden
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6S2.5 12 2.5 12Z"></path><circle cx="12" cy="12" r="2.5"></circle></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 3 18 18"></path><path d="M10.6 6.2A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.1 2.8"></path><path d="M6.5 7.2C3.9 9 2.5 12 2.5 12s3.5 6 9.5 6c1.5 0 2.9-.4 4.1-1"></path></svg>';
  }

  function addPasswordControl(input) {
    if (processedPasswordInputs.has(input)) return;
    processedPasswordInputs.add(input);

    if (input.dataset.noPasswordToggle === 'true' || input.dataset.secretInput === 'true') return;

    if (input.autocomplete === 'new-password') input.minLength = Math.max(input.minLength || 0, NEW_PASSWORD_MIN_LENGTH);

    let shell = input.closest('.password-input-shell');
    if (!shell) {
      shell = document.createElement('span');
      shell.className = 'password-input-shell';
      input.parentNode.insertBefore(shell, input);
      shell.appendChild(input);
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'password-visibility-button';
    button.setAttribute('aria-label', 'Show password');
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = eyeIcon(true);
    button.addEventListener('click', function () {
      const hidden = input.type === 'password';
      input.type = hidden ? 'text' : 'password';
      button.setAttribute('aria-label', hidden ? 'Hide password' : 'Show password');
      button.setAttribute('aria-pressed', hidden ? 'true' : 'false');
      button.innerHTML = eyeIcon(!hidden);
      input.focus();
    });
    shell.appendChild(button);

    if (input.autocomplete === 'new-password') {
      const check = document.createElement('small');
      check.className = 'password-live-check';
      check.textContent = `Use at least ${input.minLength} characters.`;
      shell.insertAdjacentElement('afterend', check);
      const updateCheck = function () {
        const passed = input.value.length >= input.minLength;
        check.classList.toggle('passed', passed);
        check.textContent = passed ? 'Password length is good.' : `Use at least ${input.minLength} characters.`;
      };
      input.addEventListener('input', updateCheck);
      updateCheck();
    }
  }

  function bindInput(input) {
    ensureErrorSlot(input);
    if (input.dataset.revengineValidationBound === 'true') return;
    input.dataset.revengineValidationBound = 'true';
    input.addEventListener('blur', function () { validateInput(input, true); });
    input.addEventListener('input', function () {
      if (input.classList.contains('field-input-invalid') || /confirm/i.test(input.name || input.id || '')) validateInput(input, true);
      const form = input.form || input.closest('form');
      if (form && /password/i.test(input.name || input.id || '')) {
        form.querySelectorAll('input[type="password"], input[type="text"]').forEach(function (candidate) {
          if (/confirm/i.test(candidate.name || candidate.id || '')) validateInput(candidate, true);
        });
      }
    });
    input.addEventListener('change', function () {
      validateInput(input, true);
      if (input.name === 'preferredContactMethod') {
        const form = input.form || input.closest('form');
        if (form) ['phone', 'email'].forEach(function (name) {
          const related = form.elements && form.elements[name];
          if (related) validateInput(related, true);
        });
      }
    });
  }

  function controlsWithin(root) {
    if (!root) return [];
    const controls = [];
    if (root.matches && root.matches('input, select, textarea')) controls.push(root);
    if (root.querySelectorAll) controls.push.apply(controls, root.querySelectorAll('input, select, textarea'));
    return controls;
  }

  function refresh(root) {
    const target = root || document;
    controlsWithin(target).forEach(function (input) {
      if (input.type === 'password') addPasswordControl(input);
      bindInput(input);
    });
    if (target.querySelectorAll) {
      target.querySelectorAll('form').forEach(function (form) { form.noValidate = true; });
    }
  }

  function validateForm(root) {
    const controls = controlsWithin(root).filter(isVisible);
    let firstInvalid = null;
    controls.forEach(function (input) {
      if (!validateInput(input, true) && !firstInvalid) firstInvalid = input;
    });
    if (firstInvalid) {
      try { firstInvalid.focus({ preventScroll: true }); } catch (error) { firstInvalid.focus(); }
      firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    return true;
  }

  window.RevEngineFormUX = { refresh, validateForm };

  function start() {
    refresh(document);
    document.addEventListener('submit', function (event) {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || form.dataset.skipRevengineValidation === 'true') return;
      form.noValidate = true;
      if (!validateForm(form)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
    const observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType === 1) refresh(node);
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
