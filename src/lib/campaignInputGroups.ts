/**
 * PRESENTATION-ONLY grouping layer over a campaign's flat backend input list.
 *
 * Customers think in products ("top garment", "the sneaker", "the ring"), while
 * the workflow thinks in individual reference inputs (`top_front_1`,
 * `top_back_1`, ...). This helper produces customer-facing GROUPS over those
 * inputs. It never renames, reorders or drops a backend key: every group member
 * keeps its original `key`, so uploads and the generation payload stay keyed by
 * the canonical backend input keys.
 */

import type { TemplateAssetRequirement } from "./templateAssetRequirements";

export interface GroupableInput {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  requirement?: TemplateAssetRequirement | null;
}

export interface CampaignInputGroupMember<T extends GroupableInput = GroupableInput> {
  input: T;
  /** Friendly customer-facing sub-slot label ("Front view"). */
  label: string;
  helperText?: string;
  required: boolean;
  sequence: number;
}

export interface CampaignInputGroup<T extends GroupableInput = GroupableInput> {
  id: string;
  /** Customer-facing product label ("Top garment"). */
  label: string;
  /** Coarse kind used for the action verb ("garment", "product", ...). */
  type: string;
  members: CampaignInputGroupMember<T>[];
  /** True when the group bundles more than one backend input. */
  multi: boolean;
  /** Every backend input in the group that must be filled to generate. */
  requiredKeys: string[];
}

const VIEW_TOKENS = [
  "front",
  "back",
  "side",
  "detail",
  "closeup",
  "close_up",
  "angle",
  "top_down",
  "flat",
  "flatlay",
  "profile",
  "three_quarter",
] as const;

const VIEW_LABELS: Record<string, { label: string; helper?: string }> = {
  front: { label: "Front view", helper: "Show the full front" },
  back: { label: "Back view", helper: "Show the full back" },
  side: { label: "Side view", helper: "Show one side straight on" },
  detail: { label: "Detail photo", helper: "Close on the texture, logo or stones" },
  closeup: { label: "Close-up photo", helper: "Close on the texture or detail" },
  close_up: { label: "Close-up photo", helper: "Close on the texture or detail" },
  angle: { label: "Angled view" },
  top_down: { label: "Top-down view" },
  flat: { label: "Flat lay" },
  flatlay: { label: "Flat lay" },
  profile: { label: "Profile view" },
  three_quarter: { label: "Three-quarter view" },
};

const ORDINALS = ["", "Second ", "Third ", "Fourth ", "Fifth ", "Sixth "];

/** Real-world nouns for derived group bases and asset types. */
const BASE_LABELS: Record<string, { label: string; type: string }> = {
  top: { label: "Top garment", type: "garment" },
  upper: { label: "Top garment", type: "garment" },
  shirt: { label: "Top garment", type: "garment" },
  tee: { label: "Top garment", type: "garment" },
  jacket: { label: "Jacket", type: "garment" },
  hoodie: { label: "Hoodie", type: "garment" },
  bottom: { label: "Bottom garment", type: "garment" },
  pants: { label: "Bottom garment", type: "garment" },
  jeans: { label: "Bottom garment", type: "garment" },
  shorts: { label: "Bottom garment", type: "garment" },
  skirt: { label: "Bottom garment", type: "garment" },
  dress: { label: "Dress", type: "garment" },
  garment: { label: "Garment", type: "garment" },
  outfit: { label: "Outfit", type: "garment" },
  shoe: { label: "Shoes", type: "shoes" },
  shoes: { label: "Shoes", type: "shoes" },
  sneaker: { label: "Sneakers", type: "shoes" },
  jewelry: { label: "Jewelry", type: "jewelry" },
  ring: { label: "Ring", type: "jewelry" },
  chain: { label: "Chain", type: "jewelry" },
  necklace: { label: "Necklace", type: "jewelry" },
  watch: { label: "Watch", type: "jewelry" },
  grill: { label: "Grillz", type: "jewelry" },
  grillz: { label: "Grillz", type: "jewelry" },
  bag: { label: "Bag", type: "accessory" },
  accessory: { label: "Accessory", type: "accessory" },
  hat: { label: "Hat", type: "accessory" },
  glasses: { label: "Eyewear", type: "accessory" },
  product: { label: "Product", type: "product" },
  packaging: { label: "Packaging", type: "product" },
  bottle: { label: "Bottle", type: "product" },
  can: { label: "Can", type: "product" },
  logo: { label: "Logo", type: "logo" },
  brand: { label: "Logo", type: "logo" },
  model: { label: "Model", type: "model" },
  face: { label: "Model", type: "model" },
  talent: { label: "Model", type: "model" },
  person: { label: "Model", type: "model" },
  car: { label: "Vehicle", type: "vehicle" },
  vehicle: { label: "Vehicle", type: "vehicle" },
  prop: { label: "Prop", type: "prop" },
  scene: { label: "Scene", type: "scene" },
  background: { label: "Background", type: "scene" },
};

