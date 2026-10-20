/**
 * Outfit Swap — HAT MODE (pure, no I/O).
 *
 * Product videos of hats have no people, often several different hats, and many
 * views (front, sides, back, underside, macro). Hat mode replaces each SOURCE hat
 * with the customer hat it is mapped to, sending only the reference photos that
 * match the view in THIS frame. One customer hat may replace every source hat.
 */

export const HAT_VIEWS = ["front", "right", "left", "back", "underside", "top", "macro", "multiple", "uncertain"] as const;
export type HatView = typeof HAT_VIEWS[number];

/** Customer hat (an Outfit Swap garment of type "Hat"). `url` mirrors `frontUrl`. */
export type HatGarment = {
  id: string;
  url?: string | null;
  frontUrl?: string | null;
  backUrl?: string | null;
  rightUrl?: string | null;
  leftUrl?: string | null;
  undersideUrl?: string | null;
  detailUrl?: string | null;
  sideUrl?: string | null;
  label?: string | null;
  /** Exact lettering (hat) or brand name (brand/logo), typed by the customer (spelling authority). */
  lettering?: string | null;
  /** Product type: "Hat" (default) or "Brand / logo" (branding on signs/packaging in the scene). */
  type?: string | null;
};

/** One source hat visible in a frame (from hat analysis). */
export type FrameHat = { hatId: string; view?: string | null; description?: string | null };

export type HatSwapRequest = {
  /** Source hats in this frame; empty = "every hat in the frame". */
  hats?: FrameHat[] | null;
  /** source hat id → customer hat (garment) id. Missing entries use the default. */
  mapping?: Record<string, string> | null;
  /** Customer hat used for unmapped source hats (the "one hat throughout" case). */
  defaultGarmentId?: string | null;
  /** True when hat analysis ran: an empty `hats` then means "no hat in this frame", not "unknown". */
  analyzed?: boolean | null;
};

/** Max reference photos per hat per frame (keeps the edit focused). */
export const HAT_REFS_PER_HAT = 3;

const clean = (v: unknown) => String(v ?? "").trim();

export function normalizeHatView(value: unknown): HatView {
  const v = clean(value).toLowerCase();
  return (HAT_VIEWS as readonly string[]).includes(v) ? (v as HatView) : "uncertain";
}

const front = (g: HatGarment) => clean(g.frontUrl) || clean(g.url);

/** Reference photos for one hat in one view — the matching angle first, front as identity anchor. */
export function hatRefsForView(garment: HatGarment, view: HatView): string[] {
  const f = front(garment);
  const side = clean(garment.sideUrl);
  const byView: Record<HatView, string[]> = {
    front: [f, clean(garment.detailUrl)],
    right: [clean(garment.rightUrl) || side, f],
    left: [clean(garment.leftUrl) || side, f],
    back: [clean(garment.backUrl), f],
    underside: [clean(garment.undersideUrl), f],
    top: [f, clean(garment.backUrl)],
    macro: [clean(garment.detailUrl), f],
    multiple: [f, clean(garment.backUrl), clean(garment.rightUrl) || clean(garment.leftUrl) || side],
    uncertain: [f, clean(garment.backUrl)],
  };
  return [...new Set(byView[view].filter(Boolean))].slice(0, HAT_REFS_PER_HAT);
}

const VIEW_WORDS: Record<HatView, string> = {
  front: "from the front",
  right: "from the wearer's right side",
  left: "from the wearer's left side",
  back: "from the back",
  underside: "from underneath (inside of the crown and underside of the brim)",
  top: "from above",
  macro: "in an extreme close-up",
  multiple: "",
  uncertain: "",
};

/** Letter-by-letter spelling so the model cannot "fix" the lettering. */
export function spellLettering(text: string): string {
  return [...text.trim()].map((c) => (c === " " ? "/" : c)).join("-");
}

/** Templates pass "{{input:<node>}}" as lettering; the runner fills (and spells) it at run time. */
const spelled = (text: string) => text.startsWith("{{input:") ? text.replace("{{input:", "{{spell:") : spellLettering(text);

/** "Brand / logo" products replace branding printed in the scene (signs, packaging, labels). */
export const isBrandGarment = (g: { type?: string | null }) => /brand|logo/i.test(clean(g.type));

export type HatSwapAssembly = { imageUrls: string[]; prompt: string; usedGarmentIds: string[] };

/**
 * Builds the single image edit for one frame: image 1 = source frame, then each
 * mapped customer hat's view-matched references.
 */
