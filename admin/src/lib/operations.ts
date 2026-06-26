export type OperationsTab =
  | 'registrations'
  | 'revenue'
  | 'checkin'
  | 'email'
  | 'activity'
  | 'exports'
  | 'health';

export type DatePreset = 'today' | 'yesterday' | 'last_7' | 'last_30' | 'custom';

export interface OperationsFilters {
  date_preset?: DatePreset;
  date_from?: string;
  date_to?: string;
  event_id?: string;
  payment_status?: string;
  registration_status?: string;
  check_in_status?: string;
  volunteer_id?: string;
  q?: string;
  event_types?: string[];
}

export interface FilterOptions {
  events: Array<{ id: string; name: string; slug: string }>;
  volunteers: Array<{ id: string; full_name: string; role: string }>;
}

export interface RegistrationReport {
  summary: {
    total_registrations: number;
    period_registrations: number;
    daily_registrations: number;
  };
  charts: {
    registrations_per_day: Array<{ date: string; count: number }>;
    by_pass: Array<{ name: string; count: number }>;
    by_college: Array<{ college: string; count: number }>;
    by_city: Array<{ city: string; count: number }>;
    by_department: Array<{ department: string; count: number }>;
    by_academic_year: Array<{ academic_year: string; count: number }>;
  };
  has_department: boolean;
  has_academic_year: boolean;
  table: Array<Record<string, unknown>>;
  generated_at: string;
}

export interface RevenueReport {
  summary: {
    captured_revenue: number;
    expected_revenue: number;
    today_revenue: number;
    average_order_value: number;
    payments_completed: number;
    payments_pending: number;
    payments_failed: number;
  };
  charts: {
    revenue_per_day: Array<{ date: string; revenue: number; count: number }>;
    revenue_by_pass: Array<{ name: string; revenue: number; count: number }>;
    payment_method: { enabled: boolean; items: unknown[] };
  };
  generated_at: string;
}

export interface CheckInReport {
  summary: {
    total_checked_in: number;
    pending_check_in: number;
    check_in_rate: number;
  };
  charts: {
    hourly_trend: Array<{ hour: string; count: number }>;
    peak_hour: string;
  };
  volunteer_performance: Array<{
    volunteer_name: string;
    check_ins: number;
    avg_check_ins_per_hour: number;
  }>;
  table: Array<Record<string, unknown>>;
  generated_at: string;
}

export interface EmailReport {
  summary: {
    confirmation_sent: number;
    emails_failed: number;
    resend_count: number;
    email_success_rate: number;
  };
  charts: {
    email_timeline: Array<{ date: string; sent: number; failed: number; resent: number }>;
  };
  top_resent: Array<{
    registration_reference: string;
    attendee_name: string;
    resend_count: number;
  }>;
  generated_at: string;
}

export interface ActivityReport {
  summary: { total_events: number };
  groups: Array<{
    date: string;
    events: Array<{
      timestamp: string;
      event_type: string;
      action: string;
      actor: string;
      registration_reference: string | null;
      metadata: Record<string, unknown>;
    }>;
  }>;
  generated_at: string;
}

export interface SystemHealthReport {
  generated_at: string;
  components: Array<{
    id: string;
    name: string;
    status: 'healthy' | 'degraded' | 'down' | 'unknown';
    detail: string;
  }>;
}

export type ExportType =
  | 'registrations'
  | 'payments'
  | 'check_ins'
  | 'notes'
  | 'activity'
  | 'revenue'
  | 'daily_summary';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

export type ExportJobStatus =
  | 'queued'
  | 'running'
  | 'generating_file'
  | 'uploading'
  | 'ready'
  | 'failed';

export interface ExportJob {
  id: string;
  export_type: ExportType;
  format: ExportFormat;
  status: ExportJobStatus;
  row_count: number | null;
  file_name: string | null;
  download_url?: string | null;
  error_message?: string | null;
  created_at: string;
  completed_at: string | null;
  expires_at: string | null;
}

export interface DailySummary {
  date: string;
  title: string;
  registrations: { total: number; payment_complete: number; payment_pending: number };
  revenue: { captured: number; expected: number; pending_payments: number };
  check_ins: { total: number; peak_hour: string };
  volunteers: Array<{ name: string; check_ins: number; avg_per_hour: number }>;
  email: { sent: number; failed: number; success_rate: number };
  generated_at: string;
}

export const OPERATIONS_TABS: Array<{ id: OperationsTab; label: string }> = [
  { id: 'registrations', label: 'Registration Reports' },
  { id: 'revenue', label: 'Revenue Reports' },
  { id: 'checkin', label: 'Check-In Reports' },
  { id: 'email', label: 'Email Reports' },
  { id: 'activity', label: 'Activity Reports' },
  { id: 'exports', label: 'Export Center' },
  { id: 'health', label: 'System Health' },
];

export const ACTIVITY_EVENT_TYPES = [
  'REGISTRATION_CREATED',
  'PAYMENT_CAPTURED',
  'EMAIL_SENT',
  'EMAIL_FAILED',
  'ADMIN_NOTE_ADDED',
  'CHECKED_IN',
  'ADMIN_LOGIN',
  'ADMIN_PASSWORD_RESET',
  'ADMIN_EMAIL_RESENT',
  'REGISTRATION_VIEWED',
] as const;

export const EXPORT_TYPE_OPTIONS: Array<{ value: ExportType; label: string }> = [
  { value: 'registrations', label: 'Registrations' },
  { value: 'payments', label: 'Payments' },
  { value: 'check_ins', label: 'Check-Ins' },
  { value: 'notes', label: 'Support Notes' },
  { value: 'activity', label: 'Activity Logs' },
  { value: 'revenue', label: 'Revenue (Payments)' },
  { value: 'daily_summary', label: 'Daily Summary (PDF)' },
];

export function filtersToQueryParams(filters: OperationsFilters): Record<string, string | undefined> {
  return {
    date_preset: filters.date_preset,
    date_from: filters.date_from,
    date_to: filters.date_to,
    event_id: filters.event_id,
    payment_status: filters.payment_status,
    registration_status: filters.registration_status,
    check_in_status: filters.check_in_status,
    volunteer_id: filters.volunteer_id,
    q: filters.q,
    event_types: filters.event_types?.length ? filters.event_types.join(',') : undefined,
  };
}

export function filtersFromSearchParams(params: URLSearchParams): OperationsFilters {
  const eventTypes = params.get('event_types');
  return {
    date_preset: (params.get('date_preset') as DatePreset) || 'last_7',
    date_from: params.get('date_from') || undefined,
    date_to: params.get('date_to') || undefined,
    event_id: params.get('event_id') || undefined,
    payment_status: params.get('payment_status') || undefined,
    registration_status: params.get('registration_status') || undefined,
    check_in_status: params.get('check_in_status') || undefined,
    volunteer_id: params.get('volunteer_id') || undefined,
    q: params.get('q') || undefined,
    event_types: eventTypes ? eventTypes.split(',').filter(Boolean) : undefined,
  };
}
