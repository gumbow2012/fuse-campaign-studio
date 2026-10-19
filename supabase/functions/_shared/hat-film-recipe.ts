/**
 * Hat Brand Film — versioned, opt-in recipe (pure, no I/O).
 * Spec: docs/hat-brand-film/spec.md. A template opts in when its user_input
 * nodes carry `prompt_config.hat_film_slot` and its generation nodes carry
 * `prompt_config.hat_film_shot` + `hat_film_stage` ("still" | "clip").
 * No brand names, logos or product details are hardcoded here.
 */

export const HAT_FILM_RECIPE_ID = "hat_brand_film@1";
export const HAT_FILM_CONTEXT_KEY = "__hat_film_context";
export const HAT_FILM_FPS = 30;
export const HAT_FILM_WIDTH = 1080;
export const HAT_FILM_HEIGHT = 1920;
export const HAT_FILM_CUTS = [0, 43, 72, 109, 147, 189, 223, 265, 340, 370, 414, 493, 645] as const;
export const HAT_FILM_TOTAL_FRAMES = 645;
export const HAT_FILM_CLIP_SECONDS = 5;
export const HAT_FILM_MAX_AUTO_RETRIES = 1;
/** Private template asset paths (fuse-assets bucket). Never customer branding. */
export const HAT_FILM_SOUNDTRACK_PATH = "system/templates/hat-brand-film/v1/soundtrack.m4a";
export const HAT_FILM_REFERENCE_FILM_PATH = "system/templates/hat-brand-film/v1/reference-film.mp4";

export type HatAngleSlot = "front" | "right" | "left" | "back" | "inside";
export type HatImageSlot = HatAngleSlot | "logo" | "detail_1" | "detail_2" | "detail_3";
export type HatFieldKey = HatImageSlot | "brand_vibe" | "detail_1_label" | "detail_2_label" | "detail_3_label";

export interface HatFilmField {
  key: HatFieldKey;
  label: string;
  type: "image" | "text";
  required: boolean;
  helper: string;
}

export const HAT_FILM_FIELDS: HatFilmField[] = [
  { key: "front", label: "Front", type: "image", required: true, helper: "Full crown and upper bill. Sets the front lettering and top-of-bill color." },
  { key: "right", label: "Wearer's right side", type: "image", required: true, helper: "The side on the wearer's right (image-left when you face the hat). Don't mirror the other side." },
  { key: "left", label: "Wearer's left side", type: "image", required: true, helper: "The side on the wearer's left (image-right when you face the hat)." },
  { key: "back", label: "Back", type: "image", required: true, helper: "Closure, rear lettering and construction." },
  { key: "inside", label: "Inside / underside", type: "image", required: true, helper: "Lining, sweatband, labels and the underside of the bill." },
  { key: "detail_1", label: "Detail 1", type: "image", required: false, helper: "Optional close-up." },
  { key: "detail_1_label", label: "Detail 1 label", type: "text", required: false, helper: "e.g. front stitching" },
  { key: "detail_2", label: "Detail 2", type: "image", required: false, helper: "Optional close-up." },
  { key: "detail_2_label", label: "Detail 2 label", type: "text", required: false, helper: "e.g. left patch" },
  { key: "detail_3", label: "Detail 3", type: "image", required: false, helper: "Optional close-up." },
  { key: "detail_3_label", label: "Detail 3 label", type: "text", required: false, helper: "e.g. lining print" },
  { key: "logo", label: "Brand logo", type: "image", required: true, helper: "Your original logo. Transparent PNG or WebP preferred; JPG works." },
  { key: "brand_vibe", label: "Brand / background vibe", type: "text", required: true, helper: "Describe the world, props, lighting and background action. It changes the setting, never the hat." },
];

export const HAT_FILM_VIBE_PLACEHOLDER =
  "An unfinished construction site at dusk. Excavators, concrete blocks, scaffolding, warm work lights, drifting dust. Rugged, cinematic and premium.";
export const HAT_FILM_VIBE_MAX = 1200;

export interface HatFilmInputs {
  front: string; right: string; left: string; back: string; inside: string; logo: string;
  details: Array<{ slot: "detail_1" | "detail_2" | "detail_3"; url: string; label: string }>;
  brand_vibe: string;
  top_brim_color?: string | null;
  under_brim_color?: string | null;
}

export type ShotRef = HatImageSlot | "world";
/**
 * generated: still → 5s clip, trimmed.
 * logo_composite: still → clip with the original logo overlaid during assembly.
 * logo_hold: still only; the 152-frame hold is rendered deterministically from
 * that still + original logo (longer than a 5s clip, so never trimmed from one).
 */
export type ShotKind = "generated" | "logo_composite" | "logo_hold";

