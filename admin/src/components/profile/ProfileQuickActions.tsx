import { useState } from 'react';
import type { ProfilePermissions } from '../../lib/attendeeProfile';

export function ProfileQuickActions({
  permissions,
  registrationReference,
  onResendEmail,
  onAddNote,
  resending,
}: {
  permissions: ProfilePermissions;
  registrationReference: string | null;
  onResendEmail: () => void;
  onAddNote: () => void;
  resending: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copyReference = async () => {
    const text = registrationReference ?? '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

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
          onClick={copyReference}
          disabled={!registrationReference}
        >
          {copied ? 'Copied!' : 'Copy Registration Reference'}
        </button>
        <button type="button" className="btn btn-small btn-disabled" disabled title="Module 5">
          Check In
        </button>
        <button type="button" className="btn btn-small btn-disabled" disabled title="Coming soon">
          Print Badge
        </button>
        <button type="button" className="btn btn-small btn-disabled" disabled title="Coming soon">
          Generate Certificate
        </button>
      </div>
    </section>
  );
}
