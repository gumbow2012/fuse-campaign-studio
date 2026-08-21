// DIAMOND OPTICS PROFILE — ANALYSIS ONLY (Jewelry Swap, additive).
//
// WHAT THIS IS
//   Models HOW the stones optically react to light so the swap prompt can carry
//   concise, physically-realistic optical instructions. It is NOT geometry or
//   setting analysis, and it NEVER generates or returns media.
//
// EVIDENCE FIREWALL
//   SOURCE campaign video / frame  → LIGHTING + OPTICAL-RESPONSE authority ONLY
//     (environment light, highlight intensity, flash behaviour, white-vs-rainbow
//      balance, bloom, flare, starburst, highlight size, exposure, direction).
//     It has ZERO design authority: stone layout, geometry, setting, metal,
//     clasp, bail and construction are NEVER read from the source jewelry.
//   REPLACEMENT references         → how the TARGET stones actually respond
//     (cut behaviour, real brilliance, stone density, metal-vs-stone ratio).
//   Final = REPLACEMENT STONE CHARACTER × SOURCE LIGHTING. Where they disagree
//   about the SCENE (soft source vs showroom-aggressive reference), the SOURCE
//   LIGHTING WINS.
//
// CACHING
//   The SOURCE VIDEO is analysed ONCE → globalDiamondOpticsProfile.
//   A selected frame gets a lightweight refinement (global + frame diff) →
//   frameDiamondOpticsProfile. Both are cached in jewelry_still_analyses.analysis
//   so moving the Sparkle / Rainbow-Fire sliders NEVER re-runs Gemini.

import { GoogleGenAI, Type } from "https://esm.sh/@google/genai@1.29.0";
import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  requireUser,
} from "../_shared/supabase-admin.ts";
import {
  DIAMOND_OPTICS_VERSION,
  normalizeOpticsProfile,
  opticsSummaryLine,
} from "../_shared/diamond-optics.ts";

const GEMINI_ANALYSIS_MODEL = Deno.env.get("GEMINI_ANALYSIS_MODEL")?.trim() || "gemini-3.6-flash";
const OPTICS_ROW_VERSION = DIAMOND_OPTICS_VERSION;

/* ------------------------------------------------------------------ *
 * Media plumbing (analysis input only — nothing is ever returned)
 * ------------------------------------------------------------------ */

const INLINE_VIDEO_MAX_BYTES = 16 * 1024 * 1024;
const VIDEO_FETCH_TIMEOUT_MS = 60_000;
const VIDEO_ACTIVE_TIMEOUT_MS = 90_000;
const IMAGE_FETCH_TIMEOUT_MS = 15_000;

function base64Of(buffer: Uint8Array) {
  let binary = "";
  for (let i = 0; i < buffer.length; i += 8192) {
    binary += String.fromCharCode(...buffer.subarray(i, i + 8192));
  }
  return btoa(binary);
}

function videoMimeFor(url: string, headerMime: string | null) {
  const mime = (headerMime ?? "").split(";")[0].trim();
  if (/^video\//.test(mime)) return mime;
  if (/\.mov($|\?)/i.test(url)) return "video/quicktime";
  if (/\.webm($|\?)/i.test(url)) return "video/webm";
  return "video/mp4";
}

async function inlineImage(url: string) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: abort.signal });
    if (!response.ok) throw new Error(`Could not read the frame (${response.status})`);
    const mimeType = (response.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
    if (!/^image\//.test(mimeType)) throw new Error("The frame is not a still image");
    return { inlineData: { mimeType, data: base64Of(new Uint8Array(await response.arrayBuffer())) } };
  } finally {
    clearTimeout(timer);
  }
}

