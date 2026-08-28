/**
 * Madden Media Studio — M5 recipe cards.
 *
 * A recipe is a *structured config bundle* only: it references preset ids that
 * already exist in the M4 curated libraries and never invents new values.
 * Applying a recipe is a pure state merge — no provider calls, no generation.
 */
import {
  MADDEN_SLOT_KINDS,
  type MaddenProjectState,
  type MaddenSlotKind,
} from "@/lib/madden-media/types";
import { MADDEN_CINEMATOGRAPHY_PRESETS } from "@/lib/madden-media/cinematographyPresets";
import { MADDEN_LIGHTING_PRESETS } from "@/lib/madden-media/lightingPresets";
import { MADDEN_ENVIRONMENT_PRESETS } from "@/lib/madden-media/environmentPresets";
import { findPreset } from "@/lib/madden-media/presetTypes";

/** The partial project config a recipe carries. Every field is optional. */
export type MaddenRecipeConfig = {
  cinematographyId?: string | null;
  lightingId?: string | null;
  environmentId?: string | null;
  lookName?: string;
  globalNotes?: string;
  /** Continuity slots this recipe suggests locking. */
  lockSlots?: MaddenSlotKind[];
};

export type MaddenRecipe = {
  id: string;
  name: string;
  tags: string[];
  builtin: boolean;
  featured?: boolean;
  thumbnail?: string | null;
  config: MaddenRecipeConfig;
  createdAt?: string;
};

const ALL_SLOTS: MaddenSlotKind[] = ["subject", "outfit", "jewelry", "environment"];
const IDENTITY_SLOTS: MaddenSlotKind[] = ["subject", "outfit"];

function recipe(
  id: string,
  name: string,
  tags: string[],
  config: MaddenRecipeConfig,
  featured = false,
): MaddenRecipe {
  return { id, name, tags, builtin: true, featured, config };
}

