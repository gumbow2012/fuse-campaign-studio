import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  requireBuilderUser,
} from "../_shared/supabase-admin.ts";
import {
  clampSeedanceDuration,
  getFalPricing,
  getFalQueueResult,
  getFalQueueStatus,
  buildVideoModelInput,
  getVideoModel,
  IMAGE_MODEL,
  referenceToVideoEndpoint,
  submitFalJob,
  videoFallbackUsdPerSecond,
} from "../_shared/fal.ts";

/**
 * Jewelry Swap: sibling of Outfit Swap. Per-frame nano-banana jewelry
 * replacement + one Seedance reference-to-video reconstruction, plus the
 * optional Kling clip stage. Additive — reuses `studio_generations` and never
 * touches the template runner/executor.
 */

const USD_PER_CREDIT = 0.098;
const IMAGE_FALLBACK_USD = 0.15;
const MAX_REFERENCE_IMAGES = 15;

type AdminClient = ReturnType<typeof createAdminClient>;

function creditsFromUsd(usd: number | null | undefined) {
  if (!usd || !Number.isFinite(usd) || usd <= 0) return null;
  return Math.max(1, Math.ceil(usd / USD_PER_CREDIT));
}

async function estimateUsd(args: {
  endpointId: string;
  seconds?: number | null;
  fallbackUsdPerSecond?: number | null;
  fallbackFlatUsd?: number | null;
}) {
  try {
    const pricing = await getFalPricing(args.endpointId);
    if (pricing) {
      const unit = String(pricing.unit ?? "").toLowerCase();
      const quantity = unit.includes("second") ? Math.max(1, Number(args.seconds ?? 5)) : 1;
      return Number((pricing.unit_price * quantity).toFixed(6));
    }
  } catch (_error) {
    // fall through to static fallbacks
  }
  if (args.fallbackUsdPerSecond && args.seconds) {
    return Number((args.fallbackUsdPerSecond * args.seconds).toFixed(6));
  }
  return args.fallbackFlatUsd ?? null;
}

function extractOutput(payload: unknown): { url: string; type: "image" | "video" } | null {
  const data = (payload as any)?.data ?? payload;
  if (!data) return null;

  const videoUrl = data?.video?.url ?? data?.videos?.[0]?.url ??
    (typeof data?.video === "string" ? data.video : null);
  if (videoUrl) return { url: String(videoUrl), type: "video" };

  const imageUrl = data?.images?.[0]?.url ?? data?.image?.url ?? data?.output?.url;
  if (imageUrl) return { url: String(imageUrl), type: "image" };

  return null;
}

function serialize(row: any) {
  const payload = (row.input_payload ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    status: row.status as "queued" | "running" | "complete" | "failed",
    kind: row.kind ?? null,
    prompt: row.prompt ?? null,
    outputUrl: row.output_url ?? null,
    outputType: row.output_type ?? null,
    error: row.error_log ?? null,
    estimatedCredits: row.estimated_credits ?? null,
    estimatedCostUsd: row.estimated_cost_usd ? Number(row.estimated_cost_usd) : null,
    providerModel: row.provider_model ?? null,
    inputPayload: payload,
    stage: typeof payload.stage === "string" ? payload.stage : null,
    frameIndex: typeof payload.frame_index === "number" ? payload.frame_index : null,
    frameTime: typeof payload.frame_time === "number" ? payload.frame_time : null,
    sourceFrameUrl: typeof payload.source_frame_url === "string" ? payload.source_frame_url : null,
    createdAt: row.created_at ?? null,
    completedAt: row.completed_at ?? null,
  };
}

function cleanUrls(value: unknown) {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const entry of list) {
    const url = String(entry ?? "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= MAX_REFERENCE_IMAGES) break;
  }
  return urls;
}

type JewelryDimensions = {
  width?: number | string | null;
  height?: number | string | null;
  depth?: number | string | null;
  weight?: number | string | null;
};

type JewelryPiece = {
  urls?: unknown;
  url?: string;
  type?: string;
  metal?: string;
  stone?: string;
  quality?: string;
  dimensions?: JewelryDimensions | null;
  cad?: boolean;
  person?: string;
  notes?: string;
};

function pieceUrls(piece: JewelryPiece) {
  const list = Array.isArray(piece.urls) ? piece.urls : piece.url ? [piece.url] : [];
  return list.map((entry) => String(entry ?? "").trim()).filter(Boolean);
}

