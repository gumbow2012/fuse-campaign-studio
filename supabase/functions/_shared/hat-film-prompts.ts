/**
 * Hat Brand Film — compile one immutable run context: ONE shared world with
 * concrete reused values, product locks, and per-shot prompts/references.
 * The vibe is environment art direction only; it never names or replaces the
 * product. Brand words in the vibe are kept (the customer may be that brand).
 */
import {
  HAT_FILM_RECIPE_ID, HAT_FILM_SHOTS, HAT_FILM_SOUNDTRACK_PATH, resolveShotReferences,
  type HatFilmInputs, type HatFilmShot,
} from "./hat-film-recipe.ts";

export interface WorldDefinition {
  vibe: string;
  location: string;
  time_of_day: string;
  anchor: string;
  props: string[];
  lighting: string;
  palette: string;
  background_action: string;
}

/** Removes control characters, template syntax and role/override directives only. */
export function sanitizeVibe(vibe: string): string {
  let v = vibe.replace(/[\u0000-\u001f\u007f]+/g, " ");
  v = v.replace(/[^.!?]*\b(ignore|disregard|override|forget)\b[^.!?]*\b(instructions?|rules?|references?|prompts?|photos?)\b[^.!?]*[.!?]?/gi, " ");
  v = v.replace(/\b(system|assistant|developer)\s*:/gi, " ");
  return v.replace(/[{}<>`]/g, "").replace(/\s+/g, " ").trim().slice(0, 1200);
}

const TIME_WORDS = /\b(dawn|sunrise|morning|noon|midday|afternoon|golden hour|sunset|dusk|twilight|evening|night|midnight)\b/i;
const LIGHT_WORDS = /\b[^,.;]*\b(lights?|lit|glow\w*|neon|lamps?|spotlights?|sunlight|daylight|shadows?|haze)\b[^,.;]*/i;
const COLOR_WORDS = /\b(black|white|gr[ae]y|silver|gold(en)?|amber|orange|red|crimson|pink|magenta|purple|violet|blue|navy|teal|cyan|green|olive|yellow|brown|tan|beige|cream|chrome|concrete|marble|warm|cool|pastel|neon)\b/gi;

/**
 * Deterministic world: values are resolved ONCE and reused verbatim by every
 * shot. The anchor is a concrete element named by the customer (first listed
 * prop), not an instruction for each shot to invent one.
 */
export function resolveWorld(vibe: string): WorldDefinition {
  const v = sanitizeVibe(vibe);
  const sentences = v.split(/(?<=[.!?])\s+/).map((x) => x.replace(/[.!?]+$/, "").trim()).filter(Boolean);
  const location = sentences[0] || v;
  const props = sentences.slice(1).flatMap((x) => x.split(/,|\band\b/)).map((x) => x.trim()).filter((x) => x && x.split(" ").length <= 5);
  const sceneProps = props.filter((p) => !LIGHT_WORDS.test(p) && !/\b(rugged|cinematic|premium|moody|clean|minimal|luxur\w*)\b/i.test(p));
  const anchor = sceneProps[0] ?? location;
  const lighting = v.match(LIGHT_WORDS)?.[0]?.trim() || `natural light for ${location.toLowerCase()}`;
  const colors = [...new Set((v.match(COLOR_WORDS) ?? []).map((c) => c.toLowerCase()))];
  const action = props.find((p) => /\b(drift\w*|mov\w*|fly\w*|rain\w*|smok\w*|dust|spark\w*|traffic|crowd|wind|water|wave\w*)\b/i.test(p));
  return {
    vibe: v,
    location,
    time_of_day: v.match(TIME_WORDS)?.[0]?.toLowerCase() ?? "as described",
    anchor,
    props: sceneProps.slice(0, 6),
    lighting,
    palette: colors.length ? colors.join(", ") : `colors native to ${location.toLowerCase()}`,
    background_action: action ?? "subtle ambient motion",
  };
}

export interface ProductLocks { top_brim_color: string | null; under_brim_color: string | null }

export function productRules(locks: ProductLocks): string {
  const top = locks.top_brim_color ? `The TOP of the bill is ${locks.top_brim_color}, exactly as in the front photo.` : "The TOP of the bill matches the front photo exactly.";
  const under = locks.under_brim_color ? `The UNDERSIDE of the bill is ${locks.under_brim_color}, exactly as in the inside photo.` : "The UNDERSIDE of the bill matches the inside photo.";
  return [
    "Product authority: the reference photos only. Preserve crown panels, curvature, seams, button, closure, stitching, embroidery, patches and lettering exactly.",
    "The wearer's right and left sides are different; never mirror one onto the other.",
    top, under, "The underside color never recolors the top of the bill.",
    "Add no logo, lettering or graphic that is not visible in the reference photos.",
  ].join(" ");
}

export function worldText(world: WorldDefinition): string {
  return [
    `Setting (environment only, from the customer's art direction; it never changes the hat): ${world.location}.`,
    `Time: ${world.time_of_day}. Lighting: ${world.lighting}. Palette: ${world.palette}.`,
    world.props.length ? `Props: ${world.props.join(", ")}.` : "",
    `Background action: ${world.background_action}.`,
  ].filter(Boolean).join(" ");
}

export interface CompiledShot {
  shot_id: string;
  index: number;
  kind: HatFilmShot["kind"];
  still_prompt: string;
  motion_prompt: string | null;
  references: Array<{ slot: string; url: string; role: string }>;
  frames: number;
}

export interface HatFilmRunContext {
  recipe: string;
  world: WorldDefinition;
  locks: ProductLocks;
  logo_url: string;
  soundtrack_path: string;
  shots: CompiledShot[];
}

export function compileHatFilmRun(inputs: HatFilmInputs, opts: { soundtrackPath?: string } = {}): HatFilmRunContext {
  const world = resolveWorld(inputs.brand_vibe);
  const locks = { top_brim_color: inputs.top_brim_color ?? null, under_brim_color: inputs.under_brim_color ?? null };
  const rules = productRules(locks);
  const setting = worldText(world);
  const used = new Set<string>();
  const shots = HAT_FILM_SHOTS.map((shot): CompiledShot => {
    const refs = resolveShotReferences(shot, inputs, used);
    const refText = refs.map((r, i) => `Image ${i + 1} = ${r.role}`).join("; ");
    const hasHat = refs.length > 0;
    const subject = shot.index === 11
      ? "Three identical copies of the SAME hat from the reference photos, arranged naturally in the setting. Every upper bill matches the front photo."
      : shot.kind !== "generated"
        ? "No hat and no text in frame. Do not draw any logo or lettering; the brand logo is composited later from the original file."
        : hasHat ? `The hat from the reference photos. ${shot.content}.` : "No hat in frame; environment only.";
    const anchor = shot.usesWorldAnchor ? ` Feature the ${world.anchor} prominently.` : "";
    return {
      shot_id: shot.id,
      index: shot.index,
      kind: shot.kind,
      still_prompt: [
        `Vertical 9:16 premium product-film still. ${shot.content}.`,
        subject,
        setting + anchor,
        refText ? `References: ${refText}.` : "",
        hasHat ? rules : "",
      ].filter(Boolean).join(" "),
      motion_prompt: shot.kind === "logo_hold"
        ? null
        : `${shot.motion}. Keep every object rigid and unchanged${hasHat ? ", especially the hat" : ""}; animate only the camera and the ${world.background_action}. No spin, no morphing, no text.`,
      references: refs,
      frames: shot.frames,
    };
  });
  return { recipe: HAT_FILM_RECIPE_ID, world, locks, logo_url: inputs.logo, soundtrack_path: opts.soundtrackPath ?? HAT_FILM_SOUNDTRACK_PATH, shots };
}

export function parseHatFilmContext(value: unknown): HatFilmRunContext | null {
  const v = value as HatFilmRunContext | null;
  return v && v.recipe === HAT_FILM_RECIPE_ID && Array.isArray(v.shots) && v.shots.length === HAT_FILM_SHOTS.length ? v : null;
}
