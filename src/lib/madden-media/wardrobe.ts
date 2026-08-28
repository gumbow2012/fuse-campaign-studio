/**
 * Madden Media Studio — M3 outfit + jewelry consistency models.
 *
 * Self-contained: nothing here imports Cinema, Jewelry Swap, Outfit Swap,
 * Generation Studio or Templates. Attributes are VISUAL-CONSISTENCY
 * descriptors only — never brand claims, never identity, never sensitive
 * inference.
 *
 * Subject / outfit / jewelry are INDEPENDENT modules: a project can keep one
 * and swap the others. User edits and locks always win over analysis.
 */
import {
  MADDEN_LOCK_LEVELS,
  type MaddenLockLevel,
} from "@/lib/madden-media/subject";

const str = (value: unknown) => (typeof value === "string" ? value : "");
const strList = (value: unknown) =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

/* ------------------------------------------------------------------ *
 * Outfit
 * ------------------------------------------------------------------ */

export type MaddenOutfitCategory =
  | "top"
  | "bottom"
  | "footwear"
  | "outerwear"
  | "accessories";

export const MADDEN_OUTFIT_CATEGORIES: MaddenOutfitCategory[] = [
  "top",
  "bottom",
  "footwear",
  "outerwear",
  "accessories",
];

export const MADDEN_OUTFIT_LABELS: Record<MaddenOutfitCategory, string> = {
  top: "Top",
  bottom: "Bottom",
  footwear: "Shoes",
  outerwear: "Outerwear",
  accessories: "Accessories",
};

/** One garment slot described for faithful regeneration. */
export type MaddenGarment = {
  present: boolean;
  material: string;
  color: string;
  graphics: string;
  logos: string;
  typography: string;
  fit: string;
  silhouette: string;
  construction: string;
};

export const MADDEN_GARMENT_FIELDS: { key: keyof Omit<MaddenGarment, "present">; label: string }[] =
  [
    { key: "material", label: "Material" },
    { key: "color", label: "Color" },
    { key: "graphics", label: "Graphics / print" },
    { key: "logos", label: "Logos / marks" },
    { key: "typography", label: "Typography" },
    { key: "fit", label: "Fit" },
    { key: "silhouette", label: "Silhouette" },
    { key: "construction", label: "Construction / detailing" },
  ];

export type MaddenOutfitAttributes = Record<MaddenOutfitCategory, MaddenGarment> & {
  notes: string;
  uncertain: string[];
};

export type MaddenOutfitLocks = Record<MaddenOutfitCategory, MaddenLockLevel>;

export type MaddenOutfitProfileData = {
  version: 1;
  attributes: MaddenOutfitAttributes;
  locks: MaddenOutfitLocks;
  referenceUrls: string[];
  analysis?: { version: string; model: string; analyzedAt: string } | null;
  edited?: boolean;
};

function emptyGarment(): MaddenGarment {
  return {
    present: false,
    material: "",
    color: "",
    graphics: "",
    logos: "",
    typography: "",
    fit: "",
    silhouette: "",
    construction: "",
  };
}

function normalizeGarment(raw: unknown): MaddenGarment {
  if (!raw || typeof raw !== "object") return emptyGarment();
  const v = raw as Record<string, unknown>;
  return {
    present: v.present === true,
    material: str(v.material),
    color: str(v.color),
    graphics: str(v.graphics),
    logos: str(v.logos),
    typography: str(v.typography),
    fit: str(v.fit),
    silhouette: str(v.silhouette),
    construction: str(v.construction),
  };
}

export function createEmptyOutfitAttributes(): MaddenOutfitAttributes {
  return {
    top: emptyGarment(),
    bottom: emptyGarment(),
    footwear: emptyGarment(),
    outerwear: emptyGarment(),
    accessories: emptyGarment(),
    notes: "",
    uncertain: [],
  };
}

