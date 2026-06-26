import {
  corsPreflightResponse,
  getAdminContext,
  jsonResponse,
} from '../_shared/adminAuth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse();
  }

  if (req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const ctx = await getAdminContext(req, { allowedRoles: ['SUPER_ADMIN'] });
  if (ctx instanceof Response) return ctx;

  const { data, error } = await ctx.supabaseAdmin.rpc('get_admin_dashboard_stats');

  if (error) {
    console.error('get_admin_dashboard_stats error:', error);
    return jsonResponse({ error: 'Failed to load dashboard' }, 500);
  }

  return jsonResponse(data);
});
