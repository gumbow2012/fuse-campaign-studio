/**
 * CAMPAIGN LIVE STATUS transport — the single source of truth for the live
 * "Fusing" generation screen.
 *
 * Read-only wrapper around the deployed `campaign-live-status` edge function.
 * Nothing here starts, resumes, retries or bills a run; it only reports what
 * the server is already doing so the UI can never invent progress.
 */
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";
import { fetchCampaignHistoryPage } from "@/services/campaignHistory";

export type LivePhase =
  | "preparing"
  | "images"
  | "video"
  | "mixed"
  | "ready"
  | "complete"
  | "needs_action";
export type LiveJobStatus = "queued" | "running" | "video_pending" | "complete" | "failed";
export type LiveNodeStatus = "waiting" | "generating" | "ready" | "failed";

export interface LiveJob {
  id: string;
  status: LiveJobStatus;
  progress_pct: number;
  phase: LivePhase;
  headline: string | null;
  support: string | null;
  /** Server truth: the run is finished, whatever the slot-level outcome. */
  execution_complete: boolean;
}

export interface LiveActiveStep {
  label: string;
  model: string | null;
  node_type: string | null;
  output_number: number | null;
}

export interface LiveRecentStep {
  label: string;
  at: string | null;
}

export interface LiveGraphNode {
  id: string;
  media_type: string | null;
  output_number: number | null;
  model: string | null;
  status: LiveNodeStatus;
}

export interface LiveOutputItem {
  id: string;
  output_number: number | null;
  media_type: string | null;
  url: string;
  poster_url?: string | null;
}

export interface CampaignLiveStatus {
  job: LiveJob;
  active: LiveActiveStep[];
  recent: LiveRecentStep[];
  graph: LiveGraphNode[];
  outputs: {
    ready: number;
    total: number;
    needs_regeneration: number;
    items: LiveOutputItem[];
  };
  eta_seconds: number | null;
  updated_at: string | null;
}

const ACTIVE_STATUSES: ReadonlySet<LiveJobStatus> = new Set(["queued", "running", "video_pending"]);

export const isLiveJobActive = (status: LiveJobStatus | undefined | null) =>
  !!status && ACTIVE_STATUSES.has(status);

async function accessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Missing authenticated session.");
  return session.access_token;
}

const asNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const asText = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

function normalizeNodeStatus(value: unknown): LiveNodeStatus {
  return value === "generating" || value === "ready" || value === "failed" ? value : "waiting";
}

/** Defensive normalization — the UI renders only customer-safe fields. */
export function normalizeLiveStatus(raw: unknown, jobId: string): CampaignLiveStatus {
  const data = (raw ?? {}) as Record<string, any>;
  const job = (data.job ?? {}) as Record<string, any>;
  const outputs = (data.outputs ?? {}) as Record<string, any>;
  const items = Array.isArray(outputs.items) ? outputs.items : [];

  return {
    job: {
      id: asText(job.id) ?? jobId,
      status: (["queued", "running", "video_pending", "complete", "failed"] as const).includes(job.status)
        ? job.status
        : "running",
      progress_pct: Math.max(0, Math.min(100, asNumber(job.progress_pct, 0))),
      phase: (
        ["preparing", "images", "video", "mixed", "ready", "complete", "needs_action"] as const
      ).includes(job.phase)
        ? job.phase
        : "preparing",
      headline: asText(job.headline),
      support: asText(job.support),
      /* Defensive: older payloads omit the flag — a terminal status still ends the run. */
      execution_complete:
        job.execution_complete === true || job.status === "complete" || job.status === "failed",
    },
    active: (Array.isArray(data.active) ? data.active : [])
      .map((step: Record<string, any>) => ({
        label: asText(step?.label) ?? "",
        model: asText(step?.model),
        node_type: asText(step?.node_type),
        output_number: typeof step?.output_number === "number" ? step.output_number : null,
      }))
      .filter((step) => step.label.length > 0),
    recent: (Array.isArray(data.recent) ? data.recent : [])
      .map((step: Record<string, any>) => ({
        label: asText(step?.label) ?? "",
        at: asText(step?.at),
      }))
      .filter((step) => step.label.length > 0)
      .slice(0, 5),
    graph: (Array.isArray(data.graph) ? data.graph : [])
      .map((node: Record<string, any>, index: number) => ({
        id: asText(node?.id) ?? `node-${index}`,
        media_type: asText(node?.media_type),
        output_number: typeof node?.output_number === "number" ? node.output_number : null,
        model: asText(node?.model),
        status: normalizeNodeStatus(node?.status),
      })),
    outputs: {
      ready: Math.max(0, asNumber(outputs.ready, 0)),
      total: Math.max(0, asNumber(outputs.total, 0)),
      needs_regeneration: Math.max(0, asNumber(outputs.needs_regeneration, 0)),
      items: items
        .map((item: Record<string, any>, index: number) => ({
          id: asText(item?.id) ?? `output-${index}`,
          output_number: typeof item?.output_number === "number" ? item.output_number : null,
          media_type: asText(item?.media_type),
          url: asText(item?.url) ?? "",
          poster_url: asText(item?.poster_url),
        }))
        .filter((item) => item.url.length > 0),
    },
    eta_seconds:
      typeof data.eta_seconds === "number" && Number.isFinite(data.eta_seconds) && data.eta_seconds > 0
        ? data.eta_seconds
        : null,
    updated_at: asText(data.updated_at),
  };
}

export async function fetchCampaignLiveStatus(jobId: string): Promise<CampaignLiveStatus> {
  const token = await accessToken();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/campaign-live-status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ job_id: jobId }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Could not load live campaign status.");
  return normalizeLiveStatus(data, jobId);
}

/**
 * Reconnect helper: the browser is never the authority, so a reload resolves
 * the user's most recent still-running job instead of starting anything.
 */
export async function resolveMostRecentRunningJobId(): Promise<string | null> {
  try {
    const page = await fetchCampaignHistoryPage(8, 0);
    const active = page.jobs.find((job) =>
      isLiveJobActive((job as { status?: LiveJobStatus }).status),
    );
    return active ? String((active as { id?: string }).id ?? "") || null : null;
  } catch {
    return null;
  }
}
