/* ============================================================
   CONFLUENCE 2026 — cart.js
   ============================================================ */

const CART_KEY = 'confluenceCart';
const GST_RATE = 0.18;

// Pass catalogue (fallback if Supabase unavailable)
const PASS_CATALOGUE = {
  'learning-lab': { id: 'learning-lab', name: 'Learning Lab Pass', tag: 'Skill Track', price: 4500, accent: 'orange', formUrl: 'forms/learning-lab.html' },
  'concept-cocoon': { id: 'concept-cocoon', name: 'Concept Cocoon Pass', tag: 'Startup Track', price: 1000, accent: 'orange', formUrl: 'forms/concept-cocoon.html' },
  'networking-gala': { id: 'networking-gala', name: 'Networking Gala Pass', tag: 'Network Track', price: 250, accent: 'orange', formUrl: 'forms/networking-gala.html' },
  'all-access': { id: 'all-access', name: 'All Access Pass', tag: 'Full Experience', price: 6000, accent: 'gold', formUrl: 'forms/all-access.html' },
};

// ─── CART STORAGE ───

function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
  catch { return []; }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge && updateCartBadge();
}

function addToCart(passId) {
  const pass = PASS_CATALOGUE[passId];
  if (!pass) return;

  const cart = getCart();
  const existing = cart.find(i => i.id === passId);

  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ ...pass, qty: 1 });
  }

  saveCart(cart);
  return pass;
}

function removeFromCart(passId) {
  const cart = getCart().filter(i => i.id !== passId);
  saveCart(cart);
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

// ─── PRICE CALC ───

function calcTotals(cart) {
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const gst = Math.round(subtotal * GST_RATE);
  const total = subtotal + gst;
  return { subtotal, gst, total };
}

function formatINR(n) {
  return n.toLocaleString('en-IN');
}

// ─── CART PAGE RENDERER ───

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

  // Cart count label
  const countLabel = document.getElementById('cart-count-label');
  const total = cart.reduce((s, i) => s + i.qty, 0);
  if (countLabel) countLabel.textContent = `${total} item${total !== 1 ? 's' : ''}`;

  // Render items
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
  const { subtotal, gst, total } = calcTotals(cart);

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('summary-subtotal', `₹${formatINR(subtotal)}`);
  set('summary-gst', `₹${formatINR(gst)}`);
  set('summary-total', formatINR(total));
}

// ─── GLOBAL HANDLERS (called from HTML) ───

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

window.cartAddFromEvent = function (passId) {
  const pass = addToCart(passId);
  if (pass) {
    toast.success(`${pass.name} added to cart.`, 'Added');
    updateCartBadge && updateCartBadge();
  }
};

window.buyLater = function () {
  toast.info('Buy Later will be enabled soon.', 'Coming Soon');
};

// ─── CHECKOUT SUMMARY ───

function renderCheckoutSummary() {
  const el = document.getElementById('checkout-order-summary');
  if (!el) return;
  const cart = getCart();
  if (cart.length === 0) { window.location.href = 'cart.html'; return; }

  const { subtotal, gst, total } = calcTotals(cart);

  el.innerHTML = `
    <div class="summary-title">Order Summary</div>
    ${cart.map(i => `
      <div class="summary-line">
        <span>${i.name} × ${i.qty}</span>
        <span>₹${formatINR(i.price * i.qty)}</span>
      </div>
    `).join('')}
    <div class="summary-line"><span>Subtotal</span><span id="co-subtotal">₹${formatINR(subtotal)}</span></div>
    <div class="summary-line"><span>GST (18%)</span><span id="co-gst">₹${formatINR(gst)}</span></div>
    <div class="summary-line total">
      <span>Total</span>
      <span><sub>₹</sub><span id="co-total">${formatINR(total)}</span></span>
    </div>
    <p class="summary-gst-note">Inclusive of 18% GST</p>
  `;
  return { subtotal, gst, total };
}

// ─── COUPON SYSTEM ───
const COUPONS = {
  'YANC2026': { type: 'percent', value: 10, label: '10% off' },
  'EARLYBIRD': { type: 'flat', value: 500, label: '₹500 off' },
};

let appliedCoupon = null;

window.applyCoupon = function () {
  const input = document.getElementById('coupon-input');
  const msg = document.getElementById('coupon-msg');
  if (!input || !msg) return;

  const code = input.value.trim().toUpperCase();
  const coupon = COUPONS[code];

  if (!coupon) {
    msg.textContent = 'Invalid coupon code.';
    msg.className = 'coupon-msg error';
    appliedCoupon = null;
    recalcWithCoupon();
    return;
  }

  appliedCoupon = { code, ...coupon };
  msg.textContent = `${code} applied — ${coupon.label}`;
  msg.className = 'coupon-msg success';
  recalcWithCoupon();
  toast.success(`Coupon ${code} applied!`);
};

function recalcWithCoupon() {
  const cart = getCart();
  let { subtotal, gst, total } = calcTotals(cart);

  if (appliedCoupon) {
    const disc = appliedCoupon.type === 'percent'
      ? Math.round(subtotal * appliedCoupon.value / 100)
      : appliedCoupon.value;
    subtotal = Math.max(0, subtotal - disc);
    gst = Math.round(subtotal * GST_RATE);
    total = subtotal + gst;
  }

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('co-subtotal', `₹${formatINR(subtotal)}`);
  set('co-gst', `₹${formatINR(gst)}`);
  set('co-total', formatINR(total));

  return { subtotal, gst, total };
}

// ─── SUCCESS PAGE ───
function renderSuccessPage() {
  let pending = JSON.parse(sessionStorage.getItem('confluenceOrder') || 'null');
  if (!pending) {
    pending = JSON.parse(localStorage.getItem('confluenceOrder') || 'null');
  }
  if (!pending) return;

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('success-order-id', pending.orderId || '—');
  setEl('success-name', pending.name || '');
  setEl('success-email', pending.email || '');
  setEl('success-total', `₹${formatINR(pending.total || 0)}`);

  const itemsEl = document.getElementById('success-items');
  if (itemsEl && pending.items) {
    itemsEl.innerHTML = pending.items.map(i => `
      <div class="summary-line">
        <span>${i.name} × ${i.qty}</span>
        <span>₹${formatINR(i.price * i.qty)}</span>
      </div>
    `).join('');
  }
}

// ─── AUTO-INIT ───
document.addEventListener('DOMContentLoaded', () => {
  renderCart();
  renderCheckoutSummary();
  renderSuccessPage();
});

// Expose helpers globally
window.cartHelpers = { getCart, addToCart, removeFromCart, calcTotals, formatINR, clearCart, PASS_CATALOGUE };
