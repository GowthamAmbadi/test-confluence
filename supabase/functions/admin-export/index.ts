import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  corsPreflightResponse,
  getAdminContext,
  jsonResponse,
} from '../_shared/adminAuth.ts';
import { buildExportFile, contentTypeForFormat } from '../_shared/exportFormats.ts';
import { buildExportFileName } from '../_shared/exportFilenames.ts';
import { getDefaultExportProvider } from '../_shared/exportProviders.ts';

const SYNC_ROW_LIMIT = 2000;
const ASYNC_ROW_LIMIT = 50000;

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

interface ExportRequest {
  export_type: string;
  format: string;
  filters?: Record<string, unknown>;
  date?: string;
}

async function updateJob(
  supabase: SupabaseClient,
  jobId: string,
  status: string,
  extra?: { row_count?: number; storage_path?: string; error_message?: string },
) {
  await supabase.rpc('update_admin_export_job', {
    p_job_id: jobId,
    p_status: status,
    p_row_count: extra?.row_count ?? null,
    p_storage_path: extra?.storage_path ?? null,
    p_error_message: extra?.error_message ?? null,
  });
}

async function processExportJob(
  supabase: SupabaseClient,
  jobId: string,
  exportType: string,
  format: string,
  filters: Record<string, unknown>,
  fileName: string,
  profileId: string,
  summaryDate?: string,
) {
  try {
    await updateJob(supabase, jobId, 'running');

    let dailySummary: Record<string, unknown> | undefined;
    if (exportType === 'daily_summary') {
      const { data: summary, error: summaryError } = await supabase.rpc('get_admin_daily_summary', {
        p_date: summaryDate ?? null,
      });
      if (summaryError) throw new Error(summaryError.message);
      dailySummary = summary as Record<string, unknown>;
    }

    let rowCount = 0;
    let table = { columns: [] as string[], rows: [] as unknown[][] };

    if (exportType !== 'daily_summary') {
      const { data: rowData, error: rowError } = await supabase.rpc('get_admin_export_rows', {
        p_export_type: exportType,
        p_filters: filters,
        p_limit: ASYNC_ROW_LIMIT,
      });

      if (rowError) throw new Error(rowError.message);
      if (rowData?.error) throw new Error(String(rowData.error));

      rowCount = Number(rowData.row_count ?? 0);
      if (rowCount > ASYNC_ROW_LIMIT) {
        throw new Error(`Export exceeds ${ASYNC_ROW_LIMIT} rows — narrow your filters`);
      }

      table = {
        columns: (rowData.columns as string[]) ?? [],
        rows: (rowData.rows as unknown[][]) ?? [],
      };
    } else {
      rowCount = 1;
    }

    await updateJob(supabase, jobId, 'generating_file', { row_count: rowCount });

    const fileBytes = await buildExportFile(
      format,
      exportType,
      table,
      dailySummary,
    );

    await updateJob(supabase, jobId, 'uploading');

    const provider = getDefaultExportProvider(supabase);
    const storagePath = `${profileId}/${jobId}/${fileName}`;
    const { signedUrl } = await provider.upload({
      path: storagePath,
      data: fileBytes,
      contentType: contentTypeForFormat(format),
    });

    await updateJob(supabase, jobId, 'ready', {
      row_count: rowCount,
      storage_path: storagePath,
    });

    return { signedUrl, rowCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export failed';
    console.error('processExportJob error:', message);
    await updateJob(supabase, jobId, 'failed', { error_message: message });
    throw err;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse();

  const ctx = await getAdminContext(req, { allowedRoles: ['SUPER_ADMIN'] });
  if (ctx instanceof Response) return ctx;

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const jobId = url.searchParams.get('id');

    if (jobId) {
      const { data, error } = await ctx.supabaseAdmin.rpc('get_admin_export_job', {
        p_job_id: jobId,
        p_requested_by: ctx.profile.id,
      });
      if (error) return jsonResponse({ error: 'Failed to load job' }, 500);
      if (data?.error) return jsonResponse({ error: data.error }, 404);

      let downloadUrl: string | null = null;
      if (data.status === 'ready' && data.storage_path) {
        const { data: signed } = await ctx.supabaseAdmin.storage
          .from('admin-exports')
          .createSignedUrl(data.storage_path, 3600);
        downloadUrl = signed?.signedUrl ?? null;
      }

      return jsonResponse({ ...data, download_url: downloadUrl });
    }

    const { data, error } = await ctx.supabaseAdmin.rpc('list_admin_export_jobs', {
      p_requested_by: ctx.profile.id,
      p_limit: 20,
    });
    if (error) return jsonResponse({ error: 'Failed to list jobs' }, 500);
    return jsonResponse({ jobs: data });
  }

  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  let body: ExportRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const exportType = body.export_type;
  const format = body.format;
  const filters = body.filters ?? {};

  const validTypes = ['registrations', 'payments', 'check_ins', 'notes', 'activity', 'revenue', 'daily_summary'];
  const validFormats = ['csv', 'xlsx', 'pdf'];

  if (!validTypes.includes(exportType) || !validFormats.includes(format)) {
    return jsonResponse({ error: 'Invalid export_type or format' }, 400);
  }

  if (exportType !== 'daily_summary' && format === 'pdf') {
    return jsonResponse({ error: 'PDF is only available for daily summary exports' }, 400);
  }

  const fileName = buildExportFileName(exportType, format, filters);

  const { data: jobId, error: createError } = await ctx.supabaseAdmin.rpc('create_admin_export_job', {
    p_requested_by: ctx.profile.id,
    p_export_type: exportType,
    p_format: format,
    p_filters: filters,
    p_file_name: fileName,
  });

  if (createError || !jobId) {
    console.error('create_admin_export_job error:', createError);
    return jsonResponse({ error: 'Failed to create export job' }, 500);
  }

  const estimateRpc = exportType === 'daily_summary'
    ? { data: { row_count: 1 } }
    : await ctx.supabaseAdmin.rpc('get_admin_export_rows', {
      p_export_type: exportType,
      p_filters: filters,
      p_limit: SYNC_ROW_LIMIT + 1,
    });

  const estimatedRows = Number(estimateRpc.data?.row_count ?? 0);

  if (estimatedRows <= SYNC_ROW_LIMIT) {
    try {
      await processExportJob(
        ctx.supabaseAdmin,
        jobId,
        exportType,
        format,
        filters,
        fileName,
        ctx.profile.id,
        body.date,
      );
      const { data: job } = await ctx.supabaseAdmin.rpc('get_admin_export_job', {
        p_job_id: jobId,
        p_requested_by: ctx.profile.id,
      });
      let downloadUrl: string | null = null;
      if (job?.storage_path) {
        const { data: signed } = await ctx.supabaseAdmin.storage
          .from('admin-exports')
          .createSignedUrl(job.storage_path, 3600);
        downloadUrl = signed?.signedUrl ?? null;
      }
      return jsonResponse({
        job_id: jobId,
        status: 'ready',
        sync: true,
        file_name: fileName,
        download_url: downloadUrl,
        row_count: job?.row_count,
      });
    } catch (err) {
      return jsonResponse({
        job_id: jobId,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Export failed',
      }, 500);
    }
  }

  EdgeRuntime.waitUntil(
    processExportJob(
      ctx.supabaseAdmin,
      jobId,
      exportType,
      format,
      filters,
      fileName,
      ctx.profile.id,
      body.date,
    ),
  );

  return jsonResponse({
    job_id: jobId,
    status: 'queued',
    sync: false,
    file_name: fileName,
    estimated_rows: estimatedRows,
  });
});
