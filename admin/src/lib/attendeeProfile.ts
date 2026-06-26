import type { CheckInStatusKey, PaymentStatusKey, RegistrationStatusKey } from './registrations';

export type EmailDeliveryStatus = 'delivered' | 'failed' | 'pending' | 'not_applicable' | 'unknown';

export interface CommunicationDetails {
  delivery_status: EmailDeliveryStatus;
  last_email_sent_at: string | null;
  last_resend_at: string | null;
  resend_count: number;
  last_email_failed_at: string | null;
  last_failure_reason: string | null;
}

export interface RegistrationTag {
  tag: string;
  created_by: string;
  created_at: string;
}

export interface SupportExtensions {
  tickets_enabled: boolean;
  escalations_enabled: boolean;
  assignments_enabled: boolean;
  priorities_enabled: boolean;
  tag_management_enabled: boolean;
}

export type NoteCategory = 'General' | 'Payment' | 'Registration' | 'Technical' | 'VIP' | 'Other';

export type FormAnswerType =
  | 'text'
  | 'textarea'
  | 'dropdown'
  | 'radio'
  | 'checkbox'
  | 'multiselect'
  | 'link';

export interface ProfileAlert {
  key: string;
  label: string;
  severity: 'success' | 'warning' | 'danger' | 'info';
}

export interface AttendeeSnapshot {
  full_name: string;
  registration_reference: string | null;
  purchased_pass: string;
  payment_status: PaymentStatusKey;
  check_in_status: CheckInStatusKey;
  registration_status: RegistrationStatusKey;
  amount_paid: number;
  registration_date: string;
  last_updated: string;
}

export interface AttendeePersonal {
  full_name: string;
  email: string;
  phone: string;
  college: string;
  city: string | null;
  state: string | null;
  country: string | null;
  avatar_url: string | null;
}

export interface PurchasedPass {
  registration_item_id: string;
  event_id: string;
  event_name: string;
  pass_name: string;
  quantity: number;
  amount: number;
  registration_status: string;
}

export interface PaymentDetails {
  payment_status: PaymentStatusKey;
  amount_paid: number;
  currency: string;
  payment_date: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  payment_method: string | null;
}

export interface TechnicalDetails {
  registration_uuid: string;
  registration_item_ids: string[];
  order_id: string | null;
  payment_id: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
}

export interface FormAnswer {
  field_key: string;
  label: string;
  type: FormAnswerType;
  section: string | null;
  value: string | boolean | string[] | null;
  display_value: string;
}

export interface RegistrationResponseGroup {
  event_id: string;
  event_name: string;
  event_slug: string;
  answers: FormAnswer[];
}

export interface CheckInDetails {
  checked_in: boolean;
  checked_by: string | null;
  checked_at: string | null;
  notes: string | null;
  events: Array<{
    event_name: string;
    checked_at: string;
    status: string;
    notes: string | null;
  }>;
}

export interface InternalNote {
  id: string;
  note: string;
  category: NoteCategory;
  created_by: string;
  created_at: string;
}

export interface TimelineEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  event_type: string;
  metadata?: Record<string, unknown>;
}

export interface ProfilePermissions {
  can_add_note: boolean;
  can_resend_email: boolean;
}

export interface AttendeeProfile {
  snapshot: AttendeeSnapshot;
  alerts: ProfileAlert[];
  personal: AttendeePersonal;
  purchased_passes: PurchasedPass[];
  payment: PaymentDetails;
  communication: CommunicationDetails;
  tags: RegistrationTag[];
  support_extensions: SupportExtensions;
  technical: TechnicalDetails;
  registration_responses: RegistrationResponseGroup[];
  check_in: CheckInDetails;
  internal_notes: InternalNote[];
  activity_timeline: TimelineEntry[];
}

export interface AttendeeProfileResponse {
  profile: AttendeeProfile;
  permissions: ProfilePermissions;
}
