/**
 * FUSE Campaign Editor — thin client over the existing edit edge functions.
 * Signed playback urls are NEVER persisted; they are re-fetched on demand.
 */
import { supabase } from "@/integrations/supabase/client";
import { looseTable } from "@/services/looseTable";
import { normalizeAdjustments, timelineDurationMs, type Adjustments } from "@/services/editorAdjustments";
import { normalizeTextLayers, type TextLayer } from "@/services/editorText";
import { normalizeMusic, type MusicTrack } from "@/services/editorMusic";
import {
  normalizeExportSettings,
  type ExportSettings,
} from "@/services/exportSettings";

export type { TextLayer } from "@/services/editorText";
export type { MusicTrack } from "@/services/editorMusic";

export type EditProject = {
  id: string;
  name: string | null;
  aspect_ratio: string | null;
  status: string | null;
  revision: number;
  export_settings: ExportSettings;
  /** Overlay text layers — persisted verbatim (text phase). */
  text_layers: TextLayer[];
  /** Music track reference + settings (music phase). */
  music: MusicTrack | null;
};

export type EditSegment = {
  id: string;
  source_path: string;
  source_label: string | null;
  source_duration_ms: number;
  position: number;
  trim_start_ms: number;
  trim_end_ms: number;
  volume: number;
  muted: boolean;
  removed: boolean;
  /** False = attached media that is NOT on the active timeline (Available Media). */
  on_timeline: boolean;
  /** Short-lived signed playback url (expires ~1h). */
  url: string | null;
  /** Non-destructive per-clip adjustments (framing / color / grain / motion / audio). */
  adjustments: Adjustments;
};

export type EditorState = { project: EditProject; segments: EditSegment[] };

export type EditOp =
  | { op: "reorder"; payload: { order: string[] } }
  | { op: "trim"; payload: { segment_id: string; trim_start_ms: number; trim_end_ms: number } }
  | { op: "mute"; payload: { segment_id: string; muted: boolean } }
  | { op: "volume"; payload: { segment_id: string; volume: number } }
  | { op: "remove"; payload: { segment_id: string } }
  | { op: "restore"; payload: { segment_id: string } }
  | { op: "duplicate"; payload: { segment_id: string } }
  | { op: "add_to_timeline"; payload: { segment_id: string } }
  | {
      op: "adjust";
      payload: { segment_id: string; adjustments: Record<string, unknown>; scope: "clip" | "all" };
    }
  | { op: "reset_adjust"; payload: { segment_id?: string; scope: "clip" | "all" } }
  | {
      /**
       * Self-healing duration correction: the client measured the real media
       * length from video metadata. Ignored silently if unsupported server-side.
       */
      op: "set_source_duration";
      payload: { segment_id: string; source_duration_ms: number };
    }
  | {
      op: "set_meta";
      payload: {
        /** Campaign name — drives the export filename and folder. */
        name?: string;
        export_settings?: ExportSettings;
        text_layers?: TextLayer[];
        music?: MusicTrack | null;
      };
    };


export type UpdateResult = {
  status: "ok" | "conflict" | "forbidden" | "not_found" | "error";
  project?: EditProject;
  segments?: EditSegment[];
  error?: string;
};

function normalizeSegment(raw: Record<string, unknown>): EditSegment {
  const duration = Number(raw.source_duration_ms ?? 0) || 0;
  const trimStart = Math.max(0, Number(raw.trim_start_ms ?? 0) || 0);
  const rawEnd = Number(raw.trim_end_ms ?? duration);
  const trimEnd = Math.min(duration || rawEnd, rawEnd > trimStart ? rawEnd : duration);
  return {
    id: String(raw.id),
    source_path: String(raw.source_path ?? ""),
    source_label: (raw.source_label as string | null) ?? null,
    source_duration_ms: duration,
    position: Number(raw.position ?? 0) || 0,
    trim_start_ms: trimStart,
    trim_end_ms: trimEnd,
    volume: typeof raw.volume === "number" ? raw.volume : Number(raw.volume ?? 1) || 1,
    muted: Boolean(raw.muted),
    removed: Boolean(raw.removed),
    on_timeline: raw.on_timeline === undefined || raw.on_timeline === null ? true : Boolean(raw.on_timeline),
    url: typeof raw.url === "string" ? raw.url : null,
    adjustments: normalizeAdjustments(raw.adjustments),
  };
}

function normalizeState(data: unknown): EditorState {
  const payload = (data ?? {}) as { project?: Record<string, unknown>; segments?: Record<string, unknown>[] };
  const project = payload.project ?? {};
  return {
    project: {
      id: String(project.id ?? ""),
      name: (project.name as string | null) ?? null,
      aspect_ratio: (project.aspect_ratio as string | null) ?? null,
      status: (project.status as string | null) ?? null,
      revision: Number(project.revision ?? 0) || 0,
      export_settings: normalizeExportSettings(
        project.export_settings,
        (project.aspect_ratio as string | null) ?? null,
      ),
      text_layers: normalizeTextLayers(project.text_layers),
      music: normalizeMusic(project.music),
    },
    segments: (payload.segments ?? []).map(normalizeSegment).sort((a, b) => a.position - b.position),
  };
}

