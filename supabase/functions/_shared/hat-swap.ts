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
  /** Exact lettering on the hat, typed by the customer (spelling authority). */
  lettering?: string | null;
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
  const byId = new Map(args.garments.filter((g) => front(g)).map((g) => [g.id, g]));
  if (!byId.size) throw new Error("Add a hat with at least a front photo");
  const fallback = byId.get(clean(args.hatSwap.defaultGarmentId)) ?? byId.values().next().value!;

  const sourceHats: FrameHat[] = (args.hatSwap.hats ?? []).filter((h) => clean(h?.hatId));
  // No detected hats in this frame → treat as one "every hat" target with the default hat.
  const targets = sourceHats.length ? sourceHats : [{ hatId: "*", view: "uncertain", description: null }];

  const imageUrls = [source];
  const lines: string[] = [];
  const used = new Set<string>();
  for (const hat of targets) {
    const garment = byId.get(clean(args.hatSwap.mapping?.[hat.hatId])) ?? fallback;
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
        (lettering ? ` Its lettering must read exactly "${lettering}" (spelled ${spellLettering(lettering)}); never add, drop or change letters.` : ""),
    );
  }

  const prompt = [
    "Use image 1 as the exact primary image. This is a precise product swap, not a redesign.",
    "Replace ONLY the hat(s). Keep the camera angle, framing, crop, background, environment, lighting, reflections, shadows, depth of field, motion blur, hands and any people exactly as in image 1.",
    "Keep each hat's position, scale, angle and perspective exactly where the original hat is.",
    ...lines,
    "Match the replacement hat's crown shape, panels and seams, brim curve, top-of-brim color, underside color, embroidery, patches, logos, closure, materials and colors exactly as in its reference images. Show only the side of the hat that faces the camera in image 1.",
    "Do not invent text, logos or graphics that are not on the reference hat. Do not add extra hats.",
    clean(args.extraPrompt),
  ].filter(Boolean).join(" ");

  return { imageUrls, prompt, usedGarmentIds: [...used] };
}

/** True when the run should use hat mode: every product is a hat. */
export function isHatRun(garments: { type?: string | null }[]): boolean {
  return garments.length > 0 && garments.every((g) => clean(g.type).toLowerCase() === "hat");
}

/** Video rebuild prompt for a hat run: same video, the approved swapped frames define the hats. */
export function buildHatReconstructionPrompt(garments: HatGarment[], extra?: string | null): string {
  const lettering = garments.map((g) => clean(g.lettering)).filter(Boolean);
  return [
    "Recreate the source video exactly: same motion, timing, camera movement, framing, environment, lighting, hands and any people.",
    "Every hat looks exactly like the hat in the reference frames, consistently in every shot: same crown, panels, brim, top-of-brim and underside colors, embroidery, patches, logos and materials.",
    lettering.length ? `Hat lettering stays exactly ${lettering.map((t) => `"${t}"`).join(", ")} — never change letters.` : "",
    "Do not add hats, text or logos. Same video, new hat.",
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