export interface HatFilmShot {
  index: number;
  id: string;
  startFrame: number;
  endFrame: number;
  frames: number;
  kind: ShotKind;
  content: string;
  motion: string;
  primary: ShotRef[];
  detailMatch?: RegExp;
  usesWorldAnchor?: boolean;
  /** Environment reference: the generated still of this earlier shot (keeps one coherent world). */
  worldFrom?: number;
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
  s(2, "generated", "Macro over the front embroidery and fabric texture", "slow macro glide left to right", ["front"], { detailMatch: /front|embroider|stitch|fabric|crown/i }),
  s(3, "generated", "Wide environment and action anchor shot", "steady wide shot with subtle drift", ["world"], { usesWorldAnchor: true, worldFrom: 1 }),
  s(4, "generated", "Wearer's right side product reveal", "short lateral move", ["right"], { detailMatch: /right/i }),
  s(5, "generated", "Wearer's left side embroidery / patch macro", "slow macro slide", ["left"], { detailMatch: /left|patch|side/i }),
  s(6, "logo_composite", "Environmental brand presence: a flat, blank sign or banner in the world, framed for the brand logo", "restrained, near-locked camera", ["world"], { usesWorldAnchor: true, worldFrom: 3 }),
  s(7, "generated", "Back and closure detail", "slow tilt across the closure", ["back"], { detailMatch: /back|closure|strap|snap|rear/i }),
  s(8, "generated", "Interior and underside reveal", "slow push", ["inside"]),
  s(9, "generated", "Overhead environment insert", "top-down, minimal motion", ["world"], { usesWorldAnchor: true, worldFrom: 3 }),
  s(10, "generated", "Lining or detail macro", "slow macro glide", ["inside"], { detailMatch: /lining|inside|label|sweat|under|tag/i }),
  s(11, "generated", "Three copies of the SAME hat arranged within the world", "slow arc, no spin", ["front", "right", "left", "inside"]),
  s(12, "logo_hold", "Clean, softly lit backdrop from the world for the final logo reveal; no text", "none (deterministic hold)", ["world"], { worldFrom: 3 }),
];

export const HAT_FILM_SHOT_IDS = HAT_FILM_SHOTS.map((shot) => shot.id);
export const HAT_FILM_CLIP_SHOTS = HAT_FILM_SHOTS.filter((shot) => shot.kind !== "logo_hold");

export type ValidationIssue = { field: string; message: string };

const isUrl = (v: unknown) => typeof v === "string" && /^https?:\/\//i.test(v.trim());
const nonEmpty = (v: unknown) => typeof v === "string" && v.trim().length > 0;

/** Pre-charge presence check (values may still be pending file uploads). */
export function missingHatFilmFields(present: Record<string, unknown>): ValidationIssue[] {
  return HAT_FILM_FIELDS.filter((f) => f.required && !nonEmpty(present[f.key]))
    .map((f) => ({ field: f.key, message: `${f.label} is required.` }));
}

/** Full validation on resolved values. Runs before any charge or provider call. */
export function validateHatFilmInputs(raw: Record<string, unknown>): { ok: true; inputs: HatFilmInputs } | { ok: false; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  for (const f of HAT_FILM_FIELDS) {
    if (!f.required) continue;
    const v = raw[f.key];
    if (f.type === "image" && !isUrl(v)) issues.push({ field: f.key, message: `${f.label} is required.` });
    if (f.type === "text" && !nonEmpty(v)) issues.push({ field: f.key, message: `${f.label} is required.` });
  }
  const vibe = typeof raw.brand_vibe === "string" ? raw.brand_vibe.trim() : "";
  if (vibe.length > HAT_FILM_VIBE_MAX) issues.push({ field: "brand_vibe", message: `Keep the vibe under ${HAT_FILM_VIBE_MAX} characters.` });

  const seen = new Map<string, string>();
  for (const a of ["front", "right", "left", "back", "inside", "logo"] as const) {
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
    details.push({ slot, url: String(url).trim(), label: String(raw[`${slot}_label`] ?? "").trim().slice(0, 80) });
  }
  if (issues.length) return { ok: false, issues };
  const str = (k: string) => String(raw[k]).trim();
  const color = (k: string) => (typeof raw[k] === "string" && (raw[k] as string).trim() ? (raw[k] as string).trim().slice(0, 40) : null);
  return {
    ok: true,
    inputs: {
      front: str("front"), right: str("right"), left: str("left"), back: str("back"), inside: str("inside"), logo: str("logo"),
      details, brand_vibe: vibe, top_brim_color: color("top_brim_color"), under_brim_color: color("under_brim_color"),
    },
  };
}

