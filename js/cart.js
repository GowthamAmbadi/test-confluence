/* ============================================================
   CONFLUENCE 2026 — cart.js
   ============================================================ */

const CART_KEY = 'confluenceCart';
const PROMO_KEY = 'confluenceAppliedPromo';
const GST_RATE = 0.18;

const PASS_CATALOGUE = {
  'learning-lab': { id: 'learning-lab', name: 'Learning Lab Pass', tag: 'Skill Track', price: 4500, accent: 'orange', formUrl: 'forms/learning-lab.html' },
  'concept-cocoon': { id: 'concept-cocoon', name: 'Concept Cocoon Pass', tag: 'Startup Track', price: 1000, accent: 'orange', formUrl: 'forms/concept-cocoon.html' },
  'networking-gala': { id: 'networking-gala', name: 'Networking Gala Pass', tag: 'Network Track', price: 150, accent: 'orange', formUrl: 'forms/networking-gala.html' },
};

async function syncCatalogFromDb() {
  if (!window.db?.loadEventsCatalog) return;
  try {
    const catalog = await window.db.loadEventsCatalog();
    for (const slug of Object.keys(PASS_CATALOGUE)) {
      const row = catalog[slug];
      if (row) {
        PASS_CATALOGUE[slug].event_id = row.id;
        PASS_CATALOGUE[slug].price = Number(row.price);
        PASS_CATALOGUE[slug].name = row.name;
      }
    }
  } catch (err) {
    console.warn('Could not sync events from DB, using fallback catalogue.', err);
  }
}

function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
  catch { return []; }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge && updateCartBadge();
}

function removeFromCart(passId) {
  saveCart(getCart().filter(i => i.id !== passId));
}

function updateQty(passId, delta) {
  const cart = getCart();
  const item = cart.find(i => i.id === passId);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  saveCart(cart);
}

function clearCart() {
  localStorage.removeItem(CART_KEY);
  updateCartBadge && updateCartBadge();
}

function getAppliedPromo() {
  try { return JSON.parse(sessionStorage.getItem(PROMO_KEY) || 'null'); }
  catch { return null; }
}

function setAppliedPromo(promo) {
  if (!promo) sessionStorage.removeItem(PROMO_KEY);
  else sessionStorage.setItem(PROMO_KEY, JSON.stringify(promo));
}

function calcTotals(cart, promoDiscount = 0) {
  const gross = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const total = Math.max(0, gross - promoDiscount);
  const subtotal = Math.round(total / (1 + GST_RATE));
  const gst = total - subtotal;
  return { subtotal, gst, total, gross, promoDiscount };
}

function formatINR(n) {
  return n.toLocaleString('en-IN');
}

function renderCart() {
  const itemsEl = document.getElementById('cart-items');
  const emptyEl = document.getElementById('cart-empty');
  const summaryEl = document.getElementById('cart-summary');
  if (!itemsEl) return;

  const cart = getCart();

  if (cart.length === 0) {
    itemsEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'block';
    if (summaryEl) summaryEl.style.display = 'none';
    return;
  }

  itemsEl.style.display = 'flex';
  if (emptyEl) emptyEl.style.display = 'none';
  if (summaryEl) summaryEl.style.display = 'block';

  const countLabel = document.getElementById('cart-count-label');
  const totalItems = cart.reduce((s, i) => s + i.qty, 0);
  if (countLabel) countLabel.textContent = `${totalItems} item${totalItems !== 1 ? 's' : ''}`;

  itemsEl.innerHTML = cart.map(item => `
    <div class="cart-item ${item.id === 'all-access' ? 'all-access' : ''}" id="cart-item-${item.id}">
      <div class="cart-item-accent"></div>
      <div class="cart-item-info">
        <div class="cart-item-tag">${item.tag}</div>
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price-unit">₹<strong>${formatINR(item.price)}</strong> per pass</div>
      </div>
      <div class="cart-item-controls">
        <div class="qty-control">
          <button class="qty-btn" onclick="cartQty('${item.id}', -1)" aria-label="Decrease">−</button>
          <span class="qty-value">${item.qty}</span>
          <button class="qty-btn" onclick="cartQty('${item.id}', 1)" aria-label="Increase">+</button>
        </div>
        <div class="cart-item-subtotal"><sub>₹</sub>${formatINR(item.price * item.qty)}</div>
        <button class="cart-remove-btn" onclick="cartRemove('${item.id}')">Remove</button>
      </div>
    </div>
  `).join('');

  renderSummary(cart);
}

