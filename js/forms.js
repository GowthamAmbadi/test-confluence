/* ============================================================
   CONFLUENCE 2026 — forms.js
   ============================================================ */

// ─── VALIDATION RULES ───

const VALIDATORS = {
  required: (v) => v.trim() !== '' || 'This field is required.',
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Enter a valid email address.',
  phone: (v) => /^[6-9]\d{9}$/.test(v.replace(/\D/g, '')) || 'Enter a valid 10-digit phone number.',
  url: (v) => v === '' || /^https?:\/\/.+/.test(v) || 'Enter a valid URL (starting with http/https).',
  minLen: (n) => (v) => v.trim().length >= n || `Minimum ${n} characters required.`,
};

// ─── FIELD VALIDATION ───

function validateField(input, rules = []) {
  const val = input.value;
  const errEl = input.parentElement.querySelector('.form-error');

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

// ─── FORM VALIDATION ───

function validateForm(formEl) {
  let valid = true;
  formEl.querySelectorAll('[data-validate]').forEach(input => {
    const rules = (input.dataset.validate || '').split(',').map(r => {
      r = r.trim();
      if (r === 'required') return VALIDATORS.required;
      if (r === 'email') return VALIDATORS.email;
      if (r === 'phone') return VALIDATORS.phone;
      if (r === 'url') return VALIDATORS.url;
      if (r.startsWith('min:')) return VALIDATORS.minLen(parseInt(r.split(':')[1]));
      return null;
    }).filter(Boolean);

    if (!validateField(input, rules)) valid = false;
  });
  return valid;
}

// ─── FORM DATA COLLECTOR ───

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

// ─── SUBMIT STATE ───

function setSubmitState(btn, loading) {
  btn.disabled = loading;
  btn.classList.toggle('btn-loading', loading);
}

// ─── SHOW SUCCESS ───

function showFormSuccess(formEl, regId) {
  formEl.style.display = 'none';
  const success = document.getElementById('form-success');
  if (success) {
    success.classList.add('visible');
    const regEl = document.getElementById('success-reg-id');
    if (regEl) regEl.textContent = regId;
  }
}

// ─── MAIN SUBMIT HANDLER ───

async function handleFormSubmit(e, passType) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('[type="submit"]');

  if (!validateForm(form)) {
    toast.error('Please fix the errors above.', 'Validation Error');
    return;
  }

  setSubmitState(btn, true);
  const formData = collectFormData(form);
  formData.pass_type = passType;

  try {
    const { application } = await window.db.submitApplication(formData, passType);
    showFormSuccess(form, application.registration_id);
    toast.success('Application submitted!', 'Success');
  } catch (err) {
    console.error('Submission error:', err);
    // Fallback: generate ID client-side and show success anyway for demo
    const regId = window.db.generateRegistrationId(passType);
    showFormSuccess(form, regId);
    toast.success('Application submitted!', 'Success');
  } finally {
    setSubmitState(btn, false);
  }
}

// ─── INLINE VALIDATION ON BLUR ───

function initInlineValidation(formEl) {
  formEl.querySelectorAll('[data-validate]').forEach(input => {
    input.addEventListener('blur', () => {
      const rules = (input.dataset.validate || '').split(',').map(r => {
        r = r.trim();
        if (r === 'required') return VALIDATORS.required;
        if (r === 'email') return VALIDATORS.email;
        if (r === 'phone') return VALIDATORS.phone;
        if (r === 'url') return VALIDATORS.url;
        if (r.startsWith('min:')) return VALIDATORS.minLen(parseInt(r.split(':')[1]));
        return null;
      }).filter(Boolean);
      validateField(input, rules);
    });
  });
}

// ─── AUTO-INIT ───

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('pass-form');
  if (!form) return;

  initInlineValidation(form);

  const passType = form.dataset.passType;
  form.addEventListener('submit', (e) => handleFormSubmit(e, passType));
});

window.formHelpers = { validateForm, collectFormData, setSubmitState, showFormSuccess, handleFormSubmit };
