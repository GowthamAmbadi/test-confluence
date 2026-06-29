import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders } from '../_shared/cors.ts';
import { validatePromoCode } from '../_shared/promoCodes.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
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

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  let body: { code?: string; event_id?: string; subtotal?: number };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const code = body.code?.trim();
  if (!code) {
    return jsonResponse({
      valid: false,
      code: null,
      discount_amount: 0,
      final_amount: Number(body.subtotal ?? 0),
      message: 'Promo code not found',
    });
  }

  const subtotal = Number(body.subtotal ?? 0);
  if (!Number.isFinite(subtotal) || subtotal < 0) {
    return jsonResponse({ error: 'subtotal must be a non-negative number' }, 400);
  }

  const eventId = body.event_id?.trim();
  if (!eventId) {
    return jsonResponse({ error: 'event_id is required' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const result = await validatePromoCode(supabase, {
      code,
      event_id: eventId,
      subtotal,
    });
    return jsonResponse(result);
  } catch {
    return jsonResponse({ error: 'Promo validation failed' }, 500);
  }
});