async function videoPart(ai: GoogleGenAI, videoUrl: string) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), VIDEO_FETCH_TIMEOUT_MS);
  let bytes: Uint8Array;
  let mimeType: string;
  try {
    const response = await fetch(videoUrl, { signal: abort.signal });
    if (!response.ok) throw new Error(`Could not read the source video (${response.status})`);
    mimeType = videoMimeFor(videoUrl, response.headers.get("content-type"));
    bytes = new Uint8Array(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
  if (!bytes.length) throw new Error("The source video was empty");

  if (bytes.length <= INLINE_VIDEO_MAX_BYTES) {
    return { part: { inlineData: { mimeType, data: base64Of(bytes) } }, transport: "inline" as const };
  }

  const uploaded = await ai.files.upload({
    file: new Blob([bytes], { type: mimeType }),
    config: { mimeType, displayName: "source-optics-clip" },
  });
  const deadline = Date.now() + VIDEO_ACTIVE_TIMEOUT_MS;
  let file: any = uploaded;
  while (file?.state === "PROCESSING" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    file = await ai.files.get({ name: String(uploaded.name) });
  }
  if (file?.state !== "ACTIVE") throw new Error("The source video could not be prepared for analysis");
  return {
    part: { fileData: { mimeType: file.mimeType ?? mimeType, fileUri: file.uri } },
    transport: "files_api" as const,
  };
}

/* ------------------------------------------------------------------ *
 * Structured output — DiamondOpticsProfile
 * ------------------------------------------------------------------ */

const RATIO = { type: Type.NUMBER } as const;

const OPTICS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    stoneFamily: { type: Type.STRING },
    brilliance: {
      type: Type.OBJECT,
      properties: {
        intensity: RATIO,
        whiteHighlightRatio: RATIO,
        peakBrightness: RATIO,
        contrast: RATIO,
      },
      required: ["intensity", "whiteHighlightRatio", "peakBrightness", "contrast"],
    },
    fire: {
      type: Type.OBJECT,
      properties: {
        intensity: RATIO,
        rainbowRatio: RATIO,
        saturation: RATIO,
        hueDistribution: {
          type: Type.OBJECT,
          properties: {
            red: RATIO,
            orange: RATIO,
            yellow: RATIO,
            green: RATIO,
            cyan: RATIO,
            blue: RATIO,
            violet: RATIO,
          },
        },
      },
      required: ["intensity", "rainbowRatio", "saturation", "hueDistribution"],
    },
    glints: {
      type: Type.OBJECT,
      properties: {
        density: RATIO,
        averageSize: RATIO,
        maximumSize: RATIO,
        spatialCoverage: RATIO,
        sharpness: RATIO,
        persistence: RATIO,
      },
      required: ["density", "averageSize", "maximumSize", "spatialCoverage", "sharpness"],
    },
    bloom: {
      type: Type.OBJECT,
      properties: { intensity: RATIO, radius: RATIO },
      required: ["intensity", "radius"],
    },
    starburst: {
      type: Type.OBJECT,
      properties: {
        frequency: RATIO,
        intensity: RATIO,
        averageRayLength: RATIO,
        maximumRayLength: RATIO,
      },
      required: ["frequency", "intensity"],
    },
    lighting: {
      type: Type.OBJECT,
      properties: {
        dominantDirection: { type: Type.STRING },
        hardness: RATIO,
        exposure: RATIO,
        contrast: RATIO,
        environmentTemperature: { type: Type.STRING },
      },
      required: ["dominantDirection", "hardness", "exposure", "contrast"],
    },
    lensFlare: {
      type: Type.OBJECT,
      properties: { presence: RATIO, style: { type: Type.STRING } },
    },
    confidence: RATIO,
    notes: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["brilliance", "fire", "glints", "bloom", "starburst", "lighting", "confidence"],
} as const;

/* ------------------------------------------------------------------ *
 * Prompts
 * ------------------------------------------------------------------ */

type StoneContext = {
  productType?: string | null;
  stoneType?: string | null;
  stoneColor?: string | null;
  colorless?: boolean;
  settingSummary?: string | null;
};

