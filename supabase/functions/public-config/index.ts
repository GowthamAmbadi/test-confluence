import { corsHeaders } from '../_shared/cors.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Public runtime configuration for the frontend.
 * Exposes only non-secret values. Never return RAZORPAY_KEY_SECRET or RAZORPAY_WEBHOOK_SECRET.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID')?.trim();

  if (!razorpayKeyId) {
    return jsonResponse({ error: 'Payment configuration unavailable' }, 503);
  }

  return jsonResponse({
    razorpay_key_id: razorpayKeyId,
  });
});