function renderSummary(cart) {
  const promo = getAppliedPromo();
  const discount = promo?.valid ? Number(promo.discount_amount || 0) : 0;
  const { subtotal, gst, total, gross, promoDiscount } = calcTotals(cart, discount);
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('summary-subtotal', `₹${formatINR(subtotal)}`);
  set('summary-gst', `₹${formatINR(gst)}`);
  set('summary-total', formatINR(total));
  const discountRow = document.getElementById('summary-discount-row');
  if (discountRow) {
    discountRow.style.display = promoDiscount > 0 ? 'flex' : 'none';
    const discountEl = document.getElementById('summary-discount');
    if (discountEl) discountEl.textContent = `-₹${formatINR(promoDiscount)}`;
  }
  const grossEl = document.getElementById('summary-gross');
  if (grossEl) grossEl.textContent = `₹${formatINR(gross)}`;
}

window.cartQty = function (id, delta) {
  updateQty(id, delta);
  renderCart();
};

window.cartRemove = function (id) {
  const el = document.getElementById(`cart-item-${id}`);
  if (el) {
    el.classList.add('removing');
    setTimeout(() => { removeFromCart(id); renderCart(); }, 300);
  }
};

function renderCheckoutSummary() {
  const el = document.getElementById('checkout-order-summary');
  if (!el) return;
  const cart = getCart();
  if (cart.length === 0) { window.location.href = 'cart.html'; return; }

  const promo = getAppliedPromo();
  const discount = promo?.valid ? Number(promo.discount_amount || 0) : 0;
  const { subtotal, gst, total, gross, promoDiscount } = calcTotals(cart, discount);

  el.innerHTML = `
    <div class="summary-title">Order Summary</div>
    ${cart.map(i => `
      <div class="summary-line">
        <span>${i.name} × ${i.qty}</span>
        <span>₹${formatINR(i.price * i.qty)}</span>
      </div>
    `).join('')}
    <div class="promo-box">
      <label class="form-label" for="promo-code-input">Promo code</label>
      <div class="promo-input-row">
        <input class="form-input" id="promo-code-input" type="text" placeholder="Enter code" value="${promo?.code || ''}">
        <button type="button" class="btn btn-secondary" id="promo-apply-btn">Apply</button>
      </div>
      <p class="promo-message ${promo?.valid ? 'promo-ok' : promo?.message ? 'promo-error' : ''}" id="promo-message">
        ${promo?.valid ? `Applied: ${promo.code} (−₹${formatINR(promoDiscount)})` : (promo?.message || '')}
      </p>
    </div>
    ${promoDiscount > 0 ? `<div class="summary-line discount"><span>Discount</span><span>−₹${formatINR(promoDiscount)}</span></div>` : ''}
    <div class="summary-line"><span>Subtotal</span><span>₹${formatINR(subtotal)}</span></div>
    <div class="summary-line"><span>GST (18%)</span><span>₹${formatINR(gst)}</span></div>
    <div class="summary-line total">
      <span>Total</span>
      <span><sub>₹</sub>${formatINR(total)}</span>
    </div>
    <p class="summary-gst-note">Inclusive of 18% GST · Before discount: ₹${formatINR(gross)}</p>
  `;

  const applyBtn = document.getElementById('promo-apply-btn');
  const promoInput = document.getElementById('promo-code-input');
  if (applyBtn && promoInput) {
    applyBtn.addEventListener('click', () => applyPromoCode(promoInput.value));
    promoInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyPromoCode(promoInput.value);
      }
    });
  }
}

function resolveCheckoutEventId(cart) {
  const ids = [...new Set(cart.map((i) => i.event_id).filter(Boolean))];
  if (ids.length === 0) return null;
  return ids[0];
}

async function applyPromoCode(rawCode) {
  const code = rawCode.trim();
  const cart = getCart();
  if (!code) {
    setAppliedPromo(null);
    renderCheckoutSummary();
    return;
  }

  const eventId = resolveCheckoutEventId(cart);
  if (!eventId) {
    toast.error('Event information is missing from your cart.', 'Promo');
    return;
  }

  const gross = cart.reduce((s, i) => s + i.price * i.qty, 0);

  try {
    const { data, error } = await window.db.validatePromo(code, gross, eventId);
    if (error) {
      setAppliedPromo({ valid: false, code, message: error.message || 'Invalid promo code' });
      toast.error(error.message || 'Invalid promo code', 'Promo');
    } else if (!data?.valid) {
      setAppliedPromo({ valid: false, code: data.code || code, message: data.message || 'Invalid promo code' });
      toast.error(data.message || 'Invalid promo code', 'Promo');
    } else {
      setAppliedPromo({ ...data, event_id: eventId });
      toast.success(data.message || 'Promo applied', 'Promo');
    }
  } catch (err) {
    setAppliedPromo({ valid: false, code, message: 'Could not validate promo code' });
    toast.error('Could not validate promo code', 'Promo');
  }

  renderCheckoutSummary();
}