export function createDefaultOutfitLocks(): MaddenOutfitLocks {
  return {
    top: "strong",
    bottom: "strong",
    footwear: "strong",
    outerwear: "strong",
    accessories: "strong",
  };
}

export function createEmptyOutfitData(): MaddenOutfitProfileData {
  return {
    version: 1,
    attributes: createEmptyOutfitAttributes(),
    locks: createDefaultOutfitLocks(),
    referenceUrls: [],
    analysis: null,
    edited: false,
  };
}

export function normalizeOutfitAttributes(raw: unknown): MaddenOutfitAttributes {
  const base = createEmptyOutfitAttributes();
  if (!raw || typeof raw !== "object") return base;
  const v = raw as Record<string, unknown>;
  for (const category of MADDEN_OUTFIT_CATEGORIES) {
    base[category] = normalizeGarment(v[category]);
  }
  base.notes = str(v.notes);
  base.uncertain = strList(v.uncertain);
  return base;
}

function normalizeLockMap<K extends string>(raw: unknown, base: Record<K, MaddenLockLevel>) {
  if (!raw || typeof raw !== "object") return base;
  const v = raw as Record<string, unknown>;
  for (const key of Object.keys(base) as K[]) {
    const level = v[key];
    if (typeof level === "string" && (MADDEN_LOCK_LEVELS as string[]).includes(level)) {
      base[key] = level as MaddenLockLevel;
    }
  }
  return base;
}

export function normalizeOutfitLocks(raw: unknown): MaddenOutfitLocks {
  return normalizeLockMap(raw, createDefaultOutfitLocks());
}

function readAnalysis(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  return { version: str(v.version), model: str(v.model), analyzedAt: str(v.analyzedAt) };
}

export function normalizeOutfitData(raw: unknown): MaddenOutfitProfileData {
  if (!raw || typeof raw !== "object") return createEmptyOutfitData();
  const v = raw as Record<string, unknown>;
  return {
    version: 1,
    attributes: normalizeOutfitAttributes(v.attributes),
    locks: normalizeOutfitLocks(v.locks),
    referenceUrls: strList(v.referenceUrls),
    analysis: readAnalysis(v.analysis),
    edited: v.edited === true,
  };
}

export function summarizeOutfit(data: MaddenOutfitProfileData): string {
  return MADDEN_OUTFIT_CATEGORIES.filter((category) => data.attributes[category].present)
    .map((category) => {
      const garment = data.attributes[category];
      return [garment.color, MADDEN_OUTFIT_LABELS[category].toLowerCase()]
        .filter(Boolean)
        .join(" ");
    })
    .join(" · ");
}

/* ------------------------------------------------------------------ *
 * Jewelry
 * ------------------------------------------------------------------ */

export type MaddenJewelryCategory =
  | "chain"
  | "pendant"
  | "grill"
  | "earrings"
  | "rings"
  | "bracelet"
  | "watch";

export const MADDEN_JEWELRY_CATEGORIES: MaddenJewelryCategory[] = [
  "chain",
  "pendant",
  "grill",
  "earrings",
  "rings",
  "bracelet",
  "watch",
];

export const MADDEN_JEWELRY_LABELS: Record<MaddenJewelryCategory, string> = {
  chain: "Chain",
  pendant: "Pendant",
  grill: "Grill",
  earrings: "Earrings",
  rings: "Rings",
  bracelet: "Bracelet",
  watch: "Watch",
};

export type MaddenJewelryPiece = {
  present: boolean;
  metal: string;
  finish: string;
  stones: string;
  form: string;
  engraving: string;
  scale: string;
};

export const MADDEN_JEWELRY_FIELDS: {
  key: keyof Omit<MaddenJewelryPiece, "present">;
  label: string;
}[] = [
  { key: "metal", label: "Metal" },
  { key: "finish", label: "Finish" },
  { key: "stones", label: "Stones / setting" },
  { key: "form", label: "Form / shape" },
  { key: "engraving", label: "Engraving / detail" },
  { key: "scale", label: "Scale / proportion" },
];

