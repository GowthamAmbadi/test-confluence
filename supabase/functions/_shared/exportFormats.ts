import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';
import * as XLSX from 'npm:xlsx@0.18.5';

export interface ExportTable {
  columns: string[];
  rows: unknown[][];
}

function escapeCsvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildCsv(table: ExportTable): Uint8Array {
  const lines = [
    table.columns.map(escapeCsvCell).join(','),
    ...table.rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  return new TextEncoder().encode(lines.join('\r\n'));
}

export function buildXlsx(table: ExportTable): Uint8Array {
  const sheetData = [table.columns, ...table.rows];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Export');
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Uint8Array(buffer);
}

function formatInr(value: unknown): string {
  const num = Number(value);
  if (Number.isNaN(num)) return String(value ?? '—');
  return `INR ${num.toLocaleString('en-IN')}`;
}

export async function buildDailySummaryPdf(summary: Record<string, unknown>): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595, 842]);
  let y = 800;

  const draw = (text: string, size = 11, bold = false) => {
    page.drawText(text, {
      x: 50,
      y,
      size,
      font: bold ? fontBold : font,
      color: rgb(0.1, 0.1, 0.18),
    });
    y -= size + 6;
  };

  draw(String(summary.title ?? 'Daily Summary'), 18, true);
  draw(`Date: ${summary.date}`, 12);
  draw(`Generated: ${new Date(String(summary.generated_at)).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, 10);
  y -= 8;

  const regs = summary.registrations as Record<string, number> | undefined;
  draw('Registrations', 14, true);
  draw(`Total: ${regs?.total ?? 0}  |  Complete: ${regs?.payment_complete ?? 0}  |  Pending: ${regs?.payment_pending ?? 0}`);
  y -= 4;

  const rev = summary.revenue as Record<string, number> | undefined;
  draw('Revenue', 14, true);
  draw(`Captured: ${formatInr(rev?.captured)}  |  Expected: ${formatInr(rev?.expected)}  |  Pending: ${rev?.pending_payments ?? 0}`);
  y -= 4;

  const checkins = summary.check_ins as Record<string, unknown> | undefined;
  draw('Check-Ins', 14, true);
  draw(`Total: ${checkins?.total ?? 0}  |  Peak hour: ${checkins?.peak_hour ?? '—'}`);
  y -= 4;

  const email = summary.email as Record<string, number> | undefined;
  draw('Email', 14, true);
  draw(`Sent: ${email?.sent ?? 0}  |  Failed: ${email?.failed ?? 0}  |  Success rate: ${email?.success_rate ?? 0}%`);
  y -= 8;

  draw('Top Volunteers', 14, true);
  const volunteers = (summary.volunteers as Array<Record<string, unknown>>) ?? [];
  if (volunteers.length === 0) {
    draw('No check-ins recorded.');
  } else {
    for (const v of volunteers.slice(0, 8)) {
      draw(`• ${v.name}: ${v.check_ins} check-ins (${v.avg_per_hour}/hr avg)`);
      if (y < 80) break;
    }
  }

  return new Uint8Array(await pdf.save());
}

export function contentTypeForFormat(format: string): string {
  switch (format) {
    case 'csv': return 'text/csv';
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'pdf': return 'application/pdf';
    default: return 'application/octet-stream';
  }
}

export async function buildExportFile(
  format: string,
  exportType: string,
  table: ExportTable,
  dailySummary?: Record<string, unknown>,
): Promise<Uint8Array> {
  if (format === 'pdf') {
    if (exportType === 'daily_summary' && dailySummary) {
      return buildDailySummaryPdf(dailySummary);
    }
    return buildDailySummaryPdf({
      title: 'Confluence 2026 — Export Summary',
      date: new Date().toISOString().slice(0, 10),
      generated_at: new Date().toISOString(),
      registrations: { total: table.rows.length, payment_complete: 0, payment_pending: 0 },
      revenue: { captured: 0, expected: 0, pending_payments: 0 },
      check_ins: { total: 0, peak_hour: '—' },
      email: { sent: 0, failed: 0, success_rate: 100 },
      volunteers: [],
    });
  }
  if (format === 'xlsx') return buildXlsx(table);
  return buildCsv(table);
}
