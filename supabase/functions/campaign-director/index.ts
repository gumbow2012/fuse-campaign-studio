// CAMPAIGN DIRECTOR — backend.
//
// A recurring-character campaign studio: upload product designs, give a theme,
// Gemini writes a shot script, nano-banana-pro renders one still per shot from
// locked character + product references, Kling 3.0 animates each approved still.
//
// HARD BOUNDARIES (same isolation rule as Madden Media Studio / Cinema):
//   * Owned by Campaign Director. It does not import, call or modify Cinema,
//     Jewelry Swap, Outfit Swap, Generation Studio, templates, billing or credits.
//   * fal submission/status use ONLY the generic helpers in ../_shared/fal.ts
//     (read-only imports). That file is NOT modified.
//   * Builder-only (requireBuilderUser). Costs are billed to FUSE's fal account
//     and are NOT charged to customer credits.
//   * Every paid action requires `confirmed: true`, which the UI only sends
//     after showing the count and the estimated cost to the user.

import { GoogleGenAI, Type } from "https://esm.sh/@google/genai@1.29.0";
import {
  IMAGE_MODEL,
  KLING3_USD_PER_SECOND,
  VIDEO_MODELS,
  getFalPricing,
  getFalQueueResult,
  getFalQueueStatus,
  normalizeImageResolution,
  resolveVideoModelKey,
  snapKlingV3Duration,
  submitImageJob,
  submitVideoJob,
} from "../_shared/fal.ts";
import { extractFuseAssetPath, resolveExecutionUrl } from "../_shared/asset-access.ts";
import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  requireBuilderUser,
} from "../_shared/supabase-admin.ts";

const GEMINI_SCRIPT_MODEL =
  Deno.env.get("GEMINI_SCRIPT_MODEL")?.trim() ||
  Deno.env.get("GEMINI_ANALYSIS_MODEL")?.trim() ||
  "gemini-3.6-flash";
const BUCKET = "fuse-assets";
const MAX_REFERENCES = 8;
const IMAGE_FETCH_TIMEOUT_MS = 15_000;
const FALLBACK_IMAGE_USD = 0.15;

const CAMERAS = [
  "wide establishing",
  "low angle",
  "close facial reaction",
  "over-the-shoulder",
  "product POV",
  "macro product",
  "symmetrical hero",
  "rear tracking",
  "dashboard angle",
  "hand interaction",
  "dramatic profile",
  "top-down",
  "floor-level",
  "long-lens compression",
  "drone wide",
];

type Body = Record<string, unknown>;

function text(value: unknown, max = 4000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function urlList(value: unknown, max: number): string[] {
  const list = Array.isArray(value) ? value : [];
  const out: string[] = [];
  for (const item of list) {
    const url = text(item, 2000);
    if (/^https?:\/\//.test(url) && !out.includes(url)) out.push(url);
    if (out.length >= max) break;
  }
  return out;
}

function geminiKey(): string | null {
  return Deno.env.get("GEMINI_API_KEY")?.trim() || null;
}


const GEMINI_ATTEMPTS = 3;

/**
 * One structured-JSON Gemini call. Thinking tokens count against the output
 * budget (a 1024 cap truncated JSON in production on 2026-10-19), so use the
 * same budget and low thinking as the other working analyzers, and retry a
 * malformed reply a bounded number of times.
 */
async function askGemini(args: {
  prompt: string;
  parts?: unknown[];
  schema: unknown;
  maxOutputTokens?: number;
  temperature?: number;
}): Promise<Record<string, unknown>> {
  const apiKey = geminiKey();
  if (!apiKey) throw new Error("Gemini is not configured (missing GEMINI_API_KEY).");
  const ai = new GoogleGenAI({ apiKey });
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= GEMINI_ATTEMPTS; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_SCRIPT_MODEL,
        contents: [{ role: "user", parts: [{ text: args.prompt }, ...(args.parts ?? [])] }] as any,
        config: {
          responseMimeType: "application/json",
          responseSchema: args.schema as any,
          maxOutputTokens: args.maxOutputTokens ?? 8192,
          temperature: args.temperature ?? 0,
          thinkingConfig: { thinkingLevel: "low" } as any,
        },
      });
      let raw = (response.text ?? "").trim();
      raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      if (!raw) throw new Error("Gemini returned nothing.");
      return JSON.parse(raw) as Record<string, unknown>;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(errorMessage(lastError) || "Gemini could not produce a readable answer.");
}

