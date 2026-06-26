import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

/** Destination for generated export files — swap implementations without UI changes. */
export interface ExportDestination {
  readonly id: string;
  upload(params: {
    path: string;
    data: Uint8Array;
    contentType: string;
  }): Promise<{ storagePath: string; signedUrl: string }>;
}

export class SupabaseStorageExportProvider implements ExportDestination {
  readonly id = 'supabase_storage';

  constructor(
    private supabase: SupabaseClient,
    private bucket: string,
    private expiresInSeconds = 86400,
  ) {}

  async upload(params: {
    path: string;
    data: Uint8Array;
    contentType: string;
  }): Promise<{ storagePath: string; signedUrl: string }> {
    const { error: uploadError } = await this.supabase.storage
      .from(this.bucket)
      .upload(params.path, params.data, {
        contentType: params.contentType,
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    const { data: signed, error: signError } = await this.supabase.storage
      .from(this.bucket)
      .createSignedUrl(params.path, this.expiresInSeconds);

    if (signError || !signed?.signedUrl) {
      throw new Error(`Signed URL failed: ${signError?.message ?? 'unknown'}`);
    }

    return { storagePath: params.path, signedUrl: signed.signedUrl };
  }
}

/** Registry — add Google Sheets, S3, email providers here later. */
export function getDefaultExportProvider(supabase: SupabaseClient): ExportDestination {
  return new SupabaseStorageExportProvider(supabase, 'admin-exports');
}
