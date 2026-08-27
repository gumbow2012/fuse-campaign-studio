/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Private fork editor — per-node MEDIA resolution (presentation only).
 *
 * Reads ONLY already-persisted artifacts from the fork's source run
 * (execution_steps.input_payload / output_payload / output_asset_id and the
 * linked assets row). Nothing is generated, no model is called, no prompt text
 * or creator internal is ever included in the returned payload.
 */

const STORAGE_BUCKET = "fuse-assets";
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|heic)(\?|#|$)/i;

export type ForkNodeMediaItem = {
  url: string;
  type: "image" | "video";
  sourceNodeId?: string;
  role?: "start" | "end";
  label?: string;
};

export type ForkNodeMedia = {
  output: { url: string; type: "image" | "video" } | null;
  references: ForkNodeMediaItem[];
  /** true when the source run persisted no artifact for this node. */
  unavailable?: boolean;
};

export type ForkStepRow = {
  node_id: string | null;
  input_payload?: unknown;
  output_payload?: unknown;
  output_asset_id?: string | null;
};

const START_KEY = /(^|_)(start|first)(_|)?(frame|image)?$/i;
const END_KEY = /(^|_)(end|last|tail)(_|)?(frame|image)?$/i;

export function mediaTypeForUrl(url: string): "image" | "video" {
  if (VIDEO_EXT.test(url)) return "video";
  if (IMAGE_EXT.test(url)) return "image";
  return /video/i.test(url) ? "video" : "image";
}

export function frameRoleForKey(key: string): "start" | "end" | undefined {
  const k = String(key ?? "");
  if (START_KEY.test(k) || /start_frame|first_frame|image_url_start/i.test(k)) return "start";
  if (END_KEY.test(k) || /end_frame|last_frame|tail_image/i.test(k)) return "end";
  return undefined;
}

function isMediaUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (v.length < 8 || v.length > 2048) return false;
  if (v.startsWith("data:")) return false;
  if (!/^https?:\/\//i.test(v)) return false;
  return VIDEO_EXT.test(v) || IMAGE_EXT.test(v) || /\/storage\/v1\/object\//i.test(v) ||
    /(fal\.media|r2\.dev|cloudflarestorage)/i.test(v);
}

/** Walk a jsonb payload and collect media URLs with the key they were found under. */
export function collectPayloadMedia(payload: unknown): Array<{ url: string; key: string }> {
  const found: Array<{ url: string; key: string }> = [];
  const seen = new Set<string>();

  const walk = (value: unknown, key: string, depth: number) => {
    if (depth > 6 || value === null || value === undefined) return;
    if (isMediaUrl(value)) {
      const url = value.trim();
      if (!seen.has(url)) {
        seen.add(url);
        found.push({ url, key });
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, key, depth + 1));
      return;
    }
    if (typeof value === "object") {
      for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
        walk(childValue, childKey, depth + 1);
      }
    }
  };

  walk(payload, "", 0);
  return found;
}

/** Pick the OUT media of a step from its output_payload when no asset row exists. */
export function pickOutputUrl(payload: unknown): string | null {
  const media = collectPayloadMedia(payload);
  return media.length ? media[media.length - 1].url : null;
}