/**
 * `fuse-assets` is a private bucket, so a stored (canonical) URL cannot be fetched by Gemini or fal.
 * Swap the caller's OWN storage URLs for short-lived signed ones right before use. Anything else is
 * left alone, so one builder can never mint access to another user's files.
 */
async function signOwnUrls<T>(admin: ReturnType<typeof createAdminClient>, userId: string, value: T): Promise<T> {
  if (typeof value === "string") {
    if (!/^https?:\/\//i.test(value)) return value;
    const path = extractFuseAssetPath(value);
    if (!path || !path.startsWith(`${userId}/`)) return value;
    return ((await resolveExecutionUrl(admin, value)) ?? value) as T;
  }
  if (Array.isArray(value)) return (await Promise.all(value.map((v) => signOwnUrls(admin, userId, v)))) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) out[key] = await signOwnUrls(admin, userId, entry);
    return out as T;
  }
  return value;
}

async function inlineImage(url: string, maxBytes = Infinity) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: abort.signal });
    if (!response.ok) throw new Error(`Could not read a reference image (${response.status})`);
    const mimeType = (response.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
    if (!/^image\//.test(mimeType)) throw new Error("Only still images can be read");
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error("Image too large to attach");
    let binary = "";
    for (let i = 0; i < buffer.length; i += 8192) {
      binary += String.fromCharCode(...buffer.subarray(i, i + 8192));
    }
    return { inlineData: { mimeType, data: btoa(binary) } };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ *
 * estimate — live unit prices (read-only provider lookups, no spend)
 * ------------------------------------------------------------------ */
async function estimate(body: Body) {
  const resolution = normalizeImageResolution(body.resolution);
  const modelKey = resolveVideoModelKey(body.videoModel);
  let imageUsd = FALLBACK_IMAGE_USD;
  let videoUsdPerSecond = VIDEO_MODELS[modelKey].fallbackUsdPerSecond ?? KLING3_USD_PER_SECOND;
  let live = false;
  try {
    const price = await getFalPricing(IMAGE_MODEL);
    if (price && price.unit_price > 0) {
      imageUsd = price.unit_price;
      live = true;
    }
  } catch (error) {
    console.warn("campaign-director image pricing fallback:", errorMessage(error));
  }
  try {
    const price = await getFalPricing(VIDEO_MODELS[modelKey].endpointId);
    if (price && price.unit_price > 0 && /second/i.test(price.unit)) {
      videoUsdPerSecond = price.unit_price;
    }
  } catch (error) {
    console.warn("campaign-director video pricing fallback:", errorMessage(error));
  }
  if (resolution === "4K") imageUsd *= 2;
  return {
    ok: true as const,
    imageUsd: Number(imageUsd.toFixed(4)),
    videoUsdPerSecond: Number(videoUsdPerSecond.toFixed(4)),
    resolution,
    videoModel: modelKey,
    live,
  };
}

/* ------------------------------------------------------------------ *
 * script — Gemini writes the shot list as strict JSON
 * ------------------------------------------------------------------ */
const SHOT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    shots: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          act: { type: Type.STRING },
          title: { type: Type.STRING },
          camera: { type: Type.STRING, enum: CAMERAS },
          setting: { type: Type.STRING },
          action: { type: Type.STRING },
          lighting: { type: Type.STRING },
          productRole: { type: Type.STRING, enum: ["none", "hero", "secondary"] },
          productIds: { type: Type.ARRAY, items: { type: Type.STRING } },
          artistProductIds: { type: Type.ARRAY, items: { type: Type.STRING } },
          supporting: { type: Type.STRING },
          reflective: { type: Type.BOOLEAN },
          motion: { type: Type.STRING },
        },
        required: [
          "act",
          "title",
          "camera",
          "setting",
          "action",
          "lighting",
          "productRole",
          "productIds",
          "artistProductIds",
          "supporting",
          "reflective",
          "motion",
        ],
      },
    },
  },
  required: ["shots"],
};

