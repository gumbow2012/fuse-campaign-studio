// FUSE CINEMA — analysis backend (action router).
//
// ISOLATION: this function is new, self-contained code. It does NOT import from
// (or modify) analyze-jewelry-frames; it only reuses the same Gemini client
// PATTERN (@google/genai + GEMINI_ANALYSIS_MODEL). ANALYSIS ONLY — it never
// generates imagery and never spends generation credits.
//
// Actions implemented: "extract-palette", "auto-director", "detect-roles".

import { GoogleGenAI, Type } from "https://esm.sh/@google/genai@1.29.0";
import {
  corsHeaders,
  errorMessage,
  json,
  requireAdminUser,
  requireUser,
} from "../_shared/supabase-admin.ts";
import {
  handleGenerate,
  handleGenerateCallback,
  handleGenerationHistory,
  handleGenerationStatus,
} from "./generate.ts";
import {
  handlePreviewBase,
  handlePreviewGenerate,
  handlePreviewInventory,
} from "./previews.ts";


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

/* ------------------------------------------------------------------ */
/* Action: auto-director (Gemini proposes a DirectorConfig)             */
/* ------------------------------------------------------------------ */

const DIRECTOR_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    camera: {
      type: Type.OBJECT,
      properties: {
        body: { type: Type.STRING },
        sensor: { type: Type.STRING },
        aspectRatio: { type: Type.STRING },
        height: { type: Type.STRING },
        angle: { type: Type.STRING },
        distance: { type: Type.STRING },
      },
    },
    lens: {
      type: Type.OBJECT,
      properties: {
        focalLengthMm: { type: Type.NUMBER },
        type: { type: Type.STRING, enum: ["spherical", "anamorphic", "macro", "tilt-shift"] },
        character: { type: Type.STRING },
      },
    },
    aperture: {
      type: Type.OBJECT,
      properties: {
        fStop: { type: Type.NUMBER },
        depthOfField: { type: Type.STRING, enum: ["deep", "medium", "shallow", "razor"] },
        bokeh: { type: Type.STRING },
      },
    },
    movement: {
      type: Type.OBJECT,
      properties: {
        motionType: { type: Type.STRING },
        direction: { type: Type.STRING },
        speed: { type: Type.STRING, enum: ["very-slow", "slow", "medium", "fast"] },
        range: { type: Type.NUMBER },
        maxDegrees: { type: Type.NUMBER },
        easing: { type: Type.STRING, enum: ["linear", "ease-in", "ease-out", "ease-in-out"] },
        tracking: { type: Type.STRING, enum: ["none", "subject", "point-of-interest"] },
        parallax: { type: Type.NUMBER },
        roll: { type: Type.NUMBER },
        heightChange: { type: Type.NUMBER },
        focusBehavior: {
          type: Type.STRING,
          enum: ["locked", "follow-focus", "rack", "breathing"],
        },
        endBehavior: { type: Type.STRING, enum: ["settle", "continue", "hard-cut"] },
      },
    },
    lighting: {
      type: Type.OBJECT,
      properties: {
        mood: { type: Type.STRING },
        ratio: { type: Type.STRING },
        lights: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING },
              position: { type: Type.STRING },
              direction: { type: Type.STRING },
              height: { type: Type.STRING },
              size: { type: Type.NUMBER },
              intensity: { type: Type.NUMBER },
              temperature: { type: Type.NUMBER },
              tint: { type: Type.NUMBER },
              hardness: { type: Type.NUMBER },
              falloff: { type: Type.STRING, enum: ["fast", "medium", "slow"] },
            },
          },
        },
      },
    },
    color: {
      type: Type.OBJECT,
      properties: {
        paletteName: { type: Type.STRING },
        swatches: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: { hex: { type: Type.STRING }, name: { type: Type.STRING } },
          },
        },
        shadowHue: { type: Type.STRING },
        midtoneHue: { type: Type.STRING },
        highlightHue: { type: Type.STRING },
        temperature: { type: Type.NUMBER },
        tint: { type: Type.NUMBER },
        contrast: { type: Type.NUMBER },
        saturation: { type: Type.NUMBER },
        blackBehavior: { type: Type.STRING, enum: ["crushed", "lifted", "neutral", "filmic"] },
        highlightBehavior: {
          type: Type.STRING,
          enum: ["clipped", "rolled-off", "bloomed", "neutral"],
        },
        skinToneTreatment: {
          type: Type.STRING,
          enum: ["natural", "warm", "cool", "desaturated", "golden", "porcelain"],
        },
      },
    },
    optics: {
      type: Type.OBJECT,
      properties: {
        flare: { type: Type.STRING },
        diffusion: { type: Type.NUMBER },
        halation: { type: Type.NUMBER },
        chromaticAberration: { type: Type.NUMBER },
        vignette: { type: Type.NUMBER },
        distortion: { type: Type.NUMBER },
        bloom: { type: Type.NUMBER },
        bokeh: { type: Type.STRING },
        highlightBehavior: {
          type: Type.STRING,
          enum: ["clipped", "rolled-off", "bloomed", "neutral"],
        },
      },
    },
    composition: {
      type: Type.OBJECT,
      properties: {
        framing: { type: Type.STRING },
        rule: { type: Type.STRING },
        subjectPlacement: { type: Type.STRING },
        headroom: { type: Type.STRING },
        leadRoom: { type: Type.STRING },
        horizon: { type: Type.STRING },
      },
    },
    focus: {
      type: Type.OBJECT,
      properties: {
        focusTarget: { type: Type.STRING },
        focusMode: { type: Type.STRING, enum: ["locked", "rack", "follow"] },
        focusPlaneDepth: { type: Type.STRING },
        rackDirection: {
          type: Type.STRING,
          enum: ["near-to-far", "far-to-near", "none"],
        },
      },
    },
    atmosphere: {
      type: Type.OBJECT,
      properties: {
        haze: { type: Type.NUMBER },
        smoke: { type: Type.NUMBER },
        particles: { type: Type.STRING },
        weather: { type: Type.STRING },
        timeOfDay: { type: Type.STRING },
        intensity: { type: Type.NUMBER },
      },
    },
    rationale: {
      type: Type.OBJECT,
      properties: {
        camera: { type: Type.STRING },
        lens: { type: Type.STRING },
        aperture: { type: Type.STRING },
        movement: { type: Type.STRING },
        lighting: { type: Type.STRING },
        color: { type: Type.STRING },
        optics: { type: Type.STRING },
        composition: { type: Type.STRING },
        focus: { type: Type.STRING },
        atmosphere: { type: Type.STRING },
      },
    },
    summary: { type: Type.STRING },
  },
  required: ["camera", "lens", "aperture", "movement", "lighting", "color", "composition", "focus"],
} as const;

