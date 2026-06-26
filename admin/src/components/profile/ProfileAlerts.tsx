import type { ProfileAlert } from '../../lib/attendeeProfile';

export function ProfileAlerts({ alerts }: { alerts: ProfileAlert[] }) {
  if (alerts.length === 0) return null;

  return (
    <section className="profile-alerts" aria-label="Attendee alerts">
      {alerts.map((alert) => (
        <span key={alert.key} className={`profile-alert profile-alert--${alert.severity}`}>
          {alert.label}
        </span>
      ))}
    </section>
  );
}
