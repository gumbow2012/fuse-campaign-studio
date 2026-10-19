/**
 * Hat Brand Film — compile one immutable run context: a single shared world
 * definition plus per-shot prompts and reference mappings. Pure, no I/O.
 */
import {
  HAT_FILM_RECIPE_ID, HAT_FILM_SHOTS, resolveShotReferences,
  type HatFilmInputs, type HatFilmShot,
} from "./hat-film-recipe.ts";

export interface WorldDefinition {
  vibe: string; // sanitized customer art direction
  location: string;
  anchor: string;
  lighting: string;
  palette: string;
  background_action: string;
}

/** Terms from the reference film's previous brand that must never leak in. */
export const STALE_BRAND_TERMS = [/trade\s*culture/gi, /\bskull\b/gi];

/** Contain instructions inside the vibe: it is art direction only. */
export function sanitizeVibe(vibe: string): string {
  let v = vibe.replace(/[\u0000-\u001f]+/g, " ");
  v = v.replace(/\b(ignore|disregard|override|forget)\b[^.]*\b(instruction|rule|reference|prompt|previous)s?\b[^.]*\.?/gi, "");
  v = v.replace(/\b(system|assistant)\s*:/gi, "");
  for (const re of STALE_BRAND_TERMS) v = v.replace(re, "");
  return v.replace(/[{}<>`]/g, "").replace(/\s+/g, " ").trim().slice(0, 1200);
}

/**
 * Deterministic world resolution from the vibe text. Returning structured,
 * reused fields means the 12 shots never reinterpret the vibe independently.
 * (An LLM-expanded world can replace `resolveWorld` later; the contract is the same.)
 */
export function resolveWorld(vibe: string): WorldDefinition {
  const v = sanitizeVibe(vibe);
  const sentences = v.split(/(?<=\.)\s+/).filter(Boolean);
  const location = sentences[0]?.replace(/\.$/, "") || v;
  const lightWords = v.match(/[^.,]*\b(light|lights|lit|glow|neon|dusk|dawn|sunset|night|golden|shadow)\w*[^.,]*/i)?.[0]?.trim();
  return {
    vibe: v,
    location,
    anchor: `the single defining landmark of ${location.toLowerCase()}`,
    lighting: lightWords || "cinematic motivated lighting consistent with the location",
    palette: "a palette native to this location, kept identical across every shot",
    background_action: sentences.slice(1).join(" ") || "subtle ambient background motion",
  };
}

export interface ProductLocks {
  top_brim_color: string | null;
  under_brim_color: string | null;
}

export function productRules(locks: ProductLocks): string {
  const top = locks.top_brim_color ? `The TOP of the bill is ${locks.top_brim_color}, exactly as in the front photo.` : "The TOP of the bill matches the front photo exactly.";
  const under = locks.under_brim_color ? `The UNDERSIDE of the bill is ${locks.under_brim_color}, exactly as in the inside photo.` : "The UNDERSIDE of the bill matches the inside photo.";
  return [
    "The uploaded photos are the only authority for the hat: preserve crown panels, curvature, seams, button, closure, stitching, embroidery, patches and lettering exactly.",
    "Wearer's right and left sides are different; never mirror one onto the other.",
    top, under, "Never let the underside color recolor the top of the bill.",
    "Do not add any logo, lettering or graphic that is not in the uploaded photos.",
  ].join(" ");
}

export interface CompiledShot {
  shot_id: string;
  index: number;
  kind: HatFilmShot["kind"];
  still_prompt: string;
  motion_prompt: string;
  references: Array<{ slot: string; url: string; role: string }>;
  frames: number;
}

export interface HatFilmRunContext {
  recipe: string;
  world: WorldDefinition;
  locks: ProductLocks;
  shots: CompiledShot[];
}

export function compileHatFilmRun(inputs: HatFilmInputs): HatFilmRunContext {
  const world = resolveWorld(inputs.brand_vibe);
  const locks = { top_brim_color: inputs.top_brim_color ?? null, under_brim_color: inputs.under_brim_color ?? null };
  const rules = productRules(locks);
  const worldText = `World (art direction for the environment only): ${world.vibe} Location: ${world.location}. Lighting: ${world.lighting}. Background action: ${world.background_action}.`;
  const used = new Set<string>();
  const shots = HAT_FILM_SHOTS.map((shot): CompiledShot => {
    const refs = resolveShotReferences(shot, inputs, used);
    const refText = refs.map((r, i) => `@Image${i + 1} = ${r.role}`).join("; ");
    const isWorldOnly = refs.length === 0;
    const subject = shot.index === 11
      ? "Three identical copies of the SAME hat from the references, arranged naturally in the world. Every upper bill matches the front photo."
      : shot.kind === "logo_composite"
        ? "Leave a clean, flat, well-lit area for the brand logo, which is composited afterwards. Do not draw any text or logo."
        : isWorldOnly ? "No hat in frame; pure environment." : `The hat from the references. ${shot.content}.`;
    const anchor = shot.index === 3 || shot.sharesAnchorWith ? ` Feature ${world.anchor}.` : "";
    return {
      shot_id: shot.id,
      index: shot.index,
      kind: shot.kind,
      still_prompt: [`Vertical 9:16 premium product film still. ${shot.content}.`, subject, worldText + anchor, refText ? `References: ${refText}.` : "", isWorldOnly ? "" : rules].filter(Boolean).join(" "),
      motion_prompt: `${shot.motion}. Keep the hat rigid and unchanged; animate only camera and environment. No spin, no morphing, no text.`,
      references: refs,
      frames: shot.frames,
    };
  });
  return { recipe: HAT_FILM_RECIPE_ID, world, locks, shots };
}