/** ~20 curated builtins, composed only from existing M4 preset ids. */
export const MADDEN_BUILTIN_RECIPES: MaddenRecipe[] = [
  recipe(
    "midnight-chrome",
    "Midnight Chrome",
    ["night", "chrome", "hero"],
    {
      cinematographyId: "low-angle-hero",
      lightingId: "neon-night",
      environmentId: "rain-street-night",
      lookName: "Midnight Chrome",
      lockSlots: ALL_SLOTS,
    },
    true,
  ),
  recipe(
    "warehouse-cypher",
    "Warehouse Cypher",
    ["cypher", "raw", "crew"],
    {
      cinematographyId: "handheld-verite",
      lightingId: "mixed-practicals",
      environmentId: "industrial-warehouse",
      lookName: "Warehouse Cypher",
      lockSlots: IDENTITY_SLOTS,
    },
    true,
  ),
  recipe(
    "golden-hour-flex",
    "Golden Hour Flex",
    ["golden hour", "rooftop", "warm"],
    {
      cinematographyId: "slow-push-in",
      lightingId: "golden-hour",
      environmentId: "rooftop-city",
      lookName: "Golden Hour Flex",
      lockSlots: ALL_SLOTS,
    },
    true,
  ),
  recipe(
    "neon-rain",
    "Neon Rain",
    ["neon", "rain", "moody"],
    {
      cinematographyId: "tracking-dolly",
      lightingId: "streetlamp-sodium",
      environmentId: "tunnel-underpass",
      lookName: "Neon Rain",
      lockSlots: ALL_SLOTS,
    },
    true,
  ),
  recipe(
    "studio-portrait-lock",
    "Studio Portrait Lock",
    ["studio", "portrait", "clean"],
    {
      cinematographyId: "portrait-85mm",
      lightingId: "studio-softbox",
      environmentId: "studio-seamless",
      lookName: "Studio Portrait Lock",
      lockSlots: ALL_SLOTS,
    },
    true,
  ),
  recipe(
    "iced-out-macro",
    "Iced Out Macro",
    ["jewelry", "macro", "sparkle"],
    {
      cinematographyId: "macro-detail",
      lightingId: "spot-jewelry-sparkle",
      environmentId: "studio-cyc-grey",
      lookName: "Iced Out Macro",
      lockSlots: ["jewelry"],
    },
    true,
  ),
  recipe("blue-hour-block", "Blue Hour Block", ["night", "street", "cinematic"], {
    cinematographyId: "wide-establishing",
    lightingId: "neon-night",
    environmentId: "corner-store-exterior",
    lookName: "Blue Hour Block",
    lockSlots: ALL_SLOTS,
  }),
  recipe("flash-paparazzi", "Flash Paparazzi", ["flash", "press", "hard"], {
    cinematographyId: "handheld-verite",
    lightingId: "hard-flash",
    environmentId: "hotel-hallway",
    lookName: "Flash Paparazzi",
    lockSlots: IDENTITY_SLOTS,
  }),
  recipe("garage-grit", "Garage Grit", ["garage", "raw", "concrete"], {
    cinematographyId: "worms-eye-ground",
    lightingId: "top-down-hard",
    environmentId: "concrete-garage",
    lookName: "Garage Grit",
    lockSlots: ALL_SLOTS,
  }),
  recipe("penthouse-daylight", "Penthouse Daylight", ["luxury", "daylight", "soft"], {
    cinematographyId: "profile-side",
    lightingId: "window-daylight",
    environmentId: "penthouse-window",
    lookName: "Penthouse Daylight",
    lockSlots: ALL_SLOTS,
  }),
  recipe("mirror-fit-check", "Mirror Fit Check", ["fit check", "outfit", "social"], {
    cinematographyId: "mirror-selfie",
    lightingId: "high-key-white",
    environmentId: "laundromat",
    lookName: "Mirror Fit Check",
    lockSlots: ["outfit"],
  }),
  recipe("subway Ghost", "Subway Ghost", ["transit", "night", "kinetic"], {
    cinematographyId: "tracking-dolly",
    lightingId: "overcast-flat",
    environmentId: "subway-platform",
    lookName: "Subway Ghost",
    lockSlots: IDENTITY_SLOTS,
  }),
  recipe("court-lights", "Court Lights", ["sport", "night", "energy"], {
    cinematographyId: "orbit-arc",
    lightingId: "top-down-hard",
    environmentId: "basketball-court",
    lookName: "Court Lights",
    lockSlots: ALL_SLOTS,
  }),
  recipe("barbershop-portrait", "Barbershop Portrait", ["portrait", "interior", "warm"], {
    cinematographyId: "over-the-shoulder",
    lightingId: "mixed-practicals",
    environmentId: "barbershop",
    lookName: "Barbershop Portrait",
    lockSlots: IDENTITY_SLOTS,
  }),
  recipe("desert-chrome", "Desert Chrome", ["desert", "wide", "sun"], {
    cinematographyId: "wide-establishing",
    lightingId: "golden-hour",
    environmentId: "desert-flats",
    lookName: "Desert Chrome",
    lockSlots: ALL_SLOTS,
  }),
  recipe("elevator-tension", "Elevator Tension", ["tight", "moody", "interior"], {
    cinematographyId: "dutch-tilt",
    lightingId: "underlit-uplight",
    environmentId: "service-elevator",
    lookName: "Elevator Tension",
    lockSlots: IDENTITY_SLOTS,
  }),
  recipe("rave Room", "Rave Room", ["party", "crowd", "neon"], {
    cinematographyId: "handheld-verite",
    lightingId: "neon-night",
    environmentId: "warehouse-party",
    lookName: "Rave Room",
    lockSlots: IDENTITY_SLOTS,
  }),
  recipe("gallery-white", "Gallery White", ["editorial", "clean", "high key"], {
    cinematographyId: "two-shot-medium",
    lightingId: "high-key-white",
    environmentId: "white-cube-gallery",
    lookName: "Gallery White",
    lockSlots: ALL_SLOTS,
  }),
  recipe("cabin-altitude", "Cabin Altitude", ["luxury", "travel", "soft"], {
    cinematographyId: "portrait-85mm",
    lightingId: "window-daylight",
    environmentId: "private-jet-cabin",
    lookName: "Cabin Altitude",
    lockSlots: ALL_SLOTS,
  }),
  recipe("skate-dusk", "Skate Dusk", ["skate", "dusk", "motion"], {
    cinematographyId: "tracking-dolly",
    lightingId: "rim-light",
    environmentId: "skate-park",
    lookName: "Skate Dusk",
    lockSlots: IDENTITY_SLOTS,
  }),
  recipe("fog-silhouette", "Fog Silhouette", ["fog", "silhouette", "contrast"], {
    cinematographyId: "slow-push-in",
    lightingId: "chiaroscuro",
    environmentId: "forest-fog",
    lookName: "Fog Silhouette",
    lockSlots: ALL_SLOTS,
  }),
  recipe("flat-lay-drop", "Flat Lay Drop", ["product", "drop", "top down"], {
    cinematographyId: "top-down-flat-lay",
    lightingId: "soft-key",
    environmentId: "studio-cyc-grey",
    lookName: "Flat Lay Drop",
    lockSlots: ["outfit", "jewelry"],
  }),
];

export const MADDEN_FEATURED_RECIPES = MADDEN_BUILTIN_RECIPES.filter((r) => r.featured);