export type MaddenJewelryAttributes = Record<MaddenJewelryCategory, MaddenJewelryPiece> & {
  notes: string;
  uncertain: string[];
};

export type MaddenJewelryLocks = Record<MaddenJewelryCategory, MaddenLockLevel>;

export type MaddenJewelryProfileData = {
  version: 1;
  attributes: MaddenJewelryAttributes;
  locks: MaddenJewelryLocks;
  referenceUrls: string[];
  analysis?: { version: string; model: string; analyzedAt: string } | null;
  edited?: boolean;
};

function emptyPiece(): MaddenJewelryPiece {
  return {
    present: false,
    metal: "",
    finish: "",
    stones: "",
    form: "",
    engraving: "",
    scale: "",
  };
}

function normalizePiece(raw: unknown): MaddenJewelryPiece {
  if (!raw || typeof raw !== "object") return emptyPiece();
  const v = raw as Record<string, unknown>;
  return {
    present: v.present === true,
    metal: str(v.metal),
    finish: str(v.finish),
    stones: str(v.stones),
    form: str(v.form),
    engraving: str(v.engraving),
    scale: str(v.scale),
  };
}

export function createEmptyJewelryAttributes(): MaddenJewelryAttributes {
  return {
    chain: emptyPiece(),
    pendant: emptyPiece(),
    grill: emptyPiece(),
    earrings: emptyPiece(),
    rings: emptyPiece(),
    bracelet: emptyPiece(),
    watch: emptyPiece(),
    notes: "",
    uncertain: [],
  };
}

export function createDefaultJewelryLocks(): MaddenJewelryLocks {
  return {
    chain: "strong",
    pendant: "strong",
    grill: "strong",
    earrings: "strong",
    rings: "strong",
    bracelet: "strong",
    watch: "strong",
  };
}

export function createEmptyJewelryData(): MaddenJewelryProfileData {
  return {
    version: 1,
    attributes: createEmptyJewelryAttributes(),
    locks: createDefaultJewelryLocks(),
    referenceUrls: [],
    analysis: null,
    edited: false,
  };
}

export function normalizeJewelryAttributes(raw: unknown): MaddenJewelryAttributes {
  const base = createEmptyJewelryAttributes();
  if (!raw || typeof raw !== "object") return base;
  const v = raw as Record<string, unknown>;
  for (const category of MADDEN_JEWELRY_CATEGORIES) {
    base[category] = normalizePiece(v[category]);
  }
  base.notes = str(v.notes);
  base.uncertain = strList(v.uncertain);
  return base;
}

export function normalizeJewelryLocks(raw: unknown): MaddenJewelryLocks {
  return normalizeLockMap(raw, createDefaultJewelryLocks());
}

export function normalizeJewelryData(raw: unknown): MaddenJewelryProfileData {
  if (!raw || typeof raw !== "object") return createEmptyJewelryData();
  const v = raw as Record<string, unknown>;
  return {
    version: 1,
    attributes: normalizeJewelryAttributes(v.attributes),
    locks: normalizeJewelryLocks(v.locks),
    referenceUrls: strList(v.referenceUrls),
    analysis: readAnalysis(v.analysis),
    edited: v.edited === true,
  };
}

export function summarizeJewelry(data: MaddenJewelryProfileData): string {
  return MADDEN_JEWELRY_CATEGORIES.filter((category) => data.attributes[category].present)
    .map((category) => {
      const piece = data.attributes[category];
      return [piece.metal, MADDEN_JEWELRY_LABELS[category].toLowerCase()]
        .filter(Boolean)
        .join(" ");
    })
    .join(" · ");
}

/** Reusable profile envelope for both M3 modules. */
export type MaddenProfileOf<T> = {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  data: T;
  updatedAt: string;
};

export type MaddenOutfitProfile = MaddenProfileOf<MaddenOutfitProfileData>;
export type MaddenJewelryProfile = MaddenProfileOf<MaddenJewelryProfileData>;
