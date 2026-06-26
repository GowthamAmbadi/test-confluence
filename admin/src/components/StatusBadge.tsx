import type { CheckInStatusKey, PaymentStatusKey, RegistrationStatusKey } from '../lib/registrations';

const PAYMENT_LABELS: Record<PaymentStatusKey, string> = {
  complete: 'Payment Complete',
  pending: 'Payment Pending',
  failed: 'Payment Failed',
};

const CHECKIN_LABELS: Record<CheckInStatusKey, string> = {
  checked_in: 'Checked In',
  not_checked_in: 'Not Checked In',
};

const REGISTRATION_LABELS: Record<RegistrationStatusKey, string> = {
  PAYMENT_COMPLETE: 'Registration Complete',
  PAYMENT_PENDING: 'Registration Pending',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

export function PaymentStatusBadge({ status }: { status: PaymentStatusKey }) {
  return <span className={`badge badge-payment-${status}`}>{PAYMENT_LABELS[status]}</span>;
}

export function CheckInStatusBadge({ status }: { status: CheckInStatusKey }) {
  return <span className={`badge badge-checkin-${status}`}>{CHECKIN_LABELS[status]}</span>;
}

export function RegistrationStatusBadge({ status }: { status: RegistrationStatusKey | string }) {
  const key = status as RegistrationStatusKey;
  const label = REGISTRATION_LABELS[key] ?? status.replaceAll('_', ' ');
  const classKey = key in REGISTRATION_LABELS ? key.toLowerCase() : 'unknown';
  return <span className={`badge badge-registration-${classKey}`}>{label}</span>;
}
