import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders } from '../_shared/cors.ts';

interface SelectedEventInput {
  event_id: string;
  quantity?: number;
  event_answers?: Record<string, unknown>;
}

interface CreateRegistrationRequest {
  full_name: string;
  email: string;
  phone: string;
  college: string;
  selected_events: SelectedEventInput[];
}

interface NormalizedSelection {
  event_id: string;
  quantity: number;
  event_answers: Record<string, unknown>;
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

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeSelectedEvents(raw: unknown): NormalizedSelection[] | string {
  if (!Array.isArray(raw) || raw.length === 0) {
    return 'selected_events must be a non-empty array';
  }

  const merged = new Map<string, NormalizedSelection>();

  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      return 'Each selected event must be an object';
    }

    const { event_id, quantity, event_answers } = item as SelectedEventInput;

    if (!isNonEmptyString(event_id)) {
      return 'Each selected event must include event_id';
    }

    const qty = quantity ?? 1;
    if (!Number.isInteger(qty) || qty < 1) {
      return 'quantity must be a positive integer';
    }

    const answers =
      event_answers && typeof event_answers === 'object' && !Array.isArray(event_answers)
        ? event_answers
        : {};

    const existing = merged.get(event_id);
    if (existing) {
      existing.quantity += qty;
      existing.event_answers = { ...existing.event_answers, ...answers };
    } else {
      merged.set(event_id, { event_id, quantity: qty, event_answers: answers });
    }
  }

  return Array.from(merged.values());
}

function validateBody(body: unknown): CreateRegistrationRequest | string {
  if (!body || typeof body !== 'object') {
    return 'Request body must be a JSON object';
  }

  const { full_name, email, phone, college, selected_events } = body as CreateRegistrationRequest;

  if (!isNonEmptyString(full_name)) return 'full_name is required';
  if (!isNonEmptyString(email)) return 'email is required';
  if (!isValidEmail(email.trim())) return 'email is invalid';
  if (!isNonEmptyString(phone)) return 'phone is required';
  if (!isNonEmptyString(college)) return 'college is required';

  const normalized = normalizeSelectedEvents(selected_events);
  if (typeof normalized === 'string') return normalized;

  return {
    full_name: full_name.trim(),
    email: email.trim().toLowerCase(),
    phone: phone.trim(),
    college: college.trim(),
    selected_events: normalized,
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

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const validated = validateBody(body);
  if (typeof validated === 'string') {
    return jsonResponse({ error: validated }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const eventIds = validated.selected_events.map((e) => e.event_id);
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('id, name, slug, price, is_active, available_qty, sold_qty')
    .in('id', eventIds);

  if (eventsError) {
    console.error('events fetch error:', eventsError);
    return jsonResponse({ error: 'Failed to validate events' }, 500);
  }

  const eventMap = new Map((events ?? []).map((e) => [e.id, e]));

  for (const selection of validated.selected_events) {
    const event = eventMap.get(selection.event_id);

    if (!event) {
      return jsonResponse({ error: `Event not found: ${selection.event_id}` }, 404);
    }

    if (!event.is_active) {
      return jsonResponse({ error: `Event is not active: ${event.slug}` }, 422);
    }

    const remaining = event.available_qty - event.sold_qty;
    if (remaining <= 0 || remaining < selection.quantity) {
      return jsonResponse(
        {
          error: `Insufficient capacity for event: ${event.slug}`,
          available: Math.max(remaining, 0),
          requested: selection.quantity,
        },
        409,
      );
    }
  }

  const { data: registration, error: registrationError } = await supabase
    .from('registrations')
    .insert({
      full_name: validated.full_name,
      email: validated.email,
      phone: validated.phone,
      college: validated.college,
      status: 'PAYMENT_PENDING',
    })
    .select('id')
    .single();

  if (registrationError || !registration) {
    console.error('registration insert error:', registrationError);
    return jsonResponse({ error: 'Failed to create registration' }, 500);
  }

  const itemRows = validated.selected_events.map((selection) => {
    const event = eventMap.get(selection.event_id)!;
    const unitPrice = Number(event.price);
    return {
      registration_id: registration.id,
      event_id: selection.event_id,
      quantity: selection.quantity,
      unit_price: unitPrice,
      line_subtotal: unitPrice * selection.quantity,
      event_answers: selection.event_answers,
    };
  });

  const { data: items, error: itemsError } = await supabase
    .from('registration_items')
    .insert(itemRows)
    .select('id, event_id, quantity');

  if (itemsError) {
    console.error('registration_items insert error:', itemsError);
    await supabase.from('registrations').delete().eq('id', registration.id);
    return jsonResponse({ error: 'Failed to create registration items' }, 500);
  }

  const { error: auditError } = await supabase.from('audit_logs').insert({
    event_type: 'REGISTRATION_CREATED',
    entity_type: 'registration',
    entity_id: registration.id,
    registration_id: registration.id,
    actor_type: 'anon',
    metadata: {
      email: validated.email,
      event_count: itemRows.length,
      items: (items ?? []).map((i) => ({
        id: i.id,
        event_id: i.event_id,
        quantity: i.quantity,
      })),
    },
  });

  if (auditError) {
    console.error('audit_logs insert error:', auditError);
    // Registration is valid; audit failure is non-fatal for the client response.
  }

  return jsonResponse({ registration_id: registration.id });
});
