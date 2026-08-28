/**
 * Madden Media Studio — M7 shot packs.
 *
 * A shot pack is an ORDERED list of camera/composition intents. Every entry
 * references a cinematography preset id that already exists in the M4 curated
 * library — no new preset values are invented here. Applying a pack is a pure
 * state merge: no provider call, no credit spend.
 */
import {
  type MaddenProjectState,
  type MaddenShot,
} from "@/lib/madden-media/types";
import { MADDEN_CINEMATOGRAPHY_PRESETS } from "@/lib/madden-media/cinematographyPresets";
import { findPreset } from "@/lib/madden-media/presetTypes";

export type MaddenPackShot = {
  /** Stable key inside the pack (shot ids are generated per project). */
  key: string;
  title: string;
  direction: string;
  durationSeconds: number;
  /** Existing MADDEN_CINEMATOGRAPHY_PRESETS id. */
  cinematographyId: string;
};

export type MaddenShotPack = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  builtin: true;
  shots: MaddenPackShot[];
};

export const MADDEN_DEFAULT_SHOT_PACK_ID = "default-seven";

export const MADDEN_SHOT_PACKS: MaddenShotPack[] = [
  {
    id: MADDEN_DEFAULT_SHOT_PACK_ID,
    name: "Default 7",
    description:
      "The baseline coverage set: establish, carry, land the face, prove the detail, add motion, reverse, then hero out.",
    tags: ["default", "coverage", "7 shots"],
    builtin: true,
    shots: [
      {
        key: "establishing",
        title: "01 Establishing",
        direction: "Open on the location with the subject fully in frame so the world reads first.",
        durationSeconds: 5,
        cinematographyId: "wide-establishing",
      },
      {
        key: "medium",
        title: "02 Medium",
        direction: "Waist-up carry shot — the silhouette and posture do the work.",
        durationSeconds: 5,
        cinematographyId: "two-shot-medium",
      },
      {
        key: "close-up",
        title: "03 Close-up",
        direction: "Land on the face. Locked identity must read cleanly at this size.",
        durationSeconds: 4,
        cinematographyId: "portrait-85mm",
      },
      {
        key: "detail",
        title: "04 Detail",
        direction: "Hold on hardware and material — chain links, stitching, texture.",
        durationSeconds: 4,
        cinematographyId: "macro-detail",
      },
      {
        key: "motion",
        title: "05 Motion",
        direction: "Travel with the subject as they move through the space.",
        durationSeconds: 6,
        cinematographyId: "tracking-dolly",
      },
      {
        key: "reverse",
        title: "06 Reverse",
        direction: "Flip behind the subject and follow their eye line into the scene.",
        durationSeconds: 5,
        cinematographyId: "over-the-shoulder",
      },
      {
        key: "hero",
        title: "07 Hero",
        direction: "Close the cut on the dominant hero frame.",
        durationSeconds: 5,
        cinematographyId: "low-angle-hero",
      },
    ],
  },
  {
    id: "street-cypher",
    name: "Street cypher",
    description: "Looser handheld coverage built for performance energy over polish.",
    tags: ["handheld", "performance", "5 shots"],
    builtin: true,
    shots: [
      {
        key: "establishing",
        title: "01 Arrival",
        direction: "Wide arrival on the block, subject walking into frame.",
        durationSeconds: 5,
        cinematographyId: "wide-establishing",
      },
      {
        key: "handheld",
        title: "02 Handheld carry",
        direction: "Loose documentary sway while the subject performs.",
        durationSeconds: 6,
        cinematographyId: "handheld-verite",
      },
      {
        key: "push",
        title: "03 Push in",
        direction: "Creep toward the subject as the verse builds.",
        durationSeconds: 5,
        cinematographyId: "slow-push-in",
      },
      {
        key: "profile",
        title: "04 Profile",
        direction: "Hard side profile so the jawline and chain read graphic.",
        durationSeconds: 4,
        cinematographyId: "profile-side",
      },
      {
        key: "hero",
        title: "05 Hero",
        direction: "Low-angle hero to close.",
        durationSeconds: 5,
        cinematographyId: "low-angle-hero",
      },
    ],
  },
  {
    id: "product-focus",
    name: "Product focus",
    description: "Detail-led pack for pieces and garments, with a single identity anchor.",
    tags: ["product", "detail", "5 shots"],
    builtin: true,
    shots: [
      {
        key: "flat-lay",
        title: "01 Flat lay",
        direction: "Overhead layout of the pieces before anyone wears them.",
        durationSeconds: 4,
        cinematographyId: "top-down-flat-lay",
      },
      {
        key: "detail",
        title: "02 Macro detail",
        direction: "Extreme close on the hardware and finish.",
        durationSeconds: 4,
        cinematographyId: "macro-detail",
      },
      {
        key: "footwear",
        title: "03 Ground",
        direction: "Camera on the deck, footwear forward.",
        durationSeconds: 4,
        cinematographyId: "worms-eye-ground",
      },
      {
        key: "close-up",
        title: "04 Identity anchor",
        direction: "Portrait so the wearer's locked identity is established.",
        durationSeconds: 4,
        cinematographyId: "portrait-85mm",
      },
      {
        key: "orbit",
        title: "05 Orbit reveal",
        direction: "Arc around the full look to close.",
        durationSeconds: 6,
        cinematographyId: "orbit-arc",
      },
    ],
  },
];

export function findShotPack(id: string | null | undefined): MaddenShotPack | null {
  if (!id) return null;
  return MADDEN_SHOT_PACKS.find((pack) => pack.id === id) ?? null;
}

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return `shot_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Turns a pack entry into a project shot. Unknown preset ids are dropped. */
export function packShotToProjectShot(entry: MaddenPackShot): MaddenShot {
  const preset = findPreset(MADDEN_CINEMATOGRAPHY_PRESETS, entry.cinematographyId);
  return {
    id: newId(),
    title: entry.title,
    direction: entry.direction,
    durationSeconds: entry.durationSeconds,
    inheritSlots: [],
    cinematographyId: preset?.id ?? null,
    packShotKey: entry.key,
  };
}

/**
 * Applies a pack: the ordered shot list is replaced and the selection recorded.
 * Consistency slots, locks and prompt overrides are never touched.
 */
export function applyShotPackToState(
  state: MaddenProjectState,
  pack: MaddenShotPack,
): MaddenProjectState {
  return {
    ...state,
    shots: pack.shots.map(packShotToProjectShot),
    settings: { ...state.settings, shotPackId: pack.id },
  };
}

/** The cinematography preset a shot resolves to (its own, else the project's). */
export function resolveShotCinematographyId(
  state: MaddenProjectState,
  shot: MaddenShot,
): string | null {
  return shot.cinematographyId ?? state.settings.cinematographyId ?? null;
}