async function handleCheckoutSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('[type="submit"]');
  const cart = getCart();

  if (cart.length === 0) {
    toast.error('Your cart is empty.', 'Cart');
    return;
  }

  if (!window.formHelpers?.validateForm(form)) {
    toast.error('Please fix the errors above.', 'Validation Error');
    return;
  }

  await syncCatalogFromDb();

  const missingEventId = cart.find(i => !i.event_id);
  if (missingEventId) {
    toast.error('Event catalogue not loaded. Refresh and try again.', 'Error');
    return;
  }

  const formData = window.formHelpers.collectFormData(form);
  const promo = getAppliedPromo();
  const eventId = resolveCheckoutEventId(cart);

  btn.disabled = true;
  btn.classList.add('btn-loading');

  try {
    await window.checkout.startCheckout({
      full_name: formData.full_name,
      email: formData.email,
      phone: formData.phone,
      college: formData.college,
      selected_events: window.checkout.selectedEventsFromCart(cart),
      promo_code: promo?.valid ? promo.code : undefined,
      event_id: eventId || undefined,
    });
  } catch (err) {
    console.error('Checkout error:', err);
    if (err.message !== 'Payment cancelled') {
      toast.error(err.message || 'Checkout failed.', 'Error');
    }
  } finally {
    btn.disabled = false;
    btn.classList.remove('btn-loading');
  }
}

function setSuccessState({ eyebrow, title, sub, confirmed }) {
  const eyebrowEl = document.querySelector('.success-eyebrow');
  const titleEl = document.querySelector('.success-title');
  const subEl = document.querySelector('.success-sub');
  const checkWrap = document.querySelector('.success-check-wrap');
  const checkSvg = document.querySelector('.check-circle-svg');

  if (eyebrowEl) {
    eyebrowEl.textContent = eyebrow;
    if (confirmed) {
      eyebrowEl.style.background = 'rgba(34,142,80,0.08)';
      eyebrowEl.style.borderColor = 'rgba(34,142,80,0.15)';
      eyebrowEl.style.color = '#4ade80';
    } else {
      eyebrowEl.style.background = 'rgba(201, 168, 76, 0.08)';
      eyebrowEl.style.borderColor = 'rgba(201, 168, 76, 0.2)';
      eyebrowEl.style.color = 'var(--gold)';
    }
    eyebrowEl.style.animation = '';
  }
  if (titleEl) titleEl.innerHTML = title;
  if (subEl) subEl.textContent = sub;

  const stroke = confirmed ? '#4ade80' : 'var(--gold)';
  if (checkWrap) {
    checkWrap.style.background = confirmed ? 'rgba(34,142,80,0.08)' : 'rgba(201, 168, 76, 0.08)';
    checkWrap.style.borderColor = confirmed ? 'rgba(34,142,80,0.15)' : 'rgba(201, 168, 76, 0.2)';
  }
  if (checkSvg) {
    checkSvg.querySelectorAll('circle, path').forEach(el => {
      el.style.stroke = stroke;
    });
  }
}

function getRegistrationIdFromPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const fromUrl = urlParams.get('registration_id');
  if (fromUrl) return fromUrl;

  const key = window.checkout?.PENDING_REG_KEY || 'confluenceRegistration';
  let pending = JSON.parse(sessionStorage.getItem(key) || 'null');
  if (!pending) pending = JSON.parse(localStorage.getItem(key) || 'null');
  return pending?.registrationId || null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchRegistrationStatusSafe(registrationId) {
  try {
    const status = await window.db.getRegistrationStatus(registrationId);
    if (status?.error) {
      console.error('Status API error:', status.error);
      return null;
    }
    return status;
  } catch (err) {
    console.error('Status fetch error:', err);
    return null;
  }
}

