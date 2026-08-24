// FUSE CINEMA — analysis backend (action router).
//
// ISOLATION: this function is new, self-contained code. It does NOT import from
// (or modify) analyze-jewelry-frames; it only reuses the same Gemini client
// PATTERN (@google/genai + GEMINI_ANALYSIS_MODEL). ANALYSIS ONLY — it never
// generates imagery and never spends generation credits.
//
// Actions implemented: "extract-palette".

import { GoogleGenAI, Type } from "https://esm.sh/@google/genai@1.29.0";
import { corsHeaders, errorMessage, json, requireUser } from "../_shared/supabase-admin.ts";

const GEMINI_ANALYSIS_MODEL = Deno.env.get("GEMINI_ANALYSIS_MODEL")?.trim() || "gemini-3.6-flash";

const PALETTE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    swatches: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          hex: { type: Type.STRING, description: "#RRGGBB" },
          name: { type: Type.STRING },
          weight: { type: Type.NUMBER, description: "0-100 share of the frame" },
        },
        required: ["hex"],
      },
    },
    shadowHue: { type: Type.STRING },
    midtoneHue: { type: Type.STRING },
    highlightHue: { type: Type.STRING },
    temperature: { type: Type.NUMBER, description: "-100 cool .. 100 warm" },
    tint: { type: Type.NUMBER, description: "-100 green .. 100 magenta" },
    contrast: { type: Type.NUMBER, description: "0-100" },
    saturation: { type: Type.NUMBER, description: "0-100" },
    blackBehavior: { type: Type.STRING, enum: ["crushed", "lifted", "neutral", "filmic"] },
    highlightBehavior: {
      type: Type.STRING,
      enum: ["clipped", "rolled-off", "bloomed", "neutral"],
    },
    skinToneTreatment: {
      type: Type.STRING,
      enum: ["natural", "warm", "cool", "desaturated", "golden", "porcelain"],
    },
    highlights: { type: Type.NUMBER },
    shadows: { type: Type.NUMBER },
    blacks: { type: Type.NUMBER, description: "black point, 0-100" },
    whites: { type: Type.NUMBER, description: "white point, 0-100" },
    fade: { type: Type.NUMBER },
    grain: { type: Type.NUMBER },
    sharpness: { type: Type.NUMBER },
    halation: { type: Type.NUMBER },
    dominantHues: { type: Type.ARRAY, items: { type: Type.STRING } },
    paletteName: { type: Type.STRING, description: "Short evocative name, 2-4 words" },
  },
  required: [
    "swatches",
    "shadowHue",
    "midtoneHue",
    "highlightHue",
    "temperature",
    "tint",
    "contrast",
    "saturation",
    "blackBehavior",
    "highlightBehavior",
    "skinToneTreatment",
  ],
} as const;

const PALETTE_INSTRUCTIONS = `You are a senior colourist analysing ONE reference image.
Return the reference's COLOUR GRADE only — never describe subject matter, people or products.
Rules:
* swatches: 4-6 representative colours ordered shadow -> midtone -> accent -> highlight, hex "#RRGGBB".
* shadowHue / midtoneHue / highlightHue: single hue words ("teal", "amber", "neutral", ...).
* temperature -100 (cool) .. 100 (warm); tint -100 (green) .. 100 (magenta).
* contrast, saturation, highlights, shadows, blacks, whites, fade, grain, sharpness, halation: 0-100.
* blacks = black point lift (low = crushed), whites = white point roll-off (high = clipped).
* Judge grain/halation/fade from the actual image, not from a stylistic guess.
* Report only what the pixels support. Output strict JSON matching the schema.`;

