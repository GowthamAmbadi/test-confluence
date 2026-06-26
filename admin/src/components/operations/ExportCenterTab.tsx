import { useCallback, useEffect, useState } from 'react';
import { createExportJob, fetchExportJob, listExportJobs } from '../../lib/api';
import { hasPermission } from '../../lib/permissions';
import type { ExportFormat, ExportJob, ExportType, OperationsFilters } from '../../lib/operations';
import { EXPORT_TYPE_OPTIONS } from '../../lib/operations';
import { useAuth } from '../../context/AuthContext';
import { formatWhen } from './ReportSummaryCards';

const STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  running: 'Running',
  generating_file: 'Generating File…',
  uploading: 'Uploading…',
  ready: 'Download Ready',
  failed: 'Failed',
};

interface Props {
  filters: OperationsFilters;
}

export function ExportCenterTab({ filters }: Props) {
  const { profile } = useAuth();
  const canExport = profile && hasPermission(profile.role, 'operations_export');

  const [exportType, setExportType] = useState<ExportType>('registrations');
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [summaryDate, setSummaryDate] = useState(new Date().toISOString().slice(0, 10));
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  const loadJobs = useCallback(async () => {
    if (!canExport) return;
    try {
      const list = await listExportJobs();
      setJobs(list);
    } catch {
      /* ignore */
    }
  }, [canExport]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    if (!activeJobId) return;
    const timer = window.setInterval(async () => {
      try {
        const job = await fetchExportJob(activeJobId);
        setProgress(STATUS_LABELS[job.status] ?? job.status);
        if (job.status === 'ready' && job.download_url) {
          window.clearInterval(timer);
          setActiveJobId(null);
          loadJobs();
        }
        if (job.status === 'failed') {
          window.clearInterval(timer);
          setError(job.error_message ?? 'Export failed');
          setActiveJobId(null);
          loadJobs();
        }
      } catch {
        /* keep polling */
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [activeJobId, loadJobs]);

  const startExport = async () => {
    if (!canExport) return;
    setError('');
    setProgress('Preparing Report…');
    try {
      const result = await createExportJob({
        export_type: exportType,
        format: exportType === 'daily_summary' ? 'pdf' : format,
        filters: exportType === 'daily_summary'
          ? { date_preset: 'custom', date_from: summaryDate, date_to: summaryDate }
          : filters,
        date: exportType === 'daily_summary' ? summaryDate : undefined,
      });

      if (result.sync && result.download_url) {
        setProgress('Download Ready');
        window.open(result.download_url, '_blank');
        loadJobs();
        return;
      }

      setActiveJobId(result.job_id);
      setProgress(STATUS_LABELS[result.status] ?? 'Queued');
      loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
      setProgress('');
    }
  };

  const startDailySummary = async () => {
    if (!canExport) return;
    setError('');
    setProgress('Preparing Report…');
    try {
      const result = await createExportJob({
        export_type: 'daily_summary',
        format: 'pdf',
        filters: { date_preset: 'custom', date_from: summaryDate, date_to: summaryDate },
        date: summaryDate,
      });
      if (result.sync && result.download_url) {
        setProgress('Download Ready');
        window.open(result.download_url, '_blank');
        loadJobs();
        return;
      }
      setActiveJobId(result.job_id);
      setProgress(STATUS_LABELS[result.status] ?? 'Queued');
      loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
      setProgress('');
    }
  };

  if (!canExport) {
    return (
      <div className="panel-section">
        <p className="muted">Exports are available to Super Admins only. You can view all report tabs in read-only mode.</p>
      </div>
    );
  }

  return (
    <div className="ops-export-center">
      <section className="panel-section">
        <h3>New Export</h3>
        <div className="ops-export-form">
          <label>
            Dataset
            <select value={exportType} onChange={(e) => setExportType(e.target.value as ExportType)}>
              {EXPORT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          {exportType !== 'daily_summary' && (
            <label>
              Format
              <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
                <option value="csv">CSV</option>
                <option value="xlsx">Excel (.xlsx)</option>
              </select>
            </label>
          )}
          {exportType === 'daily_summary' && (
            <label>
              Summary date
              <input type="date" value={summaryDate} onChange={(e) => setSummaryDate(e.target.value)} />
            </label>
          )}
          <button type="button" className="btn btn-primary" onClick={startExport}>
            Generate Export
          </button>
        </div>
        {progress && <p className="ops-export-progress">{progress}</p>}
        {error && <p className="banner banner-error">{error}</p>}
      </section>

      <section className="panel-section">
        <h3>Generate Daily Summary</h3>
        <p className="muted">Management-ready PDF with registrations, revenue, check-ins, volunteers, pending payments, and email stats.</p>
        <div className="ops-export-form">
          <label>
            Date
            <input type="date" value={summaryDate} onChange={(e) => setSummaryDate(e.target.value)} />
          </label>
          <button type="button" className="btn btn-secondary" onClick={startDailySummary}>
            Generate Daily Summary PDF
          </button>
        </div>
      </section>

      <section className="panel-section">
        <h3>Recent Exports</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Type</th>
              <th>Status</th>
              <th>Rows</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>{job.file_name ?? '—'}</td>
                <td>{job.export_type}</td>
                <td>{STATUS_LABELS[job.status] ?? job.status}</td>
                <td>{job.row_count ?? '—'}</td>
                <td>{formatWhen(job.created_at)}</td>
                <td>
                  {job.status === 'ready' && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={async () => {
                        const fresh = await fetchExportJob(job.id);
                        if (fresh.download_url) window.open(fresh.download_url, '_blank');
                      }}
                    >
                      Download
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr><td colSpan={6} className="muted">No exports yet.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
