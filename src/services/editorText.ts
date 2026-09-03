/**
 * FUSE editor text layers — one model shared by the preview overlay (DOM) and the
 * export worker (canvas). Layout maths live here so both sides agree.
 */

export type TextFontId = "display" | "body" | "mono" | "serif" | "condensed";
export type TextAnim = "none" | "fade" | "rise" | "pop" | "slide";
export type TextAlign = "left" | "center" | "right";

export type TextLayer = {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  /** Centre of the box as a fraction of the frame. */
  x: number;
  y: number;
  /** Box width as a fraction of the frame width. */
  width: number;
  fontId: TextFontId;
  /** Font size as a percentage of frame height. */
  sizePct: number;
  weight: number;
  align: TextAlign;
  lineHeight: number;
  letterSpacing: number; // em
  uppercase: boolean;
  color: string;
  opacity: number;
  bgColor: string;
  bgOpacity: number;
  bgRadius: number; // px at 1080-wide reference
  padding: number; // px at 1080-wide reference
  outlineColor: string;
  outlineWidth: number; // px at 1080-wide reference
  shadow: number; // 0..100
  animIn: TextAnim;
  animOut: TextAnim;
  hidden: boolean;
};

export const TEXT_FONTS: { id: TextFontId; label: string; stack: string }[] = [
  { id: "display", label: "Display", stack: '"Space Grotesk", "Arial Black", Impact, sans-serif' },
  { id: "body", label: "Clean", stack: 'Inter, "Helvetica Neue", Arial, sans-serif' },
  { id: "condensed", label: "Condensed", stack: '"Archivo Narrow", "Arial Narrow", Impact, sans-serif' },
  { id: "mono", label: "Mono", stack: '"IBM Plex Mono", ui-monospace, monospace' },
  { id: "serif", label: "Serif", stack: 'Georgia, "Times New Roman", serif' },
];

export const TEXT_ANIMS: { id: TextAnim; label: string }[] = [
  { id: "none", label: "None" },
  { id: "fade", label: "Fade" },
  { id: "rise", label: "Rise" },
  { id: "pop", label: "Pop" },
  { id: "slide", label: "Slide" },
];

export const TEXT_PRESETS: { id: string; label: string; patch: Partial<TextLayer> }[] = [
  {
    id: "headline",
    label: "Headline",
    patch: {
      fontId: "display",
      sizePct: 9,
      weight: 800,
      uppercase: true,
      letterSpacing: 0.04,
      color: "#ffffff",
      bgOpacity: 0,
      outlineWidth: 0,
      shadow: 45,
    },
  },
  {
    id: "subtitle",
    label: "Subtitle",
    patch: {
      fontId: "body",
      sizePct: 4.4,
      weight: 600,
      uppercase: false,
      letterSpacing: 0,
      color: "#ffffff",
      bgColor: "#000000",
      bgOpacity: 0.55,
      padding: 18,
      bgRadius: 14,
      shadow: 0,
    },
  },
  {
    id: "tag",
    label: "Price tag",
    patch: {
      fontId: "mono",
      sizePct: 4,
      weight: 700,
      uppercase: true,
      letterSpacing: 0.12,
      color: "#04121c",
      bgColor: "#31e0ff",
      bgOpacity: 1,
      padding: 14,
      bgRadius: 999,
      shadow: 0,
    },
  },
  {
    id: "outline",
    label: "Outline",
    patch: {
      fontId: "display",
      sizePct: 8,
      weight: 800,
      uppercase: true,
      color: "#ffffff",
      bgOpacity: 0,
      outlineColor: "#04121c",
      outlineWidth: 6,
      shadow: 20,
    },
  },
];

export const DEFAULT_TEXT_LAYER: Omit<TextLayer, "id"> = {
  text: "YOUR TEXT",
  startMs: 0,
  endMs: 3000,
  x: 0.5,
  y: 0.78,
  width: 0.8,
  fontId: "display",
  sizePct: 8,
  weight: 800,
  align: "center",
  lineHeight: 1.1,
  letterSpacing: 0.04,
  uppercase: true,
  color: "#ffffff",
  opacity: 1,
  bgColor: "#000000",
  bgOpacity: 0,
  bgRadius: 14,
  padding: 16,
  outlineColor: "#04121c",
  outlineWidth: 0,
  shadow: 45,
  animIn: "rise",
  animOut: "fade",
  hidden: false,
};

const num = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const colour = (value: unknown, fallback: string) =>
  typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;

