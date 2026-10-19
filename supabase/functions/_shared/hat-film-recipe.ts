/**
 * Hat Brand Film — versioned, opt-in recipe (pure, no I/O).
 * Spec: docs/hat-brand-film/spec.md. Templates opt in via
 * templates.input_schema / prompt_config `recipe: "hat_brand_film@1"`.
 */

export const HAT_FILM_RECIPE_ID = "hat_brand_film@1";
export const HAT_FILM_FPS = 30;
export const HAT_FILM_WIDTH = 1080;
export const HAT_FILM_HEIGHT = 1920;
export const HAT_FILM_CUTS = [0, 43, 72, 109, 147, 189, 223, 265, 340, 370, 414, 493, 645] as const;
export const HAT_FILM_TOTAL_FRAMES = 645;
export const HAT_FILM_CLIP_SECONDS = 5;
export const HAT_FILM_MAX_AUTO_RETRIES = 1;

export type HatAngleSlot = "front" | "right" | "left" | "back" | "inside";
export type HatImageSlot = HatAngleSlot | "logo" | "detail_1" | "detail_2" | "detail_3";

export interface HatFilmField {
  key: HatImageSlot | "brand_vibe" | "detail_1_label" | "detail_2_label" | "detail_3_label";
  label: string;
  type: "image" | "text";
  required: boolean;
  helper: string;
}

export const HAT_FILM_FIELDS: HatFilmField[] = [
  { key: "front", label: "Front", type: "image", required: true, helper: "Full crown and upper bill." },
  { key: "right", label: "Wearer's right side", type: "image", required: true, helper: "Right side as the wearer sees it. Don't mirror the left." },
  { key: "left", label: "Wearer's left side", type: "image", required: true, helper: "Left side as the wearer sees it." },
  { key: "back", label: "Back", type: "image", required: true, helper: "Closure, rear lettering and construction." },
  { key: "inside", label: "Inside / underside", type: "image", required: true, helper: "Lining, sweatband, labels and underside of the bill." },
  { key: "detail_1", label: "Detail 1", type: "image", required: false, helper: "Optional close-up." },
  { key: "detail_1_label", label: "Detail 1 label", type: "text", required: false, helper: "e.g. front stitching" },
  { key: "detail_2", label: "Detail 2", type: "image", required: false, helper: "Optional close-up." },
  { key: "detail_2_label", label: "Detail 2 label", type: "text", required: false, helper: "e.g. left patch" },
  { key: "detail_3", label: "Detail 3", type: "image", required: false, helper: "Optional close-up." },
  { key: "detail_3_label", label: "Detail 3 label", type: "text", required: false, helper: "e.g. lining print" },
  { key: "logo", label: "Brand logo", type: "image", required: true, helper: "Original logo. Transparent PNG/WebP preferred." },
  { key: "brand_vibe", label: "Brand / background vibe", type: "text", required: true, helper: "World, props, lighting and background action." },
];

export const HAT_FILM_VIBE_PLACEHOLDER =
  "An unfinished construction site at dusk. Excavators, concrete blocks, scaffolding, warm work lights, drifting dust. Rugged, cinematic and premium.";

export const HAT_FILM_ACCEPT = ["image/jpeg", "image/png", "image/webp"];
export const HAT_FILM_VIBE_MAX = 1200;

export interface HatFilmInputs {
  front: string; right: string; left: string; back: string; inside: string; logo: string;
  details: Array<{ slot: "detail_1" | "detail_2" | "detail_3"; url: string; label: string }>;
  brand_vibe: string;
  top_brim_color?: string | null;
  under_brim_color?: string | null;
}

export type ShotRef = HatImageSlot | "world";
export type ShotKind = "generated" | "logo_composite";

export interface HatFilmShot {
  index: number; // 1..12
  id: string;
  startFrame: number;
  endFrame: number;
  frames: number;
  kind: ShotKind;
  content: string;
  motion: string;
  primary: ShotRef[];
  /** Detail keywords used to match an optional labeled detail to this shot. */
  detailMatch?: RegExp;
  /** Needs the shared environment anchor from shot 03. */
  sharesAnchorWith?: number;
}

const s = (i: number, kind: ShotKind, content: string, motion: string, primary: ShotRef[], extra: Partial<HatFilmShot> = {}): HatFilmShot => ({
  index: i,
  id: `shot_${String(i).padStart(2, "0")}`,
  startFrame: HAT_FILM_CUTS[i - 1],
  endFrame: HAT_FILM_CUTS[i],
  frames: HAT_FILM_CUTS[i] - HAT_FILM_CUTS[i - 1],
  kind, content, motion, primary, ...extra,
});

export const HAT_FILM_SHOTS: HatFilmShot[] = [
  s(1, "generated", "Front hero of the hat in the chosen world", "gentle slow push-in", ["front"]),
  s(2, "generated", "Macro over front embroidery and fabric texture", "slow macro glide left to right", ["front"], { detailMatch: /front|embroider|stitch|fabric|crown/i }),
  s(3, "generated", "Wide environment and action anchor", "steady wide shot, subtle drift", ["world"]),
  s(4, "generated", "Right side product reveal", "short lateral move", ["right"]),
  s(5, "generated", "Left side embroidery / patch macro", "slow macro slide", ["left"], { detailMatch: /left|side|patch|embroider/i }),
  s(6, "logo_composite", "Environmental brand presence: original logo on a sign or banner in the world", "restrained, near-locked camera", ["logo", "world"]),
  s(7, "generated", "Back and closure detail", "slow tilt across the closure", ["back"]),
  s(8, "generated", "Interior and underside reveal", "slow push", ["inside"]),
  s(9, "generated", "Overhead environment insert", "top-down, minimal motion", ["world"], { sharesAnchorWith: 3 }),
  s(10, "generated", "Lining or detail macro", "slow macro glide", ["inside"], { detailMatch: /lining|inside|label|sweat|under|tag/i }),
  s(11, "generated", "Three copies of the SAME hat arranged within the world", "slow arc, no spin", ["front", "right", "left", "inside"]),
  s(12, "logo_composite", "Original logo reveal and hold", "subtle scale-up with light sweep", ["logo"]),
];

