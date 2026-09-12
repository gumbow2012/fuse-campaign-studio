/**
 * CAMPAIGN FIELD MODEL — one shared, presentation-level view of whatever inputs
 * a campaign template actually declares.
 *
 * The template's own configuration is the single source of truth: this module
 * only normalizes it (stable backend id, category, friendly label, helper copy,
 * required flag, accepted files) so every campaign renders the same UI without
 * ever inventing, reordering or dropping a field. Nothing here changes the
 * generation payload — `id` is always the untouched backend key.
 */




export type CampaignRefCategory =
  | "face"
  | "top"
  | "bottom"
  | "grill"
  | "car"
  | "chain"
  | "accessory"
  | "jewelry"
  | "product"
  | "logo"
  | "scene"
  | "generic";

export interface CampaignField {
  /** Stable backend input key — never rewritten. */
  id: string;
  /** Friendly, sentence-case label shown to the customer. */
  label: string;
  category: CampaignRefCategory;
  kind: "image" | "video" | "text";
  required: boolean;
  helper: string;
  /** `accept` attribute for the file picker. */
  accept: string;
}

/**
 * Configuration lifecycle. A template with an explicitly empty input list is
 * NOT the same thing as configuration that is still loading or failed to load —
 * only `ready` may ever enable generation.
 */
export type CampaignFieldsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; fields: CampaignField[] };

/* ── category detection ── */

const CATEGORY_PATTERNS: { category: CampaignRefCategory; test: RegExp }[] = [
  { category: "face", test: /(face|portrait|headshot|selfie|subject|talent|model|avatar|person)/i },
  { category: "grill", test: /(grill|grillz|teeth|fangs)/i },
  { category: "chain", test: /(chain|necklace|pendant|cuban)/i },
  { category: "jewelry", test: /(jewel|ring|bracelet|watch|earring|diamond)/i },
  { category: "bottom", test: /(pant|jean|short|trouser|bottom|skirt|cargo|denim)/i },
  { category: "top", test: /(top|shirt|tee|hoodie|jacket|jersey|sweat|garment|apparel|upper)/i },
  { category: "car", test: /(car|vehicle|whip|auto|moto|truck)/i },
  { category: "accessory", test: /(accessor|hat|cap|glasses|eyewear|bag|shoe|sneaker|belt)/i },
  { category: "logo", test: /(logo|wordmark|badge|emblem|brand ?mark)/i },
  { category: "scene", test: /(scene|background|backdrop|location|environment)/i },
  { category: "product", test: /(product|packaging|bottle|can|box|item|sku)/i },
];

function detectCategory(key: string, label: string): CampaignRefCategory {
  const haystack = `${label} ${key}`;
  const match = CATEGORY_PATTERNS.find((entry) => entry.test.test(haystack));
  return match?.category ?? "generic";
}

/* ── copy ── */

const CATEGORY_LABEL: Record<CampaignRefCategory, string> = {
  face: "Face",
  top: "Top",
  bottom: "Pants",
  grill: "Grill",
  car: "Car",
  chain: "Chain",
  accessory: "Accessory",
  jewelry: "Jewelry",
  product: "Product",
  logo: "Logo",
  scene: "Scene",
  generic: "Reference",
};

const CATEGORY_HELPER: Record<CampaignRefCategory, string> = {
  face: "A clear, front-facing photo.",
  top: "Show the front of the garment.",
  bottom: "Show the full garment, waist to hem.",
  grill: "Show the design in a clear close-up.",
  car: "A clear view of the exterior.",
  chain: "Include the full chain and pendant.",
  accessory: "Show its shape and finish clearly.",
  jewelry: "A close-up with the detail in focus.",
  product: "Show the whole product, front on.",
  logo: "A flat file with a clean background.",
  scene: "A wide shot of the setting.",
  generic: "A clear, well-lit photo.",
};

/**
 * Interface artwork per category. Plain files under `public/` so they resolve on
 * every host. Never a campaign reference itself.
 */
const CATEGORY_ART: Partial<Record<CampaignRefCategory, string>> = {
  face: "/campaign-refs/face.png",
  top: "/campaign-refs/top.png",
  bottom: "/campaign-refs/pants.png",
  car: "/campaign-refs/car.png",
  chain: "/campaign-refs/chain.png",
  accessory: "/campaign-refs/accessory.png",
};

/** Body diagram used by the optional reference guide. */
export const BODY_GUIDE_ART = "/campaign-refs/body-guide.png";


export function categoryArtwork(category: CampaignRefCategory): string | null {
  return CATEGORY_ART[category] ?? null;
}

/** Internal-looking labels get replaced by the friendly category name. */
function looksInternal(label: string, key: string) {
  const value = label.trim();
  if (!value) return true;
  if (value.toLowerCase() === key.toLowerCase()) return true;
  if (/_/.test(value)) return true;
  if (/reference\s*\d*$/i.test(value)) return true;
  if (/^(input|image|asset|slot|upload)\b/i.test(value)) return true;
  if (/\b(0\d|\d{2,})\b/.test(value)) return true;
  return false;
}

