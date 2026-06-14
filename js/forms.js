/* ============================================================
   CONFLUENCE 2026 — forms.js
   ============================================================ */

const VALIDATORS = {
  required: (v) => v.trim() !== '' || 'This field is required.',
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Enter a valid email address.',
  phone: (v) => /^[6-9]\d{9}$/.test(v.replace(/\D/g, '')) || 'Enter a valid 10-digit phone number.',
  url: (v) => v === '' || /^https?:\/\/.+/.test(v) || 'Enter a valid URL (starting with http/https).',
  minLen: (n) => (v) => v.trim().length >= n || `Minimum ${n} characters required.`,
};

function getFieldErrorEl(input) {
  return input.closest('.form-group')?.querySelector('.form-error')
    || input.closest('div')?.querySelector('.form-error')
    || input.parentElement?.querySelector('.form-error');
}

function getValidationRules(input) {
  return (input.dataset.validate || '').split(',').map(r => {
    r = r.trim();
    if (r === 'required') {
      if (input.type === 'checkbox') {
        return () => input.checked || 'This field is required.';
      }
      return VALIDATORS.required;
    }
    if (r === 'email') return VALIDATORS.email;
    if (r === 'phone') return VALIDATORS.phone;
    if (r === 'url') return VALIDATORS.url;
    if (r.startsWith('min:')) return VALIDATORS.minLen(parseInt(r.split(':')[1], 10));
    return null;
  }).filter(Boolean);
}

function validateField(input, rules = []) {
  const val = input.type === 'checkbox' ? (input.checked ? 'yes' : '') : input.value;
  const errEl = getFieldErrorEl(input);

  for (const rule of rules) {
    const result = rule(val);
    if (result !== true) {
      input.classList.add('error');
      input.classList.remove('valid');
      if (errEl) { errEl.textContent = result; errEl.classList.add('visible'); }
      return false;
    }
  }

  input.classList.remove('error');
  input.classList.add('valid');
  if (errEl) errEl.classList.remove('visible');
  return true;
}

function validateForm(formEl) {
  let valid = true;
  formEl.querySelectorAll('[data-validate]').forEach(input => {
    if (!validateField(input, getValidationRules(input))) valid = false;
  });
  return valid;
}

function validateStep(stepEl) {
  if (!stepEl) return true;
  let valid = true;
  stepEl.querySelectorAll('[data-validate]').forEach(input => {
    if (!validateField(input, getValidationRules(input))) valid = false;
  });
  return valid;
}

function collectFormData(formEl) {
  const data = {};
  formEl.querySelectorAll('input, textarea, select').forEach(el => {
    if (!el.name) return;
    if (el.type === 'checkbox') {
      data[el.name] = el.checked;
    } else {
      data[el.name] = el.value;
    }
  });
  return data;
}

function setSubmitState(btn, loading) {
  btn.disabled = loading;
  btn.classList.toggle('btn-loading', loading);
}

async function handleFormSubmit(e, passType) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('[type="submit"]');

  if (!validateForm(form)) {
    toast.error('Please fix the errors above.', 'Validation Error');
    return;
  }

  if (!window.checkout) {
    toast.error('Checkout module not loaded.', 'Error');
    return;
  }

  setSubmitState(btn, true);
  const formData = collectFormData(form);

  try {
    await window.db.loadEventsCatalog();
    const event = window.db.getEventBySlug(passType);
    if (!event) {
      throw new Error('Event not found. Please try again later.');
    }

    await window.checkout.startCheckout({
      full_name: formData.full_name,
      email: formData.email,
      phone: formData.phone,
      college: formData.college_company || formData.college || '',
      selected_events: [{
        event_id: event.id,
        quantity: 1,
        event_answers: formData,
      }],
    });
  } catch (err) {
    console.error('Checkout error:', err);
    if (err.message !== 'Payment cancelled') {
      toast.error(err.message || 'Could not start checkout.', 'Error');
    }
  } finally {
    setSubmitState(btn, false);
  }
}

function initInlineValidation(formEl) {
  formEl.querySelectorAll('[data-validate]').forEach(input => {
    input.addEventListener('blur', () => validateField(input, getValidationRules(input)));
    if (input.type === 'checkbox') {
      input.addEventListener('change', () => validateField(input, getValidationRules(input)));
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('pass-form');
  if (!form) return;

  initInlineValidation(form);
  const passType = form.dataset.passType;
  if (window.formWizard?.WIZARD_CONFIG?.[passType]) return;
  form.addEventListener('submit', (e) => handleFormSubmit(e, passType));
});

window.formHelpers = { validateForm, validateStep, collectFormData, setSubmitState, handleFormSubmit, initInlineValidation };
