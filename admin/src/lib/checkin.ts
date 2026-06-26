import type { CheckInStatusKey, PaymentStatusKey } from './registrations';

export type CheckInValidationState = 'ready' | 'payment_pending' | 'already_checked_in' | 'cancelled' | 'refunded' | 'not_eligible' | 'not_found';

export interface CheckInSearchResult {
  registration_id: string;
  full_name: string;
  registration_reference: string | null;
  purchased_pass: string;
  payment_status: PaymentStatusKey;
  registration_status: string;
  check_in_status: CheckInStatusKey;
  registered_date: string;
  can_check_in: boolean;
  block_reason: string | null;
  checked_in_by: string | null;
  checked_in_at: string | null;
}

export interface CheckInPermissions {
  can_check_in: boolean;
}

export interface CheckInSearchResponse {
  results: CheckInSearchResult[];
  permissions: CheckInPermissions;
}

export interface CheckInRecentItem {
  checked_in_at: string;
  attendee_name: string;
  pass: string;
  volunteer_name: string;
}

export interface CheckInStats {
  generated_at: string;
  timezone: string;
  today_check_ins: number;
  total_check_ins: number;
  pending_check_ins: number;
  recent: CheckInRecentItem[];
  permissions: CheckInPermissions;
}

export interface CheckInConfirmation {
  attendee_name: string;
  purchased_pass: string;
  checked_in_at: string;
  checked_in_by: string;
  check_in_ids: string[];
}

export function validationStateForResult(result: CheckInSearchResult): CheckInValidationState {
  if (result.check_in_status === 'checked_in' || result.block_reason === 'Already Checked In') {
    return 'already_checked_in';
  }
  if (result.registration_status === 'CANCELLED') return 'cancelled';
  if (result.registration_status === 'REFUNDED') return 'refunded';
  if (result.registration_status === 'PAYMENT_PENDING' || result.payment_status === 'pending') {
    return 'payment_pending';
  }
  if (result.can_check_in) return 'ready';
  return 'not_eligible';
}

export const VALIDATION_LABELS: Record<CheckInValidationState, string> = {
  ready: 'Ready to Check In',
  payment_pending: 'Payment Pending',
  already_checked_in: 'Already Checked In',
  cancelled: 'Registration Cancelled',
  refunded: 'Registration Refunded',
  not_eligible: 'Not Eligible',
  not_found: 'Registration Not Found',
};