export function normalizeTextLayer(raw: unknown, index = 0): TextLayer {
  const layer = (raw ?? {}) as Record<string, unknown>;
  const start = num(layer.startMs, 0, 0, 10 * 60_000);
  const end = num(layer.endMs, start + 3000, start + 200, 10 * 60_000);
  return {
    id: typeof layer.id === "string" && layer.id ? layer.id : `text-${index}-${Math.random().toString(36).slice(2, 8)}`,
    text: typeof layer.text === "string" ? layer.text.slice(0, 400) : DEFAULT_TEXT_LAYER.text,
    startMs: start,
    endMs: end,
    x: num(layer.x, 0.5, 0, 1),
    y: num(layer.y, 0.78, 0, 1),
    width: num(layer.width, 0.8, 0.15, 1),
    fontId: TEXT_FONTS.some((font) => font.id === layer.fontId)
      ? (layer.fontId as TextFontId)
      : "display",
    sizePct: num(layer.sizePct, 8, 1.5, 24),
    weight: num(layer.weight, 800, 300, 900),
    align: (["left", "center", "right"] as TextAlign[]).includes(layer.align as TextAlign)
      ? (layer.align as TextAlign)
      : "center",
    lineHeight: num(layer.lineHeight, 1.1, 0.8, 2),
    letterSpacing: num(layer.letterSpacing, 0.04, -0.1, 0.5),
    uppercase: layer.uppercase === undefined ? true : !!layer.uppercase,
    color: colour(layer.color, "#ffffff"),
    opacity: num(layer.opacity, 1, 0, 1),
    bgColor: colour(layer.bgColor, "#000000"),
    bgOpacity: num(layer.bgOpacity, 0, 0, 1),
    bgRadius: num(layer.bgRadius, 14, 0, 999),
    padding: num(layer.padding, 16, 0, 120),
    outlineColor: colour(layer.outlineColor, "#04121c"),
    outlineWidth: num(layer.outlineWidth, 0, 0, 24),
    shadow: num(layer.shadow, 45, 0, 100),
    animIn: TEXT_ANIMS.some((anim) => anim.id === layer.animIn) ? (layer.animIn as TextAnim) : "rise",
    animOut: TEXT_ANIMS.some((anim) => anim.id === layer.animOut) ? (layer.animOut as TextAnim) : "fade",
    hidden: !!layer.hidden,
  };
}

export const normalizeTextLayers = (raw: unknown): TextLayer[] =>
  Array.isArray(raw) ? raw.map((item, index) => normalizeTextLayer(item, index)) : [];

export function createTextLayer(patch: Partial<TextLayer> = {}): TextLayer {
  return normalizeTextLayer({
    ...DEFAULT_TEXT_LAYER,
    ...patch,
    id: `text-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  });
}

const ANIM_MS = 380;

/** Animation + visibility state of a layer at an absolute timeline position. */
export function textLayerStateAt(layer: TextLayer, timeMs: number) {
  if (layer.hidden) return null;
  if (timeMs < layer.startMs - 1 || timeMs > layer.endMs + 1) return null;
  const inProgress = Math.min(1, Math.max(0, (timeMs - layer.startMs) / ANIM_MS));
  const outProgress = Math.min(1, Math.max(0, (layer.endMs - timeMs) / ANIM_MS));

  const apply = (anim: TextAnim, progress: number, direction: 1 | -1) => {
    switch (anim) {
      case "fade":
        return { opacity: progress, dx: 0, dy: 0, scale: 1 };
      case "rise":
        return { opacity: progress, dx: 0, dy: (1 - progress) * 0.06 * direction, scale: 1 };
      case "pop":
        return { opacity: progress, dx: 0, dy: 0, scale: 0.86 + progress * 0.14 };
      case "slide":
        return { opacity: progress, dx: (1 - progress) * 0.12 * direction, dy: 0, scale: 1 };
      default:
        return { opacity: 1, dx: 0, dy: 0, scale: 1 };
    }
  };

  const enter = apply(layer.animIn, inProgress, 1);
  const exit = apply(layer.animOut, outProgress, -1);
  return {
    opacity: Math.max(0, Math.min(1, enter.opacity * exit.opacity * layer.opacity)),
    dx: enter.dx + exit.dx,
    dy: enter.dy + exit.dy,
    scale: enter.scale * exit.scale,
  };
}

export const fontStack = (id: TextFontId) =>
  TEXT_FONTS.find((font) => font.id === id)?.stack ?? TEXT_FONTS[0].stack;

/** Reference width all px-based text values are authored against. */
export const TEXT_REFERENCE_WIDTH = 1080;

export function hexToRgba(hex: string, alpha: number) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean.slice(0, 6);
  const value = parseInt(full, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Signature for the export cache — text changes must invalidate rendered clips. */
export const textSignature = (layers: TextLayer[]) =>
  layers.length
    ? JSON.stringify(layers.filter((layer) => !layer.hidden).map((layer) => [layer.id, layer.text, layer.startMs, layer.endMs, layer.x, layer.y, layer.width, layer.fontId, layer.sizePct, layer.weight, layer.align, layer.lineHeight, layer.letterSpacing, layer.uppercase, layer.color, layer.opacity, layer.bgColor, layer.bgOpacity, layer.bgRadius, layer.padding, layer.outlineColor, layer.outlineWidth, layer.shadow, layer.animIn, layer.animOut]))
    : "none";

/** Word-wraps `text` into lines that fit `maxWidth` using the ctx font already set. */
export function wrapLines(
  measure: (line: string) => number,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let current = words[0];
    for (let index = 1; index < words.length; index += 1) {
      const candidate = `${current} ${words[index]}`;
      if (measure(candidate) <= maxWidth) current = candidate;
      else {
        lines.push(current);
        current = words[index];
      }
    }
    lines.push(current);
  }
  return lines;
}
