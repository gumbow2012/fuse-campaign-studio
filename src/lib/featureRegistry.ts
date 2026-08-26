/**
 * CENTRAL "NEW" REGISTRY
 * ----------------------
 * Single source of truth for which product surfaces read as NEW in navigation and
 * menus. Never scatter <span>NEW</span> across components — register the feature
 * here and render <FeatureNewBadge featureKey="..." />.
 *
 * A feature reads NEW while `Date.now() - launchedAt < NEW_WINDOW_DAYS`, or while
 * `showNew` is explicitly true. It disappears on its own — no code surgery.
 */

export type FeatureKey =
  | "cinema_studio"
  | "fuse_cast"
  | "creator_studio"
  | "my_avatars";

export type FeatureRegistryEntry = {
  key: FeatureKey;
  label: string;
  /** ISO date the feature became visible to customers. */
  launchedAt: string;
  /** Force the badge on/off regardless of the launch window. */
  showNew?: boolean;
};

/** Days a freshly launched feature keeps its NEW badge. */
export const NEW_WINDOW_DAYS = 21;

export const FEATURE_REGISTRY: FeatureRegistryEntry[] = [
  { key: "cinema_studio", label: "Cinema Studio", launchedAt: "2026-08-20" },
  { key: "fuse_cast", label: "FUSE Cast", launchedAt: "2026-08-18" },
  { key: "creator_studio", label: "Creator Studio", launchedAt: "2026-08-22" },
  { key: "my_avatars", label: "My Avatars", launchedAt: "2026-08-16" },
];

const REGISTRY_BY_KEY = new Map(FEATURE_REGISTRY.map((entry) => [entry.key, entry]));

export function getFeature(key: FeatureKey): FeatureRegistryEntry | undefined {
  return REGISTRY_BY_KEY.get(key);
}

/**
 * True while the feature is inside its launch window (or explicitly forced).
 * `now` is injectable so this stays deterministic in tests.
 */
export function isFeatureNew(key: FeatureKey, now: Date = new Date()): boolean {
  const entry = REGISTRY_BY_KEY.get(key);
  if (!entry) return false;
  if (typeof entry.showNew === "boolean") return entry.showNew;

  const launched = new Date(entry.launchedAt).getTime();
  if (Number.isNaN(launched)) return false;

  const ageDays = (now.getTime() - launched) / 86_400_000;
  return ageDays >= 0 && ageDays <= NEW_WINDOW_DAYS;
}

/* Local "seen" store — data model is ready for a per-user server-side version. */
const SEEN_STORAGE_KEY = "fuse.feature.seen.v1";

function readSeen(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(SEEN_STORAGE_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}

export function markFeatureSeen(key: FeatureKey) {
  if (typeof window === "undefined") return;
  try {
    const next = { ...readSeen(), [key]: Date.now() };
    window.localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — fall back to launch-date behaviour */
  }
}

export function hasSeenFeature(key: FeatureKey): boolean {
  return Boolean(readSeen()[key]);
}
