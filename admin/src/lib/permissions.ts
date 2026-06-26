export type AdminRole = 'SUPER_ADMIN' | 'CHECKIN_STAFF' | 'SUPPORT_DESK';

export const ADMIN_ROLES: AdminRole[] = ['SUPER_ADMIN', 'CHECKIN_STAFF', 'SUPPORT_DESK'];

export const ROLE_LABELS: Record<AdminRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  CHECKIN_STAFF: 'Check-in Staff',
  SUPPORT_DESK: 'Support Desk',
};

export const ROUTE_PERMISSIONS = {
  home: ['SUPER_ADMIN', 'CHECKIN_STAFF', 'SUPPORT_DESK'] as AdminRole[],
  checkIn: ['SUPER_ADMIN', 'CHECKIN_STAFF', 'SUPPORT_DESK'] as AdminRole[],
  support: ['SUPER_ADMIN', 'SUPPORT_DESK', 'CHECKIN_STAFF'] as AdminRole[],
  registrations: ['SUPER_ADMIN', 'CHECKIN_STAFF', 'SUPPORT_DESK'] as AdminRole[],
  registrationProfile: ['SUPER_ADMIN', 'CHECKIN_STAFF', 'SUPPORT_DESK'] as AdminRole[],
  team: ['SUPER_ADMIN'] as AdminRole[],
  operations: ['SUPER_ADMIN', 'SUPPORT_DESK'] as AdminRole[],
} as const;

export function canAccessRoute(role: AdminRole, route: keyof typeof ROUTE_PERMISSIONS): boolean {
  return ROUTE_PERMISSIONS[route].includes(role);
}

/**
 * Module 1 permission matrix (foundation for future modules).
 */
export const PERMISSION_MATRIX: Record<string, Record<AdminRole, boolean>> = {
  login: { SUPER_ADMIN: true, CHECKIN_STAFF: true, SUPPORT_DESK: true },
  manage_team: { SUPER_ADMIN: true, CHECKIN_STAFF: false, SUPPORT_DESK: false },
  dashboard: { SUPER_ADMIN: true, CHECKIN_STAFF: false, SUPPORT_DESK: false },
  registrations: { SUPER_ADMIN: true, CHECKIN_STAFF: true, SUPPORT_DESK: true },
  analytics: { SUPER_ADMIN: true, CHECKIN_STAFF: false, SUPPORT_DESK: false },
  check_in: { SUPER_ADMIN: true, CHECKIN_STAFF: true, SUPPORT_DESK: false },
  perform_check_in: { SUPER_ADMIN: true, CHECKIN_STAFF: true, SUPPORT_DESK: false },
  view_check_in: { SUPER_ADMIN: true, CHECKIN_STAFF: true, SUPPORT_DESK: true },
  support_desk: { SUPER_ADMIN: true, CHECKIN_STAFF: false, SUPPORT_DESK: true },
  support_actions: { SUPER_ADMIN: true, CHECKIN_STAFF: false, SUPPORT_DESK: true },
  settings: { SUPER_ADMIN: true, CHECKIN_STAFF: false, SUPPORT_DESK: false },
  search_attendees: { SUPER_ADMIN: true, CHECKIN_STAFF: true, SUPPORT_DESK: true },
  view_attendee_profile: { SUPER_ADMIN: true, CHECKIN_STAFF: true, SUPPORT_DESK: true },
  verify_payments: { SUPER_ADMIN: true, CHECKIN_STAFF: false, SUPPORT_DESK: true },
  resend_email: { SUPER_ADMIN: true, CHECKIN_STAFF: false, SUPPORT_DESK: true },
  internal_notes: { SUPER_ADMIN: true, CHECKIN_STAFF: false, SUPPORT_DESK: true },
  operations: { SUPER_ADMIN: true, CHECKIN_STAFF: false, SUPPORT_DESK: true },
  operations_export: { SUPER_ADMIN: true, CHECKIN_STAFF: false, SUPPORT_DESK: false },
};

export function hasPermission(role: AdminRole, permission: keyof typeof PERMISSION_MATRIX): boolean {
  return PERMISSION_MATRIX[permission][role];
}
