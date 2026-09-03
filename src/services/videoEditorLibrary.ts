/**
 * Video Editor library — reads the existing owner-scoped `video_editor_library`
 * RPC and the `get-export-download` edge function. No writes.
 */
import { supabase } from "@/integrations/supabase/client";

export type LibraryExport = {
  id: string;
  project_id: string | null;
  project_name: string | null;
  status: string;
  duration_ms: number | null;
  aspect_ratio: string | null;
  created_at: string | null;
  completed_at: string | null;
  error: string | null;
  downloadable: boolean;
};

export type LibraryProject = {
  id: string;
  name: string | null;
  status: string | null;
  revision: number;
  updated_at: string | null;
  execution_job_id: string | null;
  run_status: string | null;
  is_partial: boolean;
  clip_count: number;
  timeline_count: number;
  media_count: number;
  latest_export: {
    id: string;
    status: string;
    created_at: string | null;
    completed_at: string | null;
    duration_ms: number | null;
    downloadable: boolean;
  } | null;
};

export type VideoEditorLibrary = { projects: LibraryProject[]; exports: LibraryExport[] };

const num = (value: unknown) => Number(value ?? 0) || 0;
const str = (value: unknown) => (typeof value === "string" ? value : null);

function normalizeExport(raw: Record<string, unknown>): LibraryExport {
  return {
    id: String(raw.id ?? ""),
    project_id: str(raw.project_id),
    project_name: str(raw.project_name),
    status: String(raw.status ?? "unknown"),
    duration_ms: raw.duration_ms == null ? null : num(raw.duration_ms),
    aspect_ratio: str(raw.aspect_ratio),
    created_at: str(raw.created_at),
    completed_at: str(raw.completed_at),
    error: str(raw.error),
    downloadable: Boolean(raw.downloadable),
  };
}

export async function fetchVideoEditorLibrary(): Promise<VideoEditorLibrary> {
  const { data, error } = await supabase.rpc("video_editor_library" as never);
  if (error) throw new Error(error.message || "We couldn't load your video editor library.");
  const body = (data ?? {}) as { projects?: Record<string, unknown>[]; exports?: Record<string, unknown>[] };
  return {
    projects: (Array.isArray(body.projects) ? body.projects : []).map((raw) => {
      const latest = (raw.latest_export ?? null) as Record<string, unknown> | null;
      return {
        id: String(raw.id ?? ""),
        name: str(raw.name),
        status: str(raw.status),
        revision: num(raw.revision),
        updated_at: str(raw.updated_at),
        execution_job_id: str(raw.execution_job_id),
        run_status: str(raw.run_status),
        is_partial: Boolean(raw.is_partial),
        clip_count: num(raw.clip_count),
        timeline_count: num(raw.timeline_count),
        media_count: num(raw.media_count),
        latest_export: latest
          ? {
              id: String(latest.id ?? ""),
              status: String(latest.status ?? "unknown"),
              created_at: str(latest.created_at),
              completed_at: str(latest.completed_at),
              duration_ms: latest.duration_ms == null ? null : num(latest.duration_ms),
              downloadable: Boolean(latest.downloadable),
            }
          : null,
      };
    }),
    exports: (Array.isArray(body.exports) ? body.exports : []).map(normalizeExport),
  };
}

export type ExportDownload = { ready: boolean; download_url: string | null };

export async function fetchExportDownload(exportId: string): Promise<ExportDownload> {
  const { data, error } = await supabase.functions.invoke("get-export-download", {
    body: { export_id: exportId },
  });
  if (error) throw new Error(error.message || "We couldn't prepare that download.");
  const body = (data ?? {}) as Record<string, unknown>;
  return {
    ready: Boolean(body.ready),
    download_url: typeof body.download_url === "string" ? body.download_url : null,
  };
}

export const ACTIVE_EXPORT_STATUSES = new Set(["queued", "rendering"]);
