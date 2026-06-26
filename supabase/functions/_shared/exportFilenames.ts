const EXPORT_TYPE_LABELS: Record<string, string> = {
  registrations: 'registrations',
  payments: 'payments',
  check_ins: 'check-ins',
  notes: 'support-notes',
  activity: 'activity-logs',
  revenue: 'revenue',
  daily_summary: 'daily-summary',
};

function presetLabel(filters: Record<string, unknown>): string {
  const preset = String(filters.date_preset ?? 'all');
  if (preset === 'custom' && filters.date_from && filters.date_to) {
    return `${filters.date_from}_to_${filters.date_to}`;
  }
  return preset.replace(/_/g, '-');
}

export function buildExportFileName(
  exportType: string,
  format: string,
  filters: Record<string, unknown>,
): string {
  const today = new Date().toISOString().slice(0, 10);
  const typeLabel = EXPORT_TYPE_LABELS[exportType] ?? exportType;
  const range = presetLabel(filters);
  return `confluence-2026-${typeLabel}-${today}-${range}.${format}`;
}