function sentenceCase(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return clean;
  if (clean === clean.toUpperCase()) {
    return clean.charAt(0) + clean.slice(1).toLowerCase();
  }
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export interface RawCampaignInput {
  key: string;
  label?: string | null;
  type?: string | null;
  required?: boolean;
  helper?: string | null;
}

/**
 * Normalizes a template's raw input list. Order and identity are preserved;
 * repeated categories stay separate and get numbered labels ("Top", "Top 2").
 */
export function normalizeCampaignFields(inputs: RawCampaignInput[]): CampaignField[] {
  const seen = new Map<CampaignRefCategory, number>();

  return inputs
    .filter((input) => !!String(input.key ?? "").trim())
    .map((input) => {
      const id = String(input.key).trim();
      const rawLabel = String(input.label ?? "").trim();
      const category = detectCategory(id, rawLabel);
      const kindRaw = String(input.type ?? "image").toLowerCase();
      const kind: CampaignField["kind"] =
        kindRaw === "video" ? "video" : kindRaw === "image" ? "image" : "text";

      const count = (seen.get(category) ?? 0) + 1;
      seen.set(category, count);

      const friendly = looksInternal(rawLabel, id) ? CATEGORY_LABEL[category] : sentenceCase(rawLabel);
      const label = count > 1 && looksInternal(rawLabel, id) ? `${friendly} ${count}` : friendly;

      return {
        id,
        label,
        category,
        kind,
        required: input.required !== false,
        helper: String(input.helper ?? "").trim() || CATEGORY_HELPER[category],
        accept: kind === "video" ? "video/*" : "image/*",
      } satisfies CampaignField;
    });
}

/* ── editorial copy derived from the real configuration ── */

export interface CampaignCopy {
  headline: string;
  description: string;
}

export function campaignCopy(fields: CampaignField[], templateDescription?: string | null): CampaignCopy {
  const references = fields.filter((field) => field.kind !== "text");
  const categories = new Set(references.map((field) => field.category));
  const hasFace = categories.has("face");
  const hasWardrobe = categories.has("top") || categories.has("bottom");
  const productish =
    categories.has("product") ||
    categories.has("jewelry") ||
    categories.has("chain") ||
    categories.has("grill") ||
    categories.has("accessory") ||
    categories.has("car");

  let headline = "Make it yours.";
  if (!references.length) headline = "Ready when you are.";
  else if (hasFace && hasWardrobe) headline = "Your look. In motion.";
  else if (hasWardrobe) headline = "Your fit. In motion.";
  else if (productish && !hasFace) headline = "Your product. In focus.";

  const requiredLabels = references
    .filter((field) => field.required)
    .map((field) => field.label.toLowerCase());

  let description: string;
  if (!references.length) {
    description = "This campaign runs without any uploads.";
  } else if (requiredLabels.length) {
    description = `Add your ${joinWords(requiredLabels)} to personalize this campaign.`;
  } else {
    description = "Add optional references to personalize this campaign.";
  }

  /**
   * The stored description is only editorial copy when it reads like a real
   * sentence. Internal names ("Kola Flair Original Template") are ignored.
   */
  const editorial = String(templateDescription ?? "").replace(/\s+/g, " ").trim();
  const sentenceLike = /[.!?]$/.test(editorial) || editorial.split(" ").filter(Boolean).length >= 6;
  if (editorial && sentenceLike && editorial.length <= 140) description = editorial;


  return { headline, description };
}

function joinWords(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/* ── summary helpers ── */

export function deliverablesLine(imageCount: number, videoCount: number) {
  const parts: string[] = [];
  if (imageCount > 0) parts.push(`${imageCount} ${imageCount === 1 ? "image" : "images"}`);
  if (videoCount > 0) parts.push(`${videoCount} ${videoCount === 1 ? "video clip" : "video clips"}`);
  return parts.join(" · ");
}

const ASPECT_LABELS: Record<string, string> = {
  "9:16": "9:16 portrait",
  "3:4": "3:4 portrait",
  "4:5": "4:5 portrait",
  "2:3": "2:3 portrait",
  "16:9": "16:9 landscape",
  "4:3": "4:3 landscape",
  "3:2": "3:2 landscape",
  "5:4": "5:4 landscape",
  "21:9": "21:9 wide",
  "1:1": "1:1 square",
};

export function aspectRatioLine(aspect: string | null | undefined) {
  const value = String(aspect ?? "").trim();
  if (!value) return "";
  return ASPECT_LABELS[value] ?? value;
}

/**
 * Campaign names are stored shouted ("GROUP MEET"). Title-case those for the
 * calm page label; names that already carry their own casing are left alone.
 */
export function templateDisplayName(name: string | null | undefined) {
  const value = String(name ?? "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  if (value !== value.toUpperCase()) return value;
  return value
    .toLowerCase()
    .split(" ")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}


/** "Add 2 required images to continue." / "Ready to generate." */
export function readinessLine(missing: number) {
  if (missing <= 0) return "Ready to generate.";
  return `Add ${missing} required ${missing === 1 ? "image" : "images"} to continue.`;
}
