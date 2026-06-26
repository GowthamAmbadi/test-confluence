import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  fetchActivityReport,
  fetchCheckInReport,
  fetchEmailReport,
  fetchOperationsFilterOptions,
  fetchRegistrationReport,
  fetchRevenueReport,
} from '../lib/api';
import type {
  ActivityReport,
  CheckInReport,
  EmailReport,
  FilterOptions,
  OperationsFilters,
  OperationsTab,
  RegistrationReport,
  RevenueReport,
} from '../lib/operations';
import { OPERATIONS_TABS, filtersFromSearchParams, filtersToQueryParams } from '../lib/operations';
import { ExportCenterTab } from '../components/operations/ExportCenterTab';
import { OperationsFilterBar } from '../components/operations/OperationsFilterBar';
import { SimpleBarChart, SimpleLineBarChart, SimplePieLegend } from '../components/operations/ReportCharts';
import { ReportDataTable } from '../components/operations/ReportDataTable';
import { formatINR, ReportSummaryCards } from '../components/operations/ReportSummaryCards';
import { SystemHealthTab } from '../components/operations/SystemHealthTab';

function RegistrationTab({ data }: { data: RegistrationReport }) {
  const summary = [
    { label: 'Total Registrations', value: data.summary.total_registrations },
    { label: 'Period Registrations', value: data.summary.period_registrations },
    { label: 'Today', value: data.summary.daily_registrations },
  ];

  const tableCols = [
    { key: 'registration_reference', label: 'Ref' },
    { key: 'full_name', label: 'Name' },
    { key: 'college', label: 'College' },
    { key: 'city', label: 'City' },
    ...(data.has_department ? [{ key: 'department', label: 'Department' }] : []),
    ...(data.has_academic_year ? [{ key: 'academic_year', label: 'Academic Year' }] : []),
    { key: 'pass', label: 'Pass' },
    { key: 'status', label: 'Status' },
    { key: 'created_at', label: 'Created' },
  ];

  return (
    <>
      <ReportSummaryCards items={summary} />
      <div className="dash-charts-grid">
        <SimpleLineBarChart title="Daily Registrations" items={data.charts.registrations_per_day} />
        <SimpleBarChart title="By Pass" items={data.charts.by_pass} labelKey="name" valueKey="count" />
        <SimpleBarChart title="By College" items={data.charts.by_college} labelKey="college" valueKey="count" />
        <SimpleBarChart title="By City" items={data.charts.by_city} labelKey="city" valueKey="count" />
        {data.has_department && (
          <SimpleBarChart title="By Department" items={data.charts.by_department} labelKey="department" valueKey="count" />
        )}
        {data.has_academic_year && (
          <SimpleBarChart title="By Academic Year" items={data.charts.by_academic_year} labelKey="academic_year" valueKey="count" />
        )}
      </div>
      <ReportDataTable columns={tableCols} rows={data.table} />
    </>
  );
}

function RevenueTab({ data }: { data: RevenueReport }) {
  const gap = data.summary.expected_revenue - data.summary.captured_revenue;
  const summary = [
    { label: 'Captured Revenue', value: formatINR(data.summary.captured_revenue), hint: 'From captured payments only' },
    { label: 'Expected Revenue', value: formatINR(data.summary.expected_revenue), hint: 'Order totals (created/paid)' },
    { label: 'Gap', value: formatINR(gap) },
    { label: "Today's Revenue", value: formatINR(data.summary.today_revenue) },
    { label: 'Average Order Value', value: formatINR(data.summary.average_order_value) },
    { label: 'Payments Completed', value: data.summary.payments_completed },
    { label: 'Payments Pending', value: data.summary.payments_pending },
    { label: 'Payments Failed', value: data.summary.payments_failed },
  ];

  return (
    <>
      <ReportSummaryCards items={summary} />
      <div className="dash-charts-grid">
        <SimpleLineBarChart
          title="Revenue by Date (count)"
          items={data.charts.revenue_per_day.map((d) => ({ date: d.date, count: Number(d.revenue) }))}
        />
        <SimplePieLegend title="Revenue by Pass" items={data.charts.revenue_by_pass} labelKey="name" valueKey="revenue" />
      </div>
    </>
  );
}

function CheckInTab({ data }: { data: CheckInReport }) {
  const summary = [
    { label: 'Total Checked-In', value: data.summary.total_checked_in },
    { label: 'Pending Check-In', value: data.summary.pending_check_in },
    { label: 'Check-In Rate', value: `${data.summary.check_in_rate}%` },
    { label: 'Peak Hour', value: data.charts.peak_hour },
  ];

  return (
    <>
      <ReportSummaryCards items={summary} />
      <div className="dash-charts-grid">
        <SimpleBarChart title="Hourly Check-In Trend" items={data.charts.hourly_trend} labelKey="hour" valueKey="count" />
        <SimpleBarChart
          title="Volunteer Performance"
          items={data.volunteer_performance.map((v) => ({
            name: `${v.volunteer_name} (${v.avg_check_ins_per_hour}/hr)`,
            count: v.check_ins,
          }))}
          labelKey="name"
          valueKey="count"
        />
      </div>
      <ReportDataTable
        columns={[
          { key: 'checked_in_at', label: 'Time' },
          { key: 'registration_reference', label: 'Ref' },
          { key: 'attendee_name', label: 'Name' },
          { key: 'pass', label: 'Pass' },
          { key: 'volunteer_name', label: 'Volunteer' },
        ]}
        rows={data.table}
      />
    </>
  );
}

