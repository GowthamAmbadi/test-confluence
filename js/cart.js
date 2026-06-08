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
async function renderSuccessPage() {
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

  // Retrieve query params from URL
  const urlParams = new URLSearchParams(window.location.search);
  const paymentId = urlParams.get('razorpay_payment_id');
  const paymentStatus = urlParams.get('razorpay_payment_link_status') || urlParams.get('payment_status');

  // Check database if the order is already marked as approved (handles redirects without query params)
  let isApprovedInDb = false;
  try {
    const db = window.db ? window.db.getDB() : null;
    if (db && pending.orderId) {
      const { data, error } = await db
        .from('applications')
        .select('status')
        .eq('registration_id', pending.orderId)
        .single();
      if (!error && data && data.status === 'approved') {
        isApprovedInDb = true;
      }
    }
  } catch (err) {
    console.error('Error checking database verification status:', err);
  }

  const eyebrowEl = document.querySelector('.success-eyebrow');
  const titleEl = document.querySelector('.success-title');
  const subEl = document.querySelector('.success-sub');
  const checkWrap = document.querySelector('.success-check-wrap');
  const checkSvg = document.querySelector('.check-circle-svg');

  // Inject pulsing animation CSS
  if (!document.getElementById('verification-animations')) {
    const style = document.createElement('style');
    style.id = 'verification-animations';
    style.textContent = `
      @keyframes pulse {
        0% { opacity: 0.5; }
        50% { opacity: 1; }
        100% { opacity: 0.5; }
      }
    `;
    document.head.appendChild(style);
  }

  if (isApprovedInDb || (paymentId && (paymentStatus === 'confirmed' || paymentStatus === 'paid' || !paymentStatus))) {
    // Show Loading state during Supabase DB update
    if (eyebrowEl) {
      eyebrowEl.textContent = 'Verifying Payment...';
      eyebrowEl.style.background = 'rgba(201, 168, 76, 0.1)';
      eyebrowEl.style.borderColor = 'rgba(201, 168, 76, 0.3)';
      eyebrowEl.style.color = 'var(--gold)';
      eyebrowEl.style.animation = 'pulse 1.5s infinite';
    }
    if (titleEl) {
      titleEl.innerHTML = 'Verifying<br><em>your payment...</em>';
    }

    try {
      if (!isApprovedInDb && paymentId) {
        // Update Supabase Application Status to 'approved' and save payment ID
        await window.db.approveApplication(pending.orderId, paymentId);
      }

      // Verification Success UX:
      if (eyebrowEl) {
        eyebrowEl.textContent = 'Payment Verified';
        eyebrowEl.style.background = 'rgba(34,142,80,0.08)';
        eyebrowEl.style.borderColor = 'rgba(34,142,80,0.15)';
        eyebrowEl.style.color = '#4ade80';
        eyebrowEl.style.animation = '';
      }
      if (titleEl) {
        titleEl.innerHTML = 'You\'re<br><em>in, officially.</em>';
      }
      if (subEl) {
        subEl.textContent = 'Your payment was verified. Your pass has been secured for Confluence 2026. Get ready for 5 days of real growth!';
      }
      if (!isApprovedInDb) {
        toast.success('Payment verified successfully!', 'Confirmed');
      }

      // Clear the local cart now that the registration is complete & paid
      clearCart();
    } catch (error) {
      console.error('Error verifying payment:', error);
      // Database update failed but payment was made (e.g. RLS problem, offline, etc.)
      if (eyebrowEl) {
        eyebrowEl.textContent = 'Verification Error';
        eyebrowEl.style.background = 'rgba(212,85,42,0.08)';
        eyebrowEl.style.borderColor = 'rgba(212,85,42,0.15)';
        eyebrowEl.style.color = 'var(--orange)';
        eyebrowEl.style.animation = '';
      }
      if (titleEl) {
        titleEl.innerHTML = 'Payment<br><em>Unverified</em>';
      }
      if (subEl) {
        subEl.textContent = 'We detected your payment ID but couldn\'t update the database. Please keep your Order ID safe and contact support.';
      }
      if (checkWrap) {
        checkWrap.style.background = 'rgba(212,85,42,0.08)';
        checkWrap.style.borderColor = 'rgba(212,85,42,0.2)';
      }
      if (checkSvg) {
        checkSvg.querySelectorAll('circle, path').forEach(el => {
          el.style.stroke = 'var(--orange)';
        });
      }
      toast.error('Could not verify payment with the database. Please contact support.', 'DB Sync Failed');
    }
  } else {
    // No paymentId found in the URL. Verification is pending.
    if (eyebrowEl) {
      eyebrowEl.textContent = 'Verification Pending';
      eyebrowEl.style.background = 'rgba(201, 168, 76, 0.08)';
      eyebrowEl.style.borderColor = 'rgba(201, 168, 76, 0.2)';
      eyebrowEl.style.color = 'var(--gold)';
    }
    if (titleEl) {
      titleEl.innerHTML = 'Verification<br><em>Pending...</em>';
    }
    if (subEl) {
      subEl.textContent = 'Your registration details are saved, but payment status is pending. If you\'ve already completed payment, please wait for manual verification.';
    }
    if (checkWrap) {
      checkWrap.style.background = 'rgba(201, 168, 76, 0.08)';
      checkWrap.style.borderColor = 'rgba(201, 168, 76, 0.2)';
    }
    if (checkSvg) {
      checkSvg.querySelectorAll('circle, path').forEach(el => {
        el.style.stroke = 'var(--gold)';
      });
    }

    // Dev Simulation Button for Local Testing
    const actionsEl = document.querySelector('.success-actions');
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocalhost && actionsEl && !document.getElementById('dev-simulate-btn')) {
      const devBtn = document.createElement('button');
      devBtn.id = 'dev-simulate-btn';
      devBtn.className = 'btn btn-outline btn-lg';
      devBtn.style.borderColor = 'var(--gold)';
      devBtn.style.color = 'var(--gold)';
      devBtn.style.background = 'rgba(201, 168, 76, 0.05)';
      devBtn.style.cursor = 'pointer';
      devBtn.textContent = '⚡ Simulate Payment Success (Dev Mode)';
      devBtn.onclick = () => {
        const url = new URL(window.location.href);
        url.searchParams.set('razorpay_payment_id', 'pay_dev_simulated_' + Math.random().toString(36).substring(2, 9).toUpperCase());
        url.searchParams.set('razorpay_payment_link_status', 'paid');
        window.location.href = url.toString();
      };
      actionsEl.appendChild(devBtn);
    }
  }

  // Remove dev simulate button if payment succeeds
  const devBtn = document.getElementById('dev-simulate-btn');
  if (paymentId && devBtn) {
    devBtn.remove();
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
