import {
  ADMIN_ROLES,
  corsPreflightResponse,
  getAdminContext,
  jsonResponse,
  type AdminRole,
} from '../_shared/adminAuth.ts';
import { resendPaymentConfirmationEmailForRegistration } from '../_shared/sendPaymentConfirmationEmail.ts';

const READ_ROLES = ADMIN_ROLES;
const ACTION_ROLES: AdminRole[] = ['SUPER_ADMIN', 'SUPPORT_DESK'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse();
  }

  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const registrationId = url.searchParams.get('id');

  if (req.method === 'GET') {
    const ctx = await getAdminContext(req, { allowedRoles: READ_ROLES });
    if (ctx instanceof Response) return ctx;

    if (!registrationId) {
      return jsonResponse({ error: 'id is required' }, 400);
    }

    const { data, error } = await ctx.supabaseAdmin.rpc('get_admin_attendee_profile', {
      p_registration_id: registrationId,
    });

    if (error) {
      console.error('get_admin_attendee_profile error:', error);
      return jsonResponse({ error: 'Failed to load attendee profile' }, 500);
    }

    if (!data) {
      return jsonResponse({ error: 'Registration not found' }, 404);
    }

    const { error: viewAuditError } = await ctx.supabaseAdmin.from('audit_logs').insert({
      event_type: 'REGISTRATION_VIEWED',
      entity_type: 'registration',
      entity_id: registrationId,
      registration_id: registrationId,
      actor_type: 'admin',
      actor_id: ctx.profile.id,
      metadata: { staff_email: ctx.profile.email },
    });

    if (viewAuditError) {
      console.error('REGISTRATION_VIEWED audit error:', viewAuditError);
    }

    const role = ctx.profile.role;
    const canMutate = ACTION_ROLES.includes(role);

    return jsonResponse({
      profile: data,
      permissions: {
        can_add_note: canMutate,
        can_resend_email: canMutate,
      },
    });
  }

  if (req.method === 'POST' && action === 'add-note') {
    const ctx = await getAdminContext(req, { allowedRoles: ACTION_ROLES });
    if (ctx instanceof Response) return ctx;

    let body: { registration_id?: string; note?: string; category?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const note = body.note?.trim();
    const targetId = body.registration_id ?? registrationId;
    if (!targetId) {
      return jsonResponse({ error: 'registration_id is required' }, 400);
    }
    if (!note) {
      return jsonResponse({ error: 'note is required' }, 400);
    }

    const { data, error } = await ctx.supabaseAdmin.rpc('add_admin_note', {
      p_entity_type: 'registration',
      p_entity_id: targetId,
      p_admin_profile_id: ctx.profile.id,
      p_note: note,
      p_category: body.category?.trim() || 'General',
    });

    if (error) {
      console.error('add_admin_note error:', error);
      return jsonResponse({ error: 'Failed to add note' }, 500);
    }

    return jsonResponse({ ok: true, note: data });
  }

  if (req.method === 'POST' && action === 'resend-email') {
    const ctx = await getAdminContext(req, { allowedRoles: ACTION_ROLES });
    if (ctx instanceof Response) return ctx;

    let body: { registration_id?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const targetId = body.registration_id ?? registrationId;
    if (!targetId) {
      return jsonResponse({ error: 'registration_id is required' }, 400);
    }

    const result = await resendPaymentConfirmationEmailForRegistration(
      ctx.supabaseAdmin,
      targetId,
      ctx.profile.id,
    );

    if (!result.success) {
      return jsonResponse({ error: result.error ?? 'Failed to resend email' }, 422);
    }

    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: 'Method not allowed' }, 405);
});