function EmailTab({ data }: { data: EmailReport }) {
  const summary = [
    { label: 'Confirmation Emails Sent', value: data.summary.confirmation_sent },
    { label: 'Emails Failed', value: data.summary.emails_failed },
    { label: 'Resend Count', value: data.summary.resend_count },
    { label: 'Email Success Rate', value: `${data.summary.email_success_rate}%` },
  ];

  return (
    <>
      <ReportSummaryCards items={summary} />
      <div className="dash-charts-grid">
        <SimpleLineBarChart
          title="Email Timeline (sent)"
          items={data.charts.email_timeline.map((d) => ({ date: d.date, count: d.sent }))}
        />
      </div>
      <ReportDataTable
        columns={[
          { key: 'registration_reference', label: 'Ref' },
          { key: 'attendee_name', label: 'Name' },
          { key: 'resend_count', label: 'Resends' },
        ]}
        rows={data.top_resent}
      />
    </>
  );
}

function ActivityTab({ data }: { data: ActivityReport }) {
  return (
    <>
      <ReportSummaryCards items={[{ label: 'Total Events', value: data.summary.total_events }]} />
      <div className="ops-activity-groups">
        {data.groups.map((group) => (
          <section key={group.date} className="panel-section ops-activity-day">
            <h3>{group.date}</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Actor</th>
                  <th>Ref</th>
                </tr>
              </thead>
              <tbody>
                {(group.events ?? []).map((ev, idx) => (
                  <tr key={idx}>
                    <td>{new Date(ev.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                    <td>{ev.action}</td>
                    <td>{ev.actor}</td>
                    <td>{ev.registration_reference ?? '—'}</td>
                  </tr>
                ))}
                {(group.events ?? []).length === 0 && (
                  <tr><td colSpan={4} className="muted">No events</td></tr>
                )}
              </tbody>
            </table>
          </section>
        ))}
        {data.groups.length === 0 && <p className="muted">No activity for selected filters.</p>}
      </div>
    </>
  );
}

export function OperationsPage() {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as OperationsTab) || 'registrations';
  const filters = useMemo(() => filtersFromSearchParams(searchParams), [searchParams]);

  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [regData, setRegData] = useState<RegistrationReport | null>(null);
  const [revData, setRevData] = useState<RevenueReport | null>(null);
  const [checkinData, setCheckinData] = useState<CheckInReport | null>(null);
  const [emailData, setEmailData] = useState<EmailReport | null>(null);
  const [activityData, setActivityData] = useState<ActivityReport | null>(null);
  const [activityTypes, setActivityTypes] = useState<string[]>(filters.event_types ?? []);

  const loadPreset = useCallback((preset: OperationsFilters) => {
    const next = new URLSearchParams(searchParams);
    const keys = [
      'date_preset', 'date_from', 'date_to', 'event_id',
      'payment_status', 'registration_status', 'check_in_status',
      'volunteer_id', 'q', 'event_types',
    ];
    for (const key of keys) next.delete(key);
    for (const [key, value] of Object.entries(filtersToQueryParams(preset))) {
      if (value) next.set(key, value);
    }
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const updateFilters = useCallback((patch: Partial<OperationsFilters>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '') next.delete(key);
      else if (Array.isArray(value)) next.set(key, value.join(','));
      else next.set(key, String(value));
    }
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const setTab = (nextTab: OperationsTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', nextTab);
    setSearchParams(next);
  };

  useEffect(() => {
    fetchOperationsFilterOptions().then(setOptions).catch(() => {});
  }, []);

  const loadTab = useCallback(async () => {
    if (tab === 'exports' || tab === 'health') return;
    setLoading(true);
    setError('');
    try {
      const activityFilters = { ...filters, event_types: activityTypes.length ? activityTypes : undefined };
      if (tab === 'registrations') setRegData(await fetchRegistrationReport(filters));
      if (tab === 'revenue') setRevData(await fetchRevenueReport(filters));
      if (tab === 'checkin') setCheckinData(await fetchCheckInReport(filters));
      if (tab === 'email') setEmailData(await fetchEmailReport(filters));
      if (tab === 'activity') setActivityData(await fetchActivityReport(activityFilters));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [tab, filters, activityTypes]);

  useEffect(() => {
    const timer = window.setTimeout(loadTab, 300);
    return () => window.clearTimeout(timer);
  }, [loadTab]);

  const readOnly = profile?.role === 'SUPPORT_DESK';

  return (
    <div className="page-panel ops-page">
      <header className="page-header">
        <p className="page-eyebrow">Module 7</p>
        <h2>Operations & Reports</h2>
        <p className="page-sub">
          Operational visibility, exports, and event reports.
          {readOnly && ' Read-only access.'}
        </p>
      </header>

      <nav className="ops-tabs">
        {OPERATIONS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'ops-tab active' : 'ops-tab'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab !== 'exports' && tab !== 'health' && (
        <OperationsFilterBar
          filters={filters}
          options={options}
          onChange={updateFilters}
          onLoadPreset={loadPreset}
          showVolunteer={tab === 'checkin' || tab === 'activity'}
          showActivityTypes={tab === 'activity'}
          activityTypes={activityTypes}
          onActivityTypesChange={(types) => {
            setActivityTypes(types);
            updateFilters({ event_types: types });
          }}
        />
      )}

      {loading && <p className="ops-loading">Loading report…</p>}
      {error && <p className="banner banner-error">{error}</p>}

      {!loading && tab === 'registrations' && regData && <RegistrationTab data={regData} />}
      {!loading && tab === 'revenue' && revData && <RevenueTab data={revData} />}
      {!loading && tab === 'checkin' && checkinData && <CheckInTab data={checkinData} />}
      {!loading && tab === 'email' && emailData && <EmailTab data={emailData} />}
      {!loading && tab === 'activity' && activityData && <ActivityTab data={activityData} />}
      {tab === 'exports' && <ExportCenterTab filters={filters} />}
      {tab === 'health' && <SystemHealthTab />}
    </div>
  );
}
