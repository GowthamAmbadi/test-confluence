import {
  ADMIN_ROLES,
  type AdminRole,
  corsPreflightResponse,
  getAdminContext,
  jsonResponse,
  writeStaffAudit,
} from '../_shared/adminAuth.ts';

interface CreateTeamBody {
  full_name: string;
  email: string;
  role: AdminRole;
  password?: string;
}

interface UpdateTeamBody {
  id: string;
  full_name?: string;
  role?: AdminRole;
  is_active?: boolean;
}

interface ResetPasswordBody {
  id: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isValidRole(role: unknown): role is AdminRole {
  return typeof role === 'string' && ADMIN_ROLES.includes(role as AdminRole);
}

function getAdminAppUrl(): string {
  return Deno.env.get('ADMIN_APP_URL')?.trim() || 'http://localhost:5173';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse();
  }

  const ctx = await getAdminContext(req, { allowedRoles: ['SUPER_ADMIN'] });
  if (ctx instanceof Response) return ctx;

  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  if (req.method === 'GET') {
    const { data, error } = await ctx.supabaseAdmin
      .from('admin_profiles')
      .select('id, user_id, full_name, email, role, is_active, last_login_at, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('admin_profiles list error:', error);
      return jsonResponse({ error: 'Failed to load team members' }, 500);
    }

    return jsonResponse({ members: data ?? [] });
  }