function renderSuccessPassRows(events) {
  if (!events?.length) {
    return '<div style="font-size:0.9rem;color:var(--ink-light);">Loading pass details…</div>';
  }

  return events.map((event) => `
    <div style="display:flex;justify-content:space-between;gap:1rem;padding:0.45rem 0;font-size:0.9rem;color:var(--ink);">
      <span>${event.name} × ${event.quantity}</span>
      <span style="white-space:nowrap;">₹${formatINR(event.unit_price * event.quantity)}</span>
    </div>
  `).join('');
}

function applySuccessTicket(status, pending, registrationId) {
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  const name = status?.full_name || pending?.name || '—';
  const email = status?.email || pending?.email || '—';
  const orderRef = status?.registration_reference
    || (registrationId ? `Pending · ${registrationId}` : '—');

  setEl('success-order-id', orderRef || '—');
  setEl('success-name', name);
  setEl('success-email', email);
  setEl('success-total', status?.total != null ? `₹${formatINR(status.total)}` : '—');

  const itemsEl = document.getElementById('success-items');
  if (itemsEl) {
    itemsEl.innerHTML = renderSuccessPassRows(status?.events);
  }
}

async function pollRegistrationStatus(registrationId, onUpdate, maxAttempts = 45) {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await fetchRegistrationStatusSafe(registrationId);
    if (status) onUpdate(status);

    if (status?.status === 'PAYMENT_COMPLETE') return status;
    if (status?.status === 'CANCELLED' || status?.status === 'REFUNDED') return status;

    const delayMs = i < 10 ? 800 : i < 25 ? 1500 : 2500;
    await sleep(delayMs);
  }
  return null;
}

async function renderSuccessPage() {
  const registrationId = getRegistrationIdFromPage();
  if (!registrationId || !window.db?.getRegistrationStatus) return;

  const key = window.checkout?.PENDING_REG_KEY || 'confluenceRegistration';
  let pending = JSON.parse(sessionStorage.getItem(key) || 'null');
  if (!pending) pending = JSON.parse(localStorage.getItem(key) || 'null');

  setSuccessState({
    eyebrow: 'Confirming Payment',
    title: 'Verification<br><em>in progress</em>',
    sub: 'Please wait while we confirm your payment securely.',
    confirmed: false,
  });

  const initialStatus = await fetchRegistrationStatusSafe(registrationId);
  if (initialStatus) applySuccessTicket(initialStatus, pending, registrationId);

  const status = await pollRegistrationStatus(registrationId, (latestStatus) => {
    applySuccessTicket(latestStatus, pending, registrationId);
  });

  if (status?.status === 'PAYMENT_COMPLETE') {
    applySuccessTicket(status, pending, registrationId);

    setSuccessState({
      eyebrow: 'Registration Confirmed',
      title: 'You\'re<br><em>in, officially.</em>',
      sub: 'Your payment was confirmed. Your pass has been secured for Confluence 2026.',
      confirmed: true,
    });
    clearCart();
    sessionStorage.removeItem(PROMO_KEY);
    sessionStorage.removeItem(key);
    return;
  }

  if (pending || initialStatus) {
    applySuccessTicket(status || initialStatus, pending, registrationId);
  }

  setSuccessState({
    eyebrow: 'Payment Processing',
    title: 'Confirmation<br><em>pending</em>',
    sub: 'Your payment is being verified. Save your registration reference and check back shortly, or use the tracking page.',
    confirmed: false,
  });

  pollRegistrationStatus(registrationId, (latestStatus) => {
    applySuccessTicket(latestStatus, pending, registrationId);
    if (latestStatus?.status === 'PAYMENT_COMPLETE') {
      setSuccessState({
        eyebrow: 'Registration Confirmed',
        title: 'You\'re<br><em>in, officially.</em>',
        sub: 'Your payment was confirmed. Your pass has been secured for Confluence 2026.',
        confirmed: true,
      });
      clearCart();
      sessionStorage.removeItem(PROMO_KEY);
      sessionStorage.removeItem(key);
    }
  }, 60).catch((err) => console.error('Background status poll error:', err));
}

document.addEventListener('DOMContentLoaded', async () => {
  await syncCatalogFromDb();
  renderCart();
  renderCheckoutSummary();

  const checkoutForm = document.getElementById('checkout-form');
  if (checkoutForm && window.formHelpers?.initInlineValidation) {
    window.formHelpers.initInlineValidation(checkoutForm);
    checkoutForm.addEventListener('submit', handleCheckoutSubmit);
  }

  renderSuccessPage();
});

window.cartHelpers = { getCart, removeFromCart, calcTotals, formatINR, clearCart, PASS_CATALOGUE, syncCatalogFromDb, getAppliedPromo, setAppliedPromo };