const DIRECTOR_INSTRUCTIONS = `You are a senior film director + DP proposing a shot package.
You ANALYSE ONLY: you never generate imagery and you never invent product facts.
Given the scene prompt, any reference roles, the production type and the target video model,
propose one coherent cinematography package.
Rules:
* Choose real camera bodies, real focal lengths and plausible f-stops.
* movement.motionType must be one of: static, pan, tilt, dolly, truck, pedestal, orbit, crane, handheld, zoom, push-in, pull-out.
* Numeric fields: range 0-1; parallax/roll/heightChange/haze/smoke/intensity/diffusion/halation/chromaticAberration/vignette/distortion/bloom 0-100; maxDegrees 0-360.
* lighting.lights: 2-4 fixtures with position, direction, height, size, intensity, temperature (Kelvin-ish -100..100 creative), hardness 0-100.
* color: a real grade — hex swatches "#RRGGBB", temperature/tint -100..100, contrast/saturation 0-100.
* rationale.<field>: ONE short sentence (max 140 chars) explaining WHY that choice fits the prompt.
* Respect the selected model's strengths but never mention the model name in rationales.
Output strict JSON matching the schema.`;

const MOTION_TYPES = [
  "static",
  "pan",
  "tilt",
  "dolly",
  "truck",
  "pedestal",
  "orbit",
  "crane",
  "handheld",
  "zoom",
  "push-in",
  "pull-out",
];

const LIGHT_TYPES = [
  "key",
  "fill",
  "rim",
  "practical",
  "bounce",
  "ambient",
  "background",
  "kicker",
  "softbox",
  "strip",
  "point",
  "fresnel",
  "spotlight",
  "window",
  "negative-fill",
  "led-panel",
  "tube",
  "neon",
];

function text(value: unknown, fallback: string, max = 80) {
  const s = String(value ?? "").trim();
  return s ? s.slice(0, max) : fallback;
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const s = String(value ?? "").trim().toLowerCase();
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
}

function num(value: unknown, min: number, max: number, fallback: number) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