type ProductInput = { id: string; name: string; artist: string; collab: string; flavor: string; thumbUrl: string };

const MAX_DESIGN_IMAGES = 16;
const DESIGN_IMAGE_MAX_BYTES = 1_500_000;

function readProducts(value: unknown): ProductInput[] {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((item) => {
      const raw = (item ?? {}) as Record<string, unknown>;
      return {
        id: text(raw.id, 80),
        name: text(raw.name, 120),
        artist: text(raw.artist, 120),
        collab: text(raw.collab, 160),
        flavor: text(raw.flavor, 160),
        thumbUrl: urlList([raw.thumbUrl], 1)[0] ?? "",
      };
    })
    .filter((p) => p.id)
    .slice(0, 40);
}

function buildScriptPrompt(body: Body, products: ProductInput[], shotCount: number): string {
  const world = (body.world ?? {}) as Record<string, unknown>;
  const brief = (body.brief ?? {}) as Record<string, unknown>;
  const ledger = products
    .map((p) => `- id=${p.id} | ${p.name} | artist: ${p.artist || "none"} | collab: ${p.collab || "none"} | flavor: ${p.flavor || "unknown"}`)
    .join("\n");

  return [
    "You are the head of story for a premium animated-film style commercial series.",
    `Write a shot list of EXACTLY ${shotCount} shots for ONE continuous campaign film. Each shot becomes one still image, later animated for a few seconds.`,
    "",
    `WORLD: ${text(world.name, 120) || "the world"} — recurring protagonist: ${text(world.characterName, 200) || "the protagonist"}.`,
    `CHARACTER RULES (never contradict): ${text(world.characterLock)}`,
    `SCALE RULE: ${text(world.scaleRule)}`,
    `LOOK: ${text(world.styleLock)}`,
    `AVOID: ${text(world.avoid)}`,
    "",
    `CAMPAIGN THEME / IDEA: ${text(brief.theme, 3000) || "(none given: build the concept yourself FROM THE PRODUCT DESIGNS below: the artists, franchises, flavors, colors and mood printed on them decide the story, places and set pieces)"}`,
    `EXTRA DIRECTION: ${text(brief.notes, 4000) || "(none)"}`,
    "",
    "You are also shown the front design image of each product. LOOK at them: let each design's artist, colors, imagery and mood drive where and how its scene happens.",
    "",
    "PRODUCT LEDGER (use ONLY these ids):",
    ledger || "- (no products)",
    "",
    "RULES:",
    "1. One shot = ONE frozen moment. `action` describes a single moment, never a sequence (no 'then').",
    "2. It is ONE movie with a rising arc: anticipation and setup, a journey with escalating scenes, then a finale. Not unrelated ads.",
    "3. Every collaboration/product lives inside a SPECIFIC, real, physical scene of the continuous story (a place, a vehicle, a party, a boat, a rooftop). Never a portal, multiverse, director's set, studio hallway, gallery, collage, or poster standing in for a character.",
    "4. Evoke each collaboration through setting, mood and color. Do NOT reproduce any franchise character's face or likeness.",
    "5. Every product gets at least ONE clear hero shot (productRole 'hero', productIds = [that id], product large and readable). If the shot budget allows, 2 appearances per product (hero + secondary).",
    "6. Reveal rhythm: story shot, action shot, product payoff, story continues. Put a product in no more than 55 percent of shots. A shot may show at most 3 products. Product ids must come from the ledger.",
    "7. When the shot features a product's ARTIST as a separate physical character, put that product id in artistProductIds and describe the artist's role in `supporting`. The artist is never the protagonist and never a poster or screen.",
    "8. Vary the camera. Allowed cameras: " + CAMERAS.join(", ") + ". Never the same camera three shots in a row; no camera above 35 percent of the film.",
    "9. Set `reflective` true when strong colored environment light (fire, neon, sunset, rain, night) should reflect off the foil pouch and skin and a product is visible.",
    "10. `motion` = the ONE primary movement for a 3-second clip (an artist dancing, the boat accelerating, the product being raised, a slow push-in, a crowd moving). For hero product shots prefer subtle camera movement.",
    "11. Compositions must be animatable: clear hands, separated subjects, no fused or overlapping limbs, a clear subject hierarchy.",
    "12. `setting` and `lighting` are specific (time of day, place, practical light), never generic.",
    "13. Keep every field in plain, wholesome, brand-safe wording: describe places, objects and gentle physical actions in neutral terms. No violent, weapon, crime, romantic or suggestive language anywhere, and never refer to the world or its brand by a gang, mob or crime-style name.",
    "",
    "Return strict JSON matching the schema. No prose.",
  ].join("\n");
}

