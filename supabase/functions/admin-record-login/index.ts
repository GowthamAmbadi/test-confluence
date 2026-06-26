import {
  corsPreflightResponse,
  getAdminContext,
  getClientIp,
  jsonResponse,
} from '../_shared/adminAuth.ts';

interface RecordLoginBody {
  device_label?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse();
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const ctx = await getAdminContext(req);
  if (ctx instanceof Response) return ctx;

  let body: RecordLoginBody = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const ipAddress = getClientIp(req);
  const userAgent = req.headers.get('user-agent');
  const now = new Date().toISOString();

  const { error: auditError } = await ctx.supabaseAdmin.from('admin_login_audit').insert({
    admin_profile_id: ctx.profile.id,
    user_id: ctx.user.id,
    ip_address: ipAddress,
    user_agent: userAgent,
    device_label: body.device_label ?? null,
    login_at: now,
    metadata: {},
  });

  if (auditError) {
    console.error('admin_login_audit insert error:', auditError);
    return jsonResponse({ error: 'Failed to record login audit' }, 500);
  }

  const { error: profileError } = await ctx.supabaseAdmin
    .from('admin_profiles')
    .update({ last_login_at: now, updated_at: now })
    .eq('id', ctx.profile.id);

  if (profileError) {
    console.error('admin_profiles last_login_at update error:', profileError);
  }

  await ctx.supabaseAdmin.from('audit_logs').insert({
    event_type: 'ADMIN_LOGIN',
    entity_type: 'admin_login',
    entity_id: ctx.profile.id,
    actor_type: 'admin',
    actor_id: ctx.profile.id,
    metadata: {
      ip_address: ipAddress,
      user_agent: userAgent,
      device_label: body.device_label ?? null,
    },
  });

  return jsonResponse({ ok: true, recorded_at: now });
});