/** Human-readable summary of what a recipe sets, resolved against M4 presets. */
export function describeRecipe(config: MaddenRecipeConfig): string[] {
  const parts: string[] = [];
  const cine = findPreset(MADDEN_CINEMATOGRAPHY_PRESETS, config.cinematographyId);
  const light = findPreset(MADDEN_LIGHTING_PRESETS, config.lightingId);
  const env = findPreset(MADDEN_ENVIRONMENT_PRESETS, config.environmentId);
  if (cine) parts.push(cine.name);
  if (light) parts.push(light.name);
  if (env) parts.push(env.name);
  return parts;
}

/** True when the slot carries user work that a recipe must never overwrite. */
function slotIsUserOwned(state: MaddenProjectState, kind: MaddenSlotKind): boolean {
  const slot = state.slots[kind];
  if (!slot) return false;
  const hasWork =
    Boolean(slot.profileId) ||
    Boolean(slot.profileData) ||
    slot.references.length > 0 ||
    slot.name.trim().length > 0 ||
    slot.description.trim().length > 0;
  // A locked slot with real content is a STRICT lock — untouchable.
  return hasWork && slot.locked;
}

/**
 * Merges a recipe config into project state.
 *
 * Rules: user overrides win. A settings field is only written when the recipe
 * defines it AND the project has not already been set by the user, unless the
 * caller explicitly asks to overwrite presets. STRICT (locked + filled) slots
 * are never modified.
 */
export function applyRecipeToState(
  state: MaddenProjectState,
  config: MaddenRecipeConfig,
  options?: { overwritePresets?: boolean },
): { next: MaddenProjectState; skipped: MaddenSlotKind[] } {
  const overwrite = options?.overwritePresets !== false;
  const skipped: MaddenSlotKind[] = [];

  const pick = (recipeValue: string | null | undefined, current: string | null) => {
    if (recipeValue === undefined) return current;
    if (!overwrite && current) return current;
    return recipeValue;
  };

  const settings = {
    ...state.settings,
    cinematographyId: pick(config.cinematographyId, state.settings.cinematographyId),
    lightingId: pick(config.lightingId, state.settings.lightingId),
    environmentId: pick(config.environmentId, state.settings.environmentId),
    lookName:
      config.lookName === undefined
        ? state.settings.lookName
        : !overwrite && state.settings.lookName
          ? state.settings.lookName
          : config.lookName,
    globalNotes:
      config.globalNotes && !state.settings.globalNotes.trim()
        ? config.globalNotes
        : state.settings.globalNotes,
  };

  const slots = { ...state.slots };

  // Environment slot mirrors the chosen environment preset (M4 behaviour),
  // but only when the user has not locked their own environment continuity.
  if (settings.environmentId !== state.settings.environmentId) {
    if (slotIsUserOwned(state, "environment")) {
      skipped.push("environment");
      settings.environmentId = state.settings.environmentId;
    } else {
      const preset = findPreset(MADDEN_ENVIRONMENT_PRESETS, settings.environmentId);
      slots.environment = {
        ...slots.environment,
        name: preset?.name ?? "",
        description: preset?.promptFragment ?? "",
      };
    }
  }

  for (const kind of config.lockSlots ?? []) {
    if (!MADDEN_SLOT_KINDS.includes(kind)) continue;
    if (slots[kind].locked) continue;
    slots[kind] = { ...slots[kind], locked: true };
  }

  return { next: { ...state, settings, slots }, skipped };
}

/** Captures the current project settings as a saveable recipe config. */
export function buildRecipeConfigFromState(state: MaddenProjectState): MaddenRecipeConfig {
  return {
    cinematographyId: state.settings.cinematographyId,
    lightingId: state.settings.lightingId,
    environmentId: state.settings.environmentId,
    lookName: state.settings.lookName,
    lockSlots: MADDEN_SLOT_KINDS.filter((kind) => state.slots[kind].locked),
  };
}

/** Defensively normalises a config read out of the madden_recipes jsonb column. */
export function normalizeRecipeConfig(raw: unknown): MaddenRecipeConfig {
  if (!raw || typeof raw !== "object") return {};
  const value = raw as Record<string, unknown>;
  const str = (key: string) =>
    typeof value[key] === "string" ? (value[key] as string) : undefined;
  const lockSlots = Array.isArray(value.lockSlots)
    ? (value.lockSlots as unknown[])
        .map((slot) => String(slot) as MaddenSlotKind)
        .filter((slot) => MADDEN_SLOT_KINDS.includes(slot))
    : undefined;
  return {
    cinematographyId: str("cinematographyId") ?? null,
    lightingId: str("lightingId") ?? null,
    environmentId: str("environmentId") ?? null,
    lookName: str("lookName"),
    globalNotes: str("globalNotes"),
    lockSlots,
  };
}