export type ValidationIssue = { field: string; message: string };

const isUrl = (v: unknown) => typeof v === "string" && /^https?:\/\//i.test(v.trim());

/** Validate raw form values. Runs before any charge or provider call. */
export function validateHatFilmInputs(raw: Record<string, unknown>): { ok: true; inputs: HatFilmInputs } | { ok: false; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  for (const f of HAT_FILM_FIELDS) {
    if (!f.required) continue;
    const v = raw[f.key];
    if (f.type === "image" && !isUrl(v)) issues.push({ field: f.key, message: `${f.label} is required.` });
    if (f.type === "text" && (typeof v !== "string" || !v.trim())) issues.push({ field: f.key, message: `${f.label} is required.` });
  }
  const vibe = typeof raw.brand_vibe === "string" ? raw.brand_vibe.trim() : "";
  if (vibe.length > HAT_FILM_VIBE_MAX) issues.push({ field: "brand_vibe", message: `Keep the vibe under ${HAT_FILM_VIBE_MAX} characters.` });

  const angles: HatImageSlot[] = ["front", "right", "left", "back", "inside", "logo"];
  const seen = new Map<string, string>();
  for (const a of angles) {
    const v = typeof raw[a] === "string" ? (raw[a] as string).trim() : "";
    if (!v) continue;
    if (seen.has(v)) issues.push({ field: a, message: `${a} uses the same image as ${seen.get(v)}. Upload a distinct photo.` });
    else seen.set(v, a);
  }

  const details: HatFilmInputs["details"] = [];
  for (const slot of ["detail_1", "detail_2", "detail_3"] as const) {
    const url = raw[slot];
    if (url == null || url === "") continue;
    if (!isUrl(url)) { issues.push({ field: slot, message: "Detail image is invalid." }); continue; }
    const label = String(raw[`${slot}_label`] ?? "").trim().slice(0, 80);
    details.push({ slot, url: String(url).trim(), label });
  }
  if (issues.length) return { ok: false, issues };
  const str = (k: string) => String(raw[k]).trim();
  return {
    ok: true,
    inputs: {
      front: str("front"), right: str("right"), left: str("left"), back: str("back"), inside: str("inside"), logo: str("logo"),
      details, brand_vibe: vibe,
      top_brim_color: typeof raw.top_brim_color === "string" ? raw.top_brim_color.trim() || null : null,
      under_brim_color: typeof raw.under_brim_color === "string" ? raw.under_brim_color.trim() || null : null,
    },
  };
}

/** Pick the optional detail for a shot, or null (shot then uses its main angle only). */
export function matchDetail(shot: HatFilmShot, details: HatFilmInputs["details"], used: Set<string>) {
  if (!shot.detailMatch) return null;
  const hit = details.find((d) => !used.has(d.slot) && shot.detailMatch!.test(d.label));
  return hit ?? null;
}

/** Ordered reference URLs for a shot. Never invents or mirrors a missing angle. */
export function resolveShotReferences(shot: HatFilmShot, inputs: HatFilmInputs, used = new Set<string>()) {
  const refs: Array<{ slot: HatImageSlot; url: string; role: string }> = [];
  for (const p of shot.primary) {
    if (p === "world") continue;
    refs.push({ slot: p, url: inputs[p as HatAngleSlot | "logo"], role: p === "inside" && shot.index === 11 ? "underside only (do not recolor top brim)" : p });
  }
  const detail = matchDetail(shot, inputs.details, used);
  if (detail) { used.add(detail.slot); refs.push({ slot: detail.slot, url: detail.url, role: `detail: ${detail.label || detail.slot}` }); }
  return refs;
}

/** Edit decision list: every shot trimmed from the head of its 5s source handle. */
export function buildEditDecisionList() {
  return HAT_FILM_SHOTS.map((shot) => ({
    shot_id: shot.id,
    start_frame: shot.startFrame,
    end_frame: shot.endFrame,
    trim_start_ms: 0,
    trim_end_ms: Math.round((shot.frames / HAT_FILM_FPS) * 1000),
    muted: true,
    transition: "hard_cut" as const,
    logo_overlay: shot.kind === "logo_composite",
  }));
}

/**
 * Cost estimate (USD fallback prices; live fal pricing remains authoritative).
 * 12 stills (incl. backgrounds for logo shots 06/12) at the image model flat price;
 * 11 animated 5s clips, generated audio off (shot 12 is a still + logo composite).
 * Worst case includes one automatic retry per shot.
 */
export function estimateHatFilm(p: { imageUsd: number; videoUsdPerSecond: number; usdPerCredit: number }) {
  const stills = HAT_FILM_SHOTS.length;
  const clips = HAT_FILM_SHOTS.filter((s) => s.index !== 12).length;
  const baseUsd = stills * p.imageUsd + clips * HAT_FILM_CLIP_SECONDS * p.videoUsdPerSecond;
  const maxUsd = baseUsd * (1 + HAT_FILM_MAX_AUTO_RETRIES);
  return {
    stills, clips,
    base_usd: +baseUsd.toFixed(2), max_usd: +maxUsd.toFixed(2),
    base_credits: Math.ceil(baseUsd / p.usdPerCredit), max_credits: Math.ceil(maxUsd / p.usdPerCredit),
  };
}
