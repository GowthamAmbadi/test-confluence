import {
  ADMIN_ROLES,
  corsPreflightResponse,
  getAdminContext,
  jsonResponse,
} from '../_shared/adminAuth.ts';

const READ_ROLES = ADMIN_ROLES;

function parseIntParam(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse();
  }

  const ctx = await getAdminContext(req, { allowedRoles: READ_ROLES });
  if (ctx instanceof Response) return ctx;

  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const registrationId = url.searchParams.get('id');

  if (req.method === 'GET' && action === 'recent-searches') {
    const { data, error } = await ctx.supabaseAdmin.rpc('get_admin_recent_searches', {
      p_admin_profile_id: ctx.profile.id,
    });
    if (error) {
      console.error('get_admin_recent_searches error:', error);
      return jsonResponse({ error: 'Failed to load recent searches' }, 500);
    }
    return jsonResponse({ recent_searches: data ?? [] });
  }

  if (req.method === 'GET' && registrationId) {
    const { data, error } = await ctx.supabaseAdmin.rpc('get_admin_registration_detail', {
      p_registration_id: registrationId,
    });
    if (error) {
      console.error('get_admin_registration_detail error:', error);
      return jsonResponse({ error: 'Failed to load registration' }, 500);
    }
    if (!data) {
      return jsonResponse({ error: 'Registration not found' }, 404);
    }
    return jsonResponse({ registration: data });
  }

  if (req.method === 'GET') {
    const { data, error } = await ctx.supabaseAdmin.rpc('search_admin_registrations', {
      p_q: url.searchParams.get('q') || null,
      p_payment_status: url.searchParams.get('payment_status') || null,
      p_registration_status: url.searchParams.get('registration_status') || null,
      p_check_in_status: url.searchParams.get('check_in_status') || null,
      p_event_id: url.searchParams.get('event_id') || null,
      p_date_preset: url.searchParams.get('date_preset') || null,
      p_date_from: url.searchParams.get('date_from') || null,
      p_date_to: url.searchParams.get('date_to') || null,
      p_sort: url.searchParams.get('sort') || 'created_at',
      p_sort_dir: url.searchParams.get('sort_dir') || 'desc',
      p_page: parseIntParam(url.searchParams.get('page'), 1),
      p_page_size: parseIntParam(url.searchParams.get('page_size'), 25),
    });

    if (error) {
      console.error('search_admin_registrations error:', error);
      return jsonResponse({
        error: 'Failed to search registrations',
        detail: error.message,
        code: error.code,
      }, 500);
    }

    return jsonResponse(data);
  }

  if (req.method === 'POST' && action === 'recent-search') {
    let body: { search_text?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const searchText = body.search_text?.trim();
    if (!searchText) {
      return jsonResponse({ error: 'search_text is required' }, 400);
    }

    const { data, error } = await ctx.supabaseAdmin.rpc('record_admin_recent_search', {
      p_admin_profile_id: ctx.profile.id,
      p_search_text: searchText,
    });

    if (error) {
      console.error('record_admin_recent_search error:', error);
      return jsonResponse({ error: 'Failed to record search' }, 500);
    }

    return jsonResponse({ recent_searches: data ?? [] });
  }

  return jsonResponse({ error: 'Method not allowed' }, 405);
});
