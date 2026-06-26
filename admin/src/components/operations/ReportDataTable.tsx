export function ReportDataTable({ columns, rows }: {
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, unknown>>;
}) {
  return (
    <section className="panel-section ops-table-wrap">
      <div className="ops-table-scroll">
        <table className="data-table ops-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx}>
                {columns.map((col) => (
                  <td key={col.key}>
                    {col.key.endsWith('_at')
                      ? row[col.key]
                        ? new Date(String(row[col.key])).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
                        : '—'
                      : String(row[col.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="muted">No rows match the current filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length >= 500 && (
        <p className="ops-table-note muted">Showing first 500 rows. Use Export Center for the full dataset.</p>
      )}
    </section>
  );
}