function storagePathFor(url: string): string | null {
  const match = url.match(
    new RegExp(`/storage/v1/object/(?:public/|sign/)?${STORAGE_BUCKET}/(.+?)(?:\\?|#|$)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

/** Sign Supabase-storage URLs; pass absolute third-party URLs through untouched. */
export async function signMediaUrls(admin: any, urls: string[], expiresIn = 3600) {
  const map = new Map<string, string>();
  const paths: string[] = [];
  const byPath = new Map<string, string[]>();

  for (const url of urls) {
    const path = storagePathFor(url);
    if (!path) {
      map.set(url, url);
      continue;
    }
    if (!byPath.has(path)) {
      byPath.set(path, []);
      paths.push(path);
    }
    byPath.get(path)!.push(url);
  }

  if (paths.length) {
    const { data } = await admin.storage.from(STORAGE_BUCKET).createSignedUrls(paths, expiresIn);
    for (const entry of (data ?? []) as Array<{ path?: string | null; signedUrl?: string | null }>) {
      const originals = byPath.get(String(entry?.path ?? "")) ?? [];
      for (const original of originals) {
        map.set(original, entry?.signedUrl ? String(entry.signedUrl) : original);
      }
    }
    // Fall back to the raw URL if signing failed for a path.
    for (const [path, originals] of byPath) {
      void path;
      for (const original of originals) if (!map.has(original)) map.set(original, original);
    }
  }

  return map;
}

/**
 * Build the per-node media map for a fork's source run.
 * Pure aside from the storage signing + the caller-supplied asset URL lookup.
 */
export function buildNodeMediaMap(args: {
  steps: ForkStepRow[];
  assetUrlById: Map<string, string>;
  nodeIds: string[];
}): Record<string, ForkNodeMedia> {
  const { steps, assetUrlById, nodeIds } = args;

  const outputByNode = new Map<string, { url: string; type: "image" | "video" }>();
  const stepsByNode = new Map<string, ForkStepRow[]>();

  for (const step of steps) {
    const nodeId = String(step.node_id ?? "");
    if (!nodeId) continue;
    const bucket = stepsByNode.get(nodeId) ?? [];
    bucket.push(step);
    stepsByNode.set(nodeId, bucket);

    const assetUrl = step.output_asset_id ? assetUrlById.get(String(step.output_asset_id)) ?? null : null;
    const url = assetUrl ?? pickOutputUrl(step.output_payload);
    if (url) outputByNode.set(nodeId, { url, type: mediaTypeForUrl(url) });
  }

  // Reverse index: output URL → producing node, for provenance labelling.
  const nodeByUrl = new Map<string, string>();
  for (const [nodeId, out] of outputByNode) if (!nodeByUrl.has(out.url)) nodeByUrl.set(out.url, nodeId);

  const media: Record<string, ForkNodeMedia> = {};
  for (const nodeId of nodeIds) {
    const nodeSteps = stepsByNode.get(nodeId) ?? [];
    const references: ForkNodeMediaItem[] = [];
    const seen = new Set<string>();

    for (const step of nodeSteps) {
      for (const { url, key } of collectPayloadMedia(step.input_payload)) {
        if (seen.has(url)) continue;
        seen.add(url);
        const item: ForkNodeMediaItem = { url, type: mediaTypeForUrl(url) };
        const role = frameRoleForKey(key);
        if (role) item.role = role;
        const source = nodeByUrl.get(url);
        if (source && source !== nodeId) item.sourceNodeId = source;
        references.push(item);
      }
    }

    const output = outputByNode.get(nodeId) ?? null;
    const entry: ForkNodeMedia = { output, references };
    if (!output && !references.length) entry.unavailable = true;
    media[nodeId] = entry;
  }

  return media;
}

/** Collect every URL that needs signing from a built media map. */
export function collectMapUrls(map: Record<string, ForkNodeMedia>): string[] {
  const urls = new Set<string>();
  for (const entry of Object.values(map)) {
    if (entry.output?.url) urls.add(entry.output.url);
    for (const ref of entry.references) urls.add(ref.url);
  }
  return [...urls];
}

/** Apply signed URLs in place (returns a new map). */
export function applySignedUrls(
  map: Record<string, ForkNodeMedia>,
  signed: Map<string, string>,
): Record<string, ForkNodeMedia> {
  const next: Record<string, ForkNodeMedia> = {};
  for (const [nodeId, entry] of Object.entries(map)) {
    next[nodeId] = {
      ...entry,
      output: entry.output ? { ...entry.output, url: signed.get(entry.output.url) ?? entry.output.url } : null,
      references: entry.references.map((ref) => ({ ...ref, url: signed.get(ref.url) ?? ref.url })),
    };
  }
  return next;
}
