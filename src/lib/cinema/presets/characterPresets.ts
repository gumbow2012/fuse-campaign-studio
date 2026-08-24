/**
 * FUSE Cinema — character / performance preset data (no DB, no provider calls).
 *
 * The EMOTION grid is the visual entry point for performance direction. Every
 * emotion is proven on the PORTRAIT canonical scene (CV1): same model, same
 * wardrobe, same backdrop, same camera — the ONLY variable is the performance.
 */

import type { CinemaControlValidation, PreviewMedia } from "@/lib/cinema/previewTypes";

export type EmotionPreset = {
  id: string;
  name: string;
  /** One-line direction note shown under the tile. */
  hint: string;
  /** Face/performance description compiled into the prompt. */
  expression: string;
  /** Default intensity 0–100 when first selected. */
  defaultIntensity: number;
  tags?: string[];
  thumbnail?: string;
  /** CV1: optional standardized visual preview (gradients are fallback-only). */
  preview?: PreviewMedia;
  validation?: CinemaControlValidation;
};

const g = (from: string, to: string) => `linear-gradient(135deg, ${from}, ${to})`;

export const EMOTION_PRESETS: EmotionPreset[] = [
  {
    id: "neutral",
    name: "Neutral",
    hint: "Unreadable, composed",
    expression: "relaxed neutral face, unreadable, no acting",
    defaultIntensity: 20,
    thumbnail: g("#3a3f47", "#1b1e23"),
  },
  {
    id: "hope",
    name: "Hope",
    hint: "Lifted gaze, soft optimism",
    expression: "softly lifted brows, open eyes looking slightly up, faint hopeful mouth",
    defaultIntensity: 55,
    thumbnail: g("#5b7fa8", "#1f2a36"),
  },
  {
    id: "anger",
    name: "Anger",
    hint: "Tight jaw, lowered brows",
    expression: "lowered drawn brows, hard stare, tight jaw and flared nostrils",
    defaultIntensity: 70,
    thumbnail: g("#8f2b28", "#25100f"),
  },
  {
    id: "joy",
    name: "Joy",
    hint: "Genuine, eyes engaged",
    expression: "genuine smile with engaged eye crinkle, raised cheeks",
    defaultIntensity: 65,
    thumbnail: g("#d9a341", "#3a2a0f"),
  },
  {
    id: "trust",
    name: "Trust",
    hint: "Steady, open, warm",
    expression: "steady open gaze, relaxed brow, faint warm mouth",
    defaultIntensity: 45,
    thumbnail: g("#4f7f6d", "#16241f"),
  },
  {
    id: "fear",
    name: "Fear",
    hint: "Widened eyes, held breath",
    expression: "widened eyes, raised inner brows, tense held-breath mouth",
    defaultIntensity: 70,
    thumbnail: g("#4b4a7a", "#15141f"),
  },
  {
    id: "surprise",
    name: "Surprise",
    hint: "Raised brows, parted lips",
    expression: "raised brows, wide eyes, parted lips mid-inhale",
    defaultIntensity: 60,
    thumbnail: g("#7f9fc9", "#1c232e"),
  },
  {
    id: "sadness",
    name: "Sadness",
    hint: "Downcast, heavy lids",
    expression: "downcast eyes, heavy lids, slack corners of the mouth",
    defaultIntensity: 55,
    thumbnail: g("#3f5468", "#14191f"),
  },
  {
    id: "disgust",
    name: "Disgust",
    hint: "Raised upper lip, narrowed eyes",
    expression: "raised upper lip, wrinkled nose bridge, narrowed eyes",
    defaultIntensity: 60,
    thumbnail: g("#5d6b3a", "#1c2113"),
  },
  {
    id: "confident",
    name: "Confident",
    hint: "Level chin, unhurried",
    expression: "level chin, calm unhurried eyes, faint closed-mouth assurance",
    defaultIntensity: 60,
    thumbnail: g("#b4924f", "#2a2113"),
  },
  {
    id: "intimidating",
    name: "Intimidating",
    hint: "Direct, still, unblinking",
    expression: "direct unblinking stare, lowered chin, minimal facial movement",
    defaultIntensity: 75,
    thumbnail: g("#6b2f3a", "#1a0f13"),
  },
  {
    id: "detached",
    name: "Detached",
    hint: "Through-camera, absent",
    expression: "absent gaze past the lens, flat affect, no engagement",
    defaultIntensity: 40,
    thumbnail: g("#4a4f55", "#171a1d"),
  },
  {
    id: "exhausted",
    name: "Exhausted",
    hint: "Drained, slow blinks",
    expression: "drained face, slow heavy blinks, loose jaw, low head carriage",
    defaultIntensity: 60,
    thumbnail: g("#57524a", "#1b1917"),
  },
  {
    id: "euphoric",
    name: "Euphoric",
    hint: "Peak release, unguarded",
    expression: "unguarded elation, wide bright eyes, open laughing mouth",
    defaultIntensity: 85,
    thumbnail: g("#e0723f", "#3a1a10"),
  },
  {
    id: "melancholic",
    name: "Melancholic",
    hint: "Quiet, inward, wistful",
    expression: "quiet inward gaze, wistful softness, minimal mouth movement",
    defaultIntensity: 45,
    thumbnail: g("#46566f", "#151a22"),
  },
  {
    id: "aggressive",
    name: "Aggressive",
    hint: "Forward, coiled, ready",
    expression: "forward-leaning intensity, coiled tension, bared teeth on breath",
    defaultIntensity: 85,
    thumbnail: g("#9a3320", "#26100a"),
  },
  {
    id: "calm",
    name: "Calm",
    hint: "Settled, slow breathing",
    expression: "settled face, slow breathing, soft relaxed eyes",
    defaultIntensity: 30,
    thumbnail: g("#4c6f7a", "#161f22"),
  },
];

export function findEmotionPreset(id: string | undefined | null): EmotionPreset | undefined {
  if (!id) return undefined;
  return EMOTION_PRESETS.find((preset) => preset.id === id || preset.name === id);
}

/* ------------------------------------------------------------------ */
/* Performance option vocabularies (select-style)                      */
/* ------------------------------------------------------------------ */

export const EYE_LINE_OPTIONS = [
  "to camera",
  "just off camera",
  "past camera",
  "down",
  "up",
  "at another subject",
  "at the product",
] as const;

export const BODY_LANGUAGE_OPTIONS = [
  "open",
  "closed",
  "guarded",
  "dominant",
  "submissive",
  "relaxed",
  "coiled",
  "regal",
] as const;

export const BLOCKING_OPTIONS = [
  "standing still",
  "seated",
  "leaning",
  "walking toward camera",
  "walking away",
  "crossing frame",
  "turning into frame",
  "crouched",
] as const;

export const MOTION_OPTIONS = [
  "minimal",
  "breathing only",
  "subtle weight shift",
  "slow turn",
  "gesture-led",
  "full-body movement",
] as const;

export const WARDROBE_AUTHORITY_OPTIONS = [
  "reference-locked",
  "reference-guided",
  "prompt-described",
  "free",
] as const;
