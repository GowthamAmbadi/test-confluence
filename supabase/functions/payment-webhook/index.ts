import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { deliverPaymentConfirmationEmailIfNeeded } from '../_shared/sendPaymentConfirmationEmail.ts';

interface RazorpayPaymentEntity {
  id: string;
  order_id: string;
  amount: number;
  currency?: string;
  method?: string;
  status?: string;
}

interface RazorpayOrderEntity {
  id: string;
  amount: number;
  amount_paid?: number;
  currency?: string;
  status?: string;
}

interface RazorpayWebhookPayload {
  event: string;
  payload?: {
    payment?: { entity?: RazorpayPaymentEntity };
    order?: { entity?: RazorpayOrderEntity };
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function verifyRazorpaySignature(
  rawBody: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  const expected = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return expected === signature;
}

function mapRpcError(message: string): { status: number; error: string } {
  if (message.includes('order_not_found')) return { status: 404, error: 'Order not found' };
  if (message.includes('registration_not_found')) return { status: 404, error: 'Registration not found' };
  if (message.includes('amount_mismatch')) return { status: 400, error: 'Amount mismatch' };
  if (message.includes('insufficient_capacity')) return { status: 409, error: 'Insufficient event capacity' };
  return { status: 500, error: 'Payment processing failed' };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');

  if (!supabaseUrl || !serviceRoleKey || !webhookSecret) {
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-razorpay-signature') ?? '';

  if (!signature || !(await verifyRazorpaySignature(rawBody, signature, webhookSecret))) {
    return jsonResponse({ error: 'Invalid signature' }, 401);
  }

  let webhook: RazorpayWebhookPayload;
  try {
    webhook = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const event = webhook.event;
  const payloadJson = JSON.parse(rawBody) as Record<string, unknown>;

  try {
    if (event === 'payment.captured') {
      const payment = webhook.payload?.payment?.entity;
      if (!payment?.id || !payment.order_id || payment.amount == null) {
        return jsonResponse({ error: 'Invalid payment.captured payload' }, 400);
      }

      const { data, error } = await supabase.rpc('process_payment_captured', {
        p_razorpay_payment_id: payment.id,
        p_razorpay_order_id: payment.order_id,
        p_amount_paise: payment.amount,
        p_currency: payment.currency ?? 'INR',
        p_method: payment.method ?? null,
        p_webhook_event: event,
        p_webhook_payload: payloadJson,
      });

      if (error) {
        console.error('process_payment_captured error:', error);
        const mapped = mapRpcError(error.message ?? '');
        return jsonResponse({ error: mapped.error }, mapped.status);
      }

      const rpcResult = (data ?? {}) as { status?: string };
      await deliverPaymentConfirmationEmailIfNeeded(supabase, {
        razorpayPaymentId: payment.id,
        rpcStatus: rpcResult.status ?? '',
      });

      return jsonResponse({ ok: true, result: data });
    }

    if (event === 'payment.failed') {
      const payment = webhook.payload?.payment?.entity;
      if (!payment?.id || !payment.order_id || payment.amount == null) {
        return jsonResponse({ error: 'Invalid payment.failed payload' }, 400);
      }

      const { data, error } = await supabase.rpc('process_payment_failed', {
        p_razorpay_payment_id: payment.id,
        p_razorpay_order_id: payment.order_id,
        p_amount_paise: payment.amount,
        p_currency: payment.currency ?? 'INR',
        p_method: payment.method ?? null,
        p_webhook_event: event,
        p_webhook_payload: payloadJson,
      });

      if (error) {
        console.error('process_payment_failed error:', error);
        const mapped = mapRpcError(error.message ?? '');
        return jsonResponse({ error: mapped.error }, mapped.status);
      }

      return jsonResponse({ ok: true, result: data });
    }

    if (event === 'order.paid') {
      const order = webhook.payload?.order?.entity;
      if (!order?.id || order.amount == null) {
        return jsonResponse({ error: 'Invalid order.paid payload' }, 400);
      }

      const amountPaise = order.amount_paid ?? order.amount;

      const { data, error } = await supabase.rpc('process_order_paid', {
        p_razorpay_order_id: order.id,
        p_amount_paise: amountPaise,
        p_webhook_event: event,
        p_webhook_payload: payloadJson,
      });

      if (error) {
        console.error('process_order_paid error:', error);
        const mapped = mapRpcError(error.message ?? '');
        return jsonResponse({ error: mapped.error }, mapped.status);
      }

      return jsonResponse({ ok: true, result: data });
    }

    return jsonResponse({ ok: true, ignored: true, event });
  } catch (err) {
    console.error('webhook handler error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
