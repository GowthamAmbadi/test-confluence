import { useState } from 'react';
import type { AttendeeProfile, ProfilePermissions } from '../../lib/attendeeProfile';
import { formatINR, formatWhen } from '../../lib/profileFormat';

async function copyText(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function buildAllDetails(profile: AttendeeProfile): string {
  const { snapshot, personal, payment, check_in, communication } = profile;
  const lines = [
    `Name: ${personal.full_name}`,
    `Registration Reference: ${snapshot.registration_reference || '—'}`,
    `Email: ${personal.email}`,
    `Phone: ${personal.phone}`,
    `College: ${personal.college}`,
    `City: ${personal.city || '—'}`,
    `Pass: ${snapshot.purchased_pass}`,
    `Registration Status: ${snapshot.registration_status}`,
    `Payment Status: ${snapshot.payment_status}`,
    `Amount Paid: ${formatINR(Number(payment.amount_paid), payment.currency)}`,
    `Payment Reference: ${payment.razorpay_payment_id || '—'}`,
    `Check-In: ${check_in.checked_in ? 'Yes' : 'No'}`,
    `Registered: ${formatWhen(snapshot.registration_date)}`,
  ];
  if (communication) {
    lines.push(`Email Delivery: ${communication.delivery_status}`);
    lines.push(`Resend Count: ${communication.resend_count}`);
  }
  return lines.join('\n');
}

export function SupportQuickActions({
  profile,
  permissions,
  onResendEmail,
  onAddNote,
  resending,
}: {
  profile: AttendeeProfile;
  permissions: ProfilePermissions;
  onResendEmail: () => void;
  onAddNote: () => void;
  resending: boolean;
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const flashCopied = (key: string) => {
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCopy = async (key: string, text: string) => {
    if (await copyText(text)) flashCopied(key);
  };

  const { snapshot, personal, payment } = profile;

  return (
    <section className="profile-card profile-quick-actions">
      <h3>Quick Actions</h3>
      <div className="quick-actions-grid">
        {permissions.can_resend_email && (
          <button type="button" className="btn btn-small" onClick={onResendEmail} disabled={resending}>
            {resending ? 'Sending…' : 'Resend Confirmation Email'}
          </button>
        )}
        {permissions.can_add_note && (
          <button type="button" className="btn btn-small" onClick={onAddNote}>
            Add Internal Note
          </button>
        )}
        <button
          type="button"
          className="btn btn-small"
          onClick={() => void handleCopy('all', buildAllDetails(profile))}
        >
          {copiedKey === 'all' ? 'Copied!' : 'Copy All Details'}
        </button>
        <button
          type="button"
          className="btn btn-small"
          onClick={() => void handleCopy('ref', snapshot.registration_reference || '')}
          disabled={!snapshot.registration_reference}
        >
          {copiedKey === 'ref' ? 'Copied!' : 'Copy Registration Reference'}
        </button>
        <button
          type="button"
          className="btn btn-small"
          onClick={() => void handleCopy('payment', payment.razorpay_payment_id || '')}
          disabled={!payment.razorpay_payment_id}
        >
          {copiedKey === 'payment' ? 'Copied!' : 'Copy Payment Reference'}
        </button>
        <button type="button" className="btn btn-small" onClick={() => void handleCopy('email', personal.email)}>
          {copiedKey === 'email' ? 'Copied!' : 'Copy Email'}
        </button>
        <button type="button" className="btn btn-small" onClick={() => void handleCopy('phone', personal.phone)}>
          {copiedKey === 'phone' ? 'Copied!' : 'Copy Phone'}
        </button>
        <button type="button" className="btn btn-small btn-disabled" disabled title="Coming soon">
          Manage Tags
        </button>
        <button type="button" className="btn btn-small btn-disabled" disabled title="Coming soon">
          Create Ticket
        </button>
      </div>
    </section>
  );
}
