function maxVal(items: Array<{ count?: number; revenue?: number }>, key: 'count' | 'revenue'): number {
  return Math.max(1, ...items.map((i) => Number(i[key] ?? 0)));
}

export function SimpleBarChart({ title, items, labelKey, valueKey }: {
  title: string;
  items: Array<Record<string, string | number>>;
  labelKey: string;
  valueKey: string;
}) {
  const max = Math.max(1, ...items.map((i) => Number(i[valueKey] ?? 0)));

  return (
    <section className="dash-chart panel-section">
      <h3>{title}</h3>
      <ul className="pass-bars">
        {items.map((item) => (
          <li key={String(item[labelKey])}>
            <span className="pass-name">{String(item[labelKey])}</span>
            <div className="pass-track">
              <div
                className="pass-fill"
                style={{ width: `${(Number(item[valueKey]) / max) * 100}%` }}
              />
            </div>
            <span className="pass-count">{String(item[valueKey])}</span>
          </li>
        ))}
        {items.length === 0 && <li className="muted">No data for selected filters.</li>}
      </ul>
    </section>
  );
}

export function SimpleLineBarChart({ title, items }: {
  title: string;
  items: Array<{ date: string; count: number }>;
}) {
  const max = maxVal(items, 'count');

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

export function SimplePieLegend({ title, items, labelKey, valueKey }: {
  title: string;
  items: Array<Record<string, string | number>>;
  labelKey: string;
  valueKey: string;
}) {
  const total = items.reduce((sum, i) => sum + Number(i[valueKey] ?? 0), 0) || 1;
  const colors = ['#1a1a2e', '#b8860b', '#5c5c78', '#1f7a4d', '#b42318', '#4a6fa5'];

  return (
    <section className="dash-chart panel-section">
      <h3>{title}</h3>
      <ul className="ops-pie-legend">
        {items.map((item, idx) => {
          const value = Number(item[valueKey] ?? 0);
          const pct = Math.round((value / total) * 100);
          return (
            <li key={String(item[labelKey])}>
              <span className="ops-pie-swatch" style={{ background: colors[idx % colors.length] }} />
              <span className="pass-name">{String(item[labelKey])}</span>
              <span className="pass-count">{pct}% ({value})</span>
            </li>
          );
        })}
        {items.length === 0 && <li className="muted">No data for selected filters.</li>}
      </ul>
    </section>
  );
}
