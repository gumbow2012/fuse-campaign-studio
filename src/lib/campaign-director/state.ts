import { CAMERA_KINDS, type CameraKind, type DirectorJob, type DirectorQa, type DirectorProject, type DirectorRef, type DirectorShot, type ProductRole, type ShotStatus } from "./types";
import { createEmptyProject, createEmptyWorld } from "./defaults";

const STATUSES: ShotStatus[] = [
  "draft",
  "image_queued",
  "image_ready",
  "approved",
  "rejected",
  "video_queued",
  "video_ready",
  "failed",
];

export function emptyJob(): DirectorJob {
  return { requestId: "", url: "", error: "", attempts: 0 };
}

export function newId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${random}`;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function strList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.length > 0) : [];
}

function job(value: unknown): DirectorJob {
  const raw = (value ?? {}) as Partial<DirectorJob>;
  return {
    requestId: str(raw.requestId),
    url: str(raw.url),
    error: str(raw.error),
    attempts: Number.isFinite(raw.attempts) ? Math.max(0, Number(raw.attempts)) : 0,
  };
}

export function emptyQa(): DirectorQa {
  return { verdict: "", issues: [], checkedUrl: "" };
}

function qa(value: unknown): DirectorQa {
  const raw = (value ?? {}) as Partial<DirectorQa>;
  const verdict = raw.verdict === "pass" || raw.verdict === "fail" || raw.verdict === "error" ? raw.verdict : "";
  return { verdict, issues: strList(raw.issues), checkedUrl: str(raw.checkedUrl) };
}

function refs(value: unknown, kind: DirectorRef["kind"]): DirectorRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const raw = (item ?? {}) as Partial<DirectorRef>;
      const url = str(raw.url);
      if (!/^https?:\/\//.test(url)) return null;
      return { id: str(raw.id) || newId("ref"), url, kind, label: str(raw.label) } as DirectorRef;
    })
    .filter((r): r is DirectorRef => r !== null);
}

export function normalizeShot(value: unknown, index: number): DirectorShot {
  const raw = (value ?? {}) as Partial<DirectorShot>;
  const camera = CAMERA_KINDS.includes(raw.camera as CameraKind) ? (raw.camera as CameraKind) : "wide establishing";
  const role: ProductRole = raw.productRole === "hero" || raw.productRole === "secondary" ? raw.productRole : "none";
  const status = STATUSES.includes(raw.status as ShotStatus) ? (raw.status as ShotStatus) : "draft";
  const productIds = strList(raw.productIds);
  return {
    id: str(raw.id) || newId("shot"),
    index: Number.isFinite(raw.index) ? Number(raw.index) : index + 1,
    act: str(raw.act),
    title: str(raw.title) || `Shot ${index + 1}`,
    camera,
    setting: str(raw.setting),
    action: str(raw.action),
    lighting: str(raw.lighting),
    productRole: productIds.length === 0 ? "none" : role === "none" ? "secondary" : role,
    productIds,
    artistProductIds: strList(raw.artistProductIds),
    supporting: str(raw.supporting),
    reflective: raw.reflective === true,
    motion: str(raw.motion),
    status,
    image: job(raw.image),
    video: job(raw.video),
    promptOverride: str(raw.promptOverride),
    note: str(raw.note),
    qa: qa(raw.qa),
  };
}

export function normalizeProject(value: unknown): DirectorProject {
  const base = createEmptyProject();
  const raw = (value ?? {}) as Partial<DirectorProject>;
  const worldRaw = (raw.world ?? {}) as Partial<DirectorProject["world"]>;
  const empty = createEmptyWorld();
  const world = {
    ...empty,
    name: str(worldRaw.name, empty.name),
    characterName: str(worldRaw.characterName, empty.characterName),
    characterLock: str(worldRaw.characterLock, empty.characterLock),
    scaleRule: str(worldRaw.scaleRule, empty.scaleRule),
    styleLock: str(worldRaw.styleLock, empty.styleLock),
    productSpec: str(worldRaw.productSpec, empty.productSpec),
    reflectiveLook: str(worldRaw.reflectiveLook, empty.reflectiveLook),
    avoid: str(worldRaw.avoid, empty.avoid),
    characters: refs(worldRaw.characters, "character"),
    styleRefs: refs(worldRaw.styleRefs, "style"),
    reflectiveRefs: refs(worldRaw.reflectiveRefs, "reflective"),
    aspectRatio: (["9:16", "16:9", "1:1"] as const).includes(worldRaw.aspectRatio as never)
      ? (worldRaw.aspectRatio as "9:16" | "16:9" | "1:1")
      : empty.aspectRatio,
    imageResolution: (["1K", "2K", "4K"] as const).includes(worldRaw.imageResolution as never)
      ? (worldRaw.imageResolution as "1K" | "2K" | "4K")
      : empty.imageResolution,
    videoModel: worldRaw.videoModel === "kling-3.0-standard" ? "kling-3.0-standard" : "kling-3.0-pro",
    clipSeconds: Number.isFinite(worldRaw.clipSeconds) ? Math.min(15, Math.max(3, Number(worldRaw.clipSeconds))) : 3,
  } as DirectorProject["world"];

  const products = Array.isArray(raw.products)
    ? raw.products
        .map((p): DirectorProject["products"][number] | null => {
          const item = (p ?? {}) as Partial<DirectorProject["products"][number]>;
          const imageUrl = str(item.imageUrl);
          if (!/^https?:\/\//.test(imageUrl)) return null;
          return {
            id: str(item.id) || newId("prod"),
            name: str(item.name) || "Product",
            artist: str(item.artist),
            collab: str(item.collab),
            flavor: str(item.flavor),
            imageUrl,
            thumbUrl: /^https?:\/\//.test(str(item.thumbUrl)) ? str(item.thumbUrl) : undefined,
          };
        })
        .filter((p): p is DirectorProject["products"][number] => p !== null)
    : [];

  const briefRaw = (raw.brief ?? {}) as Partial<DirectorProject["brief"]>;
  const shotCount = Number.isFinite(briefRaw.shotCount) ? Math.min(40, Math.max(4, Math.round(Number(briefRaw.shotCount)))) : 20;

  const masters: Record<string, string> = {};
  for (const [key, url] of Object.entries((raw.artistMasters ?? {}) as Record<string, unknown>)) {
    if (typeof url === "string" && /^https?:\/\//.test(url)) masters[key] = url;
  }

  return {
    version: 1,
    world,
    products,
    brief: { theme: str(briefRaw.theme), notes: str(briefRaw.notes), shotCount },
    shots: Array.isArray(raw.shots) ? raw.shots.map((s, i) => normalizeShot(s, i)) : base.shots,
    artistMasters: masters,
  };
}

export interface ProjectStats {
  shots: number;
  imagesReady: number;
  approved: number;
  videosReady: number;
  failed: number;
}

export function projectStats(project: DirectorProject): ProjectStats {
  const shots = project.shots;
  return {
    shots: shots.length,
    imagesReady: shots.filter((s) => s.image.url).length,
    approved: shots.filter((s) => s.status === "approved" || s.status === "video_queued" || s.status === "video_ready").length,
    videosReady: shots.filter((s) => s.video.url).length,
    failed: shots.filter((s) => s.status === "failed").length,
  };
}
