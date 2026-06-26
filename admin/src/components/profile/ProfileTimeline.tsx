import type { TimelineEntry } from '../../lib/attendeeProfile';

const TIMELINE_ICONS: Record<string, string> = {
  REGISTRATION_CREATED: '✦',
  ORDER_CREATED: '🛒',
  PAYMENT_CAPTURED: '₹',
  PAYMENT_FAILED: '!',
  REGISTRATION_APPROVED: '✓',
  EMAIL_SENT: '✉',
  EMAIL_FAILED: '✉',
  ADMIN_EMAIL_RESENT: '↻',
  REGISTRATION_VIEWED: '👁',
  ADMIN_NOTE_ADDED: '📝',
  CHECKED_IN: '✓',
  REFUND_CREATED: '↩',
};

const TIMELINE_TONES: Record<string, string> = {
  REGISTRATION_CREATED: 'neutral',
  ORDER_CREATED: 'neutral',
  PAYMENT_CAPTURED: 'success',
  PAYMENT_FAILED: 'danger',
  REGISTRATION_APPROVED: 'success',
  EMAIL_SENT: 'info',
  EMAIL_FAILED: 'danger',
  ADMIN_EMAIL_RESENT: 'info',
  REGISTRATION_VIEWED: 'neutral',
  ADMIN_NOTE_ADDED: 'warning',
  CHECKED_IN: 'success',
  REFUND_CREATED: 'warning',
};

function iconForEvent(eventType: string): string {
  return TIMELINE_ICONS[eventType] ?? '•';
}

function toneForEvent(eventType: string): string {
  return TIMELINE_TONES[eventType] ?? 'neutral';
}

function formatWhen(value: string): string {
  return new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

export function ProfileTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return <p className="muted">No activity recorded yet.</p>;
  }

  return (
    <ol className="profile-timeline">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className={`profile-timeline-item profile-timeline-item--${entry.event_type.toLowerCase()} profile-timeline-tone--${toneForEvent(entry.event_type)}`}
        >
          <span className="profile-timeline-icon" aria-hidden="true">
            {iconForEvent(entry.event_type)}
          </span>
          <div className="profile-timeline-content">
            <p className="profile-timeline-action">{entry.action}</p>
            <p className="profile-timeline-meta">
              {formatWhen(entry.timestamp)} · {entry.actor}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
