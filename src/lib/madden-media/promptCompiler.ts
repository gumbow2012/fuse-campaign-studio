/**
 * Madden Media Studio — M6 prompt compiler.
 *
 * Pure function: project config in, structured 9:16 short-form prompt out.
 * Nothing here calls a provider, spends credits, or touches any other
 * workspace's compiler (Cinema / Jewelry / Seedance compilers are untouched).
 *
 * PROVIDER-SAFE BY CONSTRUCTION:
 *  - identity comes from the reference images plus technical descriptors only;
 *  - profile names and any free-text names are NEVER emitted as an identity
 *    claim, so no celebrity / public-figure name can leak into the prompt.
 */
import {
  MADDEN_SLOT_KINDS,
  type MaddenProjectState,
  type MaddenShot,
  type MaddenSlot,
  type MaddenSlotKind,
} from "@/lib/madden-media/types";

import {
  MADDEN_SUBJECT_LOCK_CATEGORIES,
  MADDEN_SUBJECT_LOCK_LABELS,
  normalizeSubjectData,
  type MaddenLockLevel,
  type MaddenSubjectProfileData,
} from "@/lib/madden-media/subject";
import {
  MADDEN_GARMENT_FIELDS,
  MADDEN_JEWELRY_CATEGORIES,
  MADDEN_JEWELRY_FIELDS,
  MADDEN_JEWELRY_LABELS,
  MADDEN_OUTFIT_CATEGORIES,
  MADDEN_OUTFIT_LABELS,
  normalizeJewelryData,
  normalizeOutfitData,
  type MaddenJewelryProfileData,
  type MaddenOutfitProfileData,
} from "@/lib/madden-media/wardrobe";
import { MADDEN_CINEMATOGRAPHY_PRESETS } from "@/lib/madden-media/cinematographyPresets";
import { MADDEN_LIGHTING_PRESETS } from "@/lib/madden-media/lightingPresets";
import { MADDEN_ENVIRONMENT_PRESETS } from "@/lib/madden-media/environmentPresets";
import { findPreset } from "@/lib/madden-media/presetTypes";

export type MaddenPromptWarning = {
  code: string;
  message: string;
};

export type MaddenCompiledPrompt = {
  /** The compiled prompt text. */
  prompt: string;
  /** Section-by-section breakdown so the UI can explain the output. */
  sections: { title: string; lines: string[] }[];
  warnings: MaddenPromptWarning[];
  /** Reference image URLs that act as the visual authority. */
  referenceUrls: string[];
};

/* ------------------------------------------------------------------ *
 * Lock language
 * ------------------------------------------------------------------ */

const LOCK_LANGUAGE: Record<MaddenLockLevel, string> = {
  strict: "MUST MATCH EXACTLY — zero deviation permitted",
  strong: "match closely; only micro-variation from camera angle is acceptable",
  medium: "keep clearly recognisable; small variation is acceptable",
  flexible: "use as guidance; variation is acceptable",
};

