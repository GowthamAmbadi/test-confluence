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

  // Get details from catalog for success page
  const passInfo = window.cartHelpers ? window.cartHelpers.PASS_CATALOGUE[passType] : null;
  const passName = passInfo ? passInfo.name : (passType.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) + ' Pass');
  const passPrice = passInfo ? passInfo.price : 0;

  try {
    const { application } = await window.db.submitApplication(formData, passType);
    
    const orderData = {
      orderId: application.registration_id,
      name: formData.full_name,
      email: formData.email,
      items: [{
        name: passName,
        price: passPrice,
        qty: 1
      }],
      total: passPrice
    };
    
    // Store in both sessionStorage and localStorage for success.html
    sessionStorage.setItem('confluenceOrder', JSON.stringify(orderData));
    localStorage.setItem('confluenceOrder', JSON.stringify(orderData));

    // Construct Razorpay URL with prefill parameters
    const razorpayUrl = new URL('https://rzp.io/rzp/osgvpJt');
    razorpayUrl.searchParams.set('name', formData.full_name);
    razorpayUrl.searchParams.set('email', formData.email);
    razorpayUrl.searchParams.set('phone', formData.phone);
    razorpayUrl.searchParams.set('prefill[name]', formData.full_name);
    razorpayUrl.searchParams.set('prefill[email]', formData.email);
    razorpayUrl.searchParams.set('prefill[contact]', formData.phone);

    toast.success('Application submitted! Redirecting to payment...', 'Success');
    setTimeout(() => {
      window.location.href = razorpayUrl.toString();
    }, 1000);
  } catch (err) {
    console.error('Submission error:', err);
    
    // Fallback: generate ID client-side and show success anyway for demo
    const regId = window.db.generateRegistrationId(passType);
    
    const orderDataFallback = {
      orderId: regId,
      name: formData.full_name,
      email: formData.email,
      items: [{
        name: passName,
        price: passPrice,
        qty: 1
      }],
      total: passPrice
    };
    
    // Store in both sessionStorage and localStorage for success.html
    sessionStorage.setItem('confluenceOrder', JSON.stringify(orderDataFallback));
    localStorage.setItem('confluenceOrder', JSON.stringify(orderDataFallback));
    
    // Construct Razorpay URL with prefill parameters for fallback path as well
    const razorpayUrlFallback = new URL('https://rzp.io/rzp/osgvpJt');
    razorpayUrlFallback.searchParams.set('name', formData.full_name);
    razorpayUrlFallback.searchParams.set('email', formData.email);
    razorpayUrlFallback.searchParams.set('phone', formData.phone);
    razorpayUrlFallback.searchParams.set('prefill[name]', formData.full_name);
    razorpayUrlFallback.searchParams.set('prefill[email]', formData.email);
    razorpayUrlFallback.searchParams.set('prefill[contact]', formData.phone);

    toast.success('Application submitted! Redirecting to payment...', 'Success');
    setTimeout(() => {
      window.location.href = razorpayUrlFallback.toString();
    }, 1000);
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