  if (req.method === 'POST' && action === 'create') {
    let body: CreateTeamBody;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    if (!isNonEmptyString(body.full_name)) {
      return jsonResponse({ error: 'full_name is required' }, 400);
    }
    if (!isNonEmptyString(body.email)) {
      return jsonResponse({ error: 'email is required' }, 400);
    }
    if (!isValidRole(body.role)) {
      return jsonResponse({ error: 'Invalid role' }, 400);
    }

    const email = body.email.trim().toLowerCase();
    const fullName = body.full_name.trim();

    const { data: existing } = await ctx.supabaseAdmin
      .from('admin_profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      return jsonResponse({ error: 'A staff account with this email already exists' }, 409);
    }

    let authUserId: string;
    let inviteSent = false;

    if (isNonEmptyString(body.password)) {
      const { data: created, error: createError } = await ctx.supabaseAdmin.auth.admin.createUser({
        email,
        password: body.password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

      if (createError || !created.user) {
        console.error('auth.admin.createUser error:', createError);
        return jsonResponse({ error: createError?.message ?? 'Failed to create auth user' }, 400);
      }

      authUserId = created.user.id;
    } else {
      const { data: invited, error: inviteError } = await ctx.supabaseAdmin.auth.admin.inviteUserByEmail(
        email,
        {
          data: { full_name: fullName },
          redirectTo: `${getAdminAppUrl()}/reset-password`,
        },
      );

      if (inviteError || !invited.user) {
        console.error('auth.admin.inviteUserByEmail error:', inviteError);
        return jsonResponse({ error: inviteError?.message ?? 'Failed to invite user' }, 400);
      }

      authUserId = invited.user.id;
      inviteSent = true;
    }

    const { data: profile, error: profileError } = await ctx.supabaseAdmin
      .from('admin_profiles')
      .insert({
        user_id: authUserId,
        full_name: fullName,
        email,
        role: body.role,
        is_active: true,
        created_by: ctx.profile.id,
      })
      .select('id, user_id, full_name, email, role, is_active, last_login_at, created_at, updated_at')
      .single();

    if (profileError || !profile) {
      console.error('admin_profiles insert error:', profileError);
      await ctx.supabaseAdmin.auth.admin.deleteUser(authUserId);
      return jsonResponse({ error: 'Failed to create staff profile' }, 500);
    }

    await writeStaffAudit(ctx.supabaseAdmin, {
      eventType: 'ADMIN_TEAM_CREATED',
      entityType: 'admin_profile',
      entityId: profile.id,
      actorProfileId: ctx.profile.id,
      metadata: { email, role: body.role, invite_sent: inviteSent },
    });

    return jsonResponse({ member: profile, invite_sent: inviteSent }, 201);
  }

  if (req.method === 'POST' && action === 'reset-password') {
    let body: ResetPasswordBody;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    if (!isNonEmptyString(body.id)) {
      return jsonResponse({ error: 'id is required' }, 400);
    }

    const { data: member, error: memberError } = await ctx.supabaseAdmin
      .from('admin_profiles')
      .select('id, user_id, email')
      .eq('id', body.id)
      .single();

    if (memberError || !member) {
      return jsonResponse({ error: 'Team member not found' }, 404);
    }

    const { error: resetError } = await ctx.supabaseAdmin.auth.resetPasswordForEmail(member.email, {
      redirectTo: `${getAdminAppUrl()}/reset-password`,
    });

    if (resetError) {
      console.error('resetPasswordForEmail error:', resetError);
      return jsonResponse({ error: resetError.message }, 400);
    }

    await writeStaffAudit(ctx.supabaseAdmin, {
      eventType: 'ADMIN_PASSWORD_RESET',
      entityType: 'admin_profile',
      entityId: member.id,
      actorProfileId: ctx.profile.id,
      metadata: { email: member.email },
    });

    return jsonResponse({ ok: true, email: member.email });
  }

  if (req.method === 'PATCH') {
    let body: UpdateTeamBody;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    if (!isNonEmptyString(body.id)) {
      return jsonResponse({ error: 'id is required' }, 400);
    }

    if (body.id === ctx.profile.id && body.is_active === false) {
      return jsonResponse({ error: 'You cannot deactivate your own account' }, 400);
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.full_name !== undefined) {
      if (!isNonEmptyString(body.full_name)) {
        return jsonResponse({ error: 'full_name cannot be empty' }, 400);
      }
      updates.full_name = body.full_name.trim();
    }

    if (body.role !== undefined) {
      if (!isValidRole(body.role)) {
        return jsonResponse({ error: 'Invalid role' }, 400);
      }
      if (body.id === ctx.profile.id && body.role !== 'SUPER_ADMIN') {
        return jsonResponse({ error: 'You cannot change your own role' }, 400);
      }
      updates.role = body.role;
    }

    if (body.is_active !== undefined) {
      if (typeof body.is_active !== 'boolean') {
        return jsonResponse({ error: 'is_active must be a boolean' }, 400);
      }
      updates.is_active = body.is_active;
    }

    if (Object.keys(updates).length === 1) {
      return jsonResponse({ error: 'No valid fields to update' }, 400);
    }

    const { data: member, error: fetchError } = await ctx.supabaseAdmin
      .from('admin_profiles')
      .select('id, user_id')
      .eq('id', body.id)
      .single();

    if (fetchError || !member) {
      return jsonResponse({ error: 'Team member not found' }, 404);
    }

    const { data: updated, error: updateError } = await ctx.supabaseAdmin
      .from('admin_profiles')
      .update(updates)
      .eq('id', body.id)
      .select('id, user_id, full_name, email, role, is_active, last_login_at, created_at, updated_at')
      .single();

    if (updateError || !updated) {
      console.error('admin_profiles update error:', updateError);
      return jsonResponse({ error: 'Failed to update team member' }, 500);
    }

    if (body.is_active === false) {
      await ctx.supabaseAdmin.auth.admin.updateUserById(member.user_id, {
        ban_duration: '876000h',
      });
    } else if (body.is_active === true) {
      await ctx.supabaseAdmin.auth.admin.updateUserById(member.user_id, {
        ban_duration: 'none',
      });
    }

    await writeStaffAudit(ctx.supabaseAdmin, {
      eventType: 'ADMIN_TEAM_UPDATED',
      entityType: 'admin_profile',
      entityId: updated.id,
      actorProfileId: ctx.profile.id,
      metadata: updates,
    });

    return jsonResponse({ member: updated });
  }

  return jsonResponse({ error: 'Method not allowed' }, 405);
});
