export type PaymentStatusKey = 'complete' | 'pending' | 'failed';
export type CheckInStatusKey = 'checked_in' | 'not_checked_in';
export type RegistrationStatusKey = 'PAYMENT_COMPLETE' | 'PAYMENT_PENDING' | 'CANCELLED' | 'REFUNDED';

export interface PassOption {
  id: string;
  name: string;
  slug: string;
}

export interface RegistrationListItem {
  id: string;
  registration_reference: string | null;
  full_name: string;
  email: string;
  phone: string;
  college: string;
  purchased_pass: string;
  amount_paid: number;
  payment_status: PaymentStatusKey;
  registration_status: RegistrationStatusKey;
  check_in_status: CheckInStatusKey;
  created_at: string;
}

export interface RegistrationListResponse {
  items: RegistrationListItem[];
  total: number;
  page: number;
  page_size: number;
  passes: PassOption[];
}

export interface RegistrationDetail {
  id: string;
  registration_reference: string | null;
  full_name: string;
  email: string;
  phone: string;
  college: string;
  status: RegistrationStatusKey;
  created_at: string;
  approved_at: string | null;
  payment_status: PaymentStatusKey;
  check_in_status: CheckInStatusKey;
  amount_paid: number;
  items: Array<{
    id: string;
    event_id: string;
    event_name: string;
    event_slug: string;
    quantity: number;
    unit_price: number;
    line_subtotal: number;
    event_answers: Record<string, unknown>;
  }>;
  orders: Array<{
    id: string;
    razorpay_order_id: string | null;
    total: number;
    amount_paise: number;
    status: string;
    created_at: string;
    paid_at: string | null;
  }>;
  payments: Array<{
    id: string;
    razorpay_payment_id: string;
    amount: number;
    currency: string;
    status: string;
    method: string | null;
    paid_at: string | null;
    created_at: string;
  }>;
  audit_logs: Array<{
    id: string;
    event_type: string;
    created_at: string;
    metadata: Record<string, unknown>;
  }>;
  check_ins: Array<{
    id: string;
    event_name: string;
    checked_in_at: string;
    status: string;
  }>;
}

export interface RecentSearch {
  search_text: string;
  searched_at: string;
}

export interface RegistrationQuery {
  q?: string;
  payment_status?: string;
  registration_status?: string;
  check_in_status?: string;
  event_id?: string;
  date_preset?: string;
  date_from?: string;
  date_to?: string;
  sort?: string;
  sort_dir?: 'asc' | 'desc';
  page?: number;
  page_size?: number;
}
