export function formatINR(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatWhen(value: string): string {
  return new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

export function ReportSummaryCards({ items }: {
  items: Array<{ label: string; value: string | number; hint?: string }>;
}) {
  return (
    <div className="ops-summary-grid">
      {items.map((item) => (
        <div key={item.label} className="ops-summary-card">
          <span className="ops-summary-label">{item.label}</span>
          <strong className="ops-summary-value">{item.value}</strong>
          {item.hint && <span className="ops-summary-hint">{item.hint}</span>}
        </div>
      ))}
    </div>
  );
}
