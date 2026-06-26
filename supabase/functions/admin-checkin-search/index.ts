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

  if (req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const ctx = await getAdminContext(req, { allowedRoles: READ_ROLES });
  if (ctx instanceof Response) return ctx;

  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  if (action === 'stats') {
    const { data, error } = await ctx.supabaseAdmin.rpc('get_admin_checkin_stats', {
      p_recent_limit: parseIntParam(url.searchParams.get('recent_limit'), 20),
    });

    if (error) {
      console.error('get_admin_checkin_stats error:', error);
      return jsonResponse({ error: 'Failed to load check-in stats' }, 500);
    }

    const role = ctx.profile.role;
    return jsonResponse({
      ...data,
      permissions: {
        can_check_in: role === 'SUPER_ADMIN' || role === 'CHECKIN_STAFF',
      },
    });
  }

  const query = url.searchParams.get('q') ?? '';
  const { data, error } = await ctx.supabaseAdmin.rpc('search_admin_checkin_attendees', {
    p_q: query,
    p_limit: parseIntParam(url.searchParams.get('limit'), 8),
  });

  if (error) {
    console.error('search_admin_checkin_attendees error:', error);
    return jsonResponse({ error: 'Search failed' }, 500);
  }

  const role = ctx.profile.role;
  return jsonResponse({
    results: data ?? [],
    permissions: {
      can_check_in: role === 'SUPER_ADMIN' || role === 'CHECKIN_STAFF',
    },
  });
});