function parseDataUrl(input: string): { mimeType: string; data: string } {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(input.trim());
  if (!match) throw new Error("Reference image must be a base64 data URL");
  return { mimeType: match[1], data: match[2] };
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeHex(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  const match = /^#?([0-9a-f]{6})$/i.exec(raw);
  return match ? `#${match[1].toLowerCase()}` : null;
}

async function handleExtractPalette(body: any, apiKey?: string) {
  if (!apiKey) {
    return json({ error: "Palette analysis is unavailable (analysis key not configured)" }, 503);
  }

  const imageDataUrl = typeof body?.imageDataUrl === "string" ? body.imageDataUrl : "";
  if (!imageDataUrl) return json({ error: "imageDataUrl is required" }, 400);
  if (imageDataUrl.length > 12_000_000) {
    return json({ error: "Reference image is too large — use an image under ~8 MB" }, 400);
  }

  let inline: { mimeType: string; data: string };
  try {
    inline = parseDataUrl(imageDataUrl);
  } catch (error) {
    return json({ error: errorMessage(error) }, 400);
  }
  if (!inline.mimeType.startsWith("image/")) {
    return json({ error: "Reference must be an image file" }, 400);
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: GEMINI_ANALYSIS_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { text: PALETTE_INSTRUCTIONS },
          { inlineData: { mimeType: inline.mimeType, data: inline.data } },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: PALETTE_SCHEMA as unknown as Record<string, unknown>,
      temperature: 0.2,
    },
  });

  const text = response.text ?? "";
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    return json({ error: "Palette analysis returned an unreadable response — please retry." }, 502);
  }

  const swatches = (Array.isArray(raw?.swatches) ? raw.swatches : [])
    .map((s: any) => {
      const hex = normalizeHex(s?.hex);
      if (!hex) return null;
      return {
        hex,
        name: typeof s?.name === "string" ? s.name : undefined,
        weight: typeof s?.weight === "number" ? clamp(s.weight, 0, 100, 0) : undefined,
      };
    })
    .filter(Boolean)
    .slice(0, 8);

  if (swatches.length < 2) {
    return json({ error: "Could not read a usable palette from that image — try another." }, 422);
  }

  const hue = (value: unknown, fallback: string) => {
    const s = String(value ?? "").trim().toLowerCase();
    return s ? s.slice(0, 24) : fallback;
  };

  const palette = {
    swatches,
    shadowHue: hue(raw.shadowHue, "neutral"),
    midtoneHue: hue(raw.midtoneHue, "neutral"),
    highlightHue: hue(raw.highlightHue, "neutral"),
    temperature: clamp(raw.temperature, -100, 100, 0),
    tint: clamp(raw.tint, -100, 100, 0),
    contrast: clamp(raw.contrast, 0, 100, 50),
    saturation: clamp(raw.saturation, 0, 100, 50),
    blackBehavior: ["crushed", "lifted", "neutral", "filmic"].includes(raw.blackBehavior)
      ? raw.blackBehavior
      : "neutral",
    highlightBehavior: ["clipped", "rolled-off", "bloomed", "neutral"].includes(
      raw.highlightBehavior,
    )
      ? raw.highlightBehavior
      : "neutral",
    skinToneTreatment: ["natural", "warm", "cool", "desaturated", "golden", "porcelain"].includes(
      raw.skinToneTreatment,
    )
      ? raw.skinToneTreatment
      : "natural",
    highlights: clamp(raw.highlights, 0, 100, 50),
    shadows: clamp(raw.shadows, 0, 100, 50),
    blacks: clamp(raw.blacks, 0, 100, 50),
    whites: clamp(raw.whites, 0, 100, 50),
    fade: clamp(raw.fade, 0, 100, 0),
    grain: clamp(raw.grain, 0, 100, 0),
    sharpness: clamp(raw.sharpness, 0, 100, 60),
    halation: clamp(raw.halation, 0, 100, 0),
    dominantHues: (Array.isArray(raw.dominantHues) ? raw.dominantHues : [])
      .map((h: any) => String(h ?? "").trim().toLowerCase())
      .filter((h: string) => h)
      .slice(0, 8),
  };

  const paletteName =
    typeof raw.paletteName === "string" && raw.paletteName.trim()
      ? raw.paletteName.trim().slice(0, 48)
      : "Reference Palette";

  return json({ palette, paletteName, model: GEMINI_ANALYSIS_MODEL });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    await requireUser(req);
  } catch (error) {
    return json({ error: errorMessage(error) }, 401);
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const action = String(body?.action ?? "");
  const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();

  try {
    switch (action) {
      case "extract-palette":
        return await handleExtractPalette(body, apiKey);
      default:
        return json({ error: `Unknown action: ${action || "(none)"}` }, 400);
    }
  } catch (error) {
    console.error("[cinema-studio] failed", action, errorMessage(error).slice(0, 800));
    return json({ error: errorMessage(error) }, 500);
  }
});
