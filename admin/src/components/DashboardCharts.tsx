import type { CheckInProgress, DayCount, DayPayment, PassCount } from '../lib/dashboard';

function maxCount(items: Array<{ count: number }>): number {
  return Math.max(1, ...items.map((i) => i.count));
}

function BarChart<T extends { date: string; count: number }>({ title, items }: {
  title: string;
  items: T[];
}) {
  const max = Math.max(1, ...items.map((i) => i.count));

  return (
    <section className="dash-chart panel-section">
      <h3>{title}</h3>
      <div className="bar-chart">
        {items.map((item) => {
          const height = Math.round((item.count / max) * 100);
          return (
            <div key={item.date} className="bar-col" title={`${item.date}: ${item.count}`}>
              <div className="bar-fill" style={{ height: `${height}%` }} />
              <span className="bar-label">{item.date.slice(-5)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PassChart({ items }: { items: PassCount[] }) {
  const max = maxCount(items.map((i) => ({ count: i.count })));

  return (
    <section className="dash-chart panel-section">
      <h3>Pass Distribution</h3>
      <ul className="pass-bars">
        {items.map((item) => (
          <li key={item.slug}>
            <span className="pass-name">{item.name}</span>
            <div className="pass-track">
              <div className="pass-fill" style={{ width: `${(item.count / max) * 100}%` }} />
            </div>
            <span className="pass-count">{item.count}</span>
          </li>
        ))}
        {items.length === 0 && <li className="muted">No paid registrations yet.</li>}
      </ul>
    </section>
  );
}

function CheckInChart({ items }: { items: CheckInProgress[] }) {
  return (
    <section className="dash-chart panel-section">
      <h3>Check-In Progress</h3>
      <ul className="pass-bars">
        {items.map((item) => {
          const pct = item.expected > 0 ? Math.round((item.checked_in / item.expected) * 100) : 0;
          return (
            <li key={item.slug}>
              <span className="pass-name">{item.name}</span>
              <div className="pass-track">
                <div className="pass-fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="pass-count">{item.checked_in}/{item.expected}</span>
            </li>
          );
        })}
        {items.length === 0 && <li className="muted">No check-in data yet.</li>}
      </ul>
    </section>
  );
}

export function DashboardCharts({ data }: {
  data: {
    registrations_per_day: DayCount[];
    payments_per_day: DayPayment[];
    pass_distribution: PassCount[];
    check_in_progress: CheckInProgress[];
  };
}) {
  return (
    <div className="dash-charts-grid">
      <BarChart title="Registrations Per Day (30d)" items={data.registrations_per_day} />
      <BarChart title="Payments Per Day (30d)" items={data.payments_per_day} />
      <PassChart items={data.pass_distribution} />
      <CheckInChart items={data.check_in_progress} />
    </div>
  );
}