async function writeScript(body: Body) {
  const products = readProducts(body.products);
  const brief = (body.brief ?? {}) as Record<string, unknown>;
  const shotCount = Math.min(40, Math.max(4, Math.round(Number(brief.shotCount) || 20)));
  const world = (body.world ?? {}) as Record<string, unknown>;
  const visual = [...urlList(world.characterUrls, 2), ...urlList(world.styleUrls, 1)];

  try {
    const parts = await Promise.all(visual.map((url) => inlineImage(url)));
    // A design we cannot fetch is skipped; the text ledger still describes it.
    const designs = (
      await Promise.all(
        products
          .filter((p) => p.thumbUrl)
          .slice(0, MAX_DESIGN_IMAGES)
          .map(async (p) => {
            try {
              return [{ text: `Front design of product id=${p.id} (${p.name}):` }, await inlineImage(p.thumbUrl, DESIGN_IMAGE_MAX_BYTES)];
            } catch {
              return [];
            }
          }),
      )
    ).flat();
    const parsed = await askGemini({
      prompt: buildScriptPrompt(body, products, shotCount),
      parts: [
        ...(parts.length ? [{ text: "Reference frames of the world and its recurring character follow, for continuity only:" }, ...parts] : []),
        ...designs,
      ],
      schema: SHOT_SCHEMA,
      maxOutputTokens: 16384,
      temperature: 0.8,
    });
    return { ok: true as const, model: GEMINI_SCRIPT_MODEL, shots: (parsed.shots as unknown[]) ?? [] };
  } catch (error) {
    console.error("campaign-director script failed:", errorMessage(error));
    return { ok: false as const, reason: errorMessage(error) };
  }
}

/* ------------------------------------------------------------------ *
 * read-product — read the PRINTED text on a design (no identification)
 * ------------------------------------------------------------------ */
const PRODUCT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    artist: { type: Type.STRING },
    collab: { type: Type.STRING },
    flavor: { type: Type.STRING },
  },
  required: ["name", "artist", "collab", "flavor"],
};

async function readProduct(body: Body) {
  const url = urlList([body.imageUrl], 1)[0];
  if (!url) return { ok: false as const, reason: "Add a design image first." };
  try {
    const part = await inlineImage(url);
    const parsed = await askGemini({
      prompt: [
        "This is the front design of a product package. READ only the text that is printed on it.",
        "Return: name = a short label (the main title or featured name as printed), artist = a featured person or act ONLY if their name is printed, collab = a franchise or brand collaboration ONLY if printed, flavor = the flavor / product name as printed.",
        "Never identify anyone from their appearance. If a field is not printed, return an empty string. Copy spelling exactly as printed.",
        "Return strict JSON.",
      ].join("\n"),
      parts: [part],
      schema: PRODUCT_SCHEMA,
      maxOutputTokens: 4096,
    });
    return {
      ok: true as const,
      name: text(parsed.name, 120),
      artist: text(parsed.artist, 120),
      collab: text(parsed.collab, 160),
      flavor: text(parsed.flavor, 160),
    };
  } catch (error) {
    return { ok: false as const, reason: errorMessage(error) };
  }
}

/* ------------------------------------------------------------------ *
 * qa-check — compare a finished still to the exact references
 * ------------------------------------------------------------------ */
const QA_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    characterMatch: { type: Type.BOOLEAN },
    scaleOk: { type: Type.BOOLEAN },
    productMatch: { type: Type.BOOLEAN },
    unexpectedProducts: { type: Type.BOOLEAN },
    issues: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["characterMatch", "scaleOk", "productMatch", "unexpectedProducts", "issues"],
};

