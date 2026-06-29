import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders } from '../_shared/cors.ts';
import { validatePromoCode } from '../_shared/promoCodes.ts';

const GST_RATE = 0.18;
// ============================================================
// TEMPORARY: TEST PAYMENT MODE
// When enabled, all Razorpay orders are created for ₹1.00 (100 paise).
// This must be turned OFF before going live.
// ============================================================
const TEST_PAYMENT_MODE = false;

interface CreateOrderRequest {
  registration_id: string;
  promo_code?: string;
  event_id?: string;
}

function resolveRegistrationEventId(
  items: Array<{ event_id: string }>,
  requestedEventId?: string,
): string | null {
  if (isNonEmptyString(requestedEventId)) return requestedEventId.trim();
  const unique = [...new Set(items.map((item) => String(item.event_id)))];
  if (unique.length === 1) return unique[0];
  return unique[0] ?? null;
}

interface OrderTotals {
  subtotal: number;
  discount: number;
  gst: number;
  total: number;
  amountPaise: number;
  originalAmount: number;
}

interface PromoApplyResult {
  promoCodeId: string | null;
  couponCode: string | null;
  discount: number;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function calculateTotals(grossTotal: number, discount = 0): OrderTotals {
  const originalAmount = grossTotal;
  const discountedTotal = Math.max(0, originalAmount - discount);
  const gstExclusiveDiscounted = Math.round(discountedTotal / (1 + GST_RATE));
  const gst = discountedTotal - gstExclusiveDiscounted;
  const gstExclusiveOriginal = Math.round(originalAmount / (1 + GST_RATE));

  return {
    subtotal: gstExclusiveOriginal,
    discount,
    gst,
    total: discountedTotal,
    amountPaise: Math.round(discountedTotal * 100),
    originalAmount,
  };
}

async function createRazorpayOrder(
  amountPaise: number,
  registrationId: string,
  keyId: string,
  keySecret: string,
): Promise<{ id: string }> {
  const credentials = btoa(`${keyId}:${keySecret}`);
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: 'INR',
      receipt: registrationId.replace(/-/g, '').slice(0, 40),
      notes: { registration_id: registrationId },
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    console.error('Razorpay order error:', payload);
    throw new Error(payload?.error?.description ?? 'Razorpay order creation failed');
  }

  return payload;
}