async function handleAutoDirector(body: any, apiKey?: string) {
  if (!apiKey) {
    return json({ error: "Auto Director is unavailable (analysis key not configured)" }, 503);
  }

  const scenePrompt = String(body?.prompt ?? "").trim().slice(0, 4000);
  if (!scenePrompt) return json({ error: "Describe the scene before running Auto Director" }, 400);

  const productionType = text(body?.productionType, "commercial", 60);
  const model = text(body?.model, "unspecified", 60);
  const references = Array.isArray(body?.references) ? body.references.slice(0, 8) : [];
  const referenceText = references.length
    ? references
        .map((r: any, i: number) => {
          const roles = Array.isArray(r?.roles) ? r.roles.map((x: any) => String(x)).join(", ") : "";
          return `Reference ${i + 1}: roles = ${roles || "unspecified"}`;
        })
        .join("\n")
    : "No references attached.";

  const filmSetup = body?.filmSetup && typeof body.filmSetup === "object" ? body.filmSetup : null;

  const brief = `SCENE PROMPT:\n${scenePrompt}\n\nPRODUCTION TYPE: ${productionType}\nTARGET VIDEO MODEL: ${model}\nFILM SETUP: ${
    filmSetup ? JSON.stringify(filmSetup).slice(0, 600) : "auto"
  }\n\nREFERENCES:\n${referenceText}`;

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: GEMINI_ANALYSIS_MODEL,
    contents: [{ role: "user", parts: [{ text: DIRECTOR_INSTRUCTIONS }, { text: brief }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: DIRECTOR_SCHEMA as unknown as Record<string, unknown>,
      temperature: 0.6,
    },
  });

  let raw: any;
  try {
    raw = JSON.parse(response.text ?? "");
  } catch {
    return json({ error: "Auto Director returned an unreadable response — please retry." }, 502);
  }

  const sourced = (value: unknown) => ({ value, source: "DIRECTOR_AGENT" as const });

  const swatches = (Array.isArray(raw?.color?.swatches) ? raw.color.swatches : [])
    .map((s: any) => {
      const hex = normalizeHex(s?.hex);
      return hex ? { hex, name: typeof s?.name === "string" ? s.name.slice(0, 32) : undefined } : null;
    })
    .filter(Boolean)
    .slice(0, 6);

  const lights = (Array.isArray(raw?.lighting?.lights) ? raw.lighting.lights : [])
    .slice(0, 4)
    .map((l: any, i: number) => ({
      id: `agent-light-${i + 1}`,
      type: pickEnum(l?.type, LIGHT_TYPES, i === 0 ? "key" : "fill"),
      position: text(l?.position, "camera left"),
      direction: text(l?.direction, "toward subject"),
      height: pickEnum(l?.height, ["below", "eye-level", "above", "top", "overhead"], "above"),
      size: num(l?.size, 0, 100, 50),
      intensity: num(l?.intensity, 0, 100, 60),
      temperature: num(l?.temperature, -100, 100, 0),
      tint: num(l?.tint, -100, 100, 0),
      hardness: num(l?.hardness, 0, 100, 40),
      falloff: pickEnum(l?.falloff, ["fast", "medium", "slow"], "medium"),
    }));

  const proposal = {
    camera: sourced({
      body: text(raw?.camera?.body, "modern cinema camera"),
      sensor: text(raw?.camera?.sensor, "super35"),
      aspectRatio: text(raw?.camera?.aspectRatio, "9:16", 12),
      height: text(raw?.camera?.height, "eye-level"),
      angle: text(raw?.camera?.angle, "straight-on"),
      distance: text(raw?.camera?.distance, "medium"),
    }),
    lens: sourced({
      focalLengthMm: Math.round(num(raw?.lens?.focalLengthMm, 8, 400, 50)),
      type: pickEnum(raw?.lens?.type, ["spherical", "anamorphic", "macro", "tilt-shift"], "spherical"),
      character: text(raw?.lens?.character, "neutral", 120),
    }),
    aperture: sourced({
      fStop: Number(num(raw?.aperture?.fStop, 0.95, 22, 2.8).toFixed(2)),
      depthOfField: pickEnum(
        raw?.aperture?.depthOfField,
        ["deep", "medium", "shallow", "razor"],
        "medium",
      ),
      bokeh: text(raw?.aperture?.bokeh, "round", 60),
    }),
    movement: sourced({
      motionType: pickEnum(raw?.movement?.motionType, MOTION_TYPES, "static"),
      direction: text(raw?.movement?.direction, "none"),
      speed: pickEnum(raw?.movement?.speed, ["very-slow", "slow", "medium", "fast"], "slow"),
      range: num(raw?.movement?.range, 0, 1, 0.3),
      maxDegrees: num(raw?.movement?.maxDegrees, 0, 360, 0),
      easing: pickEnum(
        raw?.movement?.easing,
        ["linear", "ease-in", "ease-out", "ease-in-out"],
        "ease-in-out",
      ),
      tracking: pickEnum(
        raw?.movement?.tracking,
        ["none", "subject", "point-of-interest"],
        "subject",
      ),
      parallax: num(raw?.movement?.parallax, 0, 100, 20),
      roll: num(raw?.movement?.roll, 0, 100, 0),
      heightChange: num(raw?.movement?.heightChange, 0, 100, 0),
      focusBehavior: pickEnum(
        raw?.movement?.focusBehavior,
        ["locked", "follow-focus", "rack", "breathing"],
        "locked",
      ),
      endBehavior: pickEnum(
        raw?.movement?.endBehavior,
        ["settle", "continue", "hard-cut"],
        "settle",
      ),
      envelope: { maxOrbit: num(raw?.movement?.maxDegrees, 0, 360, 0), geometryRequirements: [] },
    }),
    lighting: sourced({
      lights: lights.length ? lights : [],
      ratio: text(raw?.lighting?.ratio, "2:1", 24),
      mood: text(raw?.lighting?.mood, "neutral", 60),
    }),
    color: sourced({
      swatches,
      shadowHue: text(raw?.color?.shadowHue, "neutral", 24),
      midtoneHue: text(raw?.color?.midtoneHue, "neutral", 24),
      highlightHue: text(raw?.color?.highlightHue, "neutral", 24),
      temperature: num(raw?.color?.temperature, -100, 100, 0),
      tint: num(raw?.color?.tint, -100, 100, 0),
      contrast: num(raw?.color?.contrast, 0, 100, 50),
      saturation: num(raw?.color?.saturation, 0, 100, 50),
      blackBehavior: pickEnum(
        raw?.color?.blackBehavior,
        ["crushed", "lifted", "neutral", "filmic"],
        "neutral",
      ),
      highlightBehavior: pickEnum(
        raw?.color?.highlightBehavior,
        ["clipped", "rolled-off", "bloomed", "neutral"],
        "neutral",
      ),
      skinToneTreatment: pickEnum(
        raw?.color?.skinToneTreatment,
        ["natural", "warm", "cool", "desaturated", "golden", "porcelain"],
        "natural",
      ),
    }),
    optics: sourced({
      flare: text(raw?.optics?.flare, "none", 60),
      diffusion: num(raw?.optics?.diffusion, 0, 100, 0),
      halation: num(raw?.optics?.halation, 0, 100, 0),
      chromaticAberration: num(raw?.optics?.chromaticAberration, 0, 100, 0),
      vignette: num(raw?.optics?.vignette, 0, 100, 0),
      distortion: num(raw?.optics?.distortion, 0, 100, 0),
      bloom: num(raw?.optics?.bloom, 0, 100, 0),
      bokeh: text(raw?.optics?.bokeh, "round", 60),
      highlightBehavior: pickEnum(
        raw?.optics?.highlightBehavior,
        ["clipped", "rolled-off", "bloomed", "neutral"],
        "neutral",
      ),
    }),
    composition: sourced({
      framing: text(raw?.composition?.framing, "medium", 60),
      rule: text(raw?.composition?.rule, "centered", 60),
      subjectPlacement: text(raw?.composition?.subjectPlacement, "center", 60),
      headroom: text(raw?.composition?.headroom, "balanced", 40),
      leadRoom: text(raw?.composition?.leadRoom, "balanced", 40),
      horizon: text(raw?.composition?.horizon, "center", 40),
    }),
    focus: sourced({
      focusTarget: text(raw?.focus?.focusTarget, "subject", 60),
      focusMode: pickEnum(raw?.focus?.focusMode, ["locked", "rack", "follow"], "locked"),
      focusPlaneDepth: text(raw?.focus?.focusPlaneDepth, "subject plane", 60),
      rackDirection: pickEnum(
        raw?.focus?.rackDirection,
        ["near-to-far", "far-to-near", "none"],
        "none",
      ),
    }),
    atmosphere: sourced({
      haze: num(raw?.atmosphere?.haze, 0, 100, 0),
      smoke: num(raw?.atmosphere?.smoke, 0, 100, 0),
      particles: text(raw?.atmosphere?.particles, "none", 60),
      weather: text(raw?.atmosphere?.weather, "clear", 40),
      timeOfDay: text(raw?.atmosphere?.timeOfDay, "unspecified", 40),
      intensity: num(raw?.atmosphere?.intensity, 0, 100, 0),
    }),
  };

  const rationaleFields = [
    "camera",
    "lens",
    "aperture",
    "movement",
    "lighting",
    "color",
    "optics",
    "composition",
    "focus",
    "atmosphere",
  ];
  const rationale: Record<string, string> = {};
  for (const field of rationaleFields) {
    const value = raw?.rationale?.[field];
    if (typeof value === "string" && value.trim()) rationale[field] = value.trim().slice(0, 200);
  }

  return json({
    proposal,
    rationale,
    summary:
      typeof raw?.summary === "string" && raw.summary.trim()
        ? raw.summary.trim().slice(0, 320)
        : undefined,
    paletteName: text(raw?.color?.paletteName, "Director Grade", 48),
    model: GEMINI_ANALYSIS_MODEL,
  });
}

