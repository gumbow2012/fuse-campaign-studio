/**
 * FUSE Cinema — unified preset library helpers.
 *
 * One shape (`LibraryPreset`) for builtin CODE presets and user presets stored
 * in `cinema_presets`, plus PARTIAL APPLICATION scoping and the local
 * favorites / recents store. Cinema-only: nothing here is imported outside
 * `src/lib/cinema` / `src/components/cinema`.
 */

import type {
  CinemaPresetType,
  ConfigSource,
  DirectorConfig,
  DirectorConfigField,
  PartialDirectorConfig,
  Sourced,
} from "./types";

export type LibraryPreset = {
  id: string;
  type: CinemaPresetType;
  name: string;
  category: string;
  tags: string[];
  /** CSS gradient string — FALLBACK ONLY when no preview media exists. */
  thumbnail?: string;
  /** CV1: standardized visual preview media. */
  preview?: PreviewMedia;
  /** CV1: cross-model validation record. */
  validation?: CinemaControlValidation;
  /** Short card line. */
  subtitle?: string;
  config: PartialDirectorConfig;
  builtin: boolean;
  userId?: string;
};

/* ------------------------------------------------------------------ */
/* Partial application                                                 */
/* ------------------------------------------------------------------ */

/** The write signature the preset library uses (source-aware). */
export type PresetUpdateField = (
  field: DirectorConfigField,
  value: unknown,
  source?: ConfigSource,
) => void;

export type ApplyScope = "all" | "camera" | "lighting" | "color" | "movement";

export const SCOPE_FIELDS: Record<Exclude<ApplyScope, "all">, DirectorConfigField[]> = {
  camera: ["camera", "lens", "aperture", "optics", "filmSetup"],
  lighting: ["lighting"],
  color: ["color"],
  movement: ["movement"],
};

export const SCOPE_LABELS: Record<ApplyScope, string> = {
  all: "Apply All",
  camera: "Apply Camera Only",
  lighting: "Apply Lighting Only",
  color: "Apply Color Only",
  movement: "Apply Movement Only",
};

/** Fields a fragment actually carries. */
export function fragmentFields(fragment: PartialDirectorConfig): DirectorConfigField[] {
  return (Object.keys(fragment) as DirectorConfigField[]).filter((field) => {
    const entry = fragment[field] as Sourced<unknown> | undefined;
    return !!entry && entry.value !== undefined && entry.value !== null;
  });
}

/** Which scopes make sense for this fragment (always includes "all"). */
export function availableScopes(fragment: PartialDirectorConfig): ApplyScope[] {
  const present = new Set(fragmentFields(fragment));
  const scopes: ApplyScope[] = ["all"];
  (Object.keys(SCOPE_FIELDS) as Array<Exclude<ApplyScope, "all">>).forEach((scope) => {
    if (SCOPE_FIELDS[scope].some((field) => present.has(field))) scopes.push(scope);
  });
  // A single-scope fragment needs no scope menu.
  return scopes.length === 2 ? ["all"] : scopes;
}

/** Narrow a fragment to the chosen scope. */
export function scopeFragment(
  fragment: PartialDirectorConfig,
  scope: ApplyScope,
): PartialDirectorConfig {
  if (scope === "all") return fragment;
  const allowed = new Set(SCOPE_FIELDS[scope]);
  const out: PartialDirectorConfig = {};
  fragmentFields(fragment).forEach((field) => {
    if (allowed.has(field)) {
      (out as Record<string, unknown>)[field] = fragment[field];
    }
  });
  return out;
}

export type ApplyResult = { applied: DirectorConfigField[]; skipped: DirectorConfigField[] };

/**
 * Apply a preset fragment field-by-field with source "PRESET".
 * USER-edited fields are PRESERVED unless `overwriteUser` is explicitly set.
 */
export function applyPresetFragment(
  args: {
    fragment: PartialDirectorConfig;
    scope: ApplyScope;
    config: DirectorConfig;
    overwriteUser?: boolean;
    updateField: (
      field: DirectorConfigField,
      value: unknown,
      source?: ConfigSource,
    ) => void;
  },
): ApplyResult {
  const scoped = scopeFragment(args.fragment, args.scope);
  const applied: DirectorConfigField[] = [];
  const skipped: DirectorConfigField[] = [];

  fragmentFields(scoped).forEach((field) => {
    if (!args.overwriteUser && args.config[field]?.source === "USER") {
      skipped.push(field);
      return;
    }
    const entry = scoped[field] as Sourced<unknown>;
    args.updateField(field, entry.value, "PRESET");
    applied.push(field);
  });

  return { applied, skipped };
}

/** Capture the current config slice for a category as a savable fragment. */
export function capturePresetFragment(
  config: DirectorConfig,
  type: CinemaPresetType,
): PartialDirectorConfig {
  const fields: DirectorConfigField[] =
    type === "full"
      ? (Object.keys(config) as DirectorConfigField[])
      : type === "camera"
        ? ["camera", "lens", "aperture", "optics", "filmSetup"]
        : type === "lighting"
          ? ["lighting"]
          : type === "color"
            ? ["color"]
            : ["movement"];

  const out: PartialDirectorConfig = {};
  fields.forEach((field) => {
    const entry = config[field] as Sourced<unknown> | undefined;
    if (!entry || entry.value === undefined || entry.value === null) return;
    (out as Record<string, unknown>)[field] = {
      value: JSON.parse(JSON.stringify(entry.value)),
      source: "PRESET" as ConfigSource,
    };
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

/** Name + tags + category matching, so tag queries behave semantically. */
export function matchesQuery(preset: LibraryPreset, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const terms = q.split(/\s+/);
  const haystack = [
    preset.name,
    preset.category,
    preset.subtitle ?? "",
    ...preset.tags,
  ]
    .join(" ")
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

/* ------------------------------------------------------------------ */
/* Favorites + recents (per-user local store)                          */
/* ------------------------------------------------------------------ */

const RECENT_LIMIT = 12;

function key(kind: "fav" | "recent", userId: string, type: CinemaPresetType) {
  return `fuse.cinema.${kind}.${userId}.${type}`;
}

function readList(storageKey: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeList(storageKey: string, ids: string[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(ids));
  } catch {
    /* storage unavailable — favorites stay in-memory for this session */
  }
}

export function readFavorites(userId: string, type: CinemaPresetType): string[] {
  return readList(key("fav", userId, type));
}

export function writeFavorites(userId: string, type: CinemaPresetType, ids: string[]): void {
  writeList(key("fav", userId, type), ids);
}

export function readRecents(userId: string, type: CinemaPresetType): string[] {
  return readList(key("recent", userId, type));
}

export function pushRecent(userId: string, type: CinemaPresetType, id: string): string[] {
  const next = [id, ...readRecents(userId, type).filter((v) => v !== id)].slice(0, RECENT_LIMIT);
  writeList(key("recent", userId, type), next);
  return next;
}
