import type { AdminRole } from './permissions';
import type { AttendeeProfileResponse } from './attendeeProfile';
import { normalizeAttendeeProfile } from './normalizeProfile';
import type { CheckInConfirmation, CheckInSearchResponse, CheckInStats } from './checkin';
import type { DashboardData } from './dashboard';
import type {
  ActivityReport,
  CheckInReport,
  DailySummary,
  EmailReport,
  ExportFormat,
  ExportJob,
  ExportType,
  FilterOptions,
  OperationsFilters,
  RegistrationReport,
  RevenueReport,
  SystemHealthReport,
} from './operations';
import { filtersToQueryParams } from './operations';
import type { PromoCode, PromoCodeFormData, PromoEventOption } from './promoCodes';
import type { RegistrationDetail, RegistrationListResponse, RegistrationQuery, RecentSearch } from './registrations';
import { supabase } from './supabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

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

export type TeamMember = AdminProfile;

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error('Not authenticated');
  }
  return data.session.access_token;
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(`${supabaseUrl}/functions/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || 'Request failed');
  }
  return data as T;
}

export async function fetchDashboard(): Promise<DashboardData> {
  return adminFetch<DashboardData>('admin-dashboard', { method: 'GET' });
}

function toQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export async function searchRegistrations(query: RegistrationQuery): Promise<RegistrationListResponse> {
  const qs = toQueryString({
    q: query.q,
    payment_status: query.payment_status,
    registration_status: query.registration_status,
    check_in_status: query.check_in_status,
    event_id: query.event_id,
    date_preset: query.date_preset,
    date_from: query.date_from,
    date_to: query.date_to,
    sort: query.sort,
    sort_dir: query.sort_dir,
    page: query.page,
    page_size: query.page_size,
  });
  return adminFetch<RegistrationListResponse>(`admin-registrations${qs}`, { method: 'GET' });
}

export async function fetchRegistrationDetail(id: string): Promise<RegistrationDetail> {
  const data = await adminFetch<{ registration: RegistrationDetail }>(
    `admin-registrations?id=${encodeURIComponent(id)}`,
    { method: 'GET' },
  );
  return data.registration;
}

export async function fetchAttendeeProfile(registrationId: string): Promise<AttendeeProfileResponse> {
  const data = await adminFetch<AttendeeProfileResponse>(
    `admin-registration-profile?id=${encodeURIComponent(registrationId)}`,
    { method: 'GET' },
  );
  return {
    ...data,
    profile: normalizeAttendeeProfile(data.profile),
  };
}

export async function addAttendeeNote(
  registrationId: string,
  note: string,
  category = 'General',
): Promise<void> {
  await adminFetch('admin-registration-profile?action=add-note', {
    method: 'POST',
    body: JSON.stringify({ registration_id: registrationId, note, category }),
  });
}

export async function resendAttendeeConfirmationEmail(registrationId: string): Promise<void> {
  await adminFetch('admin-registration-profile?action=resend-email', {
    method: 'POST',
    body: JSON.stringify({ registration_id: registrationId }),
  });
}

export async function searchCheckInAttendees(query: string): Promise<CheckInSearchResponse> {
  const qs = query.trim().length >= 2
    ? `?q=${encodeURIComponent(query.trim())}&limit=8`
    : '?q=&limit=8';
  return adminFetch<CheckInSearchResponse>(`admin-checkin-search${qs}`, { method: 'GET' });
}

export async function fetchCheckInStats(): Promise<CheckInStats> {
  return adminFetch<CheckInStats>('admin-checkin-search?action=stats', { method: 'GET' });
}

export async function performCheckIn(payload: {
  registration_id: string;
  notes?: string;
  device_information?: string;
}): Promise<{ ok: true; confirmation: CheckInConfirmation }> {
  return adminFetch('admin-checkin', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchRecentSearches(): Promise<RecentSearch[]> {
  const data = await adminFetch<{ recent_searches: RecentSearch[] }>(
    'admin-registrations?action=recent-searches',
    { method: 'GET' },
  );
  return data.recent_searches ?? [];
}

export async function recordRecentSearch(searchText: string): Promise<RecentSearch[]> {
  const data = await adminFetch<{ recent_searches: RecentSearch[] }>(
    'admin-registrations?action=recent-search',
    {
      method: 'POST',
      body: JSON.stringify({ search_text: searchText }),
    },
  );
  return data.recent_searches ?? [];
}

export async function fetchAdminMe(): Promise<{ profile: AdminProfile; user: { id: string; email?: string } }> {
  return adminFetch('admin-me', { method: 'GET' });
}

export async function recordAdminLogin(deviceLabel: string): Promise<void> {
  await adminFetch('admin-record-login', {
    method: 'POST',
    body: JSON.stringify({ device_label: deviceLabel }),
  });
}

export async function listTeamMembers(): Promise<TeamMember[]> {
  const data = await adminFetch<{ members: TeamMember[] }>('admin-team', { method: 'GET' });
  return data.members;
}

export async function createTeamMember(payload: {
  full_name: string;
  email: string;
  role: AdminRole;
  password?: string;
}): Promise<{ member: TeamMember; invite_sent: boolean }> {
  return adminFetch('admin-team?action=create', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateTeamMember(payload: {
  id: string;
  full_name?: string;
  role?: AdminRole;
  is_active?: boolean;
}): Promise<{ member: TeamMember }> {
  return adminFetch('admin-team', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function resetTeamMemberPassword(id: string): Promise<{ ok: boolean; email: string }> {
  return adminFetch('admin-team?action=reset-password', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
}

function operationsReportUrl(tab: string, filters: OperationsFilters): string {
  const params = new URLSearchParams();
  params.set('tab', tab);
  for (const [key, value] of Object.entries(filtersToQueryParams(filters))) {
    if (value) params.set(key, value);
  }
  return `admin-reports?${params.toString()}`;
}

export async function fetchOperationsFilterOptions(): Promise<FilterOptions> {
  return adminFetch<FilterOptions>('admin-reports?action=filter-options', { method: 'GET' });
}

export async function fetchRegistrationReport(filters: OperationsFilters): Promise<RegistrationReport> {
  return adminFetch<RegistrationReport>(operationsReportUrl('registration', filters), { method: 'GET' });
}

export async function fetchRevenueReport(filters: OperationsFilters): Promise<RevenueReport> {
  return adminFetch<RevenueReport>(operationsReportUrl('revenue', filters), { method: 'GET' });
}

export async function fetchCheckInReport(filters: OperationsFilters): Promise<CheckInReport> {
  return adminFetch<CheckInReport>(operationsReportUrl('checkin', filters), { method: 'GET' });
}

export async function fetchEmailReport(filters: OperationsFilters): Promise<EmailReport> {
  return adminFetch<EmailReport>(operationsReportUrl('email', filters), { method: 'GET' });
}

export async function fetchActivityReport(filters: OperationsFilters): Promise<ActivityReport> {
  return adminFetch<ActivityReport>(operationsReportUrl('activity', filters), { method: 'GET' });
}

export async function fetchSystemHealth(): Promise<SystemHealthReport> {
  return adminFetch<SystemHealthReport>('admin-reports?action=health', { method: 'GET' });
}

export async function fetchDailySummary(date?: string): Promise<DailySummary> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : '';
  return adminFetch<DailySummary>(`admin-reports?action=daily-summary${qs}`, { method: 'GET' });
}

export async function createExportJob(payload: {
  export_type: ExportType;
  format: ExportFormat;
  filters: OperationsFilters;
  date?: string;
}): Promise<{
  job_id: string;
  status: string;
  sync?: boolean;
  file_name?: string;
  download_url?: string | null;
  row_count?: number;
  estimated_rows?: number;
}> {
  return adminFetch('admin-export', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchExportJob(jobId: string): Promise<ExportJob> {
  return adminFetch<ExportJob>(`admin-export?id=${encodeURIComponent(jobId)}`, { method: 'GET' });
}

export async function listExportJobs(): Promise<ExportJob[]> {
  const data = await adminFetch<{ jobs: ExportJob[] }>('admin-export', { method: 'GET' });
  return data.jobs ?? [];
}

export async function listPromoCodes(): Promise<{ promo_codes: PromoCode[]; events: PromoEventOption[] }> {
  return adminFetch<{ promo_codes: PromoCode[]; events: PromoEventOption[] }>('admin-promo-codes', { method: 'GET' });
}

export async function createPromoCode(payload: PromoCodeFormData): Promise<PromoCode> {
  const data = await adminFetch<{ promo_code: PromoCode }>('admin-promo-codes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.promo_code;
}

export async function updatePromoCode(id: string, payload: Partial<PromoCodeFormData>): Promise<PromoCode> {
  const data = await adminFetch<{ promo_code: PromoCode }>(`admin-promo-codes?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return data.promo_code;
}