/* ------------------------------------------------------------------ */
/* Action: detect-roles (Gemini suggests reference roles)              */
/* ------------------------------------------------------------------ */

const REFERENCE_ROLES = [
  "Character",
  "Location",
  "Product",
  "Camera",
  "Composition",
  "Lighting",
  "Palette",
  "Environment",
  "Texture",
  "Motion",
];

const ROLES_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    roles: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          role: { type: Type.STRING, enum: REFERENCE_ROLES },
          strength: { type: Type.NUMBER, description: "0-100 usefulness for that role" },
        },
        required: ["role"],
      },
    },
    note: { type: Type.STRING, description: "One short sentence, max 140 chars" },
  },
  required: ["roles"],
} as const;

const ROLES_INSTRUCTIONS = `You classify ONE reference image for a cinematography workspace.
Decide which roles this reference can credibly serve, from this closed list:
Character, Location, Product, Camera, Composition, Lighting, Palette, Environment, Texture, Motion.
Rules:
* Return 1-4 roles, strongest first, each with strength 0-100.
* Only assign a role the pixels actually support (do not guess Motion from a still unless motion blur/trails are visible).
* Never describe identities, brands or people; classify usefulness only.
* note: one short sentence on what this reference is best used for.
Output strict JSON matching the schema.`;

