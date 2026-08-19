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
  IMAGE_MODEL_ALT,
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
    imageModel: payload.image_model === "nb2" ? "nb2" : payload.image_model === "pro" ? "pro" : null,
    preferredRole: typeof payload.preferred_role === "string" ? payload.preferred_role : null,
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

/** A single labeled reference image of a piece. */
type JewelryReference = { url: string; role?: string | null; cad?: boolean };

type JewelryPiece = {
  urls?: unknown;
  url?: string;
  /** Preferred: labeled references ({url, role, cad}). `urls` stays supported. */
  references?: unknown;
  type?: string;
  metal?: string;
  stone?: string;
  quality?: string;
  dimensions?: JewelryDimensions | null;
  cad?: boolean;
  person?: string;
  notes?: string;
};

/** Normalized labeled references for a piece, in supplied order. */
function pieceReferences(piece: JewelryPiece): JewelryReference[] {
  const refs: JewelryReference[] = [];
  const raw = Array.isArray(piece.references) ? piece.references : [];
  for (const entry of raw) {
    const url = String((entry as any)?.url ?? "").trim();
    if (!url) continue;
    refs.push({
      url,
      role: String((entry as any)?.role ?? "").trim() || null,
      cad: (entry as any)?.cad === true || piece.cad === true,
    });
  }
  if (refs.length) return refs;

  const list = Array.isArray(piece.urls) ? piece.urls : piece.url ? [piece.url] : [];
  return list
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean)
    .map((url) => ({ url, role: null, cad: piece.cad === true }));
}

