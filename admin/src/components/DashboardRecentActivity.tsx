import type { RecentCheckIn, RecentPayment, RecentRegistration } from '../lib/dashboard';

function formatWhen(value: string): string {
  return new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function formatINR(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function DashboardRecentActivity({ data }: {
  data: {
    registrations: RecentRegistration[];
    payments: RecentPayment[];
    check_ins: RecentCheckIn[];
  };
}) {
  return (
    <div className="dash-recent-grid">
      <section className="panel-section">
        <h3>Latest Registrations</h3>
        <ul className="activity-list">
          {data.registrations.map((row) => (
            <li key={row.id}>
              <strong>{row.full_name}</strong>
              <span>{row.status}</span>
              <small>{formatWhen(row.created_at)}</small>
            </li>
          ))}
          {data.registrations.length === 0 && <li className="muted">No registrations.</li>}
        </ul>
      </section>

      <section className="panel-section">
        <h3>Latest Payments</h3>
        <ul className="activity-list">
          {data.payments.map((row) => (
            <li key={row.id}>
              <strong>{row.attendee_name}</strong>
              <span>{formatINR(Number(row.amount))}</span>
              <small>{row.paid_at ? formatWhen(row.paid_at) : '—'}</small>
            </li>
          ))}
          {data.payments.length === 0 && <li className="muted">No payments.</li>}
        </ul>
      </section>

      <section className="panel-section">
        <h3>Latest Check-Ins</h3>
        <ul className="activity-list">
          {data.check_ins.map((row) => (
            <li key={row.id}>
              <strong>{row.attendee_name}</strong>
              <span>{row.event_name}</span>
              <small>{formatWhen(row.checked_in_at)}</small>
            </li>
          ))}
          {data.check_ins.length === 0 && <li className="muted">No check-ins yet.</li>}
        </ul>
      </section>
    </div>
  );
}