export function assembleHatSwap(args: {
  sourceFrameUrl: string;
  garments: HatGarment[];
  hatSwap: HatSwapRequest;
  extraPrompt?: string | null;
}): HatSwapAssembly {
  const source = clean(args.sourceFrameUrl);
  if (!source) throw new Error("A source frame is required");
  const brands = args.garments.filter((g) => isBrandGarment(g) && front(g));
  const byId = new Map(args.garments.filter((g) => !isBrandGarment(g) && front(g)).map((g) => [g.id, g]));
  if (!byId.size && !brands.length) throw new Error("Add a hat with at least a front photo, or a brand logo");
  const fallback = byId.get(clean(args.hatSwap.defaultGarmentId)) ?? byId.values().next().value;

  const sourceHats: FrameHat[] = (args.hatSwap.hats ?? []).filter((h) => clean(h?.hatId));
  // No detected hats: if hats were analyzed this frame simply has none (never invent one);
  // if not, treat it as one "every hat" target with the default hat.
  const targets = !fallback
    ? []
    : sourceHats.length
      ? sourceHats
      : args.hatSwap.analyzed
        ? []
        : [{ hatId: "*", view: "uncertain", description: null }];

  const imageUrls = [source];
  const lines: string[] = [];
  const used = new Set<string>();
  for (const hat of targets) {
    const garment = byId.get(clean(args.hatSwap.mapping?.[hat.hatId])) ?? fallback!;
    const view = normalizeHatView(hat.view);
    const refs = hatRefsForView(garment, view);
    const first = imageUrls.length + 1;
    imageUrls.push(...refs);
    const last = imageUrls.length;
    used.add(garment.id);
    const where = hat.hatId === "*"
      ? "Every hat in image 1"
      : `The hat in image 1${clean(hat.description) ? ` described as "${clean(hat.description)}"` : ""}${VIEW_WORDS[view] ? `, seen ${VIEW_WORDS[view]}` : ""},`;
    const refWords = first === last ? `reference image ${first}` : `reference images ${first}-${last}`;
    const lettering = clean(garment.lettering);
    lines.push(
      `${where} becomes exactly the hat shown in ${refWords}${clean(garment.label) ? ` (${clean(garment.label)})` : ""}.` +
        (lettering ? ` Its lettering must read exactly "${lettering}" (spelled ${spelled(lettering)}); never add, drop or change letters.` : ""),
    );
  }

  for (const brand of brands) {
    imageUrls.push(front(brand));
    used.add(brand.id);
    const name = clean(brand.lettering);
    lines.push(
      `Every brand name and logo printed on signs, displays, machines, packaging, wrappers and labels in image 1 becomes the brand shown in reference image ${imageUrls.length}` +
        (name ? `, with the name reading exactly "${name}" (spelled ${spelled(name)}); never add, drop or change letters` : "") +
        ". Keep each item's shape, layout, colors, materials, lighting and perspective; change only the brand mark and its wording. Logos on hats follow the hat instructions instead.",
    );
  }
  if (!lines.length) throw new Error("Nothing to swap in this frame");

  const prompt = [
    "Use image 1 as the exact primary image. This is a precise product swap, not a redesign.",
    "Replace ONLY what is listed below. Keep the camera angle, framing, crop, background, environment, lighting, reflections, shadows, depth of field, motion blur, hands and any people exactly as in image 1.",
    targets.length ? "Keep each hat's position, scale, angle and perspective exactly where the original hat is." : "",
    ...lines,
    targets.length
      ? "Match the replacement hat's crown shape, panels and seams, brim curve, top-of-brim color, underside color, embroidery, patches, logos, closure, materials and colors exactly as in its reference images. Show only the side of the hat that faces the camera in image 1."
      : "",
    targets.length ? "Do not add extra hats." : "Do not add a hat.",
    "Do not invent other text, logos or graphics.",
    clean(args.extraPrompt),
  ].filter(Boolean).join(" ");

  return { imageUrls, prompt, usedGarmentIds: [...used] };
}

/**
 * Hat/scene mode: every product is a hat or a brand/logo (product and branded-scene videos).
 * Clothing worn by people keeps the regular Outfit Swap paths.
 */
export function isHatRun(garments: { type?: string | null }[]): boolean {
  return garments.length > 0 && garments.every((g) => clean(g.type).toLowerCase() === "hat" || isBrandGarment(g));
}

