import {
  corsPreflightResponse,
  getAdminContext,
  jsonResponse,
  type AdminRole,
} from '../_shared/adminAuth.ts';

const REPORT_ROLES: AdminRole[] = ['SUPER_ADMIN', 'SUPPORT_DESK'];

function parseFilters(url: URL): Record<string, unknown> {
  const filters: Record<string, unknown> = {};
  const keys = [
    'date_preset', 'date_from', 'date_to', 'event_id',
    'payment_status', 'registration_status', 'check_in_status',
    'volunteer_id', 'q',
  ];
  for (const key of keys) {
    const value = url.searchParams.get(key);
    if (value) filters[key] = value;
  }
  const eventTypes = url.searchParams.get('event_types');
  if (eventTypes) {
    filters.event_types = eventTypes.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return filters;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse();
  if (req.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405);

  const ctx = await getAdminContext(req, { allowedRoles: REPORT_ROLES });
  if (ctx instanceof Response) return ctx;

  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  if (action === 'filter-options') {
    const { data, error } = await ctx.supabaseAdmin.rpc('get_admin_operations_filter_options');
    if (error) {
      console.error('filter-options error:', error);
      return jsonResponse({ error: 'Failed to load filter options' }, 500);
    }
    return jsonResponse(data);
  }

  if (action === 'health') {
    const { data, error } = await ctx.supabaseAdmin.rpc('get_admin_system_health');
    if (error) {
      console.error('health error:', error);
      return jsonResponse({ error: 'Failed to load system health' }, 500);
    }
    return jsonResponse(data);
  }

  if (action === 'daily-summary') {
    const date = url.searchParams.get('date') ?? undefined;
    const { data, error } = await ctx.supabaseAdmin.rpc('get_admin_daily_summary', {
      p_date: date ?? null,
    });
    if (error) {
      console.error('daily-summary error:', error);
      return jsonResponse({ error: 'Failed to load daily summary' }, 500);
    }
    return jsonResponse(data);
  }

  const tab = url.searchParams.get('tab');
  if (!tab) {
    return jsonResponse({ error: 'tab parameter required' }, 400);
  }

  const validTabs = ['registration', 'revenue', 'checkin', 'email', 'activity'];
  if (!validTabs.includes(tab)) {
    return jsonResponse({ error: 'Invalid tab' }, 400);
  }

  const filters = parseFilters(url);
  const { data, error } = await ctx.supabaseAdmin.rpc('get_admin_operations_report', {
    p_report_type: tab,
    p_filters: filters,
  });

  if (error) {
    console.error('get_admin_operations_report error:', error);
    return jsonResponse({ error: 'Failed to load report' }, 500);
  }

  if (data?.error) {
    return jsonResponse({ error: data.error }, 400);
  }

  return jsonResponse(data);
});