function lockPhrase(level: MaddenLockLevel): string {
  return LOCK_LANGUAGE[level] ?? LOCK_LANGUAGE.strong;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function joinFacts(facts: (string | undefined)[]): string {
  return facts.map(clean).filter(Boolean).join(", ");
}

/* ------------------------------------------------------------------ *
 * Slot readers (defensive: profileData is jsonb-shaped `unknown`)
 * ------------------------------------------------------------------ */

function subjectDataOf(slot: MaddenSlot): MaddenSubjectProfileData | null {
  if (!slot.profileData) return null;
  return normalizeSubjectData(slot.profileData);
}

function outfitDataOf(slot: MaddenSlot): MaddenOutfitProfileData | null {
  if (!slot.profileData) return null;
  return normalizeOutfitData(slot.profileData);
}

function jewelryDataOf(slot: MaddenSlot): MaddenJewelryProfileData | null {
  if (!slot.profileData) return null;
  return normalizeJewelryData(slot.profileData);
}

/* ------------------------------------------------------------------ *
 * Section builders
 * ------------------------------------------------------------------ */

function subjectSection(
  slot: MaddenSlot,
  warnings: MaddenPromptWarning[],
): { lines: string[]; refs: string[] } {
  const data = subjectDataOf(slot);
  const lines: string[] = [];
  const refs = data?.referenceUrls ?? [];

  if (!data) {
    warnings.push({
      code: "subject_missing",
      message: "No subject profile is bound — identity consistency cannot be enforced.",
    });
    return { lines, refs };
  }

  if (refs.length === 0) {
    warnings.push({
      code: "subject_no_reference",
      message:
        "The subject has no reference images. Reference images are the visual authority for identity; descriptors alone will drift.",
    });
  } else {
    lines.push(
      `Identity authority: the ${refs.length} attached subject reference image(s). Reproduce the person shown in those references. Do not substitute, stylise or average the face.`,
    );
  }

  const a = data.attributes;
  const detail: Record<string, string> = {
    face: joinFacts([a.face.shape, a.face.proportions, a.face.distinguishingFeatures]),
    skin: joinFacts([a.skin.tone, a.skin.texture]),
    hair: joinFacts([a.hair.style, a.hair.color, a.hair.length]),
    facialHair: a.facialHair.present ? clean(a.facialHair.description) || "present" : "none",
    tattoos: a.tattoos.present
      ? joinFacts([a.tattoos.description, a.tattoos.placements.join(" / ")]) || "present"
      : "none",
    grills: a.grills.present ? clean(a.grills.description) || "present" : "none",
  };

  for (const category of MADDEN_SUBJECT_LOCK_CATEGORIES) {
    const value = detail[category];
    if (!value) continue;
    const level = data.locks[category];
    lines.push(
      `${MADDEN_SUBJECT_LOCK_LABELS[category]}: ${value} — ${lockPhrase(level)}.`,
    );
  }

  if (clean(a.notes)) lines.push(`Subject notes: ${clean(a.notes)}`);
  if (a.uncertain.length > 0) {
    warnings.push({
      code: "subject_uncertain",
      message: `Subject analysis was uncertain about: ${a.uncertain.join(", ")}. Defer to the reference images.`,
    });
  }

  return { lines, refs };
}

function outfitSection(
  slot: MaddenSlot,
  warnings: MaddenPromptWarning[],
): { lines: string[]; refs: string[] } {
  const data = outfitDataOf(slot);
  const lines: string[] = [];
  if (!data) return { lines, refs: [] };

  if (data.referenceUrls.length > 0) {
    lines.push(
      `Wardrobe authority: the attached outfit reference image(s) — garments must read as the same physical pieces.`,
    );
  }

  for (const category of MADDEN_OUTFIT_CATEGORIES) {
    const garment = data.attributes[category];
    if (!garment.present) continue;
    const facts = MADDEN_GARMENT_FIELDS.map(({ key, label }) => {
      const value = clean(garment[key]);
      return value ? `${label.toLowerCase()} ${value}` : "";
    }).filter(Boolean);
    if (facts.length === 0) continue;
    lines.push(
      `${MADDEN_OUTFIT_LABELS[category]}: ${facts.join("; ")} — ${lockPhrase(data.locks[category])}.`,
    );
  }

  if (clean(data.attributes.notes)) lines.push(`Outfit notes: ${clean(data.attributes.notes)}`);
  if (data.attributes.uncertain.length > 0) {
    warnings.push({
      code: "outfit_uncertain",
      message: `Outfit analysis was uncertain about: ${data.attributes.uncertain.join(", ")}.`,
    });
  }

  return { lines, refs: data.referenceUrls };
}

function jewelrySection(
  slot: MaddenSlot,
  warnings: MaddenPromptWarning[],
): { lines: string[]; refs: string[] } {
  const data = jewelryDataOf(slot);
  const lines: string[] = [];
  if (!data) return { lines, refs: [] };

  if (data.referenceUrls.length > 0) {
    lines.push(
      "Jewelry authority: the attached jewelry reference image(s) — reproduce each piece one-for-one, no added or removed pieces.",
    );
  }

  for (const category of MADDEN_JEWELRY_CATEGORIES) {
    const piece = data.attributes[category];
    if (!piece.present) continue;
    const facts = MADDEN_JEWELRY_FIELDS.map(({ key, label }) => {
      const value = clean(piece[key]);
      return value ? `${label.toLowerCase()} ${value}` : "";
    }).filter(Boolean);
    if (facts.length === 0) continue;
    lines.push(
      `${MADDEN_JEWELRY_LABELS[category]}: ${facts.join("; ")} — ${lockPhrase(data.locks[category])}.`,
    );
  }

  if (clean(data.attributes.notes)) lines.push(`Jewelry notes: ${clean(data.attributes.notes)}`);
  if (data.attributes.uncertain.length > 0) {
    warnings.push({
      code: "jewelry_uncertain",
      message: `Jewelry analysis was uncertain about: ${data.attributes.uncertain.join(", ")}.`,
    });
  }

  return { lines, refs: data.referenceUrls };
}

function lockedSlotSummary(state: MaddenProjectState): string[] {
  const locked: MaddenSlotKind[] = MADDEN_SLOT_KINDS.filter((kind) => state.slots[kind].locked);
  if (locked.length === 0) return [];
  return [
    `Continuity locked across every shot: ${locked.join(", ")}. These must not change between shots.`,
  ];
}

/* ------------------------------------------------------------------ *
 * Compiler
 * ------------------------------------------------------------------ */

export function maddenMediaPromptCompiler(state: MaddenProjectState): MaddenCompiledPrompt {
  const warnings: MaddenPromptWarning[] = [];
  const referenceUrls: string[] = [];
  const sections: { title: string; lines: string[] }[] = [];

  const push = (title: string, lines: string[]) => {
    const kept = lines.map((line) => line.trim()).filter(Boolean);
    if (kept.length > 0) sections.push({ title, lines: kept });
  };

  /* Format ------------------------------------------------------- */
  push("FORMAT", [
    "Vertical 9:16 short-form video, social-native framing with headroom kept inside the safe area.",
    state.settings.lookName ? `Look / grade: ${state.settings.lookName}.` : "",
    state.shots.length > 0
      ? `${state.shots.length} shot(s), total ${state.shots.reduce((sum, shot) => sum + (shot.durationSeconds || 0), 0)}s.`
      : "",
  ]);

  /* Subject ------------------------------------------------------ */
  const subject = subjectSection(state.slots.subject, warnings);
  referenceUrls.push(...subject.refs);
  push("SUBJECT CONSISTENCY", subject.lines);

  /* Wardrobe ----------------------------------------------------- */
  const outfit = outfitSection(state.slots.outfit, warnings);
  referenceUrls.push(...outfit.refs);
  push("WARDROBE CONSISTENCY", outfit.lines);

  /* Jewelry ------------------------------------------------------ */
  const jewelry = jewelrySection(state.slots.jewelry, warnings);
  referenceUrls.push(...jewelry.refs);
  push("JEWELRY CONSISTENCY", jewelry.lines);

  /* Craft -------------------------------------------------------- */
  const cine = findPreset(MADDEN_CINEMATOGRAPHY_PRESETS, state.settings.cinematographyId);
  const light = findPreset(MADDEN_LIGHTING_PRESETS, state.settings.lightingId);
  const env = findPreset(MADDEN_ENVIRONMENT_PRESETS, state.settings.environmentId);

  push("CINEMATOGRAPHY", cine ? [`${cine.name}: ${cine.promptFragment}`] : []);
  push("LIGHTING", light ? [`${light.name}: ${light.promptFragment}`] : []);
  push(
    "ENVIRONMENT",
    env
      ? [`${env.name}: ${env.promptFragment}`]
      : [clean(state.slots.environment.description)],
  );

  if (!cine) {
    warnings.push({
      code: "no_cinematography",
      message: "No cinematography preset selected — camera language is unspecified.",
    });
  }
  if (!light) {
    warnings.push({
      code: "no_lighting",
      message: "No lighting preset selected — lighting continuity is unspecified.",
    });
  }

  /* Shots -------------------------------------------------------- */
  push(
    "SHOT LIST",
    state.shots.map((shot, index) => {
      const inherits =
        shot.inheritSlots.length > 0 ? shot.inheritSlots.join(", ") : "all locked slots";
      return `${index + 1}. ${clean(shot.title) || `Shot ${index + 1}`} (${shot.durationSeconds || 0}s) — ${
        clean(shot.direction) || "no direction given"
      }. Inherits: ${inherits}.`;
    }),
  );

  /* Continuity + direction --------------------------------------- */
  push("CONTINUITY", lockedSlotSummary(state));
  push("DIRECTION", [clean(state.settings.globalNotes)]);

  /* Provider-safety guardrails ----------------------------------- */
  push("CONSTRAINTS", [
    "Identity is defined solely by the attached reference images and the technical descriptors above. Do not name, imply or substitute any real, public or famous person.",
    "Do not add jewelry, garments, tattoos or text that are not described above.",
    "No on-screen captions or watermarks unless explicitly directed.",
  ]);

  /* Capability warnings (non-blocking) --------------------------- */
  const longShots = state.shots.filter((shot) => (shot.durationSeconds || 0) > 10);
  if (longShots.length > 0) {
    warnings.push({
      code: "shot_duration",
      message: `${longShots.length} shot(s) exceed 10s. Most video providers cap a single clip near 10s — these will need to be split.`,
    });
  }
  if (state.shots.length > 1) {
    warnings.push({
      code: "multi_shot",
      message:
        "Multi-shot boards render as separate clips: continuity across cuts depends on the locked references, not on the provider.",
    });
  }
  if (referenceUrls.length > 3) {
    warnings.push({
      code: "reference_count",
      message: `${referenceUrls.length} reference images are bound. Providers commonly accept only the first few — order matters.`,
    });
  }
  if (state.slots.subject.locked && !subjectDataOf(state.slots.subject)) {
    warnings.push({
      code: "locked_without_profile",
      message:
        "The subject slot is locked but carries no analysed profile — the lock cannot be enforced technically.",
    });
  }

  const prompt = sections
    .map((section) => `${section.title}\n${section.lines.map((l) => `- ${l}`).join("\n")}`)
    .join("\n\n");

  return {
    prompt,
    sections,
    warnings,
    referenceUrls: Array.from(new Set(referenceUrls)),
  };
}

/** Resolves which prompt would actually be used. */
export function resolveMaddenPrompt(
  state: MaddenProjectState,
): { autoPrompt: string; finalPrompt: string; userEdited: boolean; compiled: MaddenCompiledPrompt } {
  const compiled = maddenMediaPromptCompiler(state);
  const userEdited = state.settings.promptUserEdited === true;
  const override = clean(state.settings.promptOverride);
  return {
    autoPrompt: compiled.prompt,
    finalPrompt: userEdited && override ? override : compiled.prompt,
    userEdited: userEdited && override.length > 0,
    compiled,
  };
}

/**
 * M7 — per-shot compile. The shot keeps the project's locked subject / outfit /
 * jewelry consistency and contributes only its own composition + direction.
 * Pure: no provider call, no persistence.
 */
export function maddenShotPromptCompiler(
  state: MaddenProjectState,
  shot: MaddenShot,
): MaddenCompiledPrompt {
  const shotState: MaddenProjectState = {
    ...state,
    shots: [shot],
    settings: {
      ...state.settings,
      cinematographyId: shot.cinematographyId ?? state.settings.cinematographyId,
      // A project-level prompt override never masks a single shot's compile.
      promptOverride: "",
      promptUserEdited: false,
    },
  };
  return maddenMediaPromptCompiler(shotState);
}

