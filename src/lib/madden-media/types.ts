/**
 * Madden Media Studio — M1 foundation types.
 *
 * Self-contained on purpose: nothing here imports from Cinema, Jewelry,
 * Generation Studio or Templates. Later phases (M2–M7) fill these slots in;
 * M1 only establishes the shape and safe defaults.
 */

export type MaddenSlotKind = "subject" | "outfit" | "jewelry" | "environment";

/** A single uploaded / referenced image attached to a slot. */
export type MaddenReference = {
  id: string;
  url: string;
  label?: string;
  /** Free-form notes the artist writes about this reference. */
  notes?: string;
};

/** Shared shape for the four consistency slots. */
export type MaddenSlot = {
  kind: MaddenSlotKind;
  /** Short human label, e.g. the artist name or the outfit name. */
  name: string;
  /** Description used later for prompt synthesis (M3+). */
  description: string;
  references: MaddenReference[];
  /** When true the slot is treated as locked continuity across all shots. */
  locked: boolean;
  /** M2+: the reusable madden_profiles row bound into this slot, if any. */
  profileId?: string | null;
  /**
   * M2+: the slot's structured consistency payload as bound into the project.
   * For the subject slot this is a MaddenSubjectProfileData shape; kept as
   * unknown here so this module stays free of cross-module imports.
   */
  profileData?: unknown;
};


/** A single 9:16 short-form shot in the board. */
export type MaddenShot = {
  id: string;
  title: string;
  /** Director-facing description of the action / framing. */
  direction: string;
  durationSeconds: number;
  /** Slots this shot inherits. Empty = inherit every locked slot. */
  inheritSlots: MaddenSlotKind[];
  /** M7: per-shot cinematography preset id; falls back to the project preset. */
  cinematographyId?: string | null;
  /** M7: the shot-pack entry this shot came from, when applied from a pack. */
  packShotKey?: string | null;
};

export type MaddenSettings = {
  /** Fixed to vertical short-form for this workspace. */
  aspectRatio: "9:16";
  /** Look/grade label, resolved in a later phase. */
  lookName: string;
  /** Notes that apply to the whole project. */
  globalNotes: string;
  /** M4: selected builtin preset ids (see lib/madden-media/*Presets.ts). */
  cinematographyId: string | null;
  lightingId: string | null;
  environmentId: string | null;
  /** M6: the user's edited prompt, when they have taken over from the compiler. */
  promptOverride?: string;
  /** M6: true once the user edits the prompt — their text then wins. */
  promptUserEdited?: boolean;
  /** M7: the selected shot pack id (see lib/madden-media/shotPacks.ts). */
  shotPackId?: string | null;
};



export type MaddenProjectState = {
  /** Schema version so later phases can migrate saved states safely. */
  version: 1;
  slots: Record<MaddenSlotKind, MaddenSlot>;
  shots: MaddenShot[];
  settings: MaddenSettings;
};

export type MaddenMediaProject = {
  id: string;
  userId: string;
  name: string;
  projectState: MaddenProjectState;
  createdAt: string;
  updatedAt: string;
};

export type MaddenProjectSummary = {
  id: string;
  name: string;
  updatedAt: string;
};

export const MADDEN_SLOT_KINDS: MaddenSlotKind[] = [
  "subject",
  "outfit",
  "jewelry",
  "environment",
];

export const MADDEN_SLOT_LABELS: Record<MaddenSlotKind, string> = {
  subject: "Subject",
  outfit: "Outfit",
  jewelry: "Jewelry",
  environment: "Environment",
};

export const MADDEN_SLOT_HINTS: Record<MaddenSlotKind, string> = {
  subject: "Artist / celebrity reference identity kept consistent across shots.",
  outfit: "The exact garment set worn in every shot.",
  jewelry: "Chains, rings, watches — locked piece-for-piece.",
  environment: "Location, time of day and lighting continuity.",
};

export function createSlot(kind: MaddenSlotKind): MaddenSlot {
  return { kind, name: "", description: "", references: [], locked: true };
}

export function createEmptyProjectState(): MaddenProjectState {
  return {
    version: 1,
    slots: {
      subject: createSlot("subject"),
      outfit: createSlot("outfit"),
      jewelry: createSlot("jewelry"),
      environment: createSlot("environment"),
    },
    shots: [],
    settings: {
      aspectRatio: "9:16",
      lookName: "",
      globalNotes: "",
      cinematographyId: null,
      lightingId: null,
      environmentId: null,
      promptOverride: "",
      promptUserEdited: false,
      shotPackId: null,
    },


  };
}

/** Defensively normalises anything read out of the jsonb column. */
export function normalizeProjectState(raw: unknown): MaddenProjectState {
  const base = createEmptyProjectState();
  if (!raw || typeof raw !== "object") return base;
  const value = raw as Partial<MaddenProjectState>;

  const slots = { ...base.slots };
  for (const kind of MADDEN_SLOT_KINDS) {
    const saved = (value.slots as Record<string, unknown> | undefined)?.[kind];
    if (saved && typeof saved === "object") {
      const s = saved as Partial<MaddenSlot>;
      slots[kind] = {
        kind,
        name: typeof s.name === "string" ? s.name : "",
        description: typeof s.description === "string" ? s.description : "",
        references: Array.isArray(s.references) ? (s.references as MaddenReference[]) : [],
        locked: s.locked !== false,
        profileId: typeof s.profileId === "string" ? s.profileId : null,
        profileData: s.profileData ?? undefined,
      };

    }
  }

  return {
    version: 1,
    slots,
    shots: normalizeShots(value.shots),
    settings: {
      aspectRatio: "9:16",
      lookName:
        typeof value.settings?.lookName === "string" ? value.settings.lookName : "",
      globalNotes:
        typeof value.settings?.globalNotes === "string" ? value.settings.globalNotes : "",
      cinematographyId:
        typeof value.settings?.cinematographyId === "string"
          ? value.settings.cinematographyId
          : null,
      lightingId:
        typeof value.settings?.lightingId === "string" ? value.settings.lightingId : null,
      environmentId:
        typeof value.settings?.environmentId === "string" ? value.settings.environmentId : null,
      promptOverride:
        typeof value.settings?.promptOverride === "string" ? value.settings.promptOverride : "",
      promptUserEdited: value.settings?.promptUserEdited === true,
      shotPackId:
        typeof value.settings?.shotPackId === "string" ? value.settings.shotPackId : null,
    },



  };
}