async function handleDetectRoles(body: any, apiKey?: string) {
  if (!apiKey) {
    return json({ error: "Role detection is unavailable (analysis key not configured)" }, 503);
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
          { text: ROLES_INSTRUCTIONS },
          { inlineData: { mimeType: inline.mimeType, data: inline.data } },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: ROLES_SCHEMA as unknown as Record<string, unknown>,
      temperature: 0.2,
    },
  });

  let raw: any;
  try {
    raw = JSON.parse(response.text ?? "");
  } catch {
    return json({ error: "Role detection returned an unreadable response — please retry." }, 502);
  }

  const seen = new Set<string>();
  const roles: Array<{ role: string; strength: number }> = [];
  for (const entry of Array.isArray(raw?.roles) ? raw.roles : []) {
    const role = String(entry?.role ?? "").trim();
    if (!REFERENCE_ROLES.includes(role) || seen.has(role)) continue;
    seen.add(role);
    roles.push({ role, strength: Math.round(num(entry?.strength, 0, 100, 70)) });
    if (roles.length >= 4) break;
  }

  if (!roles.length) {
    return json({ error: "Could not classify that reference — assign roles manually." }, 422);
  }

  return json({
    roles,
    note:
      typeof raw?.note === "string" && raw.note.trim() ? raw.note.trim().slice(0, 200) : undefined,
    model: GEMINI_ANALYSIS_MODEL,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // fal webhook: unauthenticated provider callback, scoped to one cinema row.
  const url = new URL(req.url);
  if (url.searchParams.get("callback") === "1") {
    const generationId = url.searchParams.get("generationId") ?? "";
    if (!generationId) return json({ error: "generationId is required" }, 400);
    try {
      return await handleGenerateCallback(req, generationId);
    } catch (error) {
      console.error("[cinema-studio] callback failed", errorMessage(error).slice(0, 800));
      return json({ error: errorMessage(error) }, 500);
    }
  }

  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser(req);
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
      case "auto-director":
        return await handleAutoDirector(body, apiKey);
      case "detect-roles":
        return await handleDetectRoles(body, apiKey);
      case "generate":
        return await handleGenerate(body, user.id);
      case "generation-status":
        return await handleGenerationStatus(body, user.id);
      case "generation-history":
        return await handleGenerationHistory(body, user.id);
      // Preview batch generation — ADMIN ONLY, and only on an explicit click.
      case "preview-inventory":
        await requireAdminUser(req);
        return await handlePreviewInventory();
      case "preview-base":
        await requireAdminUser(req);
        return await handlePreviewBase(body);
      case "preview-generate":
        await requireAdminUser(req);
        return await handlePreviewGenerate(body);
      default:
        return json({ error: `Unknown action: ${action || "(none)"}` }, 400);

    }
  } catch (error) {
    console.error("[cinema-studio] failed", action, errorMessage(error).slice(0, 800));
    return json({ error: errorMessage(error) }, 500);
  }
});
