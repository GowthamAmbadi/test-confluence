/* ============================================================
   CONFLUENCE 2026 — checkout.js
   create-registration → create-order → Razorpay Checkout
   ============================================================ */

const PENDING_REG_KEY = 'confluenceRegistration';

function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Failed to load Razorpay Checkout'));
    document.head.appendChild(script);
  });
}

function storePendingRegistration(data) {
  sessionStorage.setItem(PENDING_REG_KEY, JSON.stringify(data));
  localStorage.setItem(PENDING_REG_KEY, JSON.stringify(data));
}

/**
 * @param {object} params
 * @param {string} params.full_name
 * @param {string} params.email
 * @param {string} params.phone
 * @param {string} params.college
 * @param {Array} params.selected_events - { event_id, quantity?, event_answers? }
 * @param {string} [params.promo_code]
 * @param {string} [params.event_id]
 */
async function startCheckout(params) {
  let razorpayKeyId;
  try {
    razorpayKeyId = await window.db.getRazorpayKeyId();
  } catch (err) {
    throw new Error(err.message || 'Could not load payment configuration');
  }

  if (!razorpayKeyId) {
    throw new Error('Razorpay is not configured. Set RAZORPAY_KEY_ID in Supabase secrets.');
  }

  await loadRazorpayScript();

  const { data: regData, error: regError } = await window.db.createRegistration({
    full_name: params.full_name,
    email: params.email,
    phone: params.phone,
    college: params.college,
    selected_events: params.selected_events,
  });

  if (regError) throw new Error(regError.message || 'Registration failed');

  const registrationId = regData.registration_id;

  const { data: orderData, error: orderError } = await window.db.createOrder(
    registrationId,
    params.promo_code || undefined,
    params.event_id || undefined,
  );
  if (orderError) throw new Error(orderError.message || 'Order creation failed');

  const prefill = {
    name: params.full_name,
    email: params.email,
    phone: params.phone,
  };

  storePendingRegistration({
    registrationId,
    name: params.full_name,
    email: params.email,
    phone: params.phone,
    college: params.college,
  });

  return new Promise((resolve, reject) => {
    const options = {
      key: razorpayKeyId,
      amount: orderData.amount,
      currency: orderData.currency || 'INR',
      name: 'Confluence 2026',
      description: 'Event Registration',
      order_id: orderData.razorpay_order_id,
      prefill: {
        name: prefill.name,
        email: prefill.email,
        contact: prefill.phone,
      },
      theme: { color: '#C9A84C' },
      handler(response) {
        storePendingRegistration({
          registrationId,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_order_id: response.razorpay_order_id,
          name: prefill.name,
          email: prefill.email,
          phone: prefill.phone,
        });
        const base = window.location.pathname.includes('/forms/') ? '../' : '';
        window.location.href = `${base}success.html?registration_id=${encodeURIComponent(registrationId)}`;
        resolve(response);
      },
      modal: {
        ondismiss() {
          reject(new Error('Payment cancelled'));
        },
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', (response) => {
      console.error('Payment failed:', response.error);
      toast.error(response.error?.description || 'Payment failed', 'Payment Error');
    });
    rzp.open();
  });
}

/**
 * Build selected_events from cart items (must have event_id).
 */
function selectedEventsFromCart(cart, eventAnswersBySlug = {}) {
  return cart.map((item) => ({
    event_id: item.event_id,
    quantity: item.qty || 1,
    event_answers: eventAnswersBySlug[item.id] || {},
  }));
}

window.checkout = { startCheckout, selectedEventsFromCart, storePendingRegistration, PENDING_REG_KEY };
