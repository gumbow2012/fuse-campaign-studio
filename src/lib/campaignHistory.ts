/**
 * Campaign history (presentation layer only).
 *
 * Shared, pure helpers for the customer-facing "Your Campaigns" surfaces:
 * the Studio launcher strip, the history drawer, and /app/campaigns.
 *
 * Nothing here talks to the executor, credits, or billing. Raw job states are
 * mapped to customer language exactly once, in this file.
 */

export type CampaignRunStatus = "queued" | "running" | "video_pending" | "complete" | "failed";

export interface CampaignRunOutput {
  type: string;
  url: string;
  label?: string;
  key?: string;
  outputNumber?: number;
}

/** Structurally compatible with the existing internal `RecentRun` payload. */
export interface CampaignRun {
  id: string;
  status: CampaignRunStatus;
  startedAt: string | null;
  completedAt: string | null;
  progress: number;
  templateName: string;
  outputs: CampaignRunOutput[];
  /** Privileged-only diagnostics — never rendered by these components. */
  error?: string | null;
  publicFailure?: unknown;
  feedback?: unknown;
}

export const ACTIVE_CAMPAIGN_STATUSES = new Set<CampaignRunStatus>([
  "queued",
  "running",
  "video_pending",
]);

export type CampaignStatusTone = "ready" | "building" | "attention";

export interface CampaignStatusDescriptor {
  tone: CampaignStatusTone;
  /** Customer-facing label. Raw states never leak through here. */
  label: string;
  /** Optional short qualifier — only rendered when genuinely useful. */
  detail: string | null;
}

/** Outputs the customer can actually use (a real media URL). */
export function usableOutputCount(run: Pick<CampaignRun, "outputs">) {
  const outputs = Array.isArray(run.outputs) ? run.outputs : [];
  return outputs.filter((output) => !!output?.url).length;
}

/**
 * A terminal run with at least one usable output is a RESULTS campaign, not a
 * failure — the customer never sees "failed/interrupted/didn't finish".
 */
export function hasUsableOutputs(run: Pick<CampaignRun, "outputs">) {
  return usableOutputCount(run) > 0;
}

export function describeCampaignStatus(run: Pick<CampaignRun, "status" | "progress" | "outputs">): CampaignStatusDescriptor {
  const outputCount = usableOutputCount(run);

  if (run.status === "complete") {
    // Never show "100%" on a finished campaign.
    return { tone: "ready", label: "✓ READY", detail: null };
  }

  if (run.status === "failed") {
    // Usable outputs → calm results language. Nothing usable → neutral retry.
    if (outputCount > 0) {
      return { tone: "ready", label: "✓ READY", detail: `${outputCount} ready` };
    }
    return { tone: "attention", label: "NEEDS ANOTHER TRY", detail: null };
  }

  const progress = Number.isFinite(run.progress) ? Math.max(0, Math.min(99, Math.round(run.progress))) : 0;
  const detail = outputCount > 0
    ? `${outputCount} ready`
    : progress > 0
      ? `${progress}%`
      : null;

  return { tone: "building", label: "● BUILDING", detail };
}

export const CAMPAIGN_STATUS_TONE_CLASS: Record<CampaignStatusTone, string> = {
  ready: "text-emerald-200",
  building: "text-cyan-100",
  attention: "text-rose-200",
};

export type CampaignFilterKey = "all" | "building" | "ready" | "attention";

export const CAMPAIGN_FILTERS: { key: CampaignFilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "building", label: "Building" },
  { key: "ready", label: "Ready" },
  { key: "attention", label: "Attention" },
];

export function matchesCampaignFilter(run: CampaignRun, filter: CampaignFilterKey) {
  if (filter === "all") return true;
  const { tone } = describeCampaignStatus(run);
  return tone === filter;
}

export function matchesCampaignSearch(run: CampaignRun, search: string) {
  const term = search.trim().toLowerCase();
  if (!term) return true;
  return (run.templateName ?? "").toLowerCase().includes(term);
}

export function filterCampaigns(runs: CampaignRun[], search: string, filter: CampaignFilterKey) {
  return runs.filter((run) => matchesCampaignFilter(run, filter) && matchesCampaignSearch(run, search));
}

/** The single campaign the customer should be nudged back into, if any. */
export function findActiveCampaign(runs: CampaignRun[]) {
  return runs.find((run) => ACTIVE_CAMPAIGN_STATUSES.has(run.status)) ?? null;
}

export function campaignTimestamp(run: CampaignRun) {
  const raw = run.completedAt ?? run.startedAt;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatRelativeCampaignTime(run: CampaignRun, now = new Date()) {
  const date = campaignTimestamp(run);
  if (!date) return "just now";

  const diffSeconds = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  if (diffSeconds < 60) return "just now";

  const minutes = Math.round(diffSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatCampaignOutputCount(run: CampaignRun) {
  const count = Array.isArray(run.outputs) ? run.outputs.length : 0;
  return `${count} output${count === 1 ? "" : "s"}`;
}

export type CampaignDayBucket = "today" | "yesterday" | "earlier";

export const CAMPAIGN_DAY_LABEL: Record<CampaignDayBucket, string> = {
  today: "Today",
  yesterday: "Yesterday",
  earlier: "Earlier",
};

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function campaignDayBucket(run: CampaignRun, now = new Date()): CampaignDayBucket {
  const date = campaignTimestamp(run);
  if (!date) return "today";
  const today = startOfDay(now).getTime();
  const day = startOfDay(date).getTime();
  if (day >= today) return "today";
  if (day >= today - 86_400_000) return "yesterday";
  return "earlier";
}

/** Chronological day grouping, preserving the backend's newest-first ordering. */
export function groupCampaignsByDay(runs: CampaignRun[], now = new Date()) {
  const order: CampaignDayBucket[] = ["today", "yesterday", "earlier"];
  const buckets = new Map<CampaignDayBucket, CampaignRun[]>();

  for (const run of runs) {
    const bucket = campaignDayBucket(run, now);
    const existing = buckets.get(bucket) ?? [];
    existing.push(run);
    buckets.set(bucket, existing);
  }

  return order
    .filter((bucket) => (buckets.get(bucket)?.length ?? 0) > 0)
    .map((bucket) => ({ bucket, label: CAMPAIGN_DAY_LABEL[bucket], runs: buckets.get(bucket)! }));
}

export type CampaignThumbnail =
  | { kind: "image"; url: string }
  | { kind: "video"; url: string }
  | { kind: "placeholder" };

/**
 * Hero media for a campaign card: first completed output wins, then the
 * template's own preview, then a neutral FUSE placeholder. Never a fabricated
 * illustration.
 */
export function resolveCampaignThumbnail(
  run: CampaignRun,
  templatePreviewUrl?: string | null,
): CampaignThumbnail {
  const outputs = Array.isArray(run.outputs) ? run.outputs : [];
  const image = outputs.find((output) => output.type !== "video" && !!output.url);
  if (image) return { kind: "image", url: image.url };

  const video = outputs.find((output) => output.type === "video" && !!output.url);
  if (video) return { kind: "video", url: video.url };

  if (templatePreviewUrl) {
    return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(templatePreviewUrl)
      ? { kind: "video", url: templatePreviewUrl }
      : { kind: "image", url: templatePreviewUrl };
  }

  return { kind: "placeholder" };
}
