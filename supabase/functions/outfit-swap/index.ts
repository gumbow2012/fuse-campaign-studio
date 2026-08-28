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
 * Outfit Swap: per-frame nano-banana wardrobe edits + one Seedance
 * reference-to-video reconstruction. Additive — reuses `studio_generations`
 * and never touches the template runner/executor.
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

type GarmentReference = { url?: string; type?: string; label?: string; person?: string };

/**
 * Wardrobe edit prompt: the source frame is authoritative, only the supplied
 * clothing categories change.
 */
function buildSwapPrompt(args: {
  garments: GarmentReference[];
  person: string;
  extra?: string;
}) {
  const targetPhrase = (value: string) =>
    value.toLowerCase() === "everyone"
      ? "on every person in the frame"
      : "on the main subject only, leaving all other people untouched";

  const fallbackTarget = String(args.person ?? "Main Subject").trim() || "Main Subject";

  // Each product carries its own target; there is no global subject selection.
  const instructions = args.garments
    .map((garment, index) => {
      const refNumber = index + 2; // image 1 is the source frame
      const type = String(garment.type ?? "garment").trim() || "garment";
      const label = String(garment.label ?? "").trim();
      const person = String(garment.person ?? "").trim() || fallbackTarget;
      return `Replace the ${type.toLowerCase()} with the product shown in reference image ${refNumber}${
        label ? ` (${label})` : ""
      } ${targetPhrase(person)}.`;
    })
    .join(" ");

  const target = args.garments.some(
    (garment) => String(garment.person ?? fallbackTarget).toLowerCase() === "everyone",
  )
    ? "Leave every person and garment not named above exactly as in image 1."
    : "Leave every other person in the frame exactly as in image 1.";

  const categories = args.garments
    .map((garment) => String(garment.type ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(", ");

  return [
    "Use image 1 as the exact primary image. This is a precise edit, not a redesign.",
    "Preserve the person's identity, face, hair, skin tone, body proportions, pose, hands, and expression exactly.",
    "Preserve the camera angle, framing, background, environment, and lighting exactly.",
    `Modify only these clothing categories: ${categories || "the supplied garments"}.`,
    instructions,
    "Match each product's exact colors, graphics, logos, text, materials, construction, and fit as shown in its reference image.",
    "Preserve all unrelated clothing, jewelry, shoes, and accessories that were not supplied as references.",
    target,
    String(args.extra ?? "").trim(),
  ].filter(Boolean).join(" ");
}

/** Reconstruction prompt for the Seedance reference-to-video pass. */
function buildReconstructionPrompt(args: { garments: GarmentReference[]; extra?: string }) {
  const wardrobe = args.garments
    .map((garment) => String(garment.type ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(", ");

  return [
    "Recreate the source video exactly: same subject, same motion, same action, same timing, same camera movement and framing, same environment and lighting.",
    `The subject wears exactly the replacement wardrobe shown in the reference frames${
      wardrobe ? ` (${wardrobe})` : ""
    }, consistently in every shot.`,
    "Keep logos, colors, graphics, materials, and garment construction consistent across the whole clip.",
    "Do not change the identity, face, environment, or any clothing that was not replaced.",
    "Same video, new clothes.",
    String(args.extra ?? "").trim(),
  ].filter(Boolean).join(" ");
}

/**
 * PHASE 5 — resolves the Phase 4 model choices into identity reference packs.
 * Avatar/cast identities are read from `avatar_profiles` through the shared
 * identity-lock helpers; `upload` models use their loose project-scoped refs.
 */
async function resolveSubjectModels(
  admin: AdminClient,
  userId: string,
  assignment: Record<string, any> | null | undefined,
): Promise<Record<string, AssemblySubjectModel>> {
  const entries = Object.entries(assignment ?? {});
  if (!entries.length) return {};

  const avatarIds = Array.from(
    new Set(
      entries
        .filter(([, model]) => {
          const source = String(model?.modelSource ?? "").toLowerCase();
          return source === "avatar" || source === "cast";
        })
        .map(([, model]) => String(model?.avatarId ?? "").trim())
        .filter(Boolean),
    ),
  );

  const avatars = new Map<string, any>();
  if (avatarIds.length) {
    const { data: rows } = await admin
      .from("avatar_profiles")
      .select("*")
      .in("id", avatarIds);
    for (const row of rows ?? []) avatars.set(String(row.id), row);
  }

  const resolved: Record<string, AssemblySubjectModel> = {};
  for (const [subjectId, model] of entries) {
    const source = String(model?.modelSource ?? "keep_original").toLowerCase();
    if (source === "avatar" || source === "cast") {
      const row = avatars.get(String(model?.avatarId ?? "").trim());
      if (!row) {
        // Unknown/inaccessible avatar → fall back to keeping the source person.
        resolved[subjectId] = { modelSource: "keep_original" };
        continue;
      }
      resolved[subjectId] = {
        modelSource: source as "avatar" | "cast",
        avatarId: String(row.id),
        label: typeof row.name === "string" ? row.name : null,
        identityRefs: identityReferencePack(row),
        identityAngles: (readConsistencyProfile(row).approved ?? {}) as Record<string, string | null>,
      };
      continue;
    }
    if (source === "upload") {
      const refs = Array.isArray(model?.uploadedRefUrls)
        ? model.uploadedRefUrls.map((url: unknown) => String(url ?? "").trim()).filter(Boolean)
        : [];
      resolved[subjectId] = refs.length
        ? { modelSource: "upload", label: "uploaded model reference", identityRefs: refs }
        : { modelSource: "keep_original" };
      continue;
    }
    resolved[subjectId] = { modelSource: "keep_original" };
  }
  return resolved;
}

async function startSwapFrame(admin: AdminClient, args: {
  userId: string;
  sourceFrameUrl: string;
  garments: GarmentReference[];
  person: string;
  frameIndex?: number;
  frameTime?: number;
  aspectRatio?: string;
  resolution?: string;
  extraPrompt?: string;
  webhookBase: string;
  /** PHASE 5 (optional) — Phase 1/3/4 context for this specific frame. */
  frameSubjects?: AssemblyFrameSubject[];
  castAssignment?: Record<string, any>;
  modelAssignment?: Record<string, any>;
}) {
  const sourceFrameUrl = String(args.sourceFrameUrl ?? "").trim();
  if (!sourceFrameUrl) throw new Error("A source frame is required");

  const garments = (Array.isArray(args.garments) ? args.garments : [])
    .filter((garment) => String(garment?.url ?? "").trim());
  if (!garments.length) throw new Error("Add at least one clothing reference");

  // ---- LEGACY PATH (unchanged): 1 subject, keep_original, no rear back-design.
  // REF order matters: the source frame is always image 1.
  let imageUrls = cleanUrls([sourceFrameUrl, ...garments.map((garment) => garment.url)]);
  let prompt = buildSwapPrompt({
    garments,
    person: String(args.person ?? "Everyone"),
    extra: args.extraPrompt,
  });
  let assembly: AssembledFrameEdit | null = null;

  // ---- PHASE 5 FUSED PATH: source frame + identity refs + orientation-correct
  // garment refs → ONE nano-banana edit. Never two sequential edits.
  const resolvedModels = await resolveSubjectModels(admin, args.userId, args.modelAssignment);
  const needsFused = requiresFusedAssembly({
    frameSubjects: args.frameSubjects ?? [],
    garments: garments as AssemblyGarment[],
    castAssignment: args.castAssignment ?? {},
    modelAssignment: resolvedModels,
  });

  if (needsFused) {
    assembly = assembleFrameEdit({
      sourceFrameUrl,
      frameSubjects: args.frameSubjects ?? [],
      garments: garments as AssemblyGarment[],
      castAssignment: args.castAssignment ?? {},
      modelAssignment: resolvedModels,
      maxReferenceImages: MAX_REFERENCE_IMAGES,
      extraPrompt: args.extraPrompt,
      identityAuthorityBlock: IDENTITY_AUTHORITY_BLOCK,
    });
    imageUrls = assembly.imageUrls;
    prompt = assembly.prompt;

    // LIVE GENERATION VERIFICATION-PENDING: this assembled payload is logged so
    // the fused contract can be inspected without triggering a paid provider run.
    console.log(
      "[outfit-swap][phase5][fused-assembly][live-verification-pending]",
      JSON.stringify({
        frame_index: Number(args.frameIndex ?? 0),
        image_url_count: imageUrls.length,
        references: assembly.references.map((ref) => ({
          index: ref.index,
          role: ref.role,
          subject_id: ref.subjectId ?? null,
          garment_id: ref.garmentId ?? null,
        })),
        plan: assembly.plan,
        prompt_length: prompt.length,
      }).slice(0, 10000),
    );
  }


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
          feature: "outfit-swap",
          stage: "frame_swap",
          source_frame_url: sourceFrameUrl,
          frame_index: Number(args.frameIndex ?? 0),
          frame_time: Number(args.frameTime ?? 0),
          person: String(args.person ?? "Everyone"),
          garments,
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
  garments: GarmentReference[];
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
  const prompt = buildReconstructionPrompt({
    garments: Array.isArray(args.garments) ? args.garments : [],
    extra: args.extraPrompt,
  });

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
          feature: "outfit-swap",
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
  "Slow cinematic dolly in toward the subject. Preserve the exact subject identity, outfit, garment graphics, logos, colors, pose, environment, lighting, framing and overall composition. Natural subtle body movement only. Realistic fabric movement and natural micro-motion. No major subject movement, no outfit changes, no camera orbit, no scene changes, no identity drift. Smooth realistic camera motion.";

const ANIMATE_MODEL_KEY = "kling-3.0-pro";
const ANIMATE_DURATION = 3;

/**
 * Optional Option A stage: animate one approved swapped frame with Kling 3.0.
 * Fully independent of the Seedance reconstruction — these clips are never fed
 * back into it.
 */
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
          feature: "outfit-swap",
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
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/outfit-swap?callback=1&generationId=`;

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
      console.error("outfit-swap callback failed:", errorMessage(error));
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
        garments: body.garments ?? [],
        person: body.person ?? "Everyone",
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
        garments: body.garments ?? [],
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

    // Recent Outfit Swap video generations for the caller — powers the Library
    // and lets a refreshed page re-attach to in-flight jobs.
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

      const outfitSwapRows = (rows ?? [])
        .filter((row: any) => {
          const payload = (row.input_payload ?? {}) as Record<string, unknown>;
          return payload.feature === "outfit-swap" &&
            (payload.stage === "reconstruction" || payload.stage === "frame_animation");
        })
        .slice(0, limit);

      // Refresh anything still in flight so the client gets truth on first load.
      const generations = await Promise.all(
        outfitSwapRows.map((row: any) =>
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

      // The provider job may already be in flight; we simply stop tracking it.
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
