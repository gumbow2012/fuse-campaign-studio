/**
 * FT2 — Additive rich input metadata for template inputs.
 *
 * These fields live inside `nodes.prompt_config` (jsonb) — no new table, no
 * migration. Every field is optional: when metadata is absent the reader
 * returns safe defaults so legacy templates behave exactly as before.
 */

export const TEMPLATE_ASSET_TYPES = [
  "garment-front",
  "garment-back",
  "logo",
  "product",
  "avatar",
  "jewelry",
  "packaging",
  "reference",
  "image",
  "video",
] as const;

export type TemplateAssetType = (typeof TEMPLATE_ASSET_TYPES)[number];

export interface TemplateAssetRequirement {
  assetType?: TemplateAssetType;
  required?: boolean;
  minFiles: number;
  maxFiles: number;
  shortInstruction?: string;
  detailedInstructions?: string[];
  recommendedAspect?: string;
  recommendedResolution?: string;
  transparencyRecommended?: boolean;
  /** Plumbed for a later phase (upload guides / example galleries). */
  guidePreview?: string;
  goodExamples?: string[];
  badExamples?: string[];
  allowUpload: boolean;
  allowLibrary: boolean;
  /**
   * PRESENTATION-ONLY grouping metadata (optional, additive). Lets a template
   * declare that several backend inputs describe ONE real-world product so the
   * builder can show a single customer-facing card. Never affects execution.
   */
  groupId?: string;
  groupLabel?: string;
  groupType?: string;
  customerSlotLabel?: string;
  helperText?: string;
  sequence?: number;
}


function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function bool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function count(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function integer(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map((item) => text(item)).filter((item): item is string => !!item);
  return items.length ? items : undefined;
}

function assetType(value: unknown): TemplateAssetType | undefined {
  const raw = text(value)?.toLowerCase();
  return raw && (TEMPLATE_ASSET_TYPES as readonly string[]).includes(raw)
    ? (raw as TemplateAssetType)
    : undefined;
}

/**
 * Reads the additive requirement metadata out of an arbitrary record
 * (`prompt_config`, or the `requirement` object projected by the backend).
 * Accepts both snake_case (db convention) and camelCase (api convention).
 */
export function readTemplateAssetRequirement(
  source: Record<string, unknown> | null | undefined,
  fallback: { required?: boolean } = {},
): TemplateAssetRequirement {
  const raw = (source ?? {}) as Record<string, unknown>;
  const pick = (snake: string, camel: string) => raw[snake] ?? raw[camel];

  const minFiles = count(pick("min_files", "minFiles")) ?? 1;
  const maxFiles = Math.max(minFiles, count(pick("max_files", "maxFiles")) ?? 1);

  return {
    assetType: assetType(pick("asset_type", "assetType")),
    required: bool(raw.required) ?? fallback.required,
    minFiles,
    maxFiles,
    shortInstruction: text(pick("short_instruction", "shortInstruction")),
    detailedInstructions: stringList(pick("detailed_instructions", "detailedInstructions")),
    recommendedAspect: text(pick("recommended_aspect", "recommendedAspect")),
    recommendedResolution: text(pick("recommended_resolution", "recommendedResolution")),
    transparencyRecommended: bool(pick("transparency_recommended", "transparencyRecommended")),
    guidePreview: text(pick("guide_preview", "guidePreview")),
    goodExamples: stringList(pick("good_examples", "goodExamples")),
    badExamples: stringList(pick("bad_examples", "badExamples")),
    allowUpload: bool(pick("allow_upload", "allowUpload")) ?? true,
    allowLibrary: bool(pick("allow_library", "allowLibrary")) ?? false,
    groupId: text(pick("group_id", "groupId")),
    groupLabel: text(pick("group_label", "groupLabel")),
    groupType: text(pick("group_type", "groupType")),
    customerSlotLabel: text(pick("customer_slot_label", "customerSlotLabel")),
    helperText: text(pick("helper_text", "helperText")),
    sequence: integer(pick("sequence", "sequence")),
  };
}

/** True when the metadata carries anything beyond the defaults. */
export function hasRichRequirementMetadata(requirement: TemplateAssetRequirement | null | undefined) {
  if (!requirement) return false;
  return !!(
    requirement.assetType ||
    requirement.shortInstruction ||
    requirement.detailedInstructions?.length ||
    requirement.recommendedAspect ||
    requirement.recommendedResolution ||
    requirement.transparencyRecommended ||
    requirement.guidePreview ||
    requirement.goodExamples?.length ||
    requirement.badExamples?.length ||
    requirement.maxFiles > 1 ||
    requirement.minFiles > 1
  );
}

export function formatAssetTypeLabel(assetTypeValue: TemplateAssetType) {
  return assetTypeValue
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