/** Map job inputs (keyed by node id or name) to recipe slots via node metadata. */
export function hatFilmRawInputs(
  nodes: Array<{ id: string; name: string; node_type: string; prompt_config?: Record<string, unknown> | null }>,
  jobInputs: Record<string, unknown>,
): Record<string, unknown> | null {
  const inputNodes = nodes.filter((n) => n.node_type === "user_input" && typeof n.prompt_config?.hat_film_slot === "string");
  if (!inputNodes.length) return null;
  const raw: Record<string, unknown> = {};
  for (const node of inputNodes) {
    const slot = String(node.prompt_config!.hat_film_slot);
    const value = jobInputs[node.id] ?? jobInputs[node.name] ?? jobInputs[slot];
    if (value != null && value !== "") raw[slot] = value;
  }
  for (const k of ["top_brim_color", "under_brim_color"]) if (jobInputs[k] != null) raw[k] = jobInputs[k];
  return raw;
}

/**
 * Explicit area named in a detail label. Side/back/inside words win over
 * generic words like "embroidery", so "left side embroidery" is a LEFT detail.
 */
export function detailArea(label: string): HatAngleSlot | null {
  const l = label.toLowerCase();
  if (/\bleft\b/.test(l)) return "left";
  if (/\bright\b/.test(l)) return "right";
  if (/\b(back|rear|closure|strap|snap\w*|buckle)\b/.test(l)) return "back";
  if (/\b(inside|interior|lining|liner|under\w*|sweat\w*|tag|label)\b/.test(l)) return "inside";
  if (/\bfront\b/.test(l)) return "front";
  return null;
}

export function matchDetail(shot: HatFilmShot, details: HatFilmInputs["details"], used: Set<string>) {
  if (!shot.detailMatch) return null;
  const shotArea = shot.primary.find((p) => p !== "world" && p !== "logo") as HatAngleSlot | undefined;
  return details.find((d) => {
    if (used.has(d.slot)) return false;
    const area = detailArea(d.label);
    if (area) return area === shotArea; // explicit area: only that angle's shot
    return shot.detailMatch!.test(d.label);
  }) ?? null;
}

/** Ordered reference URLs for a shot. Never invents or mirrors a missing angle. */
export function resolveShotReferences(shot: HatFilmShot, inputs: HatFilmInputs, used = new Set<string>()) {
  const refs: Array<{ slot: HatImageSlot; url: string; role: string }> = [];
  for (const p of shot.primary) {
    if (p === "world") continue;
    const role = p === "inside" && shot.index === 11
      ? "inside/underside photo: use ONLY for any visible underside, never for the top of the bill"
      : p === "right" ? "wearer's right side photo" : p === "left" ? "wearer's left side photo" : `${p} photo`;
    refs.push({ slot: p, url: inputs[p as HatAngleSlot | "logo"], role });
  }
  const detail = matchDetail(shot, inputs.details, used);
  if (detail) { used.add(detail.slot); refs.push({ slot: detail.slot, url: detail.url, role: `close-up detail: ${detail.label || detail.slot}` }); }
  return refs;
}

/** Exact frame schedule. Every segment starts at frame 0 of its source. */
export function buildEditDecisionList() {
  return HAT_FILM_SHOTS.map((shot) => ({
    shot_id: shot.id,
    kind: shot.kind,
    start_frame: shot.startFrame,
    end_frame: shot.endFrame,
    frames: shot.frames,
    /** Source must cover this many ms; a logo hold is rendered from a still. */
    min_source_ms: shot.kind === "logo_hold" ? 0 : Math.ceil((shot.frames / HAT_FILM_FPS) * 1000),
    muted: true,
    transition: "hard_cut" as const,
    logo_overlay: shot.kind !== "generated",
  }));
}

/** Throws unless ids are exactly the 12 expected unique shot ids. */
export function assertCompleteShotSet(ids: string[]) {
  const unique = new Set(ids);
  if (unique.size !== ids.length) throw new Error("Duplicate shot ids in manifest");
  const missing = HAT_FILM_SHOT_IDS.filter((id) => !unique.has(id));
  const extra = ids.filter((id) => !HAT_FILM_SHOT_IDS.includes(id));
  if (missing.length || extra.length) throw new Error(`Shot set mismatch (missing: ${missing.join(",") || "none"}; unexpected: ${extra.join(",") || "none"})`);
}

/**
 * Cost estimate (USD fallback prices; live provider pricing stays authoritative).
 * 12 stills + 11 five-second clips (shot 12 is a still-based hold), audio off.
 * Worst case includes one automatic retry per shot.
 */
export function estimateHatFilm(p: { imageUsd: number; videoUsdPerSecond: number; usdPerCredit: number }) {
  const stills = HAT_FILM_SHOTS.length;
  const clips = HAT_FILM_CLIP_SHOTS.length;
  const baseUsd = stills * p.imageUsd + clips * HAT_FILM_CLIP_SECONDS * p.videoUsdPerSecond;
  const maxUsd = baseUsd * (1 + HAT_FILM_MAX_AUTO_RETRIES);
  return {
    stills, clips,
    base_usd: +baseUsd.toFixed(2), max_usd: +maxUsd.toFixed(2),
    base_credits: Math.ceil(baseUsd / p.usdPerCredit), max_credits: Math.ceil(maxUsd / p.usdPerCredit),
  };
}