/** Video rebuild prompt for a hat/scene run: same video, the approved swapped frames define the hats and branding. */
export function buildHatReconstructionPrompt(garments: HatGarment[], extra?: string | null): string {
  const hats = garments.filter((g) => !isBrandGarment(g));
  const brands = garments.filter(isBrandGarment);
  const lettering = hats.map((g) => clean(g.lettering)).filter(Boolean);
  const names = brands.map((g) => clean(g.lettering)).filter(Boolean);
  return [
    "Recreate the source video exactly: same motion, timing, camera movement, framing, environment, lighting, hands and any people.",
    hats.length
      ? "Every hat looks exactly like the hat in the reference frames, consistently in every shot: same crown, panels, brim, top-of-brim and underside colors, embroidery, patches, logos and materials."
      : "",
    lettering.length ? `Hat lettering stays exactly ${lettering.map((t) => `"${t}"`).join(", ")} — never change letters.` : "",
    brands.length
      ? `Branding on signs, machines, packaging and labels looks exactly like in the reference frames in every shot${names.length ? `, reading exactly ${names.map((t) => `"${t}"`).join(", ")}` : ""}.`
      : "",
    `Do not add hats, text or logos. Same video, new ${hats.length && brands.length ? "hat and branding" : hats.length ? "hat" : "branding"}.`,
    clean(extra),
  ].filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ *
 * Hat analysis (one Gemini call per run; see outfit-swap-analyze mode "hats")
 * ------------------------------------------------------------------ */

export const HAT_ANALYSIS_VERSION = "outfit-swap-hat-analysis-v1";

export type HatTrack = { hatId: string; description: string; firstFrameId: string | null; frameCount: number };
export type HatAnalysis = {
  version: string;
  mode: "hats";
  frameCount: number;
  hatCount: number;
  hatTracks: HatTrack[];
  frames: { frameId: string; timestamp: number; hats: { hatId: string; view: HatView; confidence: number }[] }[];
};

export function buildHatAnalysisPrompt(frames: { frameId: string; timestamp: number }[]): string {
  return [
    "You are a product-continuity analyst for a hat video swap pipeline. Return JSON only. You never generate images or video.",
    "You are given ordered keyframes from ONE source video (chronological, timestamps given). The video may show one hat or several DIFFERENT hats (cuts between products are common).",
    "Give each physically distinct hat a STABLE id — hat_1, hat_2, … in order of first appearance — and reuse the SAME id whenever that same hat appears again, from any angle or distance. Two hats are the same only if crown color, brim color, lettering/graphics and construction match. Never base ids on screen position.",
    "PER FRAME list every visible hat with: hat_id; view — exactly one of front, right, left, back, underside, top, macro, multiple, uncertain (right/left = the WEARER's right/left side; underside = inside of the crown or under the brim; macro = extreme close-up of embroidery/texture); confidence 0–1.",
    "RUN LEVEL: hat_tracks — one entry per hat with hat_id and a short neutral visual description a person can recognise (e.g. 'black trucker, pink star embroidery, cream front panel'), max 12 words. Do not name brands or read out long text.",
    "Include a frames entry for EVERY frame, in order, echoing frameId and timestamp exactly. A frame with no hat gets an empty hats array.",
    "FRAMES (images follow, in this order):",
    ...frames.map((f, i) => `FRAME ${i + 1}: frameId "${f.frameId}" (timestamp ${f.timestamp}s)`),
  ].join("\n");
}

/** Truthful, stable normalization of the model's hat analysis. */
export function normalizeHatAnalysis(raw: any, frames: { frameId: string; timestamp: number }[]): HatAnalysis {
  const known = new Map(frames.map((f) => [f.frameId, f]));
  const counts = new Map<string, number>();
  const first = new Map<string, string>();
  const outFrames = (Array.isArray(raw?.frames) ? raw.frames : [])
    .map((entry: any) => {
      const src = known.get(clean(entry?.frame_id));
      if (!src) return null;
      const seen = new Set<string>();
      const hats = (Array.isArray(entry?.hats) ? entry.hats : [])
        .map((h: any) => ({ hatId: clean(h?.hat_id), view: normalizeHatView(h?.view), confidence: Math.min(1, Math.max(0, Number(h?.confidence) || 0)) }))
        .filter((h: { hatId: string }) => h.hatId && !seen.has(h.hatId) && seen.add(h.hatId));
      for (const h of hats) {
        counts.set(h.hatId, (counts.get(h.hatId) ?? 0) + 1);
        if (!first.has(h.hatId)) first.set(h.hatId, src.frameId);
      }
      return { frameId: src.frameId, timestamp: src.timestamp, hats };
    })
    .filter(Boolean) as HatAnalysis["frames"];
  const described = new Map<string, string>(
    (Array.isArray(raw?.hat_tracks) ? raw.hat_tracks : []).map((t: any) => [clean(t?.hat_id), clean(t?.description).slice(0, 120)]),
  );
  // Only hats that actually appear in a frame are real tracks.
  const hatTracks = [...counts.keys()].map((hatId) => ({
    hatId,
    description: described.get(hatId) || hatId.replace("_", " "),
    firstFrameId: first.get(hatId) ?? null,
    frameCount: counts.get(hatId) ?? 0,
  }));
  return { version: HAT_ANALYSIS_VERSION, mode: "hats", frameCount: outFrames.length, hatCount: hatTracks.length, hatTracks, frames: outFrames };
}

/* ------------------------------------------------------------------ *
 * Template planning (Outfit Swap "Make into template" for hat/scene runs)
 * ------------------------------------------------------------------ */

export type SceneTemplateInput = {
  id: string;
  key: string;
  label: string;
  expected: "image" | "text";
  required: boolean;
  sampleUrl?: string;
  sampleText?: string;
  hint?: string;
};
/** Per approved frame: the customer inputs feeding it (image 2…n order) + its prompt; null = nothing to swap. */
export type SceneTemplateFrame = { refInputIds: string[]; prompt: string } | null;

const HAT_ANGLE_SLOTS = [
  ["frontUrl", "Front", true],
  ["backUrl", "Back", false],
  ["rightUrl", "Wearer's right side", false],
  ["leftUrl", "Wearer's left side", false],
  ["undersideUrl", "Inside / underside", false],
  ["detailUrl", "Detail close-up", false],
] as const;

/**
 * Turns an approved hat/scene run into customer inputs + per-frame prompts. Customer photos
 * replace the author's (the author's are the samples); the brand name is customer text filled
 * at run time through {{input:…}} / {{spell:…}}. Hat lettering is not templated (a new hat has
 * new lettering), so hats rely on their photos.
 */
export function planSceneTemplate(args: {
  garments: HatGarment[];
  frames: { hats?: FrameHat[] | null; analyzed?: boolean | null }[];
  mapping?: Record<string, string> | null;
  defaultGarmentId?: string | null;
  newId: () => string;
}): { inputs: SceneTemplateInput[]; frames: SceneTemplateFrame[]; reconstructionPrompt: string } {
  const inputs: SceneTemplateInput[] = [];
  const hatCount = args.garments.filter((g) => !isBrandGarment(g)).length;
  let hatNo = 0;
  let brandNo = 0;
  const placeholders: HatGarment[] = args.garments.map((g) => {
    if (isBrandGarment(g)) {
      brandNo += 1;
      const logo = { id: args.newId(), key: `brand_${brandNo}_logo`, label: brandNo > 1 ? `Brand logo ${brandNo}` : "Brand logo", expected: "image" as const, required: true, sampleUrl: front(g), hint: "Your logo — a clean PNG works best." };
      const name = { id: args.newId(), key: `brand_${brandNo}_name`, label: brandNo > 1 ? `Brand name ${brandNo}` : "Brand name", expected: "text" as const, required: true, sampleText: clean(g.lettering), hint: "Exactly as it should be spelled on signs and packaging." };
      inputs.push(logo, name);
      return { id: g.id, type: g.type, frontUrl: `id:${logo.id}`, lettering: `{{input:${name.id}}}` };
    }
    hatNo += 1;
    const prefix = hatCount > 1 ? `Hat ${hatNo} · ` : "Hat · ";
    const placeholder: HatGarment = { id: g.id, type: g.type ?? "Hat" };
    for (const [field, label, required] of HAT_ANGLE_SLOTS) {
      const url = field === "frontUrl" ? front(g) : clean(g[field]);
      if (!url) continue;
      const input = { id: args.newId(), key: `hat_${hatNo}_${field.replace("Url", "")}`, label: `${prefix}${label}`, expected: "image" as const, required, sampleUrl: url };
      inputs.push(input);
      (placeholder as Record<string, unknown>)[field] = `id:${input.id}`;
    }
    return placeholder;
  });

  const frames = args.frames.map((frame): SceneTemplateFrame => {
    try {
      const out = assembleHatSwap({
        sourceFrameUrl: "id:source",
        garments: placeholders,
        hatSwap: { hats: frame.hats ?? [], analyzed: frame.analyzed ?? false, mapping: args.mapping ?? {}, defaultGarmentId: args.defaultGarmentId ?? null },
      });
      return { refInputIds: out.imageUrls.slice(1).map((u) => u.slice(3)), prompt: out.prompt };
    } catch (error) {
      if (error instanceof Error && /Nothing to swap/.test(error.message)) return null;
      throw error;
    }
  });

  return { inputs, frames, reconstructionPrompt: buildHatReconstructionPrompt(placeholders) };
}
