/**
 * Brand Workspace onboarding — REAL readiness derivation (Phase 1 correctness).
 *
 * Pure: no queries, no side effects. Readiness is derived from actual saved
 * data (brand row, product profiles, model ids, visual style) — never from
 * "the user advanced past this step".
 */
import type { BrandProfile, BrandVisualStyle } from "@/services/brandProfiles";
import type { ProductProfile } from "@/services/productProfiles";

export type ReadinessStatus =
  | "complete"
  | "recommended-missing"
  | "optional-missing"
  | "required-missing";

export interface ReadinessItem {
  key: string;
  label: string;
  level: "required" | "recommended" | "optional";
  done: boolean;
}

export interface ReadinessSection {
  key: string;
  /** Wizard step this section maps to (for "Go back & complete"). */
  step: number;
  label: string;
  status: ReadinessStatus;
  items: ReadinessItem[];
}

export interface BrandReadiness {
  sections: ReadinessSection[];
  /** Number of REQUIRED items still missing across all sections. */
  requiredMissing: number;
  recommendedMissing: number;
  ready: boolean;
  /** Steps whose required items are all satisfied. */
  completedSteps: number[];
}

/** Explicit "I have no logo" / "use a neutral palette" opt-outs. */
export function readBrandFlags(brand: BrandProfile | null) {
  const meta = (brand?.metadata ?? {}) as Record<string, unknown>;
  return {
    noLogo: meta.noLogo === true,
    neutralPalette: meta.neutralPalette === true,
  };
}

function statusFor(items: ReadinessItem[]): ReadinessStatus {
  if (items.some((item) => item.level === "required" && !item.done)) return "required-missing";
  if (items.some((item) => item.level === "recommended" && !item.done)) return "recommended-missing";
  if (items.some((item) => !item.done)) return "optional-missing";
  return "complete";
}

export function deriveBrandReadiness(
  brand: BrandProfile | null,
  products: ProductProfile[],
  modelIds: string[],
  visualStyle: BrandVisualStyle | null,
): BrandReadiness {
  const flags = readBrandFlags(brand);
  const brandProducts = brand ? products.filter((entry) => entry.brand_id === brand.id) : [];

  const hasBackAsset = brandProducts.every((profile) =>
    profile.type === "garment"
      ? profile.assets.some((asset) => /back/i.test(asset.role))
      : true,
  );

  const raw: ReadinessSection[] = [
    {
      key: "basics",
      step: 1,
      label: "Brand basics",
      status: "complete",
      items: [
        { key: "name", label: "Brand name", level: "required", done: Boolean(brand?.name?.trim()) },
        { key: "website", label: "Website", level: "recommended", done: Boolean(brand?.website?.trim()) },
        {
          key: "description",
          label: "Short description",
          level: "optional",
          done: Boolean(brand?.description?.trim()),
        },
      ],
    },
    {
      key: "identity",
      step: 2,
      label: "Identity (logo + colors)",
      status: "complete",
      items: [
        {
          key: "primary_logo",
          label: "Primary logo (or “No logo”)",
          level: "required",
          done: Boolean(brand?.primary_logo_url) || flags.noLogo,
        },
        {
          key: "colors",
          label: "Brand color (or neutral palette)",
          level: "required",
          done: (brand?.colors?.length ?? 0) > 0 || flags.neutralPalette,
        },
        {
          key: "secondary_logo",
          label: "Secondary / inverted logo",
          level: "recommended",
          done: Boolean(brand?.secondary_logo_url) || flags.noLogo,
        },
      ],
    },
    {
      key: "products",
      step: 3,
      label: `Products (${brandProducts.length})`,
      status: "complete",
      items: [
        {
          key: "product",
          label: "At least one product or garment",
          // Optional enhancement — onboarding never blocks on products.
          level: "recommended",
          done: brandProducts.length > 0,
        },
        {
          key: "product_back",
          label: "Back view for each garment",
          level: "recommended",
          done: brandProducts.length > 0 && hasBackAsset,
        },
      ],
    },
    {
      key: "models",
      step: 4,
      label: `Models (${modelIds.length})`,
      status: "complete",
      items: [
        { key: "model", label: "At least one model", level: "recommended", done: modelIds.length > 0 },
      ],
    },
    {
      key: "style",
      step: 5,
      label: "Creative DNA",
      status: "complete",
      items: [
        {
          key: "dna",
          // Recommended: satisfied by style signals, tone, or reference brands.
          label: "Style signals, tone or reference brands",
          level: "recommended",
          done: Boolean(
            visualStyle &&
              (visualStyle.styleSignals.length > 0 ||
                visualStyle.tags.length > 0 ||
                visualStyle.tone.trim().length > 0 ||
                visualStyle.referenceBrands.length > 0),
          ),
        },
        {
          key: "references",
          label: "Taste references (images or links)",
          level: "optional",
          done: Boolean(
            visualStyle &&
              (visualStyle.referenceImages.length > 0 ||
                visualStyle.references.length > 0 ||
                visualStyle.instagram ||
                visualStyle.pinterest),
          ),
        },
      ],
    },

  ];

  const sections = raw.map((section) => ({ ...section, status: statusFor(section.items) }));
  const all = sections.flatMap((section) => section.items);
  const requiredMissing = all.filter((item) => item.level === "required" && !item.done).length;
  const recommendedMissing = all.filter((item) => item.level === "recommended" && !item.done).length;

  const completedSteps = sections
    .filter((section) => !section.items.some((item) => item.level === "required" && !item.done))
    .map((section) => section.step);

  return {
    sections,
    requiredMissing,
    recommendedMissing,
    ready: requiredMissing === 0,
    completedSteps,
  };
}
