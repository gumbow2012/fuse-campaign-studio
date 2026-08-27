/**
 * BRAND ACTIVATION — Phase 5: TRUTHFUL template compatibility.
 *
 * Pure module. It compares a template's REQUIRED customer inputs against the
 * assets the active brand has actually saved (product profiles, library assets,
 * logo, cast). Nothing is inferred or fabricated:
 *  - "ready"   → every required input can be satisfied from saved brand assets
 *  - "missing" → we can name the specific asset that is absent
 *  - "unknown" → the template exposes no usable input schema, or an input's
 *                asset kind cannot be judged from saved data (never claimed ready)
 */
import type { ApiTemplate } from "@/services/fuseApi";
import { inputRoleWord, resolveInputRole, type InputRole } from "@/lib/templateInputSources";

export interface BrandFitAssets {
  hasLogo: boolean;
  garmentCount: number;
  productCount: number;
  jewelryCount: number;
  castCount: number;
}

export interface TemplateFitGap {
  role: InputRole;
  /** e.g. "Add a top" — always derived from the template's own input label. */
  label: string;
  /** Brand onboarding step that resolves this gap. */
  step: number;
}

export interface TemplateFit {
  status: "ready" | "missing" | "unknown";
  gaps: TemplateFitGap[];
}

const STEP_BY_ROLE: Record<InputRole, number> = {
  logo: 2,
  garment: 3,
  product: 3,
  jewelry: 3,
  face: 4,
  car: 3,
  generic: 3,
};

function nounFor(label: string, role: InputRole): string {
  const word = inputRoleWord(label, role).toLowerCase();
  if (role === "face") return "cast member";
  if (word === "top") return "top";
  if (word === "bottom") return "bottom";
  return word;
}

/** null → this role cannot be judged from saved brand data. */
function satisfied(role: InputRole, assets: BrandFitAssets): boolean | null {
  switch (role) {
    case "logo":
      return assets.hasLogo;
    case "garment":
      return assets.garmentCount > 0;
    case "product":
      return assets.productCount > 0;
    case "jewelry":
      return assets.jewelryCount > 0 || assets.productCount > 0;
    case "face":
      return assets.castCount > 0;
    default:
      return null;
  }
}

export function deriveTemplateFit(template: ApiTemplate, assets: BrandFitAssets): TemplateFit {
  const schema = template.input_schema ?? [];
  const required = schema.filter(
    (field) => field.required && (field.type === "image" || field.type === "video"),
  );
  if (!required.length) return { status: "unknown", gaps: [] };

  const gaps: TemplateFitGap[] = [];
  let judgedAll = true;

  for (const field of required) {
    const role = resolveInputRole(field.label || field.key);
    const ok = satisfied(role, assets);
    if (ok === null) {
      judgedAll = false;
      continue;
    }
    if (!ok) {
      gaps.push({
        role,
        label: `Add a ${nounFor(field.label || field.key, role)}`,
        step: STEP_BY_ROLE[role] ?? 3,
      });
    }
  }

  if (gaps.length) {
    // Deduplicate by role so the badge names one concrete missing thing.
    const seen = new Set<InputRole>();
    return {
      status: "missing",
      gaps: gaps.filter((gap) => (seen.has(gap.role) ? false : (seen.add(gap.role), true))),
    };
  }

  return { status: judgedAll ? "ready" : "unknown", gaps: [] };
}
