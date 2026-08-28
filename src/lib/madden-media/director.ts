/**
 * Madden Media Studio — M8 Madden Director.
 *
 * Pure structured data: variation presets, proposal types, a provider-safe
 * project digest, a diff summary and a lock-respecting apply.
 *
 * The Director NEVER mutates project state. It returns proposals; the user
 * applies them explicitly. Applying reuses the M5 merge rules, so a user's
 * STRICT (locked + filled) slots are never overwritten.
 */
import { MADDEN_CINEMATOGRAPHY_PRESETS } from "@/lib/madden-media/cinematographyPresets";
import { MADDEN_LIGHTING_PRESETS } from "@/lib/madden-media/lightingPresets";
import { MADDEN_ENVIRONMENT_PRESETS } from "@/lib/madden-media/environmentPresets";
import { findPreset } from "@/lib/madden-media/presetTypes";
import {
  applyRecipeToState,
  normalizeRecipeConfig,
  type MaddenRecipeConfig,
} from "@/lib/madden-media/recipes";
import { findShotPack } from "@/lib/madden-media/shotPacks";
import {
  MADDEN_SLOT_KINDS,
  type MaddenProjectState,
  type MaddenSlotKind,
} from "@/lib/madden-media/types";

/* ------------------------------------------------------------------ *
 * Variations
 * ------------------------------------------------------------------ */

export type MaddenVariationId =
  | "auto"
  | "darker"
  | "luxury"
  | "surreal"
  | "golden"
  | "gritty"
  | "clean";

export type MaddenVariation = {
  id: MaddenVariationId;
  label: string;
  /** Mood brief handed to the Director. Never a person or brand name. */
  brief: string;
};

export const MADDEN_VARIATIONS: MaddenVariation[] = [
  {
    id: "auto",
    label: "Director's call",
    brief:
      "Propose the strongest creative direction for this project as it stands, without forcing a mood.",
  },
  {
    id: "darker",
    label: "Darker",
    brief:
      "Push the direction darker: lower key, deeper shadow, night-leaning contrast and restraint.",
  },
  {
    id: "luxury",
    label: "Luxury",
    brief:
      "Push the direction toward high-end luxury: controlled light, rich surfaces, precise slow camera.",
  },
  {
    id: "surreal",
    label: "Surreal",
    brief:
      "Push the direction surreal and dreamlike: unexpected colour, unusual scale and staging.",
  },
  {
    id: "golden",
    label: "Golden",
    brief: "Push the direction toward warm golden-hour light and soft amber falloff.",
  },
  {
    id: "gritty",
    label: "Gritty",
    brief:
      "Push the direction raw and gritty: handheld energy, harder light, textured street realism.",
  },
  {
    id: "clean",
    label: "Clean",
    brief:
      "Push the direction clean and editorial: simple background, even light, disciplined framing.",
  },
];

export function findVariation(id: string | null | undefined): MaddenVariation | null {
  if (!id) return null;
  return MADDEN_VARIATIONS.find((variation) => variation.id === id) ?? null;
}

/* ------------------------------------------------------------------ *
 * Proposals
 * ------------------------------------------------------------------ */

export type MaddenDirectorProposal = {
  id: string;
  title: string;
  mood: string;
  rationale: string;
  /** What Apply would merge into the project — same shape as a recipe. */
  changes: MaddenRecipeConfig;
};

export type MaddenDirectorResult = {
  proposals: MaddenDirectorProposal[];
  notes: string[];
  model: string;
};

const ALLOWED_CINE = MADDEN_CINEMATOGRAPHY_PRESETS.map((p) => p.id);
const ALLOWED_LIGHT = MADDEN_LIGHTING_PRESETS.map((p) => p.id);
const ALLOWED_ENV = MADDEN_ENVIRONMENT_PRESETS.map((p) => p.id);

/** Drops any id the Director invented and any field it must not touch. */
export function sanitizeProposalChanges(raw: unknown): MaddenRecipeConfig {
  const config = normalizeRecipeConfig(raw);
  const keep = (value: string | null | undefined, allowed: string[]) =>
    value && allowed.includes(value) ? value : undefined;
  return {
    cinematographyId: keep(config.cinematographyId, ALLOWED_CINE),
    lightingId: keep(config.lightingId, ALLOWED_LIGHT),
    environmentId: keep(config.environmentId, ALLOWED_ENV),
    lookName: config.lookName?.trim() ? config.lookName.trim().slice(0, 60) : undefined,
    globalNotes: config.globalNotes?.trim()
      ? config.globalNotes.trim().slice(0, 600)
      : undefined,
    lockSlots: config.lockSlots?.filter((slot) => MADDEN_SLOT_KINDS.includes(slot)),
  };
}

export function normalizeDirectorProposals(raw: unknown): MaddenDirectorProposal[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry, index) => ({
      id: `proposal_${index + 1}`,
      title: String(entry.title ?? `Direction ${index + 1}`).slice(0, 80),
      mood: String(entry.mood ?? "").slice(0, 60),
      rationale: String(entry.rationale ?? "").slice(0, 600),
      changes: sanitizeProposalChanges(entry.changes),
    }))
    .filter((proposal) => Object.values(proposal.changes).some((value) => Boolean(value)));
}

