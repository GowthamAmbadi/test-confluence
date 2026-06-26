export interface DashboardCards {
  total_registrations: number;
  payment_complete: number;
  payment_pending: number;
  checked_in: number;
  pending_check_in: number;
  revenue: number;
  today_registrations: number;
  today_revenue: number;
}

export interface DayCount {
  date: string;
  count: number;
}

export interface DayPayment {
  date: string;
  count: number;
  revenue: number;
}

export interface PassCount {
  name: string;
  slug: string;
  count: number;
}

export interface CheckInProgress {
  name: string;
  slug: string;
  expected: number;
  checked_in: number;
}

export interface RecentRegistration {
  id: string;
  full_name: string;
  email: string;
  status: string;
  registration_reference: string | null;
  created_at: string;
}

export interface RecentPayment {
  id: string;
  amount: number;
  currency: string;
  razorpay_payment_id: string;
  registration_reference: string | null;
  attendee_name: string;
  paid_at: string;
}

export interface RecentCheckIn {
  id: string;
  registration_reference: string | null;
  attendee_name: string;
  event_name: string;
  checked_in_at: string;
}

export interface DashboardData {
  generated_at: string;
  timezone: string;
  cards: DashboardCards;
  charts: {
    registrations_per_day: DayCount[];
    payments_per_day: DayPayment[];
    pass_distribution: PassCount[];
    check_in_progress: CheckInProgress[];
  };
  recent_activity: {
    registrations: RecentRegistration[];
    payments: RecentPayment[];
    check_ins: RecentCheckIn[];
  };
}
