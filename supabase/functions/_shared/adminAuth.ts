import { createClient, type SupabaseClient, type User } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders } from './cors.ts';

export type AdminRole = 'SUPER_ADMIN' | 'CHECKIN_STAFF' | 'SUPPORT_DESK';

export const ADMIN_ROLES: AdminRole[] = ['SUPER_ADMIN', 'CHECKIN_STAFF', 'SUPPORT_DESK'];

export interface AdminProfile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: AdminRole;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminContext {
  supabaseAdmin: SupabaseClient;
  user: User;
  profile: AdminProfile;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function corsPreflightResponse(): Response {
  return new Response('ok', { headers: corsHeaders });
}

export function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim();
}

export function getClientIp(req: Request): string | null {
  return req.headers.get('cf-connecting-ip')
    ?? req.headers.get('x-real-ip')
    ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? null;
}

export async function getAdminContext(
  req: Request,
  options?: { allowedRoles?: AdminRole[] },
): Promise<AdminContext | Response> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  const token = getBearerToken(req);
  if (!token) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);

  if (userError || !userData.user) {
    return jsonResponse({ error: 'Invalid or expired session' }, 401);
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('admin_profiles')
    .select('id, user_id, full_name, email, role, is_active, last_login_at, created_at, updated_at')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return jsonResponse({ error: 'Staff profile not found' }, 403);
  }

  if (!profile.is_active) {
    return jsonResponse({ error: 'Account deactivated' }, 403);
  }

  const adminProfile = profile as AdminProfile;

  if (options?.allowedRoles && !options.allowedRoles.includes(adminProfile.role)) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  return {
    supabaseAdmin,
    user: userData.user,
    profile: adminProfile,
  };
}

export async function writeStaffAudit(
  supabaseAdmin: SupabaseClient,
  params: {
    eventType: string;
    entityType: string;
    entityId: string;
    actorProfileId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabaseAdmin.from('audit_logs').insert({
    event_type: params.eventType,
    entity_type: params.entityType,
    entity_id: params.entityId,
    actor_type: 'admin',
    actor_id: params.actorProfileId,
    metadata: params.metadata ?? {},
  });

  if (error) {
    console.error('writeStaffAudit error:', error);
  }
}