async function resolvePromoDiscount(
  supabase: ReturnType<typeof createClient>,
  promoCode: string | undefined,
  grossTotal: number,
  eventId: string | null,
): Promise<{ result: PromoApplyResult; error?: string }> {
  if (!isNonEmptyString(promoCode)) {
    return { result: { promoCodeId: null, couponCode: null, discount: 0 } };
  }

  if (!eventId) {
    return {
      result: { promoCodeId: null, couponCode: null, discount: 0 },
      error: 'event_id is required when applying a promo code',
    };
  }

  const validation = await validatePromoCode(supabase, {
    code: promoCode,
    event_id: eventId,
    subtotal: grossTotal,
  });

  if (!validation.valid) {
    return { result: { promoCodeId: null, couponCode: null, discount: 0 }, error: validation.message };
  }

  return {
    result: {
      promoCodeId: validation.promo_code_id ?? null,
      couponCode: validation.code,
      discount: Number(validation.discount_amount ?? 0),
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID');
  const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET');

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  if (!razorpayKeyId || !razorpayKeySecret) {
    return jsonResponse({ error: 'Payment gateway not configured' }, 500);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const registrationId = (body as CreateOrderRequest)?.registration_id;
  const promoCodeInput = (body as CreateOrderRequest)?.promo_code;
  const requestEventId = (body as CreateOrderRequest)?.event_id;

  if (!isNonEmptyString(registrationId)) {
    return jsonResponse({ error: 'registration_id is required' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: registration, error: regError } = await supabase
    .from('registrations')
    .select('id, status, email')
    .eq('id', registrationId)
    .single();

  if (regError || !registration) {
    return jsonResponse({ error: 'Registration not found' }, 404);
  }

  if (registration.status === 'PAYMENT_COMPLETE') {
    return jsonResponse({ error: 'Registration is already paid' }, 409);
  }

  if (registration.status !== 'PAYMENT_PENDING') {
    return jsonResponse({ error: `Registration status not payable: ${registration.status}` }, 422);
  }

  const hasPromo = isNonEmptyString(promoCodeInput);

  if (!hasPromo) {
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('id, razorpay_order_id, amount_paise, currency, status, coupon_code')
      .eq('registration_id', registrationId)
      .eq('status', 'created')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingOrder?.razorpay_order_id && !existingOrder.coupon_code) {
      const testAmountPaise = 100;
      const canReuseExistingOrder = !TEST_PAYMENT_MODE || existingOrder.amount_paise === testAmountPaise;
      if (canReuseExistingOrder) {
        return jsonResponse({
          razorpay_order_id: existingOrder.razorpay_order_id,
          amount: existingOrder.amount_paise,
          currency: existingOrder.currency,
        });
      }
    }
  }

  const { data: items, error: itemsError } = await supabase
    .from('registration_items')
    .select('id, event_id, quantity, line_subtotal, events ( id, slug, is_active, available_qty, sold_qty )')
    .eq('registration_id', registrationId);

  if (itemsError) {
    console.error('registration_items fetch error:', itemsError);
    return jsonResponse({ error: 'Failed to load registration items' }, 500);
  }

  if (!items || items.length === 0) {
    return jsonResponse({ error: 'Registration has no items' }, 400);
  }

  for (const item of items) {
    const event = item.events as {
      id: string;
      slug: string;
      is_active: boolean;
      available_qty: number;
      sold_qty: number;
    } | null;

    if (!event) {
      return jsonResponse({ error: `Event not found for item: ${item.event_id}` }, 404);
    }

    if (!event.is_active) {
      return jsonResponse({ error: `Event is not active: ${event.slug}` }, 422);
    }

    const remaining = event.available_qty - event.sold_qty;
    if (remaining <= 0 || remaining < item.quantity) {
      return jsonResponse(
        {
          error: `Insufficient capacity for event: ${event.slug}`,
          available: Math.max(remaining, 0),
          requested: item.quantity,
        },
        409,
      );
    }
  }

  const grossTotal = items.reduce((sum, item) => sum + Number(item.line_subtotal), 0);
  const checkoutEventId = resolveRegistrationEventId(items, requestEventId);

  const { result: promo, error: promoError } = await resolvePromoDiscount(
    supabase,
    promoCodeInput,
    grossTotal,
    checkoutEventId,
  );

  if (promoError) {
    return jsonResponse({ error: promoError }, 400);
  }

  const totals = calculateTotals(grossTotal, promo.discount);
  const finalTotals = TEST_PAYMENT_MODE
    ? (() => {
      const testAmountPaise = 100;
      const testTotal = testAmountPaise / 100;
      return calculateTotals(testTotal);
    })()
    : totals;

  if (finalTotals.amountPaise <= 0) {
    return jsonResponse({ error: 'Order total must be greater than zero' }, 400);
  }

  let razorpayOrder: { id: string };
  try {
    razorpayOrder = await createRazorpayOrder(
      finalTotals.amountPaise,
      registrationId,
      razorpayKeyId,
      razorpayKeySecret,
    );
  } catch (err) {
    console.error('Razorpay error:', err);
    return jsonResponse({ error: 'Failed to create payment order' }, 502);
  }

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      registration_id: registrationId,
      razorpay_order_id: razorpayOrder.id,
      subtotal: finalTotals.subtotal,
      discount: finalTotals.discount,
      coupon_code: promo.couponCode,
      promo_code_id: promo.promoCodeId,
      gst: finalTotals.gst,
      total: finalTotals.total,
      amount_paise: finalTotals.amountPaise,
      currency: 'INR',
      status: 'created',
    })
    .select('id, razorpay_order_id, amount_paise, currency')
    .single();

  if (orderError || !order) {
    console.error('orders insert error:', orderError);
    return jsonResponse({ error: 'Failed to persist order' }, 500);
  }

  const { error: auditError } = await supabase.from('audit_logs').insert({
    event_type: 'ORDER_CREATED',
    entity_type: 'order',
    entity_id: order.id,
    registration_id: registrationId,
    order_id: order.id,
    actor_type: 'anon',
    metadata: {
      razorpay_order_id: razorpayOrder.id,
      subtotal: finalTotals.subtotal,
      gst: finalTotals.gst,
      total: finalTotals.total,
      original_amount: finalTotals.originalAmount,
      discount_amount: finalTotals.discount,
      promo_code: promo.couponCode,
      amount_paise: finalTotals.amountPaise,
      item_count: items.length,
    },
  });

  if (auditError) {
    console.error('audit_logs insert error:', auditError);
  }

  return jsonResponse({
    razorpay_order_id: order.razorpay_order_id,
    amount: order.amount_paise,
    currency: order.currency,
    original_amount: finalTotals.originalAmount,
    discount_amount: finalTotals.discount,
    final_amount: finalTotals.total,
    promo_code: promo.couponCode,
  });
});