async function qaCheck(body: Body) {
  const stillUrl = urlList([body.stillUrl], 1)[0];
  if (!stillUrl) return { ok: false as const, reason: "Missing the still to check." };
  const characterUrls = urlList(body.characterUrls, 2);
  const products = (Array.isArray(body.products) ? body.products : [])
    .map((item) => {
      const raw = (item ?? {}) as Record<string, unknown>;
      return { name: text(raw.name, 120), url: urlList([raw.url], 1)[0] ?? "" };
    })
    .filter((p) => p.url)
    .slice(0, 3);

  try {
    const stillPart = await inlineImage(stillUrl);
    const characterParts = await Promise.all(characterUrls.map((u) => inlineImage(u)));
    const productParts = await Promise.all(products.map((p) => inlineImage(p.url)));
    const parsed = await askGemini({
      prompt: [
        "You are a strict quality inspector for stills from an animated-film style commercial.",
        "Image order: first the STILL to inspect, then the CHARACTER master references, then each expected PRODUCT design (flat artwork), in the order listed below.",
        `Character master references provided: ${characterParts.length}.`,
        `Expected products, in order: ${products.length ? products.map((p, i) => `${i + 1}. ${p.name || "product"}`).join("; ") : "none (no product should be the focus)"}.`,
        "",
        "Judge ONLY what you can see:",
        "- characterMatch: is the recurring protagonist in the still the SAME character as in the character references (face, skin tone, hair, hat, outfit, apparent age, body build)? If the protagonist is not visible, answer true.",
        "- scaleOk: is the protagonist's height and body proportion consistent with the references, compared with anyone standing beside him? If unclear, answer true.",
        "- productMatch: true ONLY if every expected product is visible, its printed artwork matches its design (same layout, colors, graphics) and its main text is readable and spelled like the design. If no product is expected, answer true.",
        "- unexpectedProducts: true if a package with different artwork that is NOT one of the expected products is clearly visible.",
        "- issues: short, concrete problems (empty list if none).",
        "Return strict JSON.",
      ].join("\n"),
      parts: [stillPart, ...characterParts, ...productParts],
      schema: QA_SCHEMA,
      maxOutputTokens: 8192,
    });
    const issues = Array.isArray(parsed.issues) ? (parsed.issues as unknown[]).map((i) => text(i, 240)).filter(Boolean).slice(0, 8) : [];
    const characterMatch = parsed.characterMatch !== false;
    const scaleOk = parsed.scaleOk !== false;
    const productMatch = parsed.productMatch !== false;
    const unexpectedProducts = parsed.unexpectedProducts === true;
    return {
      ok: true as const,
      pass: characterMatch && scaleOk && productMatch && !unexpectedProducts,
      characterMatch,
      scaleOk,
      productMatch,
      unexpectedProducts,
      issues,
    };
  } catch (error) {
    return { ok: false as const, reason: errorMessage(error) };
  }
}

/* ------------------------------------------------------------------ *
 * image / video submit + status
 * ------------------------------------------------------------------ */
function hookUrl(): string {
  const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  return `${base}/functions/v1/campaign-director?hook=1`;
}

function requireConfirmed(body: Body) {
  if (body.confirmed !== true) {
    throw new Error("Spend not confirmed. The count and cost must be shown and approved first.");
  }
}

async function submitImage(body: Body) {
  requireConfirmed(body);
  const prompt = text(body.prompt, 12000);
  const imageUrls = urlList(body.referenceUrls, MAX_REFERENCES);
  if (!prompt) return { ok: false as const, reason: "Missing prompt." };
  if (imageUrls.length === 0) return { ok: false as const, reason: "At least one reference image is required." };
  const aspect = ["9:16", "16:9", "1:1"].includes(String(body.aspectRatio)) ? String(body.aspectRatio) : "9:16";
  const requestId = await submitImageJob({
    prompt,
    imageUrls,
    aspectRatio: aspect,
    resolution: String(body.resolution ?? "2K"),
    webhookUrl: hookUrl(),
  });
  return { ok: true as const, requestId, endpoint: IMAGE_MODEL };
}

