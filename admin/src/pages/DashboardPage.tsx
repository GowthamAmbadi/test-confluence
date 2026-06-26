import { useEffect, useState } from 'react';
import { fetchDashboard } from '../lib/api';
import type { DashboardData } from '../lib/dashboard';
import { DashboardCardsGrid } from '../components/DashboardCards';
import { DashboardCharts } from '../components/DashboardCharts';
import { DashboardRecentActivity } from '../components/DashboardRecentActivity';

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const result = await fetchDashboard();
        if (mounted) setData(result);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return <div className="page-panel"><p>Loading dashboard…</p></div>;
  }

  if (error || !data) {
    return <div className="page-panel"><p className="banner banner-error">{error || 'No data'}</p></div>;
  }

  return (
    <div className="page-panel">
      <header className="page-header">
        <p className="page-eyebrow">Event Operations</p>
        <h2>Dashboard</h2>
        <p className="page-sub">
          Updated {new Date(data.generated_at).toLocaleString('en-IN', { timeZone: data.timezone })}
        </p>
      </header>

      <DashboardCardsGrid cards={data.cards} />
      <DashboardCharts data={data.charts} />
      <DashboardRecentActivity data={data.recent_activity} />
    </div>
  );
}