const ASSET_TYPE_LABELS: Record<string, { label: string; type: string }> = {
  "garment-front": { label: "Garment", type: "garment" },
  "garment-back": { label: "Garment", type: "garment" },
  logo: { label: "Logo", type: "logo" },
  product: { label: "Product", type: "product" },
  avatar: { label: "Model", type: "model" },
  jewelry: { label: "Jewelry", type: "jewelry" },
  packaging: { label: "Packaging", type: "product" },
};

function titleCase(value: string) {
  const clean = value.replace(/[_-]+/g, " ").trim();
  if (!clean) return "";
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

interface ParsedKey {
  base: string;
  view?: string;
  index: number;
}

function parseKey(key: string): ParsedKey {
  let rest = key.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  let index = 1;
  const trailing = rest.match(/_(\d+)$/);
  if (trailing) {
    index = Number.parseInt(trailing[1], 10) || 1;
    rest = rest.slice(0, -trailing[0].length);
  }
  const matchedView = VIEW_TOKENS.find(
    (token) => rest === token || rest.endsWith(`_${token}`),
  );
  if (matchedView) {
    const base = rest === matchedView ? "" : rest.slice(0, rest.length - matchedView.length - 1);
    return { base, view: matchedView, index };
  }
  return { base: rest, index };
}

function stripNoise(base: string) {
  return base
    .split("_")
    .filter((token) => token && !["image", "images", "photo", "photos", "reference", "ref", "input", "asset"].includes(token))
    .join("_");
}

function describeBase(base: string, requirement?: TemplateAssetRequirement | null) {
  const cleaned = stripNoise(base);
  const tokens = cleaned.split("_").filter(Boolean);
  for (const token of tokens) {
    const known = BASE_LABELS[token];
    if (known) {
      const prefix = tokens.filter((item) => item !== token && !BASE_LABELS[item]);
      const label = prefix.length ? `${titleCase(prefix.join(" "))} ${known.label.toLowerCase()}` : known.label;
      return { label, type: known.type };
    }
  }
  if (cleaned) return { label: titleCase(cleaned), type: cleaned.split("_")[0] };
  const fromAsset = requirement?.assetType ? ASSET_TYPE_LABELS[requirement.assetType] : undefined;
  return fromAsset ?? { label: "Garment", type: "garment" };
}

function describeMemberLabel(parsed: ParsedKey, fallbackLabel: string) {
  if (!parsed.view) return { label: fallbackLabel };
  const view = VIEW_LABELS[parsed.view] ?? { label: titleCase(parsed.view) };
  const ordinal = ORDINALS[Math.min(parsed.index - 1, ORDINALS.length - 1)] ?? "";
  if (!ordinal) return view;
  return { label: `${ordinal}${view.label.toLowerCase()}`, helper: view.helper };
}

/**
 * Builds the customer-facing groups. Text inputs and unrelated single images
 * stay as their own simple one-card input (no over-grouping); distinct products
 * are never merged, because grouping is keyed on the product base token.
 */
export function campaignInputGroups<T extends GroupableInput>(inputs: T[]): CampaignInputGroup<T>[] {
  const buckets = new Map<string, CampaignInputGroup<T>>();
  const order: string[] = [];

  inputs.forEach((input, position) => {
    const requirement = input.requirement ?? null;
    const explicitId = requirement?.groupId;
    const parsed = parseKey(input.key);
    const derived = describeBase(parsed.base, requirement);

    const isImage = input.type === "image";
    // Only image inputs can share a product group; text stays standalone.
    const groupId = explicitId
      ? `g:${explicitId}`
      : isImage && parsed.view
        ? `d:${stripNoise(parsed.base)}|${derived.label}`
        : `s:${input.key}`;

    const memberMeta = requirement?.customerSlotLabel
      ? { label: requirement.customerSlotLabel, helper: requirement.helperText }
      : describeMemberLabel(parsed, input.label);

    const member: CampaignInputGroupMember<T> = {
      input,
      label: memberMeta.label || input.label,
      helperText: requirement?.helperText ?? memberMeta.helper,
      required: input.required !== false,
      sequence: requirement?.sequence ?? position,
    };

    const existing = buckets.get(groupId);
    if (existing) {
      existing.members.push(member);
      return;
    }

    buckets.set(groupId, {
      id: groupId,
      label: requirement?.groupLabel ?? (groupId.startsWith("s:") ? input.label : derived.label),
      type: requirement?.groupType ?? derived.type,
      members: [member],
      multi: false,
      requiredKeys: [],
    });
    order.push(groupId);
  });

  return order.map((id) => {
    const group = buckets.get(id)!;
    group.members.sort((a, b) => a.sequence - b.sequence);
    group.multi = group.members.length > 1;
    group.requiredKeys = group.members.filter((member) => member.required).map((member) => member.input.key);
    return group;
  });
}

/** "+ Add garment" style action verb for a group. */
export function groupActionLabel(group: CampaignInputGroup) {
  return `Add ${group.label.toLowerCase()}`;
}