/** Load (or refresh) the editor state, including fresh signed urls. */
export async function loadEditorState(projectId: string): Promise<EditorState> {
  const { data, error } = await supabase.functions.invoke("sign-edit-media", {
    body: { project_id: projectId },
  });
  if (error) throw new Error(error.message || "Could not load this campaign edit.");
  const state = normalizeState(data);
  if (!state.project.id) throw new Error("This campaign edit could not be found.");
  return state;
}

/** Apply one edit op with optimistic-concurrency guard. */
export async function applyEditOp(
  projectId: string,
  expectedRevision: number,
  op: EditOp,
): Promise<UpdateResult> {
  const { data, error } = await supabase.functions.invoke("edit-project-update", {
    body: { project_id: projectId, expected_revision: expectedRevision, ...op },
  });

  // A 409 conflict still carries the newest state in the response body.
  const body = (data ?? (error as unknown as { context?: { body?: unknown } })?.context?.body ?? null) as
    | Record<string, unknown>
    | null;

  if (!body) {
    return { status: "error", error: error?.message || "Could not save that change." };
  }

  const status = String(body.status ?? "error") as UpdateResult["status"];
  const state = normalizeState(body);
  return {
    status,
    project: state.project.id ? state.project : undefined,
    segments: body.segments ? state.segments : undefined,
    error: typeof body.error === "string" ? body.error : undefined,
  };
}

/**
 * Persist a measured clip length outside the edit queue: best-effort, never
 * surfaces an error to the user and never blocks an edit.
 */
export async function persistSourceDuration(
  projectId: string,
  expectedRevision: number,
  segmentId: string,
  sourceDurationMs: number,
): Promise<number | null> {
  try {
    const result = await applyEditOp(projectId, expectedRevision, {
      op: "set_source_duration",
      payload: { segment_id: segmentId, source_duration_ms: Math.round(sourceDurationMs) },
    });
    return result.status === "ok" && result.project ? result.project.revision : null;
  } catch {
    return null;
  }
}

export type ExportResult = {
  status: string;
  export?: { id: string; status: string; duration_ms?: number; aspect_ratio?: string; output_path?: string | null };
  render_pipeline?: "connecting" | "connected";
};

export async function exportCampaign(
  projectId: string,
  settings: { aspect_ratio: string; width: number; height: number },
): Promise<ExportResult> {
  const { data, error } = await supabase.functions.invoke("export-campaign", {
    body: { project_id: projectId, settings },
  });
  if (error) throw new Error(error.message || "Could not start the export.");
  return (data ?? { status: "queued" }) as ExportResult;
}

export type EditProjectSummary = {
  id: string;
  status: string | null;
  revision: number;
  segmentCount: number;
};

/**
 * Result-page lookup: does this finished run have an edit project?
 * Reads the owner's own row directly (RLS scoped). Never throws.
 */
export async function findEditProjectForRun(executionJobId: string): Promise<EditProjectSummary | null> {
  try {
    const { data, error } = await looseTable("campaign_edit_projects")
      .select("id,status,revision")
      .eq("execution_job_id", executionJobId)
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const id = String(data.id ?? "");
    if (!id) return null;

    let segmentCount = 0;
    try {
      const { data: segs } = await looseTable("campaign_edit_segments")
        .select("id,removed")
        .eq("project_id", id);
      segmentCount = Array.isArray(segs)
        ? (segs as { removed?: boolean }[]).filter((s) => !s.removed).length
        : 0;
    } catch {
      segmentCount = 0;
    }

    return {
      id,
      status: (data.status as string | null) ?? null,
      revision: Number(data.revision ?? 0) || 0,
      segmentCount,
    };
  } catch {
    return null;
  }
}

/* ------------------------------ helpers ------------------------------ */

export const activeSegments = (segments: EditSegment[]) =>
  segments.filter((s) => !s.removed && s.on_timeline).sort((a, b) => a.position - b.position);

export const removedSegments = (segments: EditSegment[]) =>
  segments.filter((s) => s.removed && s.on_timeline).sort((a, b) => a.position - b.position);

/** Attached media that isn't on the timeline yet (e.g. retried outputs). */
export const availableMedia = (segments: EditSegment[]) =>
  segments.filter((s) => !s.on_timeline).sort((a, b) => a.position - b.position);

export const clipDurationMs = (segment: EditSegment) =>
  Math.max(0, segment.trim_end_ms - segment.trim_start_ms);

/** Timeline length of a clip once speed + freeze frame are applied. */
export const playbackDurationMs = (segment: EditSegment) =>
  timelineDurationMs(clipDurationMs(segment), segment.adjustments.motion);

export const totalDurationMs = (segments: EditSegment[]) =>
  activeSegments(segments).reduce((sum, segment) => sum + playbackDurationMs(segment), 0);

export function formatTimecode(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatSeconds(ms: number) {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}

export const ASPECT_PRESETS: Record<string, { width: number; height: number; label: string }> = {
  "9:16": { width: 1080, height: 1920, label: "9:16 vertical" },
  "1:1": { width: 1080, height: 1080, label: "1:1 square" },
  "4:5": { width: 1080, height: 1350, label: "4:5 portrait" },
  "16:9": { width: 1920, height: 1080, label: "16:9 landscape" },
};

export function resolveAspect(ratio: string | null | undefined) {
  const key = ratio && ASPECT_PRESETS[ratio] ? ratio : "9:16";
  return { ratio: key, ...ASPECT_PRESETS[key] };
}
