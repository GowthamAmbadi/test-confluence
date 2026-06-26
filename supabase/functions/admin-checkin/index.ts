import {
  corsPreflightResponse,
  getAdminContext,
  jsonResponse,
  type AdminRole,
} from '../_shared/adminAuth.ts';

const CHECKIN_ROLES: AdminRole[] = ['SUPER_ADMIN', 'CHECKIN_STAFF'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse();
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const ctx = await getAdminContext(req, { allowedRoles: CHECKIN_ROLES });
  if (ctx instanceof Response) return ctx;

  let body: {
    registration_id?: string;
    notes?: string;
    device_information?: string;
    // Reserved for future SUPER_ADMIN manual override — not implemented in Module 5.
    override?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  if (body.override === true && ctx.profile.role !== 'SUPER_ADMIN') {
    return jsonResponse({ error: 'Override not permitted' }, 403);
  }

  if (body.override === true) {
    return jsonResponse({
      error: 'Manual override is not available yet',
      code: 'OVERRIDE_NOT_IMPLEMENTED',
    }, 501);
  }

  const registrationId = body.registration_id?.trim();
  if (!registrationId) {
    return jsonResponse({ error: 'registration_id is required' }, 400);
  }

  const { data, error } = await ctx.supabaseAdmin.rpc('perform_admin_checkin', {
    p_registration_id: registrationId,
    p_admin_profile_id: ctx.profile.id,
    p_notes: body.notes ?? null,
    p_device_information: body.device_information ?? null,
  });

  if (error) {
    console.error('perform_admin_checkin error:', error);
    return jsonResponse({ error: 'Check-in failed' }, 500);
  }

  const result = data as {
    ok: boolean;
    code?: string;
    error?: string;
    checked_in_by?: string;
    checked_in_at?: string;
    confirmation?: Record<string, unknown>;
  };

  if (!result.ok) {
    return jsonResponse({
      error: result.error ?? 'Check-in not allowed',
      code: result.code,
      checked_in_by: result.checked_in_by,
      checked_in_at: result.checked_in_at,
    }, 422);
  }

  return jsonResponse({ ok: true, confirmation: result.confirmation });
});
