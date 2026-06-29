import {
  corsPreflightResponse,
  getAdminContext,
  jsonResponse,
} from '../_shared/adminAuth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse();

  const ctx = await getAdminContext(req, { allowedRoles: ['SUPER_ADMIN'] });
  if (ctx instanceof Response) return ctx;

  if (req.method === 'GET') {
    const { data, error } = await ctx.supabaseAdmin.rpc('list_admin_promo_codes');
    if (error) {
      console.error('list_admin_promo_codes error:', error);
      return jsonResponse({ error: 'Failed to load promo codes' }, 500);
    }

    const { data: events, error: eventsError } = await ctx.supabaseAdmin
      .from('events')
      .select('id, name, slug')
      .eq('is_active', true)
      .order('name');

    if (eventsError) {
      console.error('events fetch error:', eventsError);
      return jsonResponse({ error: 'Failed to load events' }, 500);
    }

    return jsonResponse({ promo_codes: data ?? [], events: events ?? [] });
  }

  if (req.method === 'POST') {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const { data, error } = await ctx.supabaseAdmin.rpc('create_admin_promo_code', {
      p_payload: body,
    });

    if (error) {
      console.error('create_admin_promo_code error:', error);
      if (error.message?.includes('code_exists')) {
        return jsonResponse({ error: 'A promo code with this code already exists' }, 409);
      }
      if (error.message?.includes('code_required')) {
        return jsonResponse({ error: 'Code is required' }, 400);
      }
      return jsonResponse({ error: 'Failed to create promo code' }, 500);
    }

    return jsonResponse({ promo_code: data });
  }

  if (req.method === 'PATCH') {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return jsonResponse({ error: 'id is required' }, 400);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const { data, error } = await ctx.supabaseAdmin.rpc('update_admin_promo_code', {
      p_id: id,
      p_payload: body,
    });

    if (error) {
      console.error('update_admin_promo_code error:', error);
      if (error.message?.includes('not_found')) {
        return jsonResponse({ error: 'Promo code not found' }, 404);
      }
      return jsonResponse({ error: 'Failed to update promo code' }, 500);
    }

    return jsonResponse({ promo_code: data });
  }

  return jsonResponse({ error: 'Method not allowed' }, 405);
});