function pieceUrls(piece: JewelryPiece) {
  return pieceReferences(piece).map((ref) => ref.url);
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
  "CAD AUTHORITY ACTIVE. The CAD-flagged reference(s) are the HIGHEST-PRIORITY GEOMETRY AUTHORITY and outrank every photographic reference for geometry: silhouette, dimensions, proportions, depth, thickness, bail and connector/hinge geometry, relative scale, cutouts, negative space, borders, raised and recessed surfaces, front/back/side structure, stone-seat locations, stone count and stone layout. Geometry must NEVER be reinvented, softened or averaged from photos when a CAD reference exists. Photographic references then control ONLY materials: metal color and alloy, polish, surface finish, diamond/stone appearance and scintillation, reflections and micro-texture. Render the CAD as a physically manufactured real-world piece, preserving every structural feature exactly.";

/** Targeted corrective lines appended when the user regenerates with a reason. */
const FAILURE_CORRECTIONS: Record<string, string> = {
  "wrong angle":
    "CORRECTION: the previous attempt used the wrong viewing angle. Re-derive the camera angle, yaw/pitch/roll and viewing direction strictly from SOURCE_FRAME, and reproduce the corresponding region of the replacement piece as seen from that exact angle.",
  "wrong crop":
    "CORRECTION: the previous attempt reframed the shot. Match SOURCE_FRAME's crop, zoom and framing exactly — same visible portion of the piece, same partiality, no zoom-out to reveal the whole piece.",
  "wrong bail":
    "CORRECTION: the previous attempt produced an inaccurate bail; strictly follow the uploaded bail/CAD references and preserve the exact replacement bail geometry — do not substitute or redesign it.",
  "wrong stones/details":
    "CORRECTION: the previous attempt got the stones wrong. Reproduce the reference's exact stone layout, cuts, sizes, density and setting geometry — no invented, added, removed or resized stones.",
  "wrong lettering/logo":
    "CORRECTION: the previous attempt got the lettering/logo wrong. Reproduce the reference's exact letterforms, symbols, spacing and relief, at SOURCE_FRAME's rotation — never rotate lettering upright for legibility.",
  "wrong size":
    "CORRECTION: the previous attempt mis-scaled the piece. Keep the replacement's real physical proportions from the references, occupying approximately the same region of the frame the original jewelry occupied.",
  "hallucinated geometry":
    "CORRECTION: the previous attempt invented structure. Do not add stones, prongs, hinges, engraving, lettering or decorative elements that no reference shows; infer minimally and only where unavoidable.",
  "wrong chain interaction":
    "CORRECTION: the previous attempt broke the chain interaction. Preserve SOURCE_FRAME's chain placement, path, tension, contact and occlusion exactly, and attach the replacement at its own reference attachment point.",
  other:
    "CORRECTION: the previous attempt was inaccurate. Re-read SOURCE_FRAME for the shot and the references for the object's construction, and follow both strictly.",
};

function failureCorrection(reason: unknown) {
  const key = String(reason ?? "").trim().toLowerCase();
  if (!key) return null;
  return FAILURE_CORRECTIONS[key] ?? `${FAILURE_CORRECTIONS.other} Reported issue: "${String(reason).trim()}".`;
}

/**
 * Precision jewelry replacement prompt. Image 1 is always the SOURCE_FRAME and
 * is the absolute authority for the photograph; reference images 2..N are the
 * JEWELRY_REFERENCES and are the absolute authority only for the replacement
 * object's identity and construction.
 */
function buildJewelryPrompt(args: {
  pieces: JewelryPiece[];
  extra?: string;
  preferredRole?: string | null;
  failureReason?: string | null;
}) {
  let cursor = 2; // image 1 is the source frame
  const lines: string[] = [];
  const refLabels: string[] = [];
  const cadRefNums: number[] = [];
  let cadActive = false;

  for (const piece of args.pieces) {
    const refs = pieceReferences(piece);
    if (!refs.length) continue;
    const refNums: number[] = [];
    for (const ref of refs) {
      const num = cursor++;
      refNums.push(num);
      refLabels.push(`reference image ${num} = ${ref.role ? ref.role : "Unlabeled view"}`);
      if (ref.cad) {
        cadActive = true;
        cadRefNums.push(num);
      }
    }
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

  const preferred = String(args.preferredRole ?? "").trim();
  const correction = failureCorrection(args.failureReason);

  const prompt = [
    "Use SOURCE_FRAME (image 1) as the ABSOLUTE authority for the photograph. This is a precise jewelry replacement, not a redesign or a product shot. Do NOT reframe or recreate the photograph.",
    "",
    "Preserve EXACTLY from SOURCE_FRAME: camera position, camera angle, perspective, crop, zoom level, composition, depth of field, focus plane, lighting, background, chain placement, and the jewelry's position, orientation, rotation, tilt, visible percentage, occlusion and scale.",
    "",
    "Replace ONLY the original jewelry piece with the piece defined by the JEWELRY_REFERENCES. The references are the ABSOLUTE authority for the replacement object's identity and construction: silhouette, lettering, symbols/logos, stone locations, stone cuts, stone sizes, stone density, metal geometry, bail, bail opening, hinges, connectors, bezels, prongs, edges, thickness, front, side and back construction, raised and recessed surfaces, and structural proportions.",
    "",
    "CRITICAL — do NOT make a product shot. Render ONLY the portion of the replacement jewelry that the exact source camera would physically see:",
    "- If SOURCE_FRAME is an extreme macro of only the bail, output an extreme macro of ONLY the replacement bail.",
    "- If SOURCE_FRAME shows only an edge, show only the corresponding replacement edge.",
    "- If SOURCE_FRAME shows a partial pendant, keep the replacement equally partial.",
    "- If the piece is rotated ~25°, keep the replacement rotated ~25°. Composition beats logo readability — never rotate lettering upright for legibility.",
    "- Preserve the same focus/DOF, and any foreground occlusion.",
    "The final image should align closely if overlaid on SOURCE_FRAME. Only the jewelry identity changes — never the shot.",
    "",
    "BOUNDING-BOX / SCALE LOCK: the replacement occupies approximately the same region of the frame the original jewelry occupied; for partial shots, the same partial region. Never enlarge the piece to showcase detail.",
    "",
    "BAIL / CONNECTOR LOCK: treat MAIN BODY / BAIL / CONNECTOR-HINGE / CHAIN as distinct components. The replacement's bail is the SAME physical bail in every frame, using the reference's own bail geometry (outer silhouette, inner opening, width, height, thickness, stone coverage, edge thickness, attachment point, hinge). Position and rotate it to fit the source — but NEVER morph the replacement bail toward the original piece's bail, and never resize it to match the original's bail. Geometry comes from the REFERENCE; the SOURCE controls only camera + placement. (If the original bail is 30mm and the replacement is 20mm, keep the replacement's real 20mm geometry, just placed and rotated correctly.)",
    "",
    "DO NOT HALLUCINATE: if the visible source region needs a part of the piece that no reference shows, infer minimally. Never invent extra stones, prongs, hinges, engraving, lettering or decorative structures. If the source region is too abstract to identify confidently, reproduce the closest corresponding macro region rather than inventing a full front-facing pendant.",
    "",
    "GEOMETRY FIDELITY: STRICT. Source composition dominates, geometry cannot drift, and there is no beautification, reframing, added visibility or invented detail.",
    "",
    `PIECES: ${lines.join(" ")}`,
    refLabels.length ? "" : null,
    refLabels.length ? `REFERENCE VIEWS: ${refLabels.join("; ")}.` : null,
    refLabels.length
      ? "Identify which region of the piece SOURCE_FRAME actually shows, then reproduce that region using the best-matching labeled reference above. Use the other labeled references only to stay consistent with the same physical object."
      : null,
    preferred ? "" : null,
    preferred
      ? `PREFERRED ANGLE REFERENCE: prioritize the reference labeled "${preferred}" as the primary geometry match for this frame, while still obeying SOURCE_FRAME for camera, crop and placement.`
      : null,
    "",
    "Do NOT redesign or simplify the jewelry. Do NOT invent, add, remove, or resize stones. Do NOT change stone shapes or randomize stone placement. Do NOT modify any jewelry that was not listed. Round stones stay round and individually seated; baguettes keep their long rectangular orientation; marquise keep pointed ends; princess stay square; emerald cuts keep the stepped rectangular form. Preserve mosaic / reverse-mosaic setting patterns — never flatten them into generic pavé.",
    "",
    "If a piece is a pendant only, replace only the pendant and keep the existing chain. If a chain only, replace only the chain and keep the existing pendant. If \"Pendant + Chain\", replace both.",
    "",
    "Every unrelated detail from SOURCE_FRAME — subject identity, skin, hair, clothing, hands, environment — must be preserved exactly. Respect layering: whatever was in front stays in front. Match the source lighting, contact shadows and reflections.",
    cadActive ? "" : null,
    cadActive
      ? (cadRefNums.length
        ? `${CAD_AUTHORITY_TEXT} CAD reference image(s): ${refListPhrase(cadRefNums)}.`
        : CAD_AUTHORITY_TEXT)
      : null,
    correction ? "" : null,
    correction,
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
  /** "pro" = Nano Banana Pro (default), "nb2" = Nano Banana 2 comparison run. */
  imageModel?: string;
  preferredRole?: string | null;
  failureReason?: string | null;
  webhookBase: string;
}) {
  const sourceFrameUrl = String(args.sourceFrameUrl ?? "").trim();
  if (!sourceFrameUrl) throw new Error("A source frame is required");

  const pieces = (Array.isArray(args.pieces) ? args.pieces : [])
    .filter((piece) => pieceUrls(piece ?? {}).length);
  if (!pieces.length) throw new Error("Add at least one jewelry reference");

  const imageModelKey = String(args.imageModel ?? "pro").trim().toLowerCase() === "nb2"
    ? "nb2"
    : "pro";
  const endpointId = imageModelKey === "nb2" ? IMAGE_MODEL_ALT : IMAGE_MODEL;

  // REF order matters: the source frame is always image 1.
  const imageUrls = cleanUrls([
    sourceFrameUrl,
    ...pieces.flatMap((piece) => pieceUrls(piece)),
  ]);
  const prompt = buildJewelryPrompt({
    pieces,
    extra: args.extraPrompt,
    preferredRole: args.preferredRole ?? null,
    failureReason: args.failureReason ?? null,
  });

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
      endpointId,
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
          stage: "frame_swap",
          image_model: imageModelKey,
          image_endpoint: endpointId,
          geometry_fidelity: "strict",
          preferred_role: args.preferredRole ?? null,
          failure_reason: args.failureReason ?? null,
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

/* ========================= ANIMATE: adaptive shot system =====================
 * Universal luxury-jewelry motion-control cinematography. Every prompt is
 * composed from shared "locks" (first frame, geometry, camera-only motion,
 * optics, negatives) plus one shot recipe. Nothing here is piece-specific:
 * the language only ever refers to what the approved frame actually shows.
 * ---------------------------------------------------------------------------*/

const LOCK_FIRST_FRAME =
  "Use the provided approved image as the exact first frame of the shot. The first frame must match the source image pixel-for-pixel in composition, crop, framing, colour and lighting.";

const LOCK_OBJECT =
  "The jewelry is physically locked in place. All primary motion is produced exclusively by the camera, lens focus and moving studio lights. Preserve the approved first-frame geometry throughout the entire shot.";

const LOCK_GEOMETRY =
  "Preserve the object identity, geometry and proportions exactly, including whichever of these features are actually visible in the first frame: stones, prongs, bezels, channels, lettering, logos, engraving, metal surfaces, clasp, links, settings, crown, shank, band, case, hinge, connector, chain, overall arrangement, composition, background and surface. Never add, remove, redesign or invent any feature that is not already visible in the first frame.";

const LOCK_CAMERA_LANGUAGE =
  "All movement is camera movement: the CAMERA performs the move, the first-frame object remains rigid and unchanged, and any motion blur is produced exclusively by camera movement. The object itself never rotates, spins, sways, floats or reframes itself.";

const OPTICS_DIAMONDS =
  "If faceted stones are visible in the first frame, render physically realistic brilliance, scintillation, internal refraction, total internal reflection, spectral dispersion, crown reflections, table flashes and facet-dependent highlights. Individual stones respond INDEPENDENTLY to the changing camera angle, light angle and facet orientation, with restrained white, blue, cyan, green, yellow, orange, violet and red flashes. Never uniform or synchronized blinking, never all stones flashing at once, no glitter overlays, no sparkle particles, no star fields, no glowing stones, no excessive bloom.";

const OPTICS_METAL =
  "Keep the visible metal and its exact colour and finish unchanged. The moving camera and moving lights create realistic specular travel, edge reflection and polished-highlight movement across the real metal surface — never liquid chrome, never a material change.";

const NEGATIVES_BASE =
  "Negative: no morphing, no geometry drift, no object deformation, no changing stones, no disappearing stones, no new stones, no changed logos or lettering or engraving, no melting metal, no floating, no random object rotation, no fake glitter, no sparkle particles, no synchronized sparkle, no excessive bloom, no star filter, no recentering, no revealing unsupported unseen geometry.";

const NEGATIVES_STEADY = "no camera shake, no arbitrary zoom-out, no scene change.";
const NEGATIVES_FAST = "no camera shake beyond the intended move, no scene change, no AI morph transition.";

const WHIP_LINE =
  "The camera performs the rapid whip-pan while the jewelry remains completely stationary. Motion blur is produced exclusively by camera movement.";

type ShotEnergy = "slow" | "medium" | "high";

type ShotSpec = {
  key: string;
  label: string;
  energy: ShotEnergy;
  summary: { shot: string; camera: string; focus: string; light: string; end: string };
  body: string;
  /** true when the shot is safe for literally any approved frame. */
  safe?: boolean;
};

const SHOT_LIBRARY: ShotSpec[] = [
  {
    key: "hero_push",
    label: "Precision Hero Push",
    energy: "slow",
    safe: true,
    summary: {
      shot: "Precision hero push on the piece as framed",
      camera: "Slow robotic dolly forward, 5–10% approach, optional micro rise",
      focus: "Held on the main visible feature, gentle focus breathing",
      light: "Studio key drifts slowly, reflections travel across the surfaces",
      end: "Settles slightly closer on the same composition",
    },
    body:
      "The CAMERA performs an extremely slow, robotic hero push straight toward the piece, approaching only 5–10% closer over the whole shot, with an optional almost imperceptible arc or rise. The change is true perspective from physical camera travel, not a digital zoom. Reflections travel across the metal and any visible stones flash independently as the camera angle changes.",
  },
  {
    key: "micro_orbit",
    label: "Micro Orbit / Parallax Reveal",
    energy: "slow",
    summary: {
      shot: "Micro orbit revealing the existing thickness and side profile",
      camera: "Camera arcs 3–10° around the piece, object does not rotate",
      focus: "Locked on the nearest visible surface, shallow depth of field",
      light: "Highlights slide across edges as the viewing angle changes",
      end: "Stops inside the same near-frontal view",
    },
    body:
      "The CAMERA performs a tiny motion-control orbit of no more than 3–10° around the piece, just enough to reveal the dimensional thickness and side profile that are already visible in the first frame. The object does not rotate — only the camera moves. Never a large orbit, and never reveal geometry the first frame does not support.",
  },
  {
    key: "extreme_macro",
    label: "Extreme 1:1 Macro Diamond Scan",
    energy: "slow",
    safe: true,
    summary: {
      shot: "Extreme 1:1 macro scan across the visible stone or surface field",
      camera: "Macro camera glides only 2–3 cm across the surface",
      focus: "Very shallow depth of field, optional rack from foreground to deeper stones",
      light: "Small moving jewelry lights trigger independent facet response",
      end: "Ends still inside the macro detail, never pulling back",
    },
    body:
      "A true 1:1 macro shot. The CAMERA glides only 2–3 centimetres across the surface of the piece as framed, holding a very shallow depth of field, with an optional slow rack focus from the foreground detail to slightly deeper detail. NEVER pull back, never reveal the whole object, never reframe: the shot lives entirely inside the macro detail already visible in the first frame.",
  },
  {
    key: "surface_scan",
    label: "Surface-Contour Track",
    energy: "slow",
    summary: {
      shot: "Motion-control probe following the existing surface contour",
      camera: "Camera tracks along the visible geometry, matching its curve",
      focus: "Continuous focus on the travelling contour",
      light: "Raking light reveals relief, engraving and edges",
      end: "Completes the contour pass in tight detail",
    },
    body:
      "The CAMERA behaves like a motion-control probe following the existing surface geometry visible in the first frame — lettering, engraving, a logo, a band, a bezel, a link pattern or a curved surface — tracking along that contour at a slow, mechanical speed. The path is dictated by the geometry that is already there; nothing is straightened, re-shaped or added.",
  },
  {
    key: "edge_glide",
    label: "Edge / Sidewall Trail",
    energy: "medium",
    summary: {
      shot: "Low-angle lateral trail along the visible edge or sidewall",
      camera: "Macro slider parallel to the edge, strong near-field parallax",
      focus: "Shallow, riding the edge as it passes",
      light: "Specular line travels along the edge and any side stones",
      end: "Exits laterally, still on the side composition",
    },
    body:
      "A low-angle lateral macro slider move: the CAMERA travels parallel to the visible edge, sidewall or case profile of the piece, producing strong parallax between the near edge and the background. Keep the side composition of the first frame — do NOT rotate around to a front view and do not reveal an unseen face of the object.",
  },
  {
    key: "rack_focus",
    label: "Rack-Focus Reveal",
    energy: "slow",
    safe: true,
    summary: {
      shot: "Rack-focus reveal across the existing depth planes",
      camera: "Barely-moving camera, a few millimetres of drift",
      focus: "Deliberate focal path with realistic focus breathing",
      light: "Steady studio light, reflections shift subtly",
      end: "Rests with the main feature in crisp focus",
    },
    body:
      "The CAMERA barely moves — a few millimetres of drift at most. All interest comes from a meaningful focal path across the depth planes already present in the frame, with realistic focus breathing and a shallow depth of field: one plane falls off as another resolves into crisp detail.",
  },
  {
    key: "chain_track",
    label: "Chain / Link Track",
    energy: "medium",
    summary: {
      shot: "Macro track along the visible link pathway",
      camera: "Camera follows the chain or link run toward the main feature",
      focus: "Shallow, riding the links as they pass",
      light: "Highlights roll link to link as the camera advances",
      end: "Arrives at the main feature or continues abstractly",
    },
    body:
      "The CAMERA tracks along the visible chain, link or bracelet run exactly as it lies in the first frame, moving toward the main feature (or continuing abstractly past it if no feature is in reach). Every link stays fixed in place — the sense of travel comes only from the camera advancing along the existing pathway.",
  },
  {
    key: "overhead_descent",
    label: "Overhead Descent",
    energy: "slow",
    summary: {
      shot: "Slow overhead descent onto the arrangement as laid out",
      camera: "Physical descent near the existing overhead orientation, tiny diagonal drift",
      focus: "Held on the hero item in the arrangement",
      light: "Moving soft light produces independent stone response",
      end: "Settles closer above the same layout",
    },
    body:
      "The CAMERA performs a slow physical descent from directly above, staying close to the existing overhead orientation, with an optional tiny diagonal drift. The layout is untouched: no piece rotates, shifts or levitates, and the arrangement stays exactly as composed in the first frame.",
  },
  {
    key: "low_creep",
    label: "Low-Surface Creep",
    energy: "slow",
    summary: {
      shot: "Low creep across the resting surface toward the piece",
      camera: "Camera low to the surface, moving slowly toward or along the object",
      focus: "Shallow, foreground surface texture soft in front",
      light: "Grazing light reveals surface grain and specular travel",
      end: "Stops low and close, the piece still touching the surface",
    },
    body:
      "The CAMERA sits low on the resting surface — leather, velvet, glass, stone, metal or fabric as visible — and creeps slowly toward or along the piece, with foreground surface texture passing softly through the near field and a shallow depth of field. The piece remains in contact with its surface at all times: no floating, no lifting.",
  },
  {
    key: "diagonal_parallax",
    label: "Diagonal Parallax Slide",
    energy: "medium",
    summary: {
      shot: "Diagonal parallax slide across the layered composition",
      camera: "Slight forward-and-sideways camera move, no large orbit",
      focus: "Holds the hero plane while layers separate",
      light: "Reflections sweep as the viewing angle shifts",
      end: "Ends offset from the start with added dimension",
    },
    body:
      "The CAMERA performs a slight combined forward-and-sideways (or back-and-sideways) move so the layered elements of the composition separate dimensionally through parallax. The move is small and controlled — never a large orbit, never a new viewing angle that would require unseen geometry.",
  },
  {
    key: "micro_pullback",
    label: "Micro Pull-Back",
    energy: "slow",
    summary: {
      shot: "Controlled micro pull-back from the tight framing",
      camera: "Dolly back 5–10% only, no reveal beyond the frame's support",
      focus: "Stays locked on the main visible feature",
      light: "Highlights recede naturally along the surfaces",
      end: "Settles marginally wider on the same composition",
    },
    body:
      "The CAMERA performs a controlled dolly back of only 5–10% from the already-tight framing, and only as far as the frame genuinely supports. Do NOT reveal unseen geometry, new context or additional pieces — the wider framing must remain physically consistent with the first frame.",
  },
  {
    key: "whip_transition",
    label: "Hero → Whip Transition",
    energy: "high",
    summary: {
      shot: "Hero hold into a fast camera whip exit",
      camera: "Slow push, then a rapid camera whip-pan with slight optical roll",
      focus: "Sharp on the hero feature, dissolving into directional blur",
      light: "Specular streaks smear along the whip direction",
      end: "Ends in pure directional camera motion blur",
    },
    body:
      `The CAMERA begins with a slow, controlled hero move, then executes a fast whip-pan out with an optional slight optical roll, ending in strong directional camera motion blur. ${WHIP_LINE}`,
  },
  {
    key: "whip_macro",
    label: "Whip Into Macro",
    energy: "high",
    summary: {
      shot: "Controlled start whipping into a tight macro ending",
      camera: "Steady move, rapid camera whip, arrival in extreme detail",
      focus: "Resolves from directional blur into crisp macro detail",
      light: "Streaked speculars settle into facet-dependent flashes",
      end: "Ends locked on tight visible detail",
    },
    body:
      `The CAMERA starts with a controlled move, executes a rapid whip, passes through directional motion blur, and arrives on a tight detail that is already visible in the first frame. ${WHIP_LINE}`,
  },
  {
    key: "rapid_pass",
    label: "Rapid Macro Detail Pass",
    energy: "high",
    summary: {
      shot: "Fast macro pass across a short visible region",
      camera: "Smooth but fast camera travel over a stone row, edge or link run",
      focus: "Shallow, riding the passing detail",
      light: "Real motion blur with rolling specular highlights",
      end: "Exits the region still in macro",
    },
    body:
      "The CAMERA travels smoothly but quickly across a short region that is already visible in the first frame — a stone row, a letter edge, a bezel arc, a halo or a link run — producing real optical motion blur. No deformation, no stretching of the object, no change to the geometry passing through frame.",
  },
  {
    key: "kaleidoscope",
    label: "Kaleidoscopic Diamond Transition",
    energy: "high",
    summary: {
      shot: "Rapid advance into the dense faceted field as a transition bridge",
      camera: "Camera pushes fast into the stones until optics dominate",
      focus: "Collapses into extreme shallow macro bokeh",
      light: "Brilliance and dispersion overwhelm the frame from proximity",
      end: "Ends inside refracted light, geometry still intact",
    },
    body:
      "As a transition bridge only: the CAMERA advances rapidly into the dense faceted field visible in the first frame until brilliance, spectral dispersion and lens bokeh dominate the frame. The effect comes from real proximity, lens characteristics and facet orientation — never particles or overlays — and the underlying geometry remains unchanged throughout.",
  },
  {
    key: "light_sweep",
    label: "Light-Sweep Hero",
    energy: "slow",
    safe: true,
    summary: {
      shot: "Light-sweep hero: the lighting is the motion",
      camera: "Camera barely moves, millimetres of drift only",
      focus: "Locked on the main visible feature",
      light: "Studio strip, point and specular sources travel across the piece",
      end: "Ends as the sweep clears the surface",
    },
    body:
      "The CAMERA is nearly static, drifting only millimetres. The motion of the shot comes from studio strip lights, point sources and specular reflections physically travelling across the piece, raking over the metal, engraving, case or stones exactly as they sit in the first frame. The lighting is the movement.",
  },
  {
    key: "spectral_wave",
    label: "Spectral Fire Wave",
    energy: "medium",
    summary: {
      shot: "Cascading spectral fire across the stone field",
      camera: "Slow lateral camera slide",
      focus: "Shallow, held across the stone field",
      light: "Moving jewelry lights create an unsynchronized scintillation wave",
      end: "Ends as the wave passes off the piece",
    },
    body:
      "A slow lateral CAMERA slide combined with moving jewelry lights produces a cascading, unsynchronized wave of facet-dependent scintillation across the visible stones. Each stone ignites and fades on its own timing with restrained spectral colour. No glitter filter, no synchronized twinkle, no particle layer.",
  },
  {
    key: "center_stone",
    label: "Center-Stone Reveal",
    energy: "slow",
    summary: {
      shot: "Center-stone reveal around the existing focal stone",
      camera: "Tiny 3D camera move around the stone as placed",
      focus: "Rides the table into the pavilion depth",
      light: "Angled light reveals crown flashes and internal refraction",
      end: "Settles with the stone reading deep and crisp",
    },
    body:
      "The CAMERA performs a tiny three-dimensional move around the focal stone exactly where it sits in the first frame, revealing pavilion depth, crown geometry, table reflections and facet structure through parallax and light. Never change the stone's cut, size, colour, setting or position.",
  },
  {
    key: "multi_parallax",
    label: "Multi-Object Parallax",
    energy: "medium",
    summary: {
      shot: "Lateral parallax across multiple pieces as arranged",
      camera: "Slow lateral camera slide for foreground/background separation",
      focus: "May transition between pieces along the slide",
      light: "Reflections travel piece to piece",
      end: "Ends offset with the arrangement untouched",
    },
    body:
      "The CAMERA slides laterally across the arrangement so the foreground and background pieces separate through parallax, with focus optionally transitioning from one piece to another. Preserve the exact arrangement, spacing and orientation of every piece: no object moves.",
  },
  {
    key: "transition_out",
    label: "Transition Out",
    energy: "high",
    summary: {
      shot: "Transition-out clip built to cut away",
      camera: "Fast push or rapid lateral camera exit",
      focus: "Collapses into optical defocus or extreme macro blur",
      light: "Specular bloom builds off a reflective facet",
      end: "Ends in directional blur, ready to cut",
    },
    body:
      `The clip is designed as a transition out: the CAMERA ends the shot in directional whip blur, extreme macro blur, optical defocus bloom, a rapid lateral camera exit, or a fast push toward a reflective facet already visible in the frame. No generic AI morph, no dissolve effect. ${WHIP_LINE}`,
  },
];

const SHOT_BY_KEY = new Map(SHOT_LIBRARY.map((shot) => [shot.key, shot]));

/** UI aliases → library keys, so the dropdown stays short. */
const SHOT_ALIASES: Record<string, string> = {
  hero: "hero_push",
  macro: "extreme_macro",
  surface: "surface_scan",
  edge: "edge_glide",
  orbit: "micro_orbit",
  rack: "rack_focus",
  overhead: "overhead_descent",
  chain: "chain_track",
  light: "light_sweep",
  whip: "whip_transition",
  kaleido: "kaleidoscope",
};

function resolveShot(key: unknown): ShotSpec | null {
  const raw = String(key ?? "").trim().toLowerCase();
  if (!raw) return null;
  return SHOT_BY_KEY.get(raw) ?? SHOT_BY_KEY.get(SHOT_ALIASES[raw] ?? "") ?? null;
}

const SAFE_SHOTS = ["hero_push", "extreme_macro", "rack_focus", "light_sweep"];

/** Deterministic per-type bias pools for Auto mode. */
function shotPoolForTypes(pieceTypes: string[]) {
  const text = pieceTypes.join(" ").toLowerCase();
  const pool: string[] = [];
  const push = (...keys: string[]) => {
    for (const key of keys) if (!pool.includes(key)) pool.push(key);
  };

  const chainy = /(chain|necklace|bracelet|cuban|tennis|rope|anklet|choker|watch)/.test(text);
  const ringy = /(ring|signet|engagement|watch|cufflink)/.test(text);
  const heroy = /(grill|earring|stud|hoop|pendant|brooch|charm|custom|piece|other)/.test(text);
  const stoney = /(tennis|diamond|stone|iced|pav|halo|gem)/.test(text);
  const multi = pieceTypes.length > 1;

  if (chainy) push("chain_track", "edge_glide", "diagonal_parallax");
  if (ringy) push("micro_orbit", "edge_glide", "center_stone", "light_sweep");
  if (heroy) push("hero_push", "extreme_macro", "surface_scan", "light_sweep");
  if (stoney) push("extreme_macro", "spectral_wave", "center_stone");
  if (multi) push("overhead_descent", "multi_parallax");

  push("hero_push", "extreme_macro", "rack_focus", "light_sweep", "surface_scan", "low_creep");
  return pool;
}

/**
 * Plans the whole approved set as one coherent shot pack — deterministic,
 * no randomness. Mostly slow/medium coverage, at most ~1 high-energy shot per
 * 5 clips and only near the end, and never the same shot twice in a row.
 */
export function planShotSet(frameCount: number, pieceTypes: string[]): ShotSpec[] {
  const size = Math.max(1, Math.floor(frameCount || 1));
  const pool = shotPoolForTypes(pieceTypes)
    .map((key) => SHOT_BY_KEY.get(key))
    .filter((shot): shot is ShotSpec => !!shot && shot.energy !== "high");

  const highEnergyBudget = size >= 5 ? Math.max(1, Math.floor(size / 5)) : 0;
  const highSlots = new Set<number>();
  for (let i = 0; i < highEnergyBudget; i += 1) {
    // High-energy shots only near the END of the set.
    const slot = size - 1 - i * 5;
    if (slot > 0) highSlots.add(slot);
  }
  const highShots = ["whip_transition", "rapid_pass", "kaleidoscope"]
    .map((key) => SHOT_BY_KEY.get(key))
    .filter((shot): shot is ShotSpec => !!shot);

  const plan: ShotSpec[] = [];
  let calmCursor = 0;
  let highCursor = 0;

  for (let index = 0; index < size; index += 1) {
    let chosen: ShotSpec;
    if (highSlots.has(index) && highShots.length) {
      chosen = highShots[highCursor % highShots.length];
      highCursor += 1;
    } else {
      chosen = pool[calmCursor % pool.length];
      calmCursor += 1;
      if (plan.length && plan[plan.length - 1].key === chosen.key) {
        chosen = pool[calmCursor % pool.length];
        calmCursor += 1;
      }
    }
    if (plan.length && plan[plan.length - 1].key === chosen.key) {
      chosen = SHOT_BY_KEY.get(SAFE_SHOTS[index % SAFE_SHOTS.length])!;
    }
    plan.push(chosen);
  }

  return plan;
}

/** Compose the final Kling prompt for one clip. */
function buildAnimationPrompt(shot: ShotSpec | null, customPrompt?: string | null) {
  const parts: string[] = [
    "Luxury jewelry motion-control cinematography, photoreal, 1080p, cinematic studio lighting.",
    LOCK_FIRST_FRAME,
    LOCK_OBJECT,
  ];

  if (shot) {
    parts.push(`SHOT — ${shot.label}. ${shot.body}`);
  }
  const custom = String(customPrompt ?? "").trim();
  if (custom) {
    parts.push(`DIRECTOR NOTE (camera and lighting only, never object motion): ${custom}`);
  }

  parts.push(LOCK_CAMERA_LANGUAGE, LOCK_GEOMETRY, OPTICS_DIAMONDS, OPTICS_METAL);
  parts.push(
    `${NEGATIVES_BASE} ${shot?.energy === "high" ? NEGATIVES_FAST : NEGATIVES_STEADY}`,
  );

  return parts.join("\n\n");
}

const CUSTOM_SUMMARY = {
  shot: "Custom direction",
  camera: "As described in the director note (camera-only motion)",
  focus: "As described in the director note",
  light: "Studio lighting travel per the director note",
  end: "As described in the director note",
};


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
        imageModel: body.imageModel,
        preferredRole: body.preferredRole ?? null,
        failureReason: body.failureReason ?? null,
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
