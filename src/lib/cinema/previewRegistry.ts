/**
 * FUSE Cinema — CV10 preview-media registry (hosting + serving layer ONLY).
 *
 * Maps a preset id → hosted preview media (still webp/avif, compressed webm/mp4
 * loop + poster, swatches). Nothing here generates media and nothing calls a
 * provider: media is attached DELIBERATELY by an admin, one preset at a time.
 *
 * Resolution order for a preset preview:
 *   1. per-user / shared row in `cinema_preview_assets`
 *   2. version-controlled BUILTIN_PREVIEW_REGISTRY below
 *   3. the preset's own `preview.src`
 *   4. gradient fallback (CV1 behaviour — still the default today)
 */

import { supabase } from "@/integrations/supabase/client";
import {
  setPreviewMediaLookup,
  type PreviewKind,
  type PreviewMediaOverride,
  type PreviewSource,
} from "./previewTypes";
import { buildPreviewManifest } from "./previewManifest";

export type PreviewRegistryEntry = PreviewMediaOverride & { kind?: PreviewKind };

/**
 * Version-controlled registry for BUILTIN presets. Intentionally empty: real
 * media is attached deliberately (admin flow) and lands in
 * `cinema_preview_assets`; entries can be promoted in here once locked.
 */
export const BUILTIN_PREVIEW_REGISTRY: Record<string, PreviewRegistryEntry> = {};

/* --------------------------------- state --------------------------------- */

const remote = new Map<string, PreviewRegistryEntry>();
const listeners = new Set<() => void>();
let version = 0;
let loadPromise: Promise<void> | null = null;

function bump() {
  version += 1;
  listeners.forEach((listener) => listener());
}

export function subscribePreviewRegistry(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function previewRegistryVersion(): number {
  return version;
}

/** Registry lookup used by `resolvePreviewMedia` (never throws). */
export function lookupPreviewMedia(presetId: string): PreviewRegistryEntry | undefined {
  return remote.get(presetId) ?? BUILTIN_PREVIEW_REGISTRY[presetId];
}

setPreviewMediaLookup(lookupPreviewMedia);

/* ---------------------------------- rows ---------------------------------- */

type PreviewAssetRow = {
  id: string;
  preset_id: string;
  category: string;
  kind: string;
  src: string | null;
  poster: string | null;
  thumb_src: string | null;
  sources: unknown;
  swatches: string[] | null;
  user_id: string | null;
};

function toSources(raw: unknown): PreviewSource[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => item as { src?: unknown; type?: unknown })
    .filter((item) => typeof item?.src === "string" && (item.src as string).length > 0)
    .map((item) => ({
      src: item.src as string,
      type: typeof item.type === "string" ? item.type : undefined,
    }));
}

function toEntry(row: PreviewAssetRow): PreviewRegistryEntry {
  return {
    kind: (row.kind as PreviewKind) || undefined,
    src: row.src ?? undefined,
    poster: row.poster ?? undefined,
    thumbSrc: row.thumb_src ?? undefined,
    sources: toSources(row.sources),
    swatches: row.swatches?.length ? row.swatches : undefined,
  };
}

/**
 * Load registered preview media once per session. Media is NEVER regenerated
 * when a picker opens — this is a plain read of already hosted URLs.
 */
export function loadPreviewRegistry(force = false): Promise<void> {
  if (loadPromise && !force) return loadPromise;
  loadPromise = (async () => {
    const { data, error } = await supabase
      .from("cinema_preview_assets")
      .select("id,preset_id,category,kind,src,poster,thumb_src,sources,swatches,user_id");
    if (error || !data) return;
    remote.clear();
    // Shared rows first, own rows win.
    [...(data as PreviewAssetRow[])]
      .sort((a, b) => Number(Boolean(a.user_id)) - Number(Boolean(b.user_id)))
      .forEach((row) => remote.set(row.preset_id, toEntry(row)));
    bump();
  })().catch(() => undefined);
  return loadPromise;
}

/* -------------------------------- uploading ------------------------------- */

const BUCKET = "fuse-assets";
/** Preview URLs must outlive a browsing session by a wide margin. */
const PREVIEW_URL_TTL = 60 * 60 * 24 * 365;


export function previewStoragePath(presetId: string, filename: string) {
  const safe =
    filename
      .toLowerCase()
      .replace(/[^a-z0-9.]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "preview.bin";
  const safeId = presetId.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return `cinema/previews/${safeId}/${crypto.randomUUID()}-${safe}`;
}

function guessType(url: string): string | undefined {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
  if (!ext) return undefined;
  if (ext === "avif") return "image/avif";
  if (ext === "webp") return "image/webp";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webm") return "video/webm";
  if (ext === "mp4" || ext === "m4v") return "video/mp4";
  return undefined;
}

/** Upload one deliberately chosen still/loop for one preset. */
export async function uploadPresetPreviewFile(presetId: string, file: File) {
  const path = previewStoragePath(presetId, file.name);
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || "application/octet-stream",
  });
  if (error) throw new Error(error.message);
  // `fuse-assets` is private, so previews are served through a long-lived signed
  // URL (same pattern as the existing storage-upload service).
  const { data, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, PREVIEW_URL_TTL);
  if (signError || !data?.signedUrl) {
    throw new Error(signError?.message ?? "Could not link that preview file.");
  }
  return { path, url: data.signedUrl };
}

/** Re-sign a stored preview path when its URL has aged out. */
export async function resignPreviewPath(path: string) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, PREVIEW_URL_TTL);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Could not link that preview.");
  return data.signedUrl;
}


/** Register (or replace) the hosted media for one preset. */
export async function registerPresetPreview(input: {
  presetId: string;
  category: string;
  kind: PreviewKind;
  src: string;
  poster?: string;
  thumbSrc?: string;
  /** Additional encodings, e.g. an avif still or an mp4 fallback for a webm loop. */
  sources?: PreviewSource[];
  /** When true the row is shared (admin/global); otherwise it belongs to the user. */
  shared?: boolean;
}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Please sign in again to attach preview media.");

  const sources = (input.sources ?? []).map((source) => ({
    src: source.src,
    type: source.type ?? guessType(source.src),
  }));

  const row = {
    preset_id: input.presetId,
    category: input.category,
    kind: input.kind,
    src: input.src,
    poster: input.poster ?? null,
    thumb_src: input.thumbSrc ?? null,
    sources,
    swatches: [] as string[],
    user_id: input.shared === false ? userId : null,
  };

  const { error } = await supabase
    .from("cinema_preview_assets")
    .upsert(row, { onConflict: row.user_id ? "user_id,preset_id" : "preset_id" });
  if (error) throw new Error(error.message);

  remote.set(input.presetId, {
    kind: input.kind,
    src: input.src,
    poster: input.poster,
    thumbSrc: input.thumbSrc,
    sources,
  });
  bump();
}

export async function removePresetPreview(presetId: string) {
  const { error } = await supabase
    .from("cinema_preview_assets")
    .delete()
    .eq("preset_id", presetId);
  if (error) throw new Error(error.message);
  remote.delete(presetId);
  bump();
}

/* --------------------------- attachable inventory -------------------------- */

export type AttachablePreset = {
  presetId: string;
  category: string;
  kind: PreviewKind;
  hasMedia: boolean;
};

/** Every preview slot Cinema knows about, with its current media state. */
export function listAttachablePresets(): AttachablePreset[] {
  return buildPreviewManifest().entries.map((entry) => ({
    presetId: entry.presetId,
    category: entry.category,
    kind: entry.kind,
    hasMedia: !entry.missing,
  }));
}