/* ------------------------------------------------------------------ *
 * Provider-safe project digest
 * ------------------------------------------------------------------ */

/**
 * A compact, provider-safe description of the project for the Director.
 *
 * Free-text slot NAMES are deliberately excluded: a user may have typed a
 * public-figure name there, and the M6 compiler rules forbid passing that
 * through as an identity claim.
 */
export function buildDirectorContext(state: MaddenProjectState) {
  const cine = findPreset(MADDEN_CINEMATOGRAPHY_PRESETS, state.settings.cinematographyId);
  const light = findPreset(MADDEN_LIGHTING_PRESETS, state.settings.lightingId);
  const env = findPreset(MADDEN_ENVIRONMENT_PRESETS, state.settings.environmentId);
  const pack = findShotPack(state.settings.shotPackId);

  return {
    aspectRatio: state.settings.aspectRatio,
    lookName: state.settings.lookName || null,
    globalNotes: state.settings.globalNotes || null,
    cinematography: cine ? { id: cine.id, name: cine.name } : null,
    lighting: light ? { id: light.id, name: light.name } : null,
    environment: env ? { id: env.id, name: env.name } : null,
    shotPack: pack ? { id: pack.id, name: pack.name, shots: pack.shots.length } : null,
    shots: state.shots.map((shot) => ({
      direction: shot.direction.slice(0, 200),
      durationSeconds: shot.durationSeconds,
      cinematographyId: shot.cinematographyId ?? null,
    })),
    lockedSlots: MADDEN_SLOT_KINDS.filter((kind) => state.slots[kind].locked),
    /** Consistency payloads only — never a subject name. */
    consistency: {
      subject: state.slots.subject.profileData ? "bound" : "empty",
      outfit: state.slots.outfit.profileData ? "bound" : "empty",
      jewelry: state.slots.jewelry.profileData ? "bound" : "empty",
      environmentNotes: state.slots.environment.description.slice(0, 300) || null,
    },
    allowed: {
      cinematographyIds: ALLOWED_CINE,
      lightingIds: ALLOWED_LIGHT,
      environmentIds: ALLOWED_ENV,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Diff + apply
 * ------------------------------------------------------------------ */

export type MaddenDirectorDiffLine = {
  field: string;
  from: string;
  to: string;
  /** True when a user lock means this change will be skipped. */
  blocked?: boolean;
};

function slotIsUserOwned(state: MaddenProjectState, kind: MaddenSlotKind): boolean {
  const slot = state.slots[kind];
  if (!slot) return false;
  const hasWork =
    Boolean(slot.profileId) ||
    Boolean(slot.profileData) ||
    slot.references.length > 0 ||
    slot.name.trim().length > 0 ||
    slot.description.trim().length > 0;
  return hasWork && slot.locked;
}

/** What Apply would actually change, resolved against the current state. */
export function describeProposalDiff(
  state: MaddenProjectState,
  changes: MaddenRecipeConfig,
): MaddenDirectorDiffLine[] {
  const lines: MaddenDirectorDiffLine[] = [];

  const presetLine = (
    field: string,
    list: typeof MADDEN_CINEMATOGRAPHY_PRESETS,
    next: string | null | undefined,
    current: string | null,
    blocked = false,
  ) => {
    if (!next || next === current) return;
    lines.push({
      field,
      from: findPreset(list, current)?.name ?? "Not set",
      to: findPreset(list, next)?.name ?? next,
      blocked,
    });
  };

  presetLine(
    "Cinematography",
    MADDEN_CINEMATOGRAPHY_PRESETS,
    changes.cinematographyId,
    state.settings.cinematographyId,
  );
  presetLine("Lighting", MADDEN_LIGHTING_PRESETS, changes.lightingId, state.settings.lightingId);
  presetLine(
    "Environment",
    MADDEN_ENVIRONMENT_PRESETS,
    changes.environmentId,
    state.settings.environmentId,
    slotIsUserOwned(state, "environment"),
  );

  if (changes.lookName && changes.lookName !== state.settings.lookName) {
    lines.push({
      field: "Look",
      from: state.settings.lookName || "Not set",
      to: changes.lookName,
    });
  }

  if (changes.globalNotes) {
    lines.push({
      field: "Project notes",
      from: state.settings.globalNotes.trim() ? "Your notes (kept)" : "Empty",
      to: state.settings.globalNotes.trim() ? "Unchanged" : changes.globalNotes,
      blocked: Boolean(state.settings.globalNotes.trim()),
    });
  }

  for (const kind of changes.lockSlots ?? []) {
    if (state.slots[kind]?.locked) continue;
    lines.push({ field: `${kind} continuity`, from: "Unlocked", to: "Locked" });
  }

  return lines;
}

/** Merges a proposal using the M5 rules — STRICT locks always win. */
export function applyDirectorProposal(
  state: MaddenProjectState,
  proposal: MaddenDirectorProposal,
): { next: MaddenProjectState; skipped: MaddenSlotKind[] } {
  return applyRecipeToState(state, proposal.changes);
}
