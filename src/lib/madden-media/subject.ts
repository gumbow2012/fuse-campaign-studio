/**
 * Madden Media Studio — M2 subject consistency model.
 *
 * Self-contained: nothing here imports Cinema, Jewelry, Outfit or Generation
 * Studio code. Attributes are VISUAL-CONSISTENCY descriptors only — this model
 * never stores or asks for the identity of a real person.
 */

export type MaddenLockLevel = "strict" | "strong" | "medium" | "flexible";

export const MADDEN_LOCK_LEVELS: MaddenLockLevel[] = [
  "strict",
  "strong",
  "medium",
  "flexible",
];

export const MADDEN_LOCK_LABELS: Record<MaddenLockLevel, string> = {
  strict: "Strict",
  strong: "Strong",
  medium: "Medium",
  flexible: "Flexible",
};

export type MaddenSubjectLockCategory =
  | "face"
  | "skin"
  | "hair"
  | "facialHair"
  | "tattoos"
  | "grills";

export const MADDEN_SUBJECT_LOCK_CATEGORIES: MaddenSubjectLockCategory[] = [
  "face",
  "skin",
  "hair",
  "facialHair",
  "tattoos",
  "grills",
];

export const MADDEN_SUBJECT_LOCK_LABELS: Record<MaddenSubjectLockCategory, string> = {
  face: "Face",
  skin: "Skin",
  hair: "Hair",
  facialHair: "Facial hair",
  tattoos: "Tattoos",
  grills: "Grills",
};

export type MaddenSubjectLocks = Record<MaddenSubjectLockCategory, MaddenLockLevel>;

export type MaddenSubjectAttributes = {
  face: { shape: string; proportions: string; distinguishingFeatures: string };
  skin: { tone: string; texture: string };
  hair: { style: string; color: string; length: string };
  facialHair: { present: boolean; description: string };
  tattoos: { present: boolean; description: string; placements: string[] };
  grills: { present: boolean; description: string };
  notes: string;
  uncertain: string[];
};

export type MaddenSubjectProfileData = {
  version: 1;
  attributes: MaddenSubjectAttributes;
  locks: MaddenSubjectLocks;
  referenceUrls: string[];
  /** Analysis provenance so a later phase can tell fresh from stale. */
  analysis?: { version: string; model: string; analyzedAt: string } | null;
  /** True once the artist has hand-edited any field — user edits always win. */
  edited?: boolean;
};

export type MaddenSubjectProfile = {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  data: MaddenSubjectProfileData;
  updatedAt: string;
};

export function createDefaultLocks(): MaddenSubjectLocks {
  return {
    face: "strong",
    skin: "strong",
    hair: "strong",
    facialHair: "strong",
    tattoos: "strong",
    grills: "strong",
  };
}

export function createEmptySubjectAttributes(): MaddenSubjectAttributes {
  return {
    face: { shape: "", proportions: "", distinguishingFeatures: "" },
    skin: { tone: "", texture: "" },
    hair: { style: "", color: "", length: "" },
    facialHair: { present: false, description: "" },
    tattoos: { present: false, description: "", placements: [] },
    grills: { present: false, description: "" },
    notes: "",
    uncertain: [],
  };
}

export function createEmptySubjectData(): MaddenSubjectProfileData {
  return {
    version: 1,
    attributes: createEmptySubjectAttributes(),
    locks: createDefaultLocks(),
    referenceUrls: [],
    analysis: null,
    edited: false,
  };
}

const str = (value: unknown) => (typeof value === "string" ? value : "");
const bool = (value: unknown) => value === true;
const strList = (value: unknown) =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

/** Defensively normalises anything read from jsonb or the analysis response. */
export function normalizeSubjectAttributes(raw: unknown): MaddenSubjectAttributes {
  const base = createEmptySubjectAttributes();
  if (!raw || typeof raw !== "object") return base;
  const v = raw as Record<string, any>;
  return {
    face: {
      shape: str(v.face?.shape),
      proportions: str(v.face?.proportions),
      distinguishingFeatures: str(v.face?.distinguishingFeatures),
    },
    skin: { tone: str(v.skin?.tone), texture: str(v.skin?.texture) },
    hair: {
      style: str(v.hair?.style),
      color: str(v.hair?.color),
      length: str(v.hair?.length),
    },
    facialHair: {
      present: bool(v.facialHair?.present),
      description: str(v.facialHair?.description),
    },
    tattoos: {
      present: bool(v.tattoos?.present),
      description: str(v.tattoos?.description),
      placements: strList(v.tattoos?.placements),
    },
    grills: { present: bool(v.grills?.present), description: str(v.grills?.description) },
    notes: str(v.notes),
    uncertain: strList(v.uncertain),
  };
}

export function normalizeLocks(raw: unknown): MaddenSubjectLocks {
  const base = createDefaultLocks();
  if (!raw || typeof raw !== "object") return base;
  const v = raw as Record<string, unknown>;
  for (const key of MADDEN_SUBJECT_LOCK_CATEGORIES) {
    const level = v[key];
    if (typeof level === "string" && (MADDEN_LOCK_LEVELS as string[]).includes(level)) {
      base[key] = level as MaddenLockLevel;
    }
  }
  return base;
}

export function normalizeSubjectData(raw: unknown): MaddenSubjectProfileData {
  if (!raw || typeof raw !== "object") return createEmptySubjectData();
  const v = raw as Record<string, any>;
  const analysis = v.analysis && typeof v.analysis === "object"
    ? {
        version: str(v.analysis.version),
        model: str(v.analysis.model),
        analyzedAt: str(v.analysis.analyzedAt),
      }
    : null;
  return {
    version: 1,
    attributes: normalizeSubjectAttributes(v.attributes),
    locks: normalizeLocks(v.locks),
    referenceUrls: strList(v.referenceUrls),
    analysis,
    edited: bool(v.edited),
  };
}

/** Short human summary used on cards — never an identity, only appearance. */
export function summarizeSubject(data: MaddenSubjectProfileData): string {
  const bits = [
    data.attributes.hair.style,
    data.attributes.facialHair.present ? data.attributes.facialHair.description : "",
    data.attributes.tattoos.present ? "visible tattoos" : "",
    data.attributes.grills.present ? "grills" : "",
  ].filter((bit) => bit.trim().length > 0);
  return bits.join(" · ");
}