function isAuto(value: unknown) {
  const text = String(value ?? "").trim();
  return !text || /^auto/i.test(text);
}

function refListPhrase(numbers: number[]) {
  if (numbers.length === 1) return String(numbers[0]);
  return `${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;
}

const CAD_AUTHORITY_TEXT =
  "CAD AUTHORITY ACTIVE for the CAD-flagged reference(s). Treat the CAD as the ABSOLUTE authority for geometry: silhouette, dimensions, depth, thickness, stone count, stone layout, setting geometry, bail structure, borders, open/negative spaces and relief. Do not reinterpret the shape. Convert the CAD into a physically manufactured, manufacturable real-world piece, preserving every structural feature. If a real jewelry photo is also supplied for that piece, use it only as the material/finish/scintillation authority — geometry still comes from the CAD.";

/**
 * Precision jewelry replacement prompt. Image 1 is always the source frame;
 * reference images 2..N are the jewelry references in supplied order (one
 * physical piece may span several images).
 */
function buildJewelryPrompt(args: { pieces: JewelryPiece[]; extra?: string }) {
  let cursor = 2; // image 1 is the source frame
  const lines: string[] = [];
  let cadActive = false;

  for (const piece of args.pieces) {
    const urls = pieceUrls(piece);
    if (!urls.length) continue;
    const refNums = urls.map(() => cursor++);
    const type = String(piece.type ?? "jewelry piece").trim() || "jewelry piece";
    const applyTo = String(piece.person ?? "Main subject").trim() || "Main subject";
    const notes = String(piece.notes ?? "").trim();
    if (piece.cad === true) cadActive = true;

    let line = `Replace the ${type.toLowerCase()} on ${applyTo.toLowerCase()} with the piece shown in reference image(s) ${
      refListPhrase(refNums)
    }${notes ? `, described as "${notes}"` : ""}.`;

    if (!isAuto(piece.metal)) {
      line += ` Metal: ${String(piece.metal).trim()} (overrides visual inference).`;
    }
    if (!isAuto(piece.stone)) {
      const quality = String(piece.quality ?? "").trim();
      line += ` Stones: ${String(piece.stone).trim()}${quality ? ` ${quality}` : ""}.`;
    }

    const dims = piece.dimensions ?? null;
    const width = Number(dims?.width ?? NaN);
    const height = Number(dims?.height ?? NaN);
    const depth = Number(dims?.depth ?? NaN);
    const weight = Number(dims?.weight ?? NaN);
    if ([width, height, depth].some((value) => Number.isFinite(value) && value > 0)) {
      const part = [width, height, depth]
        .map((value) => (Number.isFinite(value) && value > 0 ? String(value) : "?"))
        .join("×");
      line += ` Physical size ~${part} mm${
        Number.isFinite(weight) && weight > 0 ? `, ~${weight} g` : ""
      } — give it believable mass and thickness, not paper-thin.`;
    }

    lines.push(line);
  }

  const prompt = [
    "Use SOURCE_FRAME (image 1) as the exact identity, pose, camera, lighting, body, skin, hair, clothing and environment reference. This is a precision jewelry replacement, not a redesign or reinterpretation.",
    "",
    "Modify ONLY the jewelry pieces explicitly listed below. Every unrelated detail from SOURCE_FRAME must be preserved exactly.",
    "",
    "For each listed piece, the supplied jewelry reference images are the STRICT visual authority for that piece's design. Preserve exactly: silhouette, proportions, dimensions, thickness, metal and metal color, surface finish, gemstone count, gemstone placement, gemstone size relationships, gemstone cuts, setting types, borders, prongs, bezels, channels, bail, attachment points, chain structure, engravings, lettering, logos, raised and recessed relief, and structural layers.",
    "",
    `PIECES: ${lines.join(" ")}`,
    "",
    "Do NOT redesign or simplify the jewelry. Do NOT invent, add, remove, or resize stones. Do NOT change stone shapes or randomize stone placement. Do NOT modify any jewelry that was not listed. Round stones stay round and individually seated; baguettes keep their long rectangular orientation; marquise keep pointed ends; princess stay square; emerald cuts keep the stepped rectangular form. Preserve mosaic / reverse-mosaic setting patterns — never flatten them into generic pavé.",
    "",
    "If a piece is a pendant only, replace only the pendant and keep the existing chain. If a chain only, replace only the chain and keep the existing pendant. If \"Pendant + Chain\", replace both.",
    "",
    "Integrate each piece naturally onto the subject with physically correct scale, perspective, gravity, contact, contact shadows, reflections, occlusion and skin/clothing interaction. Respect layering: hands, hair, sleeves and clothing that were in front stay in front. Match the source lighting.",
    "",
    "The final result must look like the EXACT original photograph, except the subject was genuinely wearing the supplied jewelry during the original shoot — a real manufactured piece, not an AI approximation. No fake glow, no random glitter, no melted or warped metal, no floating jewelry.",
    cadActive ? "" : null,
    cadActive ? CAD_AUTHORITY_TEXT : null,
    String(args.extra ?? "").trim() ? "" : null,
    String(args.extra ?? "").trim() || null,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return prompt;
}

/** Reconstruction prompt for the Seedance reference-to-video pass. */
function buildJewelryReconstructionPrompt(args: { extra?: string }) {
  return [
    "Use the supplied reference images as the strict appearance authority for the jewelry. Maintain ONE physically identical jewelry piece throughout the entire video. Do not change metal, stone count, stone placement, stone cuts, bail, chain, setting, dimensions, proportions, lettering, logos or structural design. Preserve the source subject, movement, camera, lighting, environment and timing as closely as possible. Jewelry must stay temporally consistent — no flicker, morphing, stone drift, or redesign.",
    String(args.extra ?? "").trim(),
  ].filter(Boolean).join("\n\n");
}

async function startSwapFrame(admin: AdminClient, args: {
  userId: string;
  sourceFrameUrl: string;
  pieces: JewelryPiece[];
  frameIndex?: number;
  frameTime?: number;
  aspectRatio?: string;
  resolution?: string;
  extraPrompt?: string;
  webhookBase: string;
}) {
  const sourceFrameUrl = String(args.sourceFrameUrl ?? "").trim();
  if (!sourceFrameUrl) throw new Error("A source frame is required");

  const pieces = (Array.isArray(args.pieces) ? args.pieces : [])
    .filter((piece) => pieceUrls(piece ?? {}).length);
  if (!pieces.length) throw new Error("Add at least one jewelry reference");

  // REF order matters: the source frame is always image 1.
  const imageUrls = cleanUrls([
    sourceFrameUrl,
    ...pieces.flatMap((piece) => pieceUrls(piece)),
  ]);
  const prompt = buildJewelryPrompt({ pieces, extra: args.extraPrompt });

  const { data: inserted, error: insertError } = await admin
    .from("studio_generations")
    .insert({
      user_id: args.userId,
      status: "queued",
      kind: "image",
      provider: "fal",
      prompt,
    })
    .select("*")
    .single();
  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "Could not start the frame swap");
  }

  try {
    const estimatedCostUsd = await estimateUsd({
      endpointId: IMAGE_MODEL,
      fallbackFlatUsd: IMAGE_FALLBACK_USD,
    });

    const aspect = String(args.aspectRatio ?? "").trim();
    const resolution = String(args.resolution ?? "").trim().toUpperCase();
    const falInput: Record<string, unknown> = {
      prompt,
      image_urls: imageUrls,
      output_format: "png",
      ...(aspect && aspect !== "auto" ? { aspect_ratio: aspect } : {}),
      ...(["1K", "2K", "4K"].includes(resolution) ? { resolution } : {}),
    };

    const webhookUrl = `${args.webhookBase}${encodeURIComponent(inserted.id)}`;
    const requestId = await submitFalJob(IMAGE_MODEL, falInput, webhookUrl);

    const { data: updated } = await admin
      .from("studio_generations")
      .update({
        status: "running",
        provider_model: IMAGE_MODEL,
        provider_request_id: requestId,
        estimated_cost_usd: estimatedCostUsd,
        estimated_credits: creditsFromUsd(estimatedCostUsd),
        input_payload: {
          ...falInput,
          feature: "jewelry-swap",
          stage: "frame_swap",
          source_frame_url: sourceFrameUrl,
          frame_index: Number(args.frameIndex ?? 0),
          frame_time: Number(args.frameTime ?? 0),
          pieces,
        },
      })
      .eq("id", inserted.id)
      .select("*")
      .single();

    return serialize(updated ?? inserted);
  } catch (error) {
    const message = errorMessage(error);
    await admin
      .from("studio_generations")
      .update({
        status: "failed",
        error_log: message.slice(0, 10000),
        completed_at: new Date().toISOString(),
      })
      .eq("id", inserted.id);
    throw error;
  }
}

async function startReconstruction(admin: AdminClient, args: {
  userId: string;
  frameUrls: string[];
  model?: string;
  duration?: number | string;
  resolution?: string;
  aspectRatio?: string;
  generateAudio?: boolean;
  extraPrompt?: string;
  webhookBase: string;
}) {
  const referenceUrls = cleanUrls(args.frameUrls);
  if (!referenceUrls.length) throw new Error("Approve at least one swapped frame first");

  const videoModel = getVideoModel(
    args.model === "seedance-2.0-fast" ? "seedance-2.0-fast" : "seedance-2.0",
  );
  const endpointId = referenceToVideoEndpoint(videoModel.key);
  const duration = clampSeedanceDuration(args.duration ?? 5, videoModel);
  const prompt = buildJewelryReconstructionPrompt({ extra: args.extraPrompt });

  const { data: inserted, error: insertError } = await admin
    .from("studio_generations")
    .insert({
      user_id: args.userId,
      status: "queued",
      kind: "video",
      provider: "fal",
      prompt,
    })
    .select("*")
    .single();
  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "Could not start the reconstruction");
  }

  try {
    const generateAudio = args.generateAudio !== false;
    const estimatedCostUsd = await estimateUsd({
      endpointId,
      seconds: duration,
      fallbackUsdPerSecond: videoFallbackUsdPerSecond(videoModel, generateAudio) ?? null,
    });

    const resolution = videoModel.resolutions?.includes(String(args.resolution ?? "").toLowerCase())
      ? String(args.resolution).toLowerCase()
      : "1080p";
    const aspect = String(args.aspectRatio ?? "").trim();
    const aspectRatio = videoModel.aspectRatios?.includes(aspect) ? aspect : "9:16";

    const falInput: Record<string, unknown> = {
      prompt,
      reference_image_urls: referenceUrls,
      image_urls: referenceUrls,
      duration: String(duration),
      resolution,
      aspect_ratio: aspectRatio,
      generate_audio: generateAudio,
    };

    const webhookUrl = `${args.webhookBase}${encodeURIComponent(inserted.id)}`;
    const requestId = await submitFalJob(endpointId, falInput, webhookUrl);

    const { data: updated } = await admin
      .from("studio_generations")
      .update({
        status: "running",
        provider_model: endpointId,
        provider_request_id: requestId,
        estimated_cost_usd: estimatedCostUsd,
        estimated_credits: creditsFromUsd(estimatedCostUsd),
        input_payload: {
          ...falInput,
          feature: "jewelry-swap",
          stage: "reconstruction",
          video_model: videoModel.key,
        },
      })
      .eq("id", inserted.id)
      .select("*")
      .single();

    return serialize(updated ?? inserted);
  } catch (error) {
    const message = errorMessage(error);
    await admin
      .from("studio_generations")
      .update({
        status: "failed",
        error_log: message.slice(0, 10000),
        completed_at: new Date().toISOString(),
      })
      .eq("id", inserted.id);
    throw error;
  }
}

/** Universal motion prompt for the optional Kling clip stage. */
const ANIMATE_PROMPT =
  "Slow realistic dolly in toward the jewelry and subject. Preserve the exact subject identity and the exact jewelry design — identical metal, gemstones, stone placement, setting geometry, chain, bail, logos and proportions. Natural subtle body movement only. Realistic independent diamond scintillation and physically plausible reflections. No jewelry morphing, no changing stone layout, no changing metal, no extra or disappearing stones, no camera orbit, no scene change.";

const ANIMATE_MODEL_KEY = "kling-3.0-pro";
const ANIMATE_DURATION = 3;

async function startAnimateFrame(admin: AdminClient, args: {
  userId: string;
  imageUrl: string;
  frameIndex?: number;
  frameTime?: number;
  webhookBase: string;
}) {
  const imageUrl = String(args.imageUrl ?? "").trim();
  if (!imageUrl) throw new Error("A swapped frame is required");

  const videoModel = getVideoModel(ANIMATE_MODEL_KEY);
  const endpointId = videoModel.endpointId;

  const { data: inserted, error: insertError } = await admin
    .from("studio_generations")
    .insert({
      user_id: args.userId,
      status: "queued",
      kind: "video",
      provider: "fal",
      prompt: ANIMATE_PROMPT,
    })
    .select("*")
    .single();
  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "Could not start the clip");
  }

  try {
    const estimatedCostUsd = await estimateUsd({
      endpointId,
      seconds: ANIMATE_DURATION,
      fallbackUsdPerSecond: videoFallbackUsdPerSecond(videoModel, false) ?? null,
    });

    const falInput = buildVideoModelInput(ANIMATE_MODEL_KEY, {
      imageUrl,
      prompt: ANIMATE_PROMPT,
      duration: ANIMATE_DURATION,
      generateAudio: false,
    });

    const webhookUrl = `${args.webhookBase}${encodeURIComponent(inserted.id)}`;
    const requestId = await submitFalJob(endpointId, falInput, webhookUrl);

    const { data: updated } = await admin
      .from("studio_generations")
      .update({
        status: "running",
        provider_model: endpointId,
        provider_request_id: requestId,
        estimated_cost_usd: estimatedCostUsd,
        estimated_credits: creditsFromUsd(estimatedCostUsd),
        input_payload: {
          ...falInput,
          feature: "jewelry-swap",
          stage: "frame_animation",
          video_model: ANIMATE_MODEL_KEY,
          resolution: "1080p",
          source_frame_url: imageUrl,
          frame_index: Number(args.frameIndex ?? 0),
          frame_time: Number(args.frameTime ?? 0),
        },
      })
      .eq("id", inserted.id)
      .select("*")
      .single();

    return serialize(updated ?? inserted);
  } catch (error) {
    const message = errorMessage(error);
    await admin
      .from("studio_generations")
      .update({
        status: "failed",
        error_log: message.slice(0, 10000),
        completed_at: new Date().toISOString(),
      })
      .eq("id", inserted.id);
    throw error;
  }
}

/** Poll fal for an in-flight row and persist any terminal result. */
async function syncRow(admin: AdminClient, row: any) {
  if (row.status !== "running" && row.status !== "queued") return serialize(row);
  if (!row.provider_request_id || !row.provider_model) return serialize(row);

  try {
    const status = await getFalQueueStatus(row.provider_model, row.provider_request_id);
    const normalized = String(status ?? "").toUpperCase();
    if (normalized !== "COMPLETED" && normalized !== "OK") return serialize(row);

    const result = await getFalQueueResult(row.provider_model, row.provider_request_id);
    const output = extractOutput(result);
    if (!output) throw new Error("The provider finished without returning a file");

    const { data: updated } = await admin
      .from("studio_generations")
      .update({
        status: "complete",
        output_url: output.url,
        output_type: output.type,
        completed_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .select("*")
      .single();

    return serialize(updated ?? row);
  } catch (error) {
    const message = errorMessage(error);
    if (/queue status lookup failed|fetch|network/i.test(message)) return serialize(row);

    const { data: updated } = await admin
      .from("studio_generations")
      .update({
        status: "failed",
        error_log: message.slice(0, 10000),
        completed_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .select("*")
      .single();

    return serialize(updated ?? row);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const admin = createAdminClient();
  const url = new URL(req.url);
  const webhookBase =
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/jewelry-swap?callback=1&generationId=`;

  // fal webhook callback (no auth; the generation id is the shared secret).
  if (url.searchParams.get("callback") === "1") {
    const generationId = url.searchParams.get("generationId");
    if (!generationId) return json({ error: "Missing generationId" }, 400);

    try {
      const body = await req.json().catch(() => ({})) as {
        request_id?: string;
        status?: string;
        payload?: unknown;
        error?: string;
      };

      const { data: row } = await admin
        .from("studio_generations")
        .select("*")
        .eq("id", generationId)
        .maybeSingle();
      if (!row) return json({ error: "Generation not found" }, 404);
      if (body.request_id && row.provider_request_id && body.request_id !== row.provider_request_id) {
        return json({ error: "Request mismatch" }, 400);
      }
      if (row.status === "complete" || row.status === "failed") return json({ ok: true });

      const output = extractOutput(body.payload);
      const failed = String(body.status ?? "").toUpperCase() === "ERROR" || (!output && !!body.error);

      if (failed || !output) {
        if (!body.error && !failed) return json({ ok: true });
        await admin
          .from("studio_generations")
          .update({
            status: "failed",
            error_log: String(body.error ?? "Generation failed").slice(0, 10000),
            completed_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        return json({ ok: true });
      }

      await admin
        .from("studio_generations")
        .update({
          status: "complete",
          output_url: output.url,
          output_type: output.type,
          completed_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      return json({ ok: true });
    } catch (error) {
      console.error("jewelry-swap callback failed:", errorMessage(error));
      return json({ error: errorMessage(error) }, 500);
    }
  }

  try {
    const access = await requireBuilderUser(req, admin);
    const user = access.user;
    const body = await req.json().catch(() => ({})) as Record<string, any>;
    const action = String(body.action ?? "swap_frame");

    if (action === "swap_frame") {
      const generation = await startSwapFrame(admin, {
        userId: user.id,
        sourceFrameUrl: body.sourceFrameUrl,
        pieces: body.pieces ?? [],
        frameIndex: body.frameIndex,
        frameTime: body.frameTime,
        aspectRatio: body.aspectRatio,
        resolution: body.resolution,
        extraPrompt: body.extraPrompt,
        webhookBase,
      });
      return json({ generation });
    }

    if (action === "reconstruct") {
      const generation = await startReconstruction(admin, {
        userId: user.id,
        frameUrls: body.frameUrls ?? [],
        model: body.model,
        duration: body.duration,
        resolution: body.resolution,
        aspectRatio: body.aspectRatio,
        generateAudio: body.generateAudio,
        extraPrompt: body.extraPrompt,
        webhookBase,
      });
      return json({ generation });
    }

    if (action === "animate_frame") {
      const generation = await startAnimateFrame(admin, {
        userId: user.id,
        imageUrl: body.imageUrl ?? body.sourceFrameUrl,
        frameIndex: body.frameIndex,
        frameTime: body.frameTime,
        webhookBase,
      });
      return json({ generation });
    }

    // Recent Jewelry Swap video generations for the caller — powers the Library
    // and lets a refreshed page re-attach to in-flight jobs.
    if (action === "list") {
      const limit = Math.min(60, Math.max(1, Number(body.limit ?? 24)));
      const { data: rows, error } = await admin
        .from("studio_generations")
        .select("*")
        .eq("user_id", user.id)
        .eq("kind", "video")
        .order("created_at", { ascending: false })
        .limit(120);
      if (error) throw new Error(error.message);

      const jewelryRows = (rows ?? [])
        .filter((row: any) => {
          const payload = (row.input_payload ?? {}) as Record<string, unknown>;
          return payload.feature === "jewelry-swap" &&
            (payload.stage === "reconstruction" || payload.stage === "frame_animation");
        })
        .slice(0, limit);

      const generations = await Promise.all(
        jewelryRows.map((row: any) =>
          row.status === "queued" || row.status === "running"
            ? syncRow(admin, row)
            : Promise.resolve(serialize(row)),
        ),
      );
      return json({ generations });
    }

    if (action === "status") {
      const ids = (Array.isArray(body.generationIds) ? body.generationIds : [body.generationId])
        .map((id: unknown) => String(id ?? "").trim())
        .filter(Boolean);
      if (!ids.length) throw new Error("generationIds is required");

      const { data: rows, error } = await admin
        .from("studio_generations")
        .select("*")
        .eq("user_id", user.id)
        .in("id", ids);
      if (error) throw new Error(error.message);

      const generations = await Promise.all((rows ?? []).map((row) => syncRow(admin, row)));
      return json({ generations });
    }

    if (action === "cancel") {
      const ids = (Array.isArray(body.generationIds) ? body.generationIds : [body.generationId])
        .map((id: unknown) => String(id ?? "").trim())
        .filter(Boolean);
      if (!ids.length) throw new Error("Select at least one generation to cancel");

      const { error } = await admin
        .from("studio_generations")
        .update({
          status: "canceled",
          error_log: "Canceled by the user",
          completed_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .in("id", ids)
        .in("status", ["queued", "running"]);
      if (error) throw new Error(error.message);
      return json({ canceled: ids.length });
    }

    if (action === "delete") {
      const ids = (Array.isArray(body.generationIds) ? body.generationIds : [body.generationId])
        .map((id: unknown) => String(id ?? "").trim())
        .filter(Boolean);
      if (!ids.length) throw new Error("Select at least one generation to delete");

      const { error } = await admin
        .from("studio_generations")
        .delete()
        .eq("user_id", user.id)
        .in("id", ids);
      if (error) throw new Error(error.message);
      return json({ deleted: ids.length });
    }

    throw new Error(`Unsupported action: ${action}`);
  } catch (error) {
    const message = errorMessage(error);
    const status = /access required|authorization|Authentication|bearer/i.test(message) ? 401 : 400;
    return json({ error: message }, status);
  }
});
