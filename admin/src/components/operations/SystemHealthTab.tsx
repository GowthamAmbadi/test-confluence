import { useEffect, useState } from 'react';
import { fetchSystemHealth } from '../../lib/api';
import type { SystemHealthReport } from '../../lib/operations';
import { formatWhen } from './ReportSummaryCards';

const STATUS_CLASS: Record<string, string> = {
  healthy: 'health-ok',
  degraded: 'health-warn',
  down: 'health-down',
  unknown: 'health-unknown',
};

export function SystemHealthTab() {
  const [data, setData] = useState<SystemHealthReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await fetchSystemHealth());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load health');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60000);
    return () => window.clearInterval(timer);
  }, []);

  if (loading && !data) return <p>Loading system health…</p>;
  if (error) return <p className="banner banner-error">{error}</p>;
  if (!data) return null;

  return (
    <div className="ops-health-grid">
      <p className="muted">Last checked {formatWhen(data.generated_at)} · auto-refresh every 60s</p>
      {data.components.map((component) => (
        <section key={component.id} className={`ops-health-card ${STATUS_CLASS[component.status] ?? ''}`}>
          <div className="ops-health-header">
            <h3>{component.name}</h3>
            <span className="ops-health-badge">{component.status}</span>
          </div>
          <p>{component.detail}</p>
        </section>
      ))}
      <button type="button" className="btn btn-ghost" onClick={load}>Refresh now</button>
    </div>
  );
}
