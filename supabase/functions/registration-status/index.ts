import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders } from '../_shared/cors.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface StatusResponse {
  status: string;
  registration_reference: string | null;
  events: Array<{
    name: string;
    slug: string;
    quantity: number;
    unit_price: number;
  }>;
  total: number | null;
  payment_id: string | null;
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

function parseRegistrationId(req: Request, body?: { registration_id?: string }): string | null {
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get('registration_id');
  if (isNonEmptyString(fromQuery)) return fromQuery.trim();

  const fromBody = body?.registration_id;
  if (isNonEmptyString(fromBody)) return fromBody.trim();

  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  let body: { registration_id?: string } | undefined;
  if (req.method === 'POST') {
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }
  }

  const lookupId = parseRegistrationId(req, body);
  if (!lookupId) {
    return jsonResponse({ error: 'registration_id is required' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const registrationQuery = UUID_RE.test(lookupId)
    ? supabase.from('registrations').select('id, status, registration_id').eq('id', lookupId)
    : supabase.from('registrations').select('id, status, registration_id').eq('registration_id', lookupId);

  const { data: registration, error: regError } = await registrationQuery.single();

  if (regError || !registration) {
    return jsonResponse({ error: 'Registration not found' }, 404);
  }

  const { data: items, error: itemsError } = await supabase
    .from('registration_items')
    .select('quantity, unit_price, events ( name, slug )')
    .eq('registration_id', registration.id);

  if (itemsError) {
    console.error('registration_items fetch error:', itemsError);
    return jsonResponse({ error: 'Failed to load registration items' }, 500);
  }

  const events = (items ?? []).map((item) => {
    const event = item.events as { name: string; slug: string } | null;
    return {
      name: event?.name ?? 'Unknown Event',
      slug: event?.slug ?? '',
      quantity: item.quantity,
      unit_price: Number(item.unit_price),
    };
  });

  const { data: order } = await supabase
    .from('orders')
    .select('id, total')
    .eq('registration_id', registration.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: payment } = await supabase
    .from('payments')
    .select('razorpay_payment_id')
    .eq('registration_id', registration.id)
    .eq('status', 'captured')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const response: StatusResponse = {
    status: registration.status,
    registration_reference: registration.registration_id,
    events,
    total: order ? Number(order.total) : null,
    payment_id: payment?.razorpay_payment_id ?? null,
  };

  return jsonResponse(response);
});