function readStoneContext(raw: unknown): StoneContext {
  const source = (raw ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => {
    const next = String(value ?? "").trim();
    return next ? next.slice(0, 120) : null;
  };
  return {
    productType: text(source.productType),
    stoneType: text(source.stoneType),
    stoneColor: text(source.stoneColor),
    colorless: source.colorless === true,
    settingSummary: text(source.settingSummary),
  };
}

const TERM_BLOCK = [
  "OPTICAL VOCABULARY — keep these SEPARATE, never collapse them into 'sparkle':",
  "- BRILLIANCE = white light return.",
  "- FIRE / DISPERSION = spectral rainbow separation into distinct hues.",
  "- SCINTILLATION = moving bright/dark facet flashes as things move.",
  "- SPECULAR GLINT = one localized bright highlight.",
  "- BLOOM = soft halo around a blown highlight.",
  "- STARBURST = diffraction spikes radiating from a bright point.",
  "- LENS FLARE = a camera artifact beyond the stone, not stone behaviour.",
].join("\n");

const MEASUREMENT_BLOCK = [
  "MEASUREMENT RULES (visual behaviour, NOT lab photometry):",
  "- All 0..1 values describe apparent visual strength, 0 = absent, 1 = extreme.",
  "- GLINT SIZE is normalized to the VISIBLE STONE DIAMETER (or jewelry width when stones are tiny): 0.22 means the median highlight is about 0.22× a stone's visible diameter. NEVER report pixels.",
  "- SPATIAL COVERAGE = the fraction of the visible stone field carrying an active highlight at one instant (0.18 = 18%). Sparse <0.10, distributed 0.10-0.25, dense 0.25-0.50, near-blown >0.50.",
  "- whiteHighlightRatio + rainbowRatio describe ONE mixture of highlight energy and should sum to about 1 (e.g. white 0.74 / fire 0.26).",
  "- hueDistribution reports WHICH spectral hues the dispersion actually shows, so a prompt can say 'cool blue/violet fire' instead of a generic 'rainbow'.",
  "- Starburst ray lengths are multiples of a stone diameter.",
].join("\n");

const FIREWALL_BLOCK = [
  "CONTAMINATION FIREWALL:",
  "- Reflected rose gold / yellow gold, skin, gloves, fabric, environment LEDs, chromatic flare, spectral dispersion and sensor bloom are CAPTURED or DISPERSED light — never intrinsic stone body color.",
  "- Report the optical RESPONSE only. Do NOT describe stone layout, stone count, geometry, setting family, metal type, clasp, bail or construction — you have ZERO design authority here.",
].join("\n");

function stoneContextLines(context: StoneContext) {
  const lines = [
    "TARGET STONE CHARACTER (from the confirmed replacement product — this is WHAT reacts to the light):",
    context.productType ? `- Product type: ${context.productType}` : null,
    context.stoneType ? `- Stone type: ${context.stoneType}` : null,
    context.stoneColor ? `- Stone body color: ${context.stoneColor}` : null,
    context.settingSummary ? `- Setting context: ${context.settingSummary}` : null,
    context.colorless
      ? "- The stones are COLORLESS: any color you see in them is dispersion or reflection, never body color."
      : null,
    "If the target stones are NOT diamonds, describe their own optical behaviour (e.g. saturated body color with softer dispersion) and set stoneFamily accordingly instead of forcing diamond terminology.",
  ].filter(Boolean) as string[];
  return lines.join("\n");
}

function globalPrompt(context: StoneContext, hasVideo: boolean) {
  return [
    "You are a jewelry LIGHTING AND OPTICAL-RESPONSE analyst. Return JSON only — never an image, never a video, never a URL, never bytes.",
    hasVideo
      ? "The media below is the SOURCE CAMPAIGN CLIP. Analyse how light behaves in it over time: environment lighting, highlight intensity, flash behaviour, white-versus-rainbow balance, bloom, lens flare, starburst, highlight size, exposure and light direction."
      : "The images below are SOURCE CAMPAIGN FRAMES. Analyse how light behaves in them: environment lighting, highlight intensity, white-versus-rainbow balance, bloom, lens flare, starburst, highlight size, exposure and light direction.",
    "The SOURCE is the authority for the SCENE's light. If the source light is soft while a showroom reference is aggressive, the SOURCE LIGHT WINS.",
    "",
    TERM_BLOCK,
    "",
    MEASUREMENT_BLOCK,
    "",
    FIREWALL_BLOCK,
    "",
    stoneContextLines(context),
  ].join("\n");
}

function framePrompt(context: StoneContext, globalProfile: unknown) {
  return [
    "You are refining an ALREADY ESTABLISHED optical profile for ONE selected source frame. Return JSON only.",
    "Start from the GLOBAL profile below (analysed from the whole source clip) and change ONLY what this specific frame genuinely shows differently: exposure, light direction, highlight size, coverage, bloom, flare, contrast.",
    "Keep every value you cannot justify from this frame identical to the global profile. This is a lightweight refinement, not a re-analysis.",
    "",
    "GLOBAL PROFILE:",
    JSON.stringify(globalProfile ?? {}),
    "",
    TERM_BLOCK,
    "",
    MEASUREMENT_BLOCK,
    "",
    FIREWALL_BLOCK,
    "",
    stoneContextLines(context),
  ].join("\n");
}

/* ------------------------------------------------------------------ *
 * Guard: analysis only
 * ------------------------------------------------------------------ */

const MEDIA_SHAPED = /(^data:|;base64,|https?:\/\/)/i;

function assertAnalysisOnly(value: unknown, path = "optics", stripped: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertAnalysisOnly(entry, `${path}[${index}]`, stripped));
    return stripped;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (/(image|video|url|uri|bytes|base64|blob|media)/i.test(key)) {
        delete (value as Record<string, unknown>)[key];
        stripped.push(`${path}.${key}`);
        continue;
      }
      if (typeof entry === "string" && MEDIA_SHAPED.test(entry)) {
        delete (value as Record<string, unknown>)[key];
        stripped.push(`${path}.${key}`);
        continue;
      }
      assertAnalysisOnly(entry, `${path}.${key}`, stripped);
    }
  }
  return stripped;
}

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/* ------------------------------------------------------------------ *
 * Handlers
 * ------------------------------------------------------------------ */