async function submitVideo(body: Body) {
  requireConfirmed(body);
  const prompt = text(body.prompt, 4000);
  const imageUrl = urlList([body.imageUrl], 1)[0];
  if (!prompt || !imageUrl) return { ok: false as const, reason: "A prompt and a still image are required." };
  const modelKey = resolveVideoModelKey(body.videoModel);
  const requestId = await submitVideoJob({
    prompt,
    initImageUrl: imageUrl,
    aspectRatio: String(body.aspectRatio ?? "9:16"),
    duration: Number(snapKlingV3Duration(body.seconds ?? 3)),
    webhookUrl: hookUrl(),
    modelKey,
    generateAudio: false,
  });
  return { ok: true as const, requestId, endpoint: VIDEO_MODELS[modelKey].endpointId, model: modelKey };
}

function firstUrl(result: any, kind: "image" | "video"): string | null {
  if (kind === "image") return result?.images?.[0]?.url ?? result?.image?.url ?? null;
  return result?.video?.url ?? result?.videos?.[0]?.url ?? null;
}

async function archive(admin: ReturnType<typeof createAdminClient>, userId: string, projectId: string, requestId: string, remoteUrl: string, kind: "image" | "video") {
  const response = await fetch(remoteUrl);
  if (!response.ok) throw new Error(`Could not download the output (${response.status})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const ext = kind === "image" ? "png" : "mp4";
  const safeProject = projectId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "project";
  const safeRequest = requestId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  const path = `${userId}/campaign-director/${safeProject}/${safeRequest}.${ext}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: kind === "image" ? "image/png" : "video/mp4",
    upsert: true,
    cacheControl: "31536000",
  });
  if (error) throw new Error(error.message);
  return admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function jobStatus(admin: ReturnType<typeof createAdminClient>, userId: string, body: Body) {
  const kind = body.kind === "video" ? "video" : "image";
  const requestId = text(body.requestId, 200);
  if (!requestId) return { ok: false as const, reason: "Missing requestId." };
  const endpoint = kind === "image" ? IMAGE_MODEL : VIDEO_MODELS[resolveVideoModelKey(body.videoModel)].endpointId;

  const status = String(await getFalQueueStatus(endpoint, requestId) ?? "").toUpperCase();
  if (status === "IN_QUEUE") return { ok: true as const, state: "queued" as const };
  if (status === "IN_PROGRESS") return { ok: true as const, state: "running" as const };
  if (status !== "COMPLETED") return { ok: true as const, state: "running" as const };

  try {
    const result = await getFalQueueResult(endpoint, requestId);
    const remote = firstUrl(result, kind);
    if (!remote) return { ok: true as const, state: "failed" as const, error: "The provider finished without an output." };
    const url = await archive(admin, userId, text(body.projectId, 80), requestId, remote, kind);
    return { ok: true as const, state: "done" as const, url };
  } catch (error) {
    return { ok: true as const, state: "failed" as const, error: errorMessage(error) };
  }
}

/* ------------------------------------------------------------------ */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Provider webhook: acknowledge only. The studio polls job status itself.
  if (new URL(req.url).searchParams.get("hook") === "1") {
    return json({ ok: true });
  }

  try {
    const admin = createAdminClient();
    const access = await requireBuilderUser(req, admin);
    const raw = (await req.json().catch(() => ({}))) as Body;
    const body = await signOwnUrls(admin, access.user.id, raw);
    const action = String(body.action ?? "").trim();

    switch (action) {
      case "estimate":
        return json(await estimate(body));
      case "script":
        return json(await writeScript(body));
      case "read-product":
        return json(await readProduct(body));
      case "qa-check":
        return json(await qaCheck(body));
      case "image-submit":
        return json(await submitImage(body));
      case "video-submit":
        return json(await submitVideo(body));
      case "job-status":
        return json(await jobStatus(admin, access.user.id, body));
      default:
        return json({ ok: false, reason: `Unknown action: ${action || "(none)"}` }, 400);
    }
  } catch (error) {
    return json({ ok: false, reason: errorMessage(error) }, 401);
  }
});
