/**
 * Outfit Swap — source-video LOGO (watermark / brand mark burned on top of the clip).
 *
 * The AI never draws a customer's logo (it distorts marks). It only removes the
 * source logo ("clean plate"); the customer's logo is composited pixel-exact in the
 * browser at the detected box. This module is pure: detection prompt, result
 * normalization and the clean-plate instruction.
 */

export const OVERLAY_LOGO_VERSION = "outfit-swap-overlay-logo-v1";

/** Normalized box (0–1, origin top-left). */
export type LogoBox = { x: number; y: number; w: number; h: number };
export type OverlayLogoAnalysis = {
  version: string;
  mode: "logo";
  present: boolean;
  description: string;
  box: LogoBox | null;
  /** Frames (ids) where the logo is visible. */
  frameIds: string[];
};

const clean = (v: unknown) => String(v ?? "").trim();
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function buildOverlayLogoPrompt(frames: { frameId: string; timestamp: number }[]): string {
  return [
    "You inspect frames from ONE source video for an OVERLAID logo: a watermark, creator mark or brand graphic composited on top of the footage (it stays fixed on screen while the scene moves). Return JSON only.",
    "Do NOT count logos that are physically part of the scene: logos on clothing, hats, products, signs, cars or buildings are not overlays.",
    "If an overlaid logo exists, report present=true, a short neutral description (max 8 words, no brand names), box_2d as [ymin, xmin, ymax, xmax] on a 0–1000 scale tightly around the logo where it is most clearly visible, and frame_ids listing every frame where it is visible.",
    "If there is none, report present=false, empty description, box_2d [0,0,0,0] and an empty frame_ids list.",
    "FRAMES (images follow, in this order):",
    ...frames.map((f, i) => `FRAME ${i + 1}: frameId "${f.frameId}" (timestamp ${f.timestamp}s)`),
  ].join("\n");
}

export function normalizeOverlayLogo(raw: any, frames: { frameId: string }[]): OverlayLogoAnalysis {
  const known = new Set(frames.map((f) => f.frameId));
  const b = Array.isArray(raw?.box_2d) ? raw.box_2d.map(Number) : [];
  let box: LogoBox | null = null;
  if (b.length === 4 && b.every(Number.isFinite)) {
    const [ymin, xmin, ymax, xmax] = b.map((v: number) => clamp01(v / 1000));
    if (xmax - xmin > 0.005 && ymax - ymin > 0.005) box = { x: xmin, y: ymin, w: xmax - xmin, h: ymax - ymin };
  }
  const frameIds = (Array.isArray(raw?.frame_ids) ? raw.frame_ids : []).map(clean).filter((id: string) => known.has(id));
  const present = raw?.present === true && !!box;
  return {
    version: OVERLAY_LOGO_VERSION,
    mode: "logo",
    present,
    description: present ? clean(raw?.description).slice(0, 80) : "",
    box: present ? box : null,
    frameIds: present ? [...new Set(frameIds)] : [],
  };
}

function where(box: LogoBox): string {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const v = cy < 0.33 ? "top" : cy > 0.67 ? "bottom" : "middle";
  const h = cx < 0.33 ? "left" : cx > 0.67 ? "right" : "center";
  return v === "middle" && h === "center" ? "the center" : `the ${v} ${h}`;
}

/** Instruction appended to frame swaps (and the video rebuild) when the source logo must go. */
export function cleanPlateInstruction(logo: Pick<OverlayLogoAnalysis, "present" | "description" | "box">): string {
  if (!logo.present || !logo.box) return "";
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return [
    `The source has an overlaid logo/watermark${logo.description ? ` (${logo.description})` : ""} near ${where(logo.box)} of the frame`,
    `(about ${pct(logo.box.x)}–${pct(logo.box.x + logo.box.w)} across, ${pct(logo.box.y)}–${pct(logo.box.y + logo.box.h)} down).`,
    "Remove it completely and rebuild the background behind it naturally so no trace remains. Add no logo, watermark or text anywhere.",
  ].join(" ");
}

/** Request field `removeSourceLogo` (the detected source logo) → clean-plate text appended to the user's prompt. */
export function withCleanPlate(extraPrompt: unknown, removeSourceLogo: unknown): string {
  const logo = removeSourceLogo as Partial<OverlayLogoAnalysis> | null | undefined;
  const box = logo?.box;
  const valid = !!box && [box.x, box.y, box.w, box.h].every((n) => Number.isFinite(Number(n)));
  const plate = valid
    ? cleanPlateInstruction({
      present: true,
      description: clean(logo?.description).slice(0, 80),
      box: { x: clamp01(Number(box!.x)), y: clamp01(Number(box!.y)), w: clamp01(Number(box!.w)), h: clamp01(Number(box!.h)) },
    })
    : "";
  return [clean(extraPrompt), plate].filter(Boolean).join(" ");
}