async function runOptics(args: {
  ai: GoogleGenAI;
  prompt: string;
  mediaParts: unknown[];
}) {
  const started = Date.now();
  const response = await args.ai.models.generateContent({
    model: GEMINI_ANALYSIS_MODEL,
    contents: [{ role: "user", parts: [{ text: args.prompt }, ...args.mediaParts] }] as any,
    config: {
      responseMimeType: "application/json",
      responseSchema: OPTICS_SCHEMA as any,
      maxOutputTokens: 4096,
      temperature: 0,
    },
  });
  const parsed = JSON.parse((response.text ?? "").trim());
  return { parsed, geminiMs: Date.now() - started };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let user;
  try {
    user = await requireUser(req);
  } catch (error) {
    return json({ error: errorMessage(error) }, 401);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();

  try {
    const startedAt = Date.now();
    const body = await req.json().catch(() => ({})) as Record<string, any>;
    const mode = String(body?.mode ?? "global").trim() === "frame" ? "frame" : "global";
    const context = readStoneContext(body?.stoneContext);
    const admin = createAdminClient();

    const sourceVideoUrl = String(body?.sourceVideoUrl ?? "").trim();
    const sourceFrameUrls: string[] = (Array.isArray(body?.sourceFrameUrls) ? body.sourceFrameUrls : [])
      .map((url: unknown) => String(url ?? "").trim())
      .filter((url: string) => /^https?:\/\//.test(url))
      .slice(0, 3);
    const frameUrl = String(body?.frameUrl ?? "").trim();

    if (mode === "global" && !/^https?:\/\//.test(sourceVideoUrl) && !sourceFrameUrls.length) {
      return json({ error: "A source clip or at least one source frame is required" }, 400);
    }
    if (mode === "frame" && !/^https?:\/\//.test(frameUrl)) {
      return json({ error: "A source frame is required" }, 400);
    }

    const globalProfile = mode === "frame" ? normalizeOpticsProfile(body?.globalProfile) : null;
    if (mode === "frame" && !globalProfile) {
      return json({ error: "The global optics profile is required before a frame refinement" }, 400);
    }

    const fingerprint = await sha256Hex(JSON.stringify({
      kind: "diamond-optics",
      version: OPTICS_ROW_VERSION,
      model: GEMINI_ANALYSIS_MODEL,
      mode,
      sourceVideoUrl: mode === "global" ? sourceVideoUrl : "",
      sourceFrameUrls: mode === "global" ? sourceFrameUrls : [],
      frameUrl: mode === "frame" ? frameUrl : "",
      globalScope: globalProfile ? opticsSummaryLine(globalProfile) : null,
      context,
    }));

    // CACHE: sliders re-synthesise the prompt from this row — never a new Gemini call.
    const { data: cached } = await admin
      .from("jewelry_still_analyses")
      .select("analysis, version, analyzed_at")
      .eq("user_id", user.id)
      .eq("fingerprint", fingerprint)
      .maybeSingle();

    if (cached?.analysis && body?.force !== true) {
      const stored = cached.analysis as any;
      return json({
        cached: true,
        mode,
        fingerprint,
        version: cached.version ?? OPTICS_ROW_VERSION,
        analyzedAt: cached.analyzed_at,
        profile: mode === "frame"
          ? stored?.frameDiamondOpticsProfile ?? null
          : stored?.globalDiamondOpticsProfile ?? null,
        timings: { cacheHit: true, totalMs: Date.now() - startedAt },
      });
    }

    if (!apiKey) {
      return json({ error: "Optics analysis is unavailable (analysis key not configured)" }, 503);
    }

    const ai = new GoogleGenAI({ apiKey });

    let mediaParts: unknown[] = [];
    let transport: string = "image";
    if (mode === "global") {
      if (/^https?:\/\//.test(sourceVideoUrl)) {
        const prepared = await videoPart(ai, sourceVideoUrl);
        mediaParts = [prepared.part];
        transport = prepared.transport;
      } else {
        mediaParts = await Promise.all(sourceFrameUrls.map((url) => inlineImage(url)));
        transport = "frames";
      }
    } else {
      mediaParts = [await inlineImage(frameUrl)];
    }

    const prompt = mode === "global"
      ? globalPrompt(context, transport !== "frames")
      : framePrompt(context, globalProfile);

    const { parsed, geminiMs } = await runOptics({ ai, prompt, mediaParts });
    const profile = normalizeOpticsProfile({ ...parsed, scope: mode });
    if (!profile) throw new Error("The optics analysis returned no usable profile");

    const stripped = assertAnalysisOnly(profile);
    if (stripped.length) console.warn("optics guard stripped:", stripped.join(", "));

    const stored = mode === "frame"
      ? { version: OPTICS_ROW_VERSION, frameDiamondOpticsProfile: profile }
      : { version: OPTICS_ROW_VERSION, globalDiamondOpticsProfile: profile };

    await admin.from("jewelry_still_analyses").upsert(
      {
        user_id: user.id,
        fingerprint,
        version: OPTICS_ROW_VERSION,
        analysis: stored,
        analyzed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,fingerprint" },
    );

    const timings = { cacheHit: false, transport, geminiMs, totalMs: Date.now() - startedAt };
    console.log(`[diamond-optics] ${mode}`, JSON.stringify(timings), opticsSummaryLine(profile));

    return json({
      cached: false,
      mode,
      fingerprint,
      version: OPTICS_ROW_VERSION,
      analyzedAt: new Date().toISOString(),
      profile,
      guardStripped: stripped,
      timings,
    });
  } catch (error) {
    const raw = errorMessage(error);
    const safe = apiKey ? raw.split(apiKey).join("[redacted]") : raw;
    return json({ error: safe.slice(0, 4000) }, 500);
  }
});
