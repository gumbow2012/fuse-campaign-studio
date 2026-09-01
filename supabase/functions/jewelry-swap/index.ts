import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { signDeepDisplayUrls } from "../_shared/asset-access.ts";

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
  normalizeImageResolution,
  referenceToVideoEndpoint,
  submitFalJob,
  videoFallbackUsdPerSecond,
} from "../_shared/fal.ts";
import { conditionImageForKling } from "./animateInput.ts";
import {
  applyOpticsControls,
  type DiamondOpticsControls,
  type DiamondOpticsProfile,
  mergeFrameOptics,
  normalizeOpticsProfile,
  opticsPromptLines,
  opticsSummaryLine,
  readOpticsControls,
} from "../_shared/diamond-optics.ts";
import {
  type MasterProductLock,
  masterLockProductType,
  masterLockPromptLines,
  masterLockSummaryLine,
  normalizeMasterLock,
} from "./masterLock.ts";
import {
  buildCanonicalMasterPrompt,
  canonicalMasterLabel,
  type CanonicalMasterView,
  isCanonicalMasterView,
} from "./canonicalMasters.ts";
import { collectValidatedMasterRefs } from "./validatedMasters.ts";
import { compilePromptBlocks } from "./promptBlocks.ts";
import {
  type ConnectedAssetModel,
  connectedAssetPromptLines,
  normalizeConnectedAssets,
} from "./connectedAssets.ts";
import {
  campaignPhotographySummaryLine,
  normalizeCampaignPhotographyProfile,
} from "../_shared/campaign-photography.ts";


import {
  buildMatchedPairPrompt,
  isManufacturingStage,
  type ManufacturingStage,
  manufacturingStageLabel,
  matchedPairSummaryLine,
  oppositeManufacturingStage,
} from "./matchedPair.ts";
import {
  type MaterialAppearanceAuthority,
  materialAuthorityPromptLines,
  materialAuthoritySummaryLine,
  normalizeMaterialAuthority,
} from "./materialAuthority.ts";

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
    // CANONICAL MASTER (§22) view tagging, so the client can group masters.
    canonicalMasterView: typeof payload.canonical_master_view === "string"
      ? payload.canonical_master_view
      : null,
    canonicalMasterLabel: typeof payload.canonical_master_label === "string"
      ? payload.canonical_master_label
      : null,
    // MATCHED PAIR (§29) linkage, so the client can attach the pair to its source.
    matchedPairSourceId: typeof payload.matched_pair_source_id === "string"
      ? payload.matched_pair_source_id
      : null,
    matchedPairSourceStage: typeof payload.matched_pair_source_stage === "string"
      ? payload.matched_pair_source_stage
      : null,
    matchedPairTargetStage: typeof payload.matched_pair_target_stage === "string"
      ? payload.matched_pair_target_stage
      : null,
    matchedPairTargetLabel: typeof payload.matched_pair_target_label === "string"
      ? payload.matched_pair_target_label
      : null,
    frameIndex: typeof payload.frame_index === "number" ? payload.frame_index : null,
    frameTime: typeof payload.frame_time === "number" ? payload.frame_time : null,
    sourceFrameUrl: typeof payload.source_frame_url === "string" ? payload.source_frame_url : null,
    imageModel: payload.image_model === "nb2" ? "nb2" : payload.image_model === "pro" ? "pro" : null,
    // Resolution actually sent to the Pro endpoint — lets Regenerate default to it.
    resolution: typeof payload.resolution === "string" ? payload.resolution : null,
    nanoQuality: typeof payload.nano_quality === "string" ? payload.nano_quality : null,

    preferredRole: typeof payload.preferred_role === "string" ? payload.preferred_role : null,
    coverage: typeof payload.coverage === "string" ? payload.coverage : null,
    shotKey: typeof payload.shot_key === "string" ? payload.shot_key : null,
    shotLabel: typeof payload.shot_label === "string" ? payload.shot_label : null,
    // §F4/§F5 — the duration actually submitted for this clip (no resolution field exists).
    durationSeconds: typeof payload.submitted_duration_seconds === "number"
      ? payload.submitted_duration_seconds
      : null,

    cameraDirection: typeof payload.camera_direction === "string" ? payload.camera_direction : null,
    // §F6 — per-clip motion preset actually submitted (legacy clips read null).
    motionPreset: typeof payload.motion_preset === "string" ? payload.motion_preset : null,

    directionSummary: payload.direction_summary && typeof payload.direction_summary === "object"
      ? payload.direction_summary as Record<string, string>
      : null,
    animationPrompt: typeof payload.animation_prompt === "string" ? payload.animation_prompt : null,
    // §F3 — provider lookup temporarily unavailable; the job is still tracked.
    providerTransient: payload.provider_transient === true,
    providerTransientNote: typeof payload.provider_transient_note === "string"
      ? payload.provider_transient_note
      : null,
    providerTransientAt: typeof payload.provider_transient_at === "string"
      ? payload.provider_transient_at
      : null,
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
type JewelryReference = { url: string; role?: string | null; cad?: boolean; master?: boolean };

/** One structured stone-setting entry on a piece. */
type JewelrySetting = {
  type?: string | null;
  region?: string | null;
  stone?: string | null;
  color?: string | null;
  quality?: string | null;
};

type JewelryPiece = {
  urls?: unknown;
  url?: string;
  /** Preferred: labeled references ({url, role, cad}). `urls` stays supported. */
  references?: unknown;
  type?: string;
  metal?: string;
  stone?: string;
  /** Structured stone body color, independent of clarity/quality. */
  stoneColor?: string;
  quality?: string;
  /** Structured stone-setting construction, one or more regions. */
  settings?: unknown;
  dimensions?: JewelryDimensions | null;
  cad?: boolean;
  person?: string;
  notes?: string;
  /** "piece" (default, narrowest) or "piece_chain" — what the swap may replace. */
  scope?: string;
  /**
   * Values the intake analysis DETECTED for this piece. They are used ONLY to
   * resolve a field the user left on "Auto" — a user value (user_override) is
   * never replaced. Priority: user_override > CAD > gemini_detected.
   */
  detected?: {
    type?: string | null;
    metal?: string | null;
    stone?: string | null;
    stoneColor?: string | null;
    quality?: string | null;
    settings?: { type?: string | null; region?: string | null }[] | null;
  } | null;
  /**
   * Provenance per field as recorded by the intake UI
   * ("user_override" | "gemini_detected" | "gemini_suggested" | "unknown").
   * A field the user never set is resolved from `detected` even when the card
   * still shows a default control value.
   */
  sources?: Record<string, string> | null;



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
      cad: (entry as any)?.cad === true,
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

/* ------------------------------------------------------------------ *
 * Deterministic, frame-aware IMAGE-PAYLOAD ROUTING
 * ------------------------------------------------------------------ *
 * Honest limitation: in Auto mode we do NOT inspect the source frame's
 * pixels (no vision service). Orientation-specific routing (side / back /
 * macro) therefore relies on the user's Mode + Preferred Reference. Auto
 * returns a sensible small default set: CAD authority + the best 2-3
 * product views + an optional macro-detail reference for finish.
 */

/** Product references sent alongside the SOURCE frame, per piece. */
const MAX_PRODUCT_REFERENCES = 4;
/** At most this many CAD/design-authority references. */
const MAX_CAD_REFERENCES = 2;

function roleText(ref: JewelryReference) {
  return String(ref.role ?? "").trim();
}

function isCadRef(ref: JewelryReference) {
  return ref.cad === true || /^cad/i.test(roleText(ref));
}

function isMacroRole(ref: JewelryReference) {
  return /macro/i.test(roleText(ref));
}

/** Close-detail (non-macro) roles that matter most in macro reconstruction. */
function isDetailRole(ref: JewelryReference) {
  return /(link|clasp|setting|connector|hinge|bail|crown|face|bezel|dial|crown|shank|gallery|caseback|side)/i
    .test(roleText(ref));
}

/** Overall identity views (hero-ish full product photos). */
function isOverallRole(ref: JewelryReference) {
  return /(front|back|3\/4|three quarter|dial|face|top|overall)/i.test(roleText(ref));
}

function rolesMatch(role: string, target: string) {
  const a = role.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  const b = target.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Ordered, capped, role-deduped product references for one frame.
 * SOURCE_FRAME is image 1 and is added by the CALLER, never by this selector.
 *
 * Authority order (FUSE is the final authority, Gemini is advisory):
 *   1. explicit user override (Preferred Reference / Mode / Framing)
 *   2. RELEVANT CAD / design authority for this view (never forced when none fits)
 *   3. Gemini's per-frame ranking (best-first), minus anything it flagged avoid
 *   4. deterministic role match for the mode (only tops up a thin payload)
 *   5. remaining photos (last resort only — upload order has NO authority)
 * Aim: 2-4 PRODUCT references + the source frame. Duplicate roles are dropped
 * (never "Front, Front") and the total is capped at MAX_PRODUCT_REFERENCES.
 */

function selectReferencesForFrame(args: {
  piece: JewelryPiece;
  mode?: ReplacementMode | string | null;
  preferredRole?: string | null;
  /** Stage-A still analysis for THIS frame. Advisory only — never authoritative. */
  geminiFrameAnalysis?: GeminiFrameAnalysis | null;
  /**
   * url → referenceId ("REF_1"...) using the SAME flatten order the analysis
   * batch saw, so Gemini's per-frame ranking can be resolved back to refs.
   */
  referenceIds?: Map<string, string>;
  /**
   * VALIDATED canonical / component masters (§E2). Clean derived plates of the
   * SAME product. They are candidates only — always below user-confirmed facts,
   * the original direct evidence and CAD (steps 1-4 below). Empty → behaviour is
   * exactly as before.
   */
  validatedMasters?: JewelryReference[];
}): JewelryReference[] {
  const all = pieceReferences(args.piece);
  const masters = (args.validatedMasters ?? []).filter((ref) => Boolean(ref?.url));
  if (all.length <= 1 && !masters.length) return all;

  const mode = normalizeMode(args.mode ?? null, false);
  const preferred = String(args.preferredRole ?? "").trim();
  const hasPreferred = Boolean(preferred) && !isAuto(preferred);

  const cads = all.filter(isCadRef);
  const photos = all.filter((ref) => !isCadRef(ref));

  const picked: JewelryReference[] = [];
  const usedRoles = new Set<string>();
  const usedUrls = new Set<string>();

  const take = (ref: JewelryReference | undefined | null) => {
    if (!ref) return false;
    if (usedUrls.has(ref.url)) return false;
    const key = roleText(ref).toLowerCase();
    if (key && usedRoles.has(key)) return false; // dedupe by role
    if (picked.length >= MAX_PRODUCT_REFERENCES) return false;
    picked.push(ref);
    usedUrls.add(ref.url);
    if (key) usedRoles.add(key);
    return true;
  };

  /* --- Gemini per-frame ranking (advisory), resolved by referenceId ------- */
  const advice = args.geminiFrameAnalysis ?? null;
  const idOf = (ref: JewelryReference) => args.referenceIds?.get(ref.url) ?? null;
  const norm = (value: unknown) => String(value ?? "").trim().toUpperCase();

  const rankedIds = (advice?.recommendedReferences ?? []).map(norm).filter(Boolean);
  const avoidIds = (advice?.avoidReferences ?? []).map(norm).filter(Boolean);
  const hasRanking = rankedIds.length > 0;

  const byId = (id: string) => all.find((ref) => norm(idOf(ref)) === id) ?? null;
  /** Refs Gemini ranked, best-first, avoided entries removed. */
  const rankedRefs = rankedIds
    .filter((id) => !avoidIds.includes(id))
    .map(byId)
    .filter(Boolean) as JewelryReference[];

  const avoidRoles = (advice?.avoidReferenceRoles ?? []).map((role) => String(role ?? "").trim())
    .filter(Boolean);
  const isAvoided = (ref: JewelryReference) => {
    const id = norm(idOf(ref));
    if (id && avoidIds.includes(id)) return true;
    return avoidRoles.some((role) => rolesMatch(roleText(ref), role));
  };

  // 1) CAD / design authority — only when a RELEVANT one exists. CAD is never
  //    forced into the payload just because the piece happens to have one.
  if (cads.length) {
    const relevant: JewelryReference[] = [];
    if (hasPreferred) {
      const match = cads.find((ref) => rolesMatch(roleText(ref), `CAD ${preferred}`)) ??
        cads.find((ref) => rolesMatch(roleText(ref), preferred));
      if (match) relevant.push(match);
    }
    // Gemini ranked a CAD view as relevant for THIS frame.
    for (const ref of rankedRefs) if (isCadRef(ref)) relevant.push(ref);
    // No ranking at all (fallback path) → previous deterministic behaviour.
    if (!hasRanking) {
      const front = cads.find((ref) => /cad\s*front/i.test(roleText(ref)));
      if (front) relevant.push(front);
      relevant.push(cads[0]);
    }
    let cadCount = 0;
    for (const ref of relevant) {
      if (cadCount >= MAX_CAD_REFERENCES) break;
      if (isAvoided(ref) && hasRanking) continue;
      if (take(ref)) cadCount++;
    }
  }

  // 2) The user's explicit Preferred Reference outranks Gemini and actually
  //    enters the payload (it is never prompt-only).
  if (hasPreferred) {
    take(photos.find((ref) => rolesMatch(roleText(ref), preferred)));
  }

  // 3) GEMINI RANKING — strongest product photos first, in its ranked order.
  for (const ref of rankedRefs) {
    if (isCadRef(ref)) continue;
    take(ref);
  }

  // 4) Deterministic, mode-specific photographic priorities. This is the
  //    validation layer: it only tops the payload up when Gemini's ranking left
  //    it too thin (or produced no ranking at all) — it never pads a payload the
  //    ranking already answered.
  const MIN_PRODUCT_REFERENCES = 2;
  if (!hasRanking || picked.length < MIN_PRODUCT_REFERENCES) {
    if (mode === "macro") {
      take(photos.find((ref) => isMacroRole(ref) && !isAvoided(ref)));
      take(photos.find((ref) => isDetailRole(ref) && !isAvoided(ref)));
      // At most ONE overall identity photo — avoid full-product hero photos.
      take(photos.find((ref) => isOverallRole(ref) && !isAvoided(ref)));
    } else {
      take(
        photos.find((ref) =>
          /front/i.test(roleText(ref)) && !/3\/4/.test(roleText(ref)) && !isAvoided(ref)
        ),
      );
      take(photos.find((ref) => isOverallRole(ref) && !isAvoided(ref)));
      take(
        photos.find((ref) => /3\/4|three quarter/i.test(roleText(ref)) && !isAvoided(ref)),
      );
      take(photos.find((ref) => isMacroRole(ref) && !isAvoided(ref)));
    }
  }


  // 4.5) VALIDATED CANONICAL / COMPONENT MASTERS (§E2). Clean, neutral plates of
  //      the same product, so they are preferred over arbitrary upload-order
  //      photos — but only AFTER the user's override, CAD, Gemini's ranking and
  //      the deterministic original-evidence priorities have had their turn. They
  //      never displace an original the steps above already chose, and they are
  //      subject to the same role dedupe and the same MAX_PRODUCT_REFERENCES cap.
  if (masters.length && picked.length < MAX_PRODUCT_REFERENCES) {
    // Prefer the master that answers what this frame is asking for.
    const wanted = hasPreferred ? preferred : mode === "macro" ? "macro" : "";
    if (wanted) {
      take(masters.find((ref) => rolesMatch(roleText(ref), wanted)));
    }
    for (const ref of masters) {
      if (picked.length >= MAX_PRODUCT_REFERENCES) break;
      take(ref);
    }
  }

  // 5) Last resort only. Upload order has NO authority: it is consulted purely
  //    to keep a frame reconstructable when nothing above produced enough refs.
  if (!hasRanking || picked.length < MIN_PRODUCT_REFERENCES) {
    for (const ref of photos) {
      if (picked.length >= (hasRanking ? MIN_PRODUCT_REFERENCES : MAX_PRODUCT_REFERENCES)) break;
      if (isAvoided(ref)) continue;
      take(ref);
    }
    for (const ref of photos) {
      if (picked.length >= MIN_PRODUCT_REFERENCES) break;
      take(ref);
    }
  }


  return picked;
}

/** A copy of the piece whose references are exactly the routed selection. */
function routePiece(
  piece: JewelryPiece,
  mode?: ReplacementMode | string | null,
  preferredRole?: string | null,
  geminiFrameAnalysis?: GeminiFrameAnalysis | null,
  referenceIds?: Map<string, string>,
  validatedMasters?: JewelryReference[],
): { piece: JewelryPiece; refs: JewelryReference[] } {
  const refs = selectReferencesForFrame({
    piece,
    mode,
    preferredRole,
    geminiFrameAnalysis,
    referenceIds,
    validatedMasters,
  });
  return { piece: { ...piece, references: refs, urls: refs.map((ref) => ref.url) }, refs };
}

/**
 * url → referenceId map over ALL pieces, in the exact flatten order the
 * analysis batch received (pieces in card order, refs in card order).
 */
function buildReferenceIdMap(pieces: JewelryPiece[]): Map<string, string> {
  const map = new Map<string, string>();
  let index = 0;
  for (const piece of pieces) {
    for (const ref of pieceReferences(piece)) {
      index += 1;
      if (!map.has(ref.url)) map.set(ref.url, `REF_${index}`);
    }
  }
  return map;
}


/* ------------------------------------------------------------------ *
 * STAGE A — GEMINI STILL-IMAGE ANALYSIS (advisory)
 * ------------------------------------------------------------------ *
 * Produced by the analyze-jewelry-frames function from STILL IMAGES ONLY
 * (never the source video). It ADVISES reference routing and appends a
 * concise FRAME ANALYSIS section to the existing strict prompt. It may
 * never override the structured spec, CAD authority, or any manual
 * Mode / Framing / Preferred-Reference choice.
 */

type GeminiFrameAnalysis = {
  frameId?: string;
  view?: string | null;
  coverage?: "full_object" | "partial_object" | "macro_detail" | string | null;
  detailType?: string | null;
  magnification?: string | null;
  composition?: {
    fullProductShouldBeVisible?: boolean;
    preserveIntentionalCrop?: boolean;
    negativeSpace?: string | null;
  } | null;
  orientation?: string | null;
  camera?: { angleDescription?: string | null; depthOfField?: string | null } | null;
  recommendedReferenceRoles?: string[] | null;
  avoidReferenceRoles?: string[] | null;
  /** Per-frame RANKED referenceIds ("REF_1"...), best-first. Advisory. */
  recommendedReferences?: string[] | null;
  avoidReferences?: string[] | null;
  rankingReasons?: string[] | null;

  replacementBehavior?: string | null;
  riskFlags?: string[] | null;
};

type GeminiSettingSignature = {
  declaredSetting?: string | null;
  region?: string | null;
  stoneTypes?: string[] | null;
  stoneColors?: string[] | null;
  stoneShapes?: string[] | null;
  stoneSizeDistribution?: string | null;
  stoneOrientationPattern?: string | null;
  settingDensity?: string | null;
  layoutRegularity?: string | null;
  prongOrMetalVisibility?: string | null;
  spacingPattern?: string | null;
  channelDirection?: string | null;
  bezelGeometry?: string | null;
  largeAnchorStonesVisible?: boolean | null;
  smallFillerStonesVisible?: boolean | null;
  referenceDefinedCharacteristics?: string[] | null;
  conflictWarnings?: string[] | null;
};

type GeminiProductAnalysis = {
  jewelryType?: string | null;
  visibleComponents?: string[] | null;
  disposableReferenceContext?: string[] | null;
  geometryObservations?: string[] | null;
  materialObservations?: string[] | null;
  settingObservations?: string[] | null;
  /** Universal, per-region setting signatures (setting-agnostic). */
  settingSignatures?: GeminiSettingSignature[] | null;
  /** Legacy single-object shape — still read, never required. */
  settingVisualSignature?: Record<string, unknown> | null;
  conflictWarnings?: string[] | null;
};

/** Universal signature list, from either the new array or the legacy object. */
function settingSignatures(product: GeminiProductAnalysis | null): GeminiSettingSignature[] {
  if (!product) return [];
  if (Array.isArray(product.settingSignatures)) {
    return product.settingSignatures.filter((entry) => entry && typeof entry === "object");
  }
  if (product.settingVisualSignature && typeof product.settingVisualSignature === "object") {
    return [product.settingVisualSignature as GeminiSettingSignature];
  }
  return [];
}

/** Human-readable, setting-agnostic description of one observed signature. */
function describeSignature(sig: GeminiSettingSignature): string {
  const list = (value: unknown) =>
    (Array.isArray(value) ? value : []).map((entry) => String(entry ?? "").trim()).filter(Boolean);
  const parts = [
    list(sig.stoneTypes).length ? `stone types: ${list(sig.stoneTypes).join(", ")}` : null,
    list(sig.stoneColors).length ? `stone colors: ${list(sig.stoneColors).join(", ")}` : null,
    list(sig.stoneShapes).length ? `stone shapes: ${list(sig.stoneShapes).join(", ")}` : null,
    sig.stoneSizeDistribution ? `stone-size distribution: ${sig.stoneSizeDistribution}` : null,
    sig.stoneOrientationPattern ? `stone orientation: ${sig.stoneOrientationPattern}` : null,
    sig.settingDensity ? `density: ${sig.settingDensity}` : null,
    sig.layoutRegularity ? `layout: ${sig.layoutRegularity}` : null,
    sig.prongOrMetalVisibility ? `prong/metal visibility: ${sig.prongOrMetalVisibility}` : null,
    sig.spacingPattern ? `spacing: ${sig.spacingPattern}` : null,
    sig.channelDirection ? `channel direction: ${sig.channelDirection}` : null,
    sig.bezelGeometry ? `bezel geometry: ${sig.bezelGeometry}` : null,
    sig.largeAnchorStonesVisible === true ? "large anchor stones present" : null,
    sig.smallFillerStonesVisible === true ? "small filler stones present" : null,
    ...list(sig.referenceDefinedCharacteristics),
  ].filter(Boolean);
  return parts.join("; ");
}


/** Narrow, defensive normalization — anything unexpected becomes null. */
function normalizeFrameAnalysis(value: unknown): GeminiFrameAnalysis | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, any>;
  const list = (input: unknown) =>
    (Array.isArray(input) ? input : []).map((entry) => String(entry ?? "").trim()).filter(Boolean);
  return {
    frameId: raw.frameId ? String(raw.frameId) : undefined,
    view: raw.view ? String(raw.view) : null,
    coverage: raw.coverage ? String(raw.coverage) : null,
    detailType: raw.detailType ? String(raw.detailType) : null,
    magnification: raw.magnification ? String(raw.magnification) : null,
    composition: raw.composition && typeof raw.composition === "object"
      ? {
        fullProductShouldBeVisible: raw.composition.fullProductShouldBeVisible === true,
        preserveIntentionalCrop: raw.composition.preserveIntentionalCrop === true,
        negativeSpace: raw.composition.negativeSpace ? String(raw.composition.negativeSpace) : null,
      }
      : null,
    orientation: raw.orientation ? String(raw.orientation) : null,
    camera: raw.camera && typeof raw.camera === "object"
      ? {
        angleDescription: raw.camera.angleDescription ? String(raw.camera.angleDescription) : null,
        depthOfField: raw.camera.depthOfField ? String(raw.camera.depthOfField) : null,
      }
      : null,
    recommendedReferenceRoles: list(raw.recommendedReferenceRoles),
    avoidReferenceRoles: list(raw.avoidReferenceRoles),
    recommendedReferences: list(raw.recommendedReferences),
    avoidReferences: list(raw.avoidReferences),
    rankingReasons: list(raw.rankingReasons),

    replacementBehavior: raw.replacementBehavior ? String(raw.replacementBehavior) : null,
    riskFlags: list(raw.riskFlags),
  };
}

function normalizeProductAnalysis(value: unknown): GeminiProductAnalysis | null {
  if (!value || typeof value !== "object") return null;
  return value as GeminiProductAnalysis;
}

/** Gemini's coverage vocabulary → FUSE coverage. Only used when Framing = Auto. */
function coverageFromAnalysis(analysis: GeminiFrameAnalysis | null): Coverage | null {
  const raw = String(analysis?.coverage ?? "").trim().toLowerCase();
  if (raw === "full_object") return "full";
  if (raw === "partial_object") return "partial";
  if (raw === "macro_detail") return "macro";
  return null;
}

/** Gemini's coverage/magnification → standard vs macro reconstruct. Auto only. */
function modeFromAnalysis(analysis: GeminiFrameAnalysis | null): ReplacementMode | null {
  const coverage = coverageFromAnalysis(analysis);
  const magnification = String(analysis?.magnification ?? "").trim().toLowerCase();
  if (coverage === "macro" || magnification === "macro" || magnification === "extreme_macro") {
    return "macro";
  }
  if (coverage === "full" || coverage === "partial") return "standard";
  return null;
}

/**
 * The concise FRAME ANALYSIS section appended to the existing strict prompt.
 * Explicitly labelled advisory so it can never outrank the locked blocks.
 */
function frameAnalysisBlock(
  frame: GeminiFrameAnalysis | null,
  product: GeminiProductAnalysis | null,
): string | null {
  if (!frame && !product) return null;
  const lines: string[] = [
    "FRAME ANALYSIS (automated still-image analysis — ADVISORY CONTEXT ONLY. It describes this source frame and the product references. It may NEVER override SOURCE_FRAME, the structured product specification, the CAD/design authority, the forced Mode/Coverage, or the Preferred Angle Reference above):",
  ];

  if (frame) {
    const parts = [
      frame.view ? `view: ${frame.view}` : null,
      frame.coverage ? `coverage: ${frame.coverage}` : null,
      frame.detailType ? `detail: ${frame.detailType}` : null,
      frame.magnification ? `magnification: ${frame.magnification}` : null,
      frame.orientation ? `orientation: ${frame.orientation}` : null,
      frame.camera?.angleDescription ? `camera: ${frame.camera.angleDescription}` : null,
      frame.camera?.depthOfField ? `depth of field: ${frame.camera.depthOfField}` : null,
    ].filter(Boolean);
    if (parts.length) lines.push(`- Source frame: ${parts.join("; ")}.`);
    if (frame.composition) {
      lines.push(
        `- Composition: full product ${
          frame.composition.fullProductShouldBeVisible ? "should" : "should NOT"
        } be visible; intentional crop ${
          frame.composition.preserveIntentionalCrop ? "MUST be preserved" : "not crop-critical"
        }${frame.composition.negativeSpace ? `; negative space: ${frame.composition.negativeSpace}` : ""}.`,
      );
    }
    if (frame.replacementBehavior) lines.push(`- Suggested replacement behaviour: ${frame.replacementBehavior}.`);
    if (frame.recommendedReferenceRoles?.length) {
      lines.push(`- Most relevant reference views for this frame: ${frame.recommendedReferenceRoles.join(", ")}.`);
    }
    if (frame.riskFlags?.length) {
      lines.push(`- Watch out for: ${frame.riskFlags.join("; ")}.`);
    }
  }

  if (product?.disposableReferenceContext?.length) {
    lines.push(
      `- DISPOSABLE REFERENCE CONTEXT detected in the product references — EXCLUDE all of it from the output: ${
        product.disposableReferenceContext.join(", ")
      }.`,
    );
  }
  for (const sig of settingSignatures(product ?? null)) {
    const described = describeSignature(sig);
    if (!described) continue;
    const region = String(sig.region ?? "").trim() || "Entire Piece";
    const setting = String(sig.declaredSetting ?? "").trim() || "the specified setting";
    lines.push(
      `- OBSERVED SETTING SIGNATURE — ${region} / ${setting} (reproduce this construction exactly; do not regularize or substitute it): ${described}.`,
    );
  }

  if (product?.conflictWarnings?.length) {
    lines.push(
      `- Noted conflicts (the user's structured specification still wins): ${product.conflictWarnings.join("; ")}.`,
    );
  }

  return lines.length > 1 ? lines.join("\n") : null;
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

/** The references are PRODUCT references — only the jewelry object may transfer. */
const REFERENCE_CONTEXT_EXCLUSION =
  "REFERENCE CONTEXT EXCLUSION: The uploaded jewelry reference images are PRODUCT REFERENCES ONLY. Extract visual information ONLY from the target jewelry object itself. Completely ignore and do not reproduce any incidental content surrounding the jewelry in the reference images — hands, fingers, skin, gloves, arms, necks, clothing, models, mannequins, display stands, jewelry boxes, trays, tables, velvet, leather, fabric, walls, backgrounds, flooring, props, other/unrelated jewelry, packaging, and the reference images' own shadows, reflections and lighting setup. Those exist only because the jewelry was photographed in that environment; they are NOT part of the replacement object. Do not copy them into SOURCE_FRAME.";

const SURGICAL_REPLACEMENT_CORE =
  "Perform a SURGICAL object replacement. SOURCE_FRAME is the absolute authority for the photograph and every pixel outside the target jewelry region. JEWELRY_REFERENCES are the authority ONLY for the physical target jewelry. Conceptually: identify the original jewelry region in SOURCE_FRAME, remove ONLY that jewelry, insert the replacement jewelry, and leave everything outside that region visually identical to SOURCE_FRAME. Modify the SMALLEST possible region needed for the swap. Do not blend the two photographs. Adapt the replacement object's perspective AND lighting to SOURCE_FRAME — use the references only for the jewelry's metal, material, stone color, finish and construction, then relight it to match SOURCE_FRAME's lighting; do not transplant the reference's background, environment, shadows or lighting. New local contact shadows/reflections from the replacement are allowed only where physically required by its placement in SOURCE_FRAME.";

const PRIORITY_ORDER_TEXT =
  "PRIORITY ORDER (highest first): 1) the replacement product's identity is correct, 2) NO recognizable identity from the original source jewelry survives, 3) the replacement's geometry and real proportions are authentic, 4) SOURCE_FRAME camera angle preserved, 5) SOURCE_FRAME crop and magnification preserved, 6) SOURCE_FRAME environment preserved, 7) the correct replacement reference angle is prioritized, 8) SOURCE_FRAME lighting inherited, 9) no reference-background contamination, 10) optical polish.";

const CONTEXT_NEGATIVES =
  "NEGATIVES: No reference-background transfer, no reference hands/fingers/gloves/arms, no reference props/surfaces/display stands/boxes/fabric, no imported reference shadows or reflections, no reference-image environment or lighting, no unrelated jewelry, no context blending between SOURCE_FRAME and the product references. No surviving original lettering, logo, symbol, icon or character head; no original stone layout; no original bail, border, cutout, engraving or silhouette; no hybrid or blended object; no replacement \"attached to\" the old object.";

/** ANTI-HYBRID: the source photograph survives, the source product does not. */
const ANTI_HYBRID_BLOCK = [
  "COMPLETE PRODUCT IDENTITY REPLACEMENT: Remove the original jewelry object's identity completely. Do NOT preserve, merge, combine, reinterpret or reuse recognizable design elements from the original jewelry — not its lettering, logos, symbols, icons, character heads, decorative shapes, stone layout, bail design, borders, cutouts, engraving, silhouette details or internal geometry. The replacement must be ONE coherent physical jewelry object derived EXCLUSIVELY from JEWELRY_REFERENCES. Never create a hybrid of the source jewelry and the replacement jewelry. Think of the frame as a PHOTOGRAPHIC SHELL (from SOURCE_FRAME) plus a PRODUCT IDENTITY (from the references) — SOURCE controls location, angle, scale, orientation, crop, perspective, camera, lighting and environment; SOURCE does NOT control lettering, silhouette, decorative shapes, stone layout, stone cuts, bail construction, internal geometry, engraving or product identity. Preserve the POSITION of the original jewelry, not its design.",
  "FULL-REGION REPLACEMENT: When the source jewelry occupies a region, replace the ENTIRE semantic jewelry region — do not change only the color/stones/material/one letter/one section while leaving the rest of the original identity intact. Partial VISIBILITY is fine (if the source shows ~30% of the jewelry, show ~30% of the replacement) — but that visible portion must be 100% replacement jewelry, never 30% replacement + 70% surviving original identity.",
  "Do not restyle the original jewelry into the replacement. Remove the original jewelry identity and reconstruct the replacement jewelry in its place. Mental model: the photographer captured this exact shot using the REPLACEMENT jewelry instead of the original — the photograph survives, the old product does not.",
].join("\n\n");

/** No invention, and the replacement's real proportions always win. */
const NO_INVENTION_BLOCK = [
  "NO INVENTION: If SOURCE_FRAME shows a feature the replacement does NOT have (for example the original has a circular character head, a plaque, a letter or a motif the replacement lacks), do NOT invent that feature for the replacement. Use the replacement's actual corresponding region at approximately the same scale, location and depth, keeping SOURCE_FRAME's framing and placement. The replacement's real design always wins.",
  "REAL PROPORTIONS: \"Preserve source composition\" must NEVER stretch, squash or morph the replacement into the original's silhouette. If the replacement is wider, shorter, rounder, thinner or a different aspect ratio, keep the replacement's REAL proportions and position it inside the spatial area the original occupied. Priority within this rule: replacement geometry > source camera > source object placement > source approximate scale.",
].join("\n\n");

/** Angle-role intelligence for rear and thin side-profile source views. */
const VIEW_SIDE_INTELLIGENCE_BLOCK =
  "REFERENCE ANGLE INTELLIGENCE: First determine which side of the piece SOURCE_FRAME is actually photographing, then pick references accordingly using their labels. If the source view is rear/back-facing, prioritize references in this order: Back, then CAD Back, then Side/rear (3/4 Rear, Left/Right Side), then any macro reference showing the corresponding rear geometry, then others — never default a back or detail frame to the prettiest Front reference, and never rotate the piece into a front-facing hero view. If the source is a thin side profile, prioritize Side / 3-4 / Back-side / CAD Side references and preserve the replacement's real thickness and sidewall construction; do not rotate it front-facing to show more detail.";

/** Macro frames need cinematography preserved but jewelry detail fully rebuilt. */
const MACRO_REPLACEMENT_BLOCK =
  "MACRO REPLACEMENT MODE: Use SOURCE_FRAME ONLY for magnification, crop, camera angle, orientation, focus/depth-of-field characteristics, lighting direction, exposure and environmental background. COMPLETELY reconstruct the visible jewelry region from JEWELRY_REFERENCES — do NOT preserve the original piece's stones, prongs, settings, metal shapes, engraving, borders or microscopic construction, do NOT copy the original stone layout, count or placement, and NEVER force the replacement's materials onto the original's geometry. Reconstruct this photograph as if the camera were photographing the REPLACEMENT jewelry instead: the references are the absolute authority for the microscopic detail — actual gemstone cuts and sizes, the replacement's own stone arrangement and density, prong/bead/channel/bezel style, metal borders, engraving, lettering, surface relief, material and metal color. If the original has 6 large stones and the replacement is 35 small pavé stones, show the replacement's real design — never invent large versions to match the source layout. SEMANTIC MATCHING: identify what kind of detail the source is photographing (gemstone field, pavé, prong row, letter edge, engraved surface, bail, hinge, sidewall, link, clasp, bezel, metal edge, back plate) and reproduce the REPLACEMENT's corresponding detail at the same macro scale. If no directly corresponding detail exists, use the closest visible region of the replacement and infer minimally — never revert to the original's geometry and never invent decorative detail. Stay at the source's macro distance (if 1:1 macro, remain 1:1 macro — do not pull back to a hero/product shot) and show only the amount of replacement jewelry appropriate for the existing crop. In macro the replaced region MAY cover most of the frame — the only protected pixels are the non-jewelry environmental background, which still must come from SOURCE_FRAME (never import the reference's background, hand, finger, glove, surface, box or lighting). Relight the replacement detail to match SOURCE_FRAME while keeping physically realistic diamond optics (crisp brilliance, internal refraction, independent scintillation, spectral dispersion) and source-consistent metal specular response. Prefer references in this order for the detail: Macro Detail, then CAD/design-authority, then the closest matching side/front/back, then highest-resolution product reference, then others.";

const MACRO_FORCED_PREFIX =
  "MODE: MACRO. This frame IS a local-detail / extreme macro of the jewelry — apply the following unconditionally, and in this frame the \"modify the smallest possible region\" rule does NOT override it: the only protected region is the non-jewelry environmental background.";

const STANDARD_FORCED_PREFIX =
  "MODE: STANDARD. Treat this frame as a normal full or partial product view: use the strict surgical object-replacement strategy above (identify the original jewelry region, remove the whole original jewelry identity, reconstruct the replacement in its place, and leave every non-jewelry pixel identical to SOURCE_FRAME). Ignore the macro paragraph below entirely.";

const AUTO_CLASSIFY_BLOCK =
  "MODE: AUTO. Before generating, silently classify SOURCE_FRAME internally as exactly one of: FULL_FRONT, FULL_3Q, SIDE, BACK, PARTIAL_FRONT, PARTIAL_SIDE, PARTIAL_BACK, MACRO_STONES, MACRO_LETTERING, MACRO_METAL, MACRO_EDGE, MACRO_LINK, MACRO_BAIL_OR_CONNECTOR, ABSTRACT_PRODUCT_DETAIL. Do not output the classification. For FULL_* / PARTIAL_* / SIDE / BACK views apply the STANDARD strict surgical replacement strategy above. For MACRO_* and ABSTRACT_PRODUCT_DETAIL apply the MACRO strategy below. MACRO means the photographed subject is a LOCAL DETAIL of the jewelry (individual stones, pavé, prongs, a letter section, an edge, a sidewall, links, engraving, a bezel, or bail/connector detail) — NOT merely that the jewelry is large in the frame. A tight but recognizable full-product shot is STANDARD.";

const MACRO_CONDITIONAL_PREFIX =
  "MACRO STRATEGY (apply only if the classification above is a MACRO_* / ABSTRACT_PRODUCT_DETAIL frame; it then takes precedence over the \"modify the smallest possible region\" rule, whose protected region becomes the non-jewelry environmental background only — otherwise ignore this paragraph entirely):";

export type ReplacementMode = "auto" | "standard" | "macro";

function normalizeMode(mode: unknown, legacyMacro?: boolean): ReplacementMode {
  const raw = String(mode ?? "").trim().toLowerCase();
  if (raw === "macro" || raw === "standard" || raw === "auto") return raw as ReplacementMode;
  return legacyMacro === true ? "macro" : "auto";
}

function modeBlock(mode: ReplacementMode) {
  if (mode === "macro") return `${MACRO_FORCED_PREFIX}\n${MACRO_REPLACEMENT_BLOCK}`;
  if (mode === "standard") return STANDARD_FORCED_PREFIX;
  return `${AUTO_CLASSIFY_BLOCK}\n\n${MACRO_CONDITIONAL_PREFIX}\n${MACRO_REPLACEMENT_BLOCK}`;
}

/**
 * COVERAGE — a SECOND classification, independent of VIEW (front/side/back) and
 * of Mode. It expresses how MUCH of the product the source frame shows.
 */
export type Coverage = "auto" | "full" | "partial" | "macro";

function normalizeCoverage(coverage: unknown, mode?: ReplacementMode): Coverage {
  const raw = String(coverage ?? "").trim().toLowerCase();
  if (raw === "full" || raw === "partial" || raw === "macro" || raw === "auto") {
    return raw as Coverage;
  }
  // Mode = macro implies macro coverage when the user hasn't forced one.
  return mode === "macro" ? "macro" : "auto";
}

const COVERAGE_FULL_BLOCK =
  "COVERAGE: FULL_OBJECT. The source shows the COMPLETE original jewelry product, so show the COMPLETE replacement product. Preserve the replacement's true dimensions and aspect ratio, but SCALE and POSITION it so its entire physical extent is visible inside the frame — fit: contain, never cover. Do not crop either end. Do not cut off the clasp, terminal links, top, bottom or other meaningful extremities. Do not stretch or distort its aspect ratio, and do not force it into the original object's silhouette or dimensions. Keep approximately the same photographic breathing room and negative space as SOURCE_FRAME.";

const COVERAGE_PARTIAL_BLOCK =
  "COVERAGE: PARTIAL_OBJECT. The source intentionally crops the jewelry. Preserve that crop type. Do not reveal the complete replacement merely for product readability — only the portion physically appropriate to this exact source camera/framing should remain visible; the replacement may leave the frame as the original did.";

const COVERAGE_MACRO_BLOCK =
  "COVERAGE: MACRO_DETAIL. Remain at local-detail scale. Do not reveal the entire replacement. Rebuild the visible jewelry region using the closest corresponding target-product detail at comparable magnification (e.g. 1–3 links / clasp / pavé surface for a bracelet) — never the whole product.";

const COVERAGE_AUTO_PREFIX =
  "COVERAGE CLASSIFICATION (independent of the view side and of the Mode above): Before generating, silently classify the SOURCE_FRAME's COVERAGE as exactly one of FULL_OBJECT (the complete product is visible), PARTIAL_OBJECT (the product is intentionally cropped by the frame) or MACRO_DETAIL (only a local detail of the product is photographed). Do not output the classification. Then apply ONLY the matching coverage rule below and ignore the other two.";

/** Coverage instructions: forced when the user picked one, self-classified on auto. */
function coverageBlock(coverage: Coverage, mode: ReplacementMode) {
  // Coherence with Mode: Mode = macro OR coverage = macro ⇒ treat as macro.
  if (coverage === "macro" || (coverage === "auto" && mode === "macro")) return COVERAGE_MACRO_BLOCK;
  if (coverage === "full") return COVERAGE_FULL_BLOCK;
  if (coverage === "partial") return COVERAGE_PARTIAL_BLOCK;
  return [
    COVERAGE_AUTO_PREFIX,
    COVERAGE_FULL_BLOCK,
    COVERAGE_PARTIAL_BLOCK,
    COVERAGE_MACRO_BLOCK,
  ].join("\n\n");
}

/** Reference photography context can never transfer — gloves, hands, boxes, studio. */
const REFERENCE_IMAGE_CONTEXT_RULE =
  "REFERENCE IMAGE CONTEXT RULE: Only extract the physical jewelry product from the product references. The glove, hand, fingers, wrist, neck, display surface, box, velvet, background, shadows, studio environment and any unrelated objects visible in the product references are DISPOSABLE photographic context — never reproduce them. Every pixel outside the replacement jewelry region must derive from SOURCE_FRAME.";

const REFERENCE_ROLE_PRIORITY_LINE =
  "REFERENCE ROLE PRIORITY: Use the CAD / design-authority (and otherwise cleanest) reference as the GEOMETRY authority. Use the photographic references — which may legitimately contain gloves, hands, wrists, boxes, trays or studio backdrops — ONLY for real material truth: metal alloy and rose-gold/white-gold/yellow-gold finish, polish, diamond and pavé appearance, scintillation and manufacturing micro-texture. Never use any photographic reference for environment, background, framing or composition.";

/* ------------------------------------------------------------------ *
 * STRUCTURED PRODUCT AUTHORITY
 * ------------------------------------------------------------------ *
 * The piece card now carries hard product facts (stone, stone color,
 * quality, one or more regional settings). They are injected into the
 * SAME prompt as a mandatory specification block — never a separate
 * prompt — and they outrank the model's own aesthetic inference.
 */

/** Normalized structured settings for a piece, dropping empty/Auto entries. */
function pieceSettings(piece: JewelryPiece): JewelrySetting[] {
  const raw = Array.isArray(piece.settings) ? piece.settings : [];
  const out: JewelrySetting[] = [];
  for (const entry of raw) {
    const type = String((entry as any)?.type ?? "").trim();
    if (!type || isAuto(type)) continue;
    out.push({
      type,
      region: String((entry as any)?.region ?? "").trim() || null,
      stone: String((entry as any)?.stone ?? "").trim() || null,
      color: String((entry as any)?.color ?? "").trim() || null,
      quality: String((entry as any)?.quality ?? "").trim() || null,
    });
  }
  return out;
}

/** Resolved, verifiable spec for one piece — also stored in input_payload. */
type TargetSpec = {
  type: string | null;
  metal: string | null;
  stone: string | null;
  stoneColor: string | null;
  quality: string | null;
  settings: { region: string | null; type: string; stone?: string | null; color?: string | null; quality?: string | null }[];
  dimensions: string | null;
  /** Provenance per field: user_override | gemini_detected | unknown. */
  sources: Record<string, string>;
};

/**
 * Resolves every structured field to a REAL value before the prompt is built.
 * A user value always wins (user_override). "Auto from reference" is replaced
 * by the detected value when the intake analysis found one; if nothing was
 * detected the field is simply omitted — "Auto" is never sent to the model.
 */
function resolveTargetSpec(piece: JewelryPiece): TargetSpec {
  const dims = piece.dimensions ?? null;
  const width = Number(dims?.width ?? NaN);
  const height = Number(dims?.height ?? NaN);
  const depth = Number(dims?.depth ?? NaN);
  const weight = Number(dims?.weight ?? NaN);
  const hasDims = [width, height, depth].some((value) => Number.isFinite(value) && value > 0);
  const dimText = hasDims
    ? `${[width, height, depth]
      .map((value) => (Number.isFinite(value) && value > 0 ? String(value) : "?"))
      .join("×")} mm${Number.isFinite(weight) && weight > 0 ? `, ~${weight} g` : ""}`
    : Number.isFinite(weight) && weight > 0
      ? `~${weight} g`
      : null;

  const detected = piece.detected ?? null;
  const provenance = piece.sources ?? null;
  const sources: Record<string, string> = {};

  /**
   * user value → detected value → null, recording which one was used.
   * A card field the user never touched (provenance != "user_override") is a
   * CONTROL DEFAULT, not a confirmed fact, so the analysis-detected value wins
   * for it. This keeps a never-edited dropdown default out of the prompts.
   */
  const resolve = (field: string, userValue: unknown, detectedValue: unknown) => {
    const user = String(userValue ?? "").trim();
    const auto = String(detectedValue ?? "").trim();
    const userConfirmed = !provenance || provenance[field] === "user_override";
    if (userConfirmed && user && !isAuto(user)) {
      sources[field] = "user_override";
      return user;
    }
    if (auto && !isAuto(auto)) {
      sources[field] = "gemini_detected";
      return auto;
    }
    if (user && !isAuto(user)) {
      sources[field] = provenance?.[field] ?? "unknown";
      return user;
    }
    sources[field] = "unknown";
    return null;
  };


  const userSettings = pieceSettings(piece);
  const detectedSettings = (Array.isArray(detected?.settings) ? detected!.settings! : [])
    .map((setting) => ({
      type: String(setting?.type ?? "").trim(),
      region: String(setting?.region ?? "").trim() || null,
    }))
    .filter((setting) => setting.type && !isAuto(setting.type));

  const settings = userSettings.length
    ? userSettings.map((setting) => ({
      region: setting.region,
      type: String(setting.type),
      stone: setting.stone,
      color: setting.color,
      quality: setting.quality,
    }))
    : detectedSettings.map((setting) => ({
      region: setting.region,
      type: setting.type,
      stone: null,
      color: null,
      quality: null,
    }));
  sources.settings = userSettings.length
    ? "user_override"
    : detectedSettings.length
      ? "gemini_detected"
      : "unknown";

  return {
    type: resolve("type", piece.type, detected?.type),
    metal: resolve("metal", piece.metal, detected?.metal),
    stone: resolve("stone", piece.stone, detected?.stone),
    stoneColor: resolve("stoneColor", piece.stoneColor, detected?.stoneColor),
    quality: resolve("quality", piece.quality, detected?.quality),
    settings,
    dimensions: dimText,
    sources,
  };
}


/** The mandatory TARGET JEWELRY SPECIFICATION line, or null when everything is Auto. */
function targetSpecLine(spec: TargetSpec) {
  const parts: string[] = [];
  if (spec.type) parts.push(`TYPE: ${spec.type}`);
  if (spec.metal) parts.push(`METAL: ${spec.metal}`);
  if (spec.stone) parts.push(`STONE: ${spec.stone}`);
  if (spec.stoneColor) parts.push(`STONE COLOR: ${spec.stoneColor}`);
  if (spec.quality) parts.push(`QUALITY: ${spec.quality}`);
  if (spec.settings.length) {
    const settings = spec.settings
      .map((setting) => {
        const overrides = [setting.stone, setting.color, setting.quality].filter(Boolean).join(", ");
        const base = setting.region ? `${setting.region}: ${setting.type}` : setting.type;
        return overrides ? `${base} (${overrides})` : base;
      })
      .join("; ");
    parts.push(`SETTINGS: ${settings}`);
  }
  if (spec.dimensions) parts.push(`DIMENSIONS/WEIGHT: ${spec.dimensions}`);
  if (parts.length <= 1 && !spec.stone && !spec.settings.length && !spec.stoneColor) return null;
  return `TARGET JEWELRY SPECIFICATION — ${parts.join("; ")}. These structured specifications are MANDATORY product constraints. Do not reinterpret them or substitute another setting style, stone color, stone shape, or stone layout for aesthetic reasons.`;
}

const SETTING_AUTHORITY_LINE =
  "SETTING AUTHORITY: Reproduce the replacement jewelry's actual stone-setting construction exactly as the declared setting appears on the references. Do NOT convert the declared setting into a different or easier setting style, do not convert baguettes into rounds, do not add a large center stone unless the design contains one, and do not invent halo rows, bezels, channels, prongs, clusters or decorative stones not supported by the CAD, product references, or the Setting specification.";

const STONE_COLOR_LOCK_LINE =
  "STONE COLOR LOCK: Maintain the specified gemstone/diamond body color consistently across the whole object. Metal reflections and source lighting may alter perceived highlights, but the physical stone color must not change.";

const COLORLESS_LINE = "The diamonds remain visually colorless/white.";

const OPTICS_VS_COLOR_LINE =
  "OPTICS vs COLOR: Spectral fire (white, blue, cyan, green, yellow, orange, restrained red/violet flashes from dispersion) is ALLOWED and does NOT change body color. Do not render colored diamonds (pink/champagne/yellow/blue) unless Stone Color specifies them.";

const NO_INVENT_NEGATIVES_LINE =
  "NO-INVENT NEGATIVES: No invented center stones, no added oversized diamonds, no random baguettes or marquise, no added halos or extra stone rows, no changing round↔fancy cuts, no arbitrary stone-size variation, no substituting a different setting style for the declared one, no setting-style drift, no stone-color drift. No uniform same-size stone field when the reference uses mixed sizes. No regularized grid layout when the reference layout is irregular. No invented fancy cuts.";

const SPEC_HIERARCHY_LINE =
  "SPECIFICATION HIERARCHY: CAD / design-authority references (geometry) > structured product fields (material, stone, stone color, quality, setting) > labeled product references (appearance) > Notes > model inference. If Notes conflict with the structured fields, the structured fields win unless the Notes explicitly state that they override them.";

const AUTHORITY_HIERARCHY_LINE =
  "AUTHORITY HIERARCHY (strict, highest first): 1) the user's structured product specification (type, metal, stone, stone color, quality, setting) — MANDATORY; 2) CAD / design-authority reference(s) — engineering truth for geometry, stone-size distribution, placement and construction; 3) the relevant product photographs — real material truth (metal alloy and color, polish, stone appearance, scintillation, micro-texture); 4) automated visual analysis — ANALYSIS ONLY, it may describe but may NEVER override an explicit setting, stone color, metal or quality; 5) Notes; 6) model inference (lowest). Whatever setting the user declared can NEVER be silently replaced with a different setting style or a uniform stone field because that is easier or faster to render. If a lower authority disagrees with a higher one, the higher one wins without exception.";

/** All settings the user declared, e.g. ["Entire Piece: Reverse Mosaic"]. */
function declaredSettingList(specs: TargetSpec[]) {
  return uniqueValues(
    resolvedSettings(specs).map((setting) => `${setting.region}: ${setting.type}`),
  );
}


/** True when a single stone-color value is a colorless/white option. */
function isColorlessValue(color?: string | null) {
  return !!color && /colorless|white|d–f|d-f|g–j|g-j/i.test(color);
}

/** True when every specified stone color is a colorless/white option. */
function isColorlessSpec(specs: TargetSpec[]) {
  const colors = specs.map((spec) => spec.stoneColor).filter(Boolean) as string[];
  if (!colors.length) return false;
  return colors.every((color) => isColorlessValue(color));
}

/**
 * Every specified setting across all pieces, with piece-level inheritance
 * applied per setting. A setting's OWN stone/color/quality always wins, so a
 * Clasp setting never inherits the Links setting's overrides.
 */
function resolvedSettings(specs: TargetSpec[]) {
  const out: {
    region: string;
    type: string;
    stone: string | null;
    color: string | null;
    quality: string | null;
    inherited: boolean;
  }[] = [];
  for (const spec of specs) {
    for (const setting of spec.settings) {
      out.push({
        region: setting.region || "Entire Piece",
        type: setting.type,
        stone: setting.stone || spec.stone,
        color: setting.color || spec.stoneColor,
        quality: setting.quality || spec.quality,
        inherited: !setting.stone && !setting.color && !setting.quality,
      });
    }
  }
  return out;
}

function uniqueValues(values: (string | null | undefined)[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
  }
  return out;
}

/**
 * Hard STONE ENGINEERING LOCK — fully SETTING-AGNOSTIC.
 *
 * One dynamic block per setting REGION:
 *   SETTING: {selected_setting}. REGION: {region}.
 *   VISUAL CONSTRUCTION: {gemini settingVisualSignature for that region}.
 * followed by the same generic enforcement for every setting family. No
 * setting name is hardcoded anywhere in this builder — Mosaic, Reverse Mosaic,
 * Channel, Bezel, Invisible, Tennis, Custom and any future setting all flow
 * through the identical mechanism, and a name only appears here because the
 * USER selected it.
 */
function stoneEngineeringLockBlock(
  specs: TargetSpec[],
  product?: GeminiProductAnalysis | null,
): string | null {
  const settings = resolvedSettings(specs);
  if (!settings.length) return null;

  const signatures = settingSignatures(product ?? null);
  /** Match a signature to a region/setting; fall back to the only signature. */
  const signatureFor = (region: string, type: string) => {
    const norm = (value: unknown) => String(value ?? "").trim().toLowerCase();
    return (
      signatures.find(
        (sig) => norm(sig.region) === norm(region) && norm(sig.declaredSetting) === norm(type),
      ) ??
      signatures.find((sig) => norm(sig.region) === norm(region)) ??
      signatures.find((sig) => norm(sig.declaredSetting) === norm(type)) ??
      (signatures.length === 1 && settings.length === 1 ? signatures[0] : null)
    );
  };

  const stones = uniqueValues(settings.map((s) => s.stone));
  const colors = uniqueValues(settings.map((s) => s.color));
  const qualities = uniqueValues(settings.map((s) => s.quality));
  const stoneText = stones.length ? stones.join(" / ") : "as shown in the references";
  const colorText = colors.length ? colors.join(" / ") : "as shown in the references";
  const qualityText = qualities.length ? qualities.join(" / ") : "as shown in the references";
  const bodyColorText = colors.length
    ? colors.every((color) => isColorlessValue(color))
      ? "colorless / white"
      : colors.join(" / ")
    : "the specified body color";

  const blocks: string[] = [
    "STONE ENGINEERING LOCK — the setting(s) below are the user's declared construction. The exact visual interpretation of each one is DEFINED BY the uploaded CAD / design-authority reference and the real product photographs, never by the generic setting name and never by a default house style.",
  ];

  for (const setting of settings) {
    const sig = signatureFor(setting.region, setting.type);
    const described = sig ? describeSignature(sig) : "";
    blocks.push(
      [
        `SETTING: ${setting.type}. REGION: ${setting.region}.`,
        `VISUAL CONSTRUCTION: ${
          described || "as defined by the CAD / design-authority reference and the product photographs for this region"
        }.`,
        "Reproduce this exact reference/CAD-defined setting construction. Do not substitute another setting style, regularize the layout, change stone cuts/sizes/colors, or invent unsupported stones. Preserve the reference's stone placement, orientation, spacing, density and metal work for this region exactly as shown.",
      ].join(" "),
    );
  }

  blocks.push(
    `STONE: ${stoneText}. STONE COLOR: ${colorText}. QUALITY: ${qualityText}. The stones remain physically ${bodyColorText}. Rainbow blue/cyan/green/yellow/orange/red flashes may appear only as spectral dispersion from real diamond facets; they do NOT indicate a colored diamond body color.`,
  );
  blocks.push(
    "If the CAD shows stone size, stone placement, component geometry, width, closure/clasp construction or setting distribution, that CAD information is authoritative — treat CAD as engineering truth, not inspiration.",
  );

  return blocks.join("\n");
}

/** Per-region setting breakdown, emitted when more than one setting exists. */
function multiSettingBlock(specs: TargetSpec[]): string | null {
  const settings = resolvedSettings(specs);
  if (settings.length < 2) return null;
  const rows = settings.map((s) => {
    const details = [
      s.stone ? `stone: ${s.stone}` : null,
      s.color ? `stone color: ${s.color}` : null,
      s.quality ? `quality: ${s.quality}` : null,
    ].filter(Boolean).join(", ");
    return `- ${s.region} → ${s.type}${details ? ` (${details})` : ""}${
      s.inherited ? " [inherits the piece-level stone/color/quality]" : " [region-specific override — do NOT inherit another region's values]"
    }`;
  });
  return [
    "MULTI-SETTING MAP: each region below has its OWN setting construction and its own stone/color/quality. Render each region exactly as specified:",
    ...rows,
    "Regions are independent: a Clasp setting must NOT inherit the Links setting (or any other region's construction) when a different clasp construction is specified. Do not average, blend or unify the regions into a single setting style.",
  ].join("\n");
}

/**
 * Compact PKM / analysis-derived ENGINEERING LOCK: the measurable construction
 * facts (stone-size class, packing/spacing, exposed metal, module geometry) for
 * each declared region. Setting-agnostic — a name only appears because it was
 * resolved from the confirmed spec.
 */
function engineeringLockLines(
  specs: TargetSpec[],
  product?: GeminiProductAnalysis | null,
): string | null {
  const settings = resolvedSettings(specs);
  const signatures = settingSignatures(product ?? null);
  const norm = (value: unknown) => String(value ?? "").trim().toLowerCase();
  const signatureFor = (region: string, type: string) =>
    signatures.find((sig) => norm(sig.region) === norm(region) && norm(sig.declaredSetting) === norm(type)) ??
      signatures.find((sig) => norm(sig.region) === norm(region)) ??
      signatures.find((sig) => norm(sig.declaredSetting) === norm(type)) ??
      (signatures.length === 1 ? signatures[0] : null);

  const rows: string[] = [];
  for (const setting of settings) {
    const described = (() => {
      const sig = signatureFor(setting.region, setting.type);
      const text = sig ? describeSignature(sig) : "";
      return text ? text.slice(0, 320) : "as constructed on the CAD / product references";
    })();
    const details = [setting.stone, setting.color, setting.quality].filter(Boolean).join(", ");
    rows.push(`- ${setting.region} → ${setting.type}${details ? ` (${details})` : ""}: ${described}.`);
  }
  if (!rows.length && !signatures.length) return null;
  if (!rows.length) {
    return [
      "ENGINEERING LOCK (observed construction — reproduce exactly):",
      `- ${describeSignature(signatures[0]).slice(0, 320)}.`,
    ].join("\n");
  }
  return [
    "ENGINEERING LOCK (per region: stone-size class, packing/spacing, exposed metal, module geometry — reproduce exactly, region by region, no averaging between regions):",
    ...rows.slice(0, 6),
  ].join("\n");
}

/** One-line replacement-mode instruction (compact form of modeBlock). */
function compactModeLine(mode: ReplacementMode) {
  if (mode === "macro") {
    return "MODE: MACRO. Stay at local-detail scale and rebuild only the corresponding detail of the replacement (links, clasp, setting surface) — never reveal the whole product.";
  }
  if (mode === "standard") {
    return "MODE: STANDARD. Rebuild the jewelry region at the source's existing scale and framing.";
  }
  return "MODE: AUTO. Silently judge whether SOURCE_FRAME is a normal shot or a macro detail, then rebuild only the correspondingly-scaled region of the replacement.";
}

/** One-line coverage instruction (compact form of coverageBlock). */
function compactCoverageLine(coverage: Coverage, mode: ReplacementMode) {
  if (coverage === "macro" || (coverage === "auto" && mode === "macro")) {
    return "COVERAGE: MACRO_DETAIL — reproduce the matching replacement detail at the same magnification; do not reveal the whole product.";
  }
  if (coverage === "full") {
    return "COVERAGE: FULL_OBJECT — the complete replacement is visible, fit inside the frame (contain) at its true proportions; do not crop its ends or distort its aspect ratio.";
  }
  if (coverage === "partial") {
    return "COVERAGE: PARTIAL_OBJECT — keep the source's intentional crop; do not reveal the complete piece for readability.";
  }
  return "COVERAGE: AUTO — silently classify SOURCE_FRAME as full product, intentionally cropped, or macro detail, and keep the replacement at exactly that coverage.";
}





/** Targeted corrective lines appended when the user regenerates with a reason. */
const FAILURE_CORRECTIONS: Record<string, string> = {
  "wrongangle":
    "CORRECTION: The previous result changed the viewing angle. Match the original source-frame yaw, pitch, roll, perspective and visible surfaces exactly. Do not convert the shot into a frontal product view.",
  "wrongcrop":
    "CORRECTION: The previous result revealed substantially more of the replacement object than exists in the source composition. Preserve the source crop exactly. Do not pull the camera backward. Do not reveal the full jewelry piece. Render only the replacement geometry physically visible from this exact source-frame camera position.",
  "wrongcrop/zoom":
    "CORRECTION: The previous result revealed substantially more of the replacement object than exists in the source composition. Preserve the source crop exactly. Do not pull the camera backward. Do not reveal the full jewelry piece. Render only the replacement geometry physically visible from this exact source-frame camera position.",
  "wrongbail":
    "CORRECTION: The previous result changed the bail/connector construction. Use the uploaded bail, connector, side and design-authority references as strict geometry authority. Preserve exact outer silhouette, opening, thickness, hinge, attachment and stone layout.",
  "wrongbail/connector":
    "CORRECTION: The previous result changed the bail/connector construction. Use the uploaded bail, connector, side and design-authority references as strict geometry authority. Preserve exact outer silhouette, opening, thickness, hinge, attachment and stone layout.",
  "wrongjewelrygeometry":
    "CORRECTION: the previous attempt drifted from the replacement object's real geometry. Reproduce the reference silhouette, dimensions, proportions, thickness, depth, borders, cutouts, negative space and structural features exactly — geometry may not be softened, averaged, stylised or redesigned.",
  "wrongstones/details":
    "CORRECTION: the previous attempt got the stones wrong. Reproduce the reference's exact stone layout, cuts, sizes, density and setting geometry — no invented, added, removed or resized stones.",
  "wrongstones/setting":
    "CORRECTION: the previous attempt got the stones or setting wrong. Reproduce the reference's exact stone layout, cuts, sizes, density, prong/bezel/pavé setting geometry and seat locations — no invented, added, removed or resized stones.",
  "wronglettering/logo":
    "CORRECTION: the previous attempt got the lettering/logo wrong. Reproduce the reference's exact letterforms, symbols, spacing and relief, at SOURCE_FRAME's rotation — never rotate lettering upright for legibility.",
  "wrongsize":
    "CORRECTION: the previous attempt mis-scaled the piece. Keep the replacement's real physical proportions from the references, occupying approximately the same region of the frame the original jewelry occupied.",
  "wrongscale":
    "CORRECTION: the previous attempt mis-scaled the piece. Keep the replacement's real physical proportions from the references, occupying approximately the same region of the frame the original jewelry occupied — do not enlarge or shrink it relative to the wearer or the source composition.",
  "wrongrotation":
    "CORRECTION: the previous attempt rotated the replacement object. Match SOURCE_FRAME's exact yaw, pitch and roll of the original jewelry — do not straighten, level or re-orient the piece for legibility or presentation.",
  "hallucinatedgeometry":
    "CORRECTION: the previous attempt invented structure. Do not add stones, prongs, hinges, engraving, lettering or decorative elements that no reference shows; infer minimally and only where unavoidable.",
  "hallucinateddetail":
    "CORRECTION: the previous attempt invented detail. Do not add stones, prongs, hinges, engraving, lettering, textures or decorative elements that no reference shows; infer minimally and only where unavoidable.",
  "wrongchaininteraction":
    "CORRECTION: the previous attempt broke the chain interaction. Preserve SOURCE_FRAME's chain placement, path, tension, contact and occlusion exactly, and attach the replacement at its own reference attachment point.",
  "referencebackgroundleakedin":
    "CORRECTION: The previous generation incorrectly copied environmental/contextual elements from a jewelry product reference (background, hands, gloves, props, surfaces or lighting). Remove ALL such contamination. The jewelry reference controls ONLY the target jewelry object's physical construction. Restore every non-jewelry region from SOURCE_FRAME exactly.",
  "originaljewelrystillvisible":
    "CORRECTION: The previous attempt preserved recognizable microscopic construction from the original source jewelry. Completely remove the source jewelry's stones, setting pattern, metal geometry and decorative details. Rebuild the jewelry-filled portion from the replacement references while preserving only the source camera, crop, depth of field and lighting.",
  "macrodetaildoesn'tmatchreference":
    "CORRECTION: The previous attempt invented or incorrectly translated the replacement jewelry's microscopic design. Prioritize the uploaded Macro Detail / CAD / closest product references and reproduce the replacement's actual stone cuts, settings, metal construction and surface geometry.",
  "macrodetaildoesntmatchreference":
    "CORRECTION: The previous attempt invented or incorrectly translated the replacement jewelry's microscopic design. Prioritize the uploaded Macro Detail / CAD / closest product references and reproduce the replacement's actual stone cuts, settings, metal construction and surface geometry.",
  "macrodetaildoesn’tmatchreference":
    "CORRECTION: The previous attempt invented or incorrectly translated the replacement jewelry's microscopic design. Prioritize the uploaded Macro Detail / CAD / closest product references and reproduce the replacement's actual stone cuts, settings, metal construction and surface geometry.",
  "macromismatch":
    "CORRECTION: The previous attempt invented or incorrectly translated the replacement jewelry's microscopic design, or matched the wrong kind of detail. Identify what detail the source is photographing and reproduce the REPLACEMENT's corresponding detail at the same macro scale, prioritizing the uploaded Macro Detail / CAD / closest product references.",
  "incompletereplacement":
    "CORRECTION: Previous result left recognizable original jewelry in the target region. Remove ALL original identity and rebuild the entire jewelry region from the references.",
  "hybridofold+new":
    "CORRECTION: Previous generation created a hybrid object containing recognizable elements from the original jewelry. Completely remove all source-jewelry identity from the target region. Reconstruct one coherent replacement object exclusively from the uploaded jewelry references.",
  "hybridofoldandnew":
    "CORRECTION: Previous generation created a hybrid object containing recognizable elements from the original jewelry. Completely remove all source-jewelry identity from the target region. Reconstruct one coherent replacement object exclusively from the uploaded jewelry references.",
  "hybridold+new":
    "CORRECTION: Previous generation created a hybrid object containing recognizable elements from the original jewelry. Completely remove all source-jewelry identity from the target region. Reconstruct one coherent replacement object exclusively from the uploaded jewelry references.",
  "hybridoldnew":
    "CORRECTION: Previous generation created a hybrid object containing recognizable elements from the original jewelry. Completely remove all source-jewelry identity from the target region. Reconstruct one coherent replacement object exclusively from the uploaded jewelry references.",
  "macrodetailincorrect":
    "CORRECTION: The previous attempt invented or incorrectly translated the replacement jewelry's microscopic design, or matched the wrong kind of detail. Identify what detail the source is photographing and reproduce the REPLACEMENT's corresponding detail at the same macro scale, prioritizing the uploaded Macro Detail / CAD / closest product references.",
  "wrongreplacementsection":
    "CORRECTION: The previous attempt reproduced the wrong region of the replacement object. Re-identify which part of the piece SOURCE_FRAME is showing, then render the REPLACEMENT's corresponding part — same component, same approximate scale, same viewing side.",
  "wrongfront/back/side":
    "CORRECTION: Match the source's viewing side and prioritize the correspondingly-labeled reference (Back/Side/CAD); do not switch to a front hero view.",
  "wrongfrontbackside":
    "CORRECTION: Match the source's viewing side and prioritize the correspondingly-labeled reference (Back/Side/CAD); do not switch to a front hero view.",
  "replacementcutoff":
    "CORRECTION: The source is a full-product composition but the previous replacement was cropped. Preserve the replacement's true proportions and scale the ENTIRE product to fit inside the source frame (fit: contain). Keep all meaningful ends, edges, clasp/closure and overall silhouette visible with natural negative space. Do not crop the replacement.",
  "possiblereferencecontextleak":
    "CORRECTION: The previous generation incorrectly copied environmental/contextual elements from a jewelry product reference (background, hands, gloves, props, surfaces or lighting). Remove ALL such contamination. The jewelry reference controls ONLY the target jewelry object's physical construction. Restore every non-jewelry region from SOURCE_FRAME exactly.",
  "wrongsetting":
    "CORRECTION: The previous generation used an incorrect stone-setting method. Follow the structured Setting specification and the relevant CAD/product references exactly. Do not substitute generic pavé or another setting style.",
  "wrongstonecolor":
    "CORRECTION: The previous generation changed the physical stone color. Restore the exact specified Stone Color. Spectral flashes are optical dispersion only and must not alter the gemstones' actual body color.",
  "wrongstoneshape":
    "CORRECTION: Preserve the exact stone cuts and shapes represented by the design authority and product references. Do not replace fancy-cut stones with rounds or invent other cuts.",
  "wrongstonesize/layout":
    "CORRECTION: Preserve the reference/CAD-supported relative stone sizes, spacing, orientation and arrangement. Do not regularize the design into uniform rows unless the target design actually uses uniform rows.",
  "wrongstonesizelayout":
    "CORRECTION: Preserve the reference/CAD-supported relative stone sizes, spacing, orientation and arrangement. Do not regularize the design into uniform rows unless the target design actually uses uniform rows.",
  other:



    "CORRECTION: the previous attempt was inaccurate. Re-read SOURCE_FRAME for the shot and the references for the object's construction, and follow both strictly.",
};

/** Reasons arrive as UI labels ("Wrong crop / zoom") — match them space-insensitively. */
function normalizeFailureKey(reason: string) {
  return reason.trim().toLowerCase().replace(/\s+/g, "");
}

function failureCorrection(reason: unknown) {
  const raw = String(reason ?? "").trim();
  if (!raw) return null;
  const key = normalizeFailureKey(raw);
  return FAILURE_CORRECTIONS[key] ?? `${FAILURE_CORRECTIONS.other} Reported issue: "${raw}".`;
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
  /** Per-frame replacement mode: "auto" (self-classify), "standard", "macro". */
  mode?: ReplacementMode | string | null;
  /** Per-frame coverage: "auto" (self-classify), "full", "partial", "macro". */
  coverage?: Coverage | string | null;
  /** Legacy per-frame Macro toggle — equivalent to mode = "macro". */
  macro?: boolean;
  /** Stage-A still analysis for this frame (advisory). */
  frameAnalysis?: GeminiFrameAnalysis | null;
  /** Stage-A product-level analysis of the references (advisory). */
  productAnalysis?: GeminiProductAnalysis | null;
  /** DIAMOND OPTICS: cached analysed profile (global merged with frame refinement). */
  opticsProfile?: DiamondOpticsProfile | null;
  /** DIAMOND OPTICS: user Sparkle / Fire / advanced controls (AUTO by default). */
  opticsControls?: DiamondOpticsControls | null;
  /** DIAMOND OPTICS: add the temporal-consistency line (video rebuild stage). */
  opticsTemporal?: boolean;
  /** MASTER PRODUCT LOCK: the project's single authoritative product identity. */
  masterLock?: MasterProductLock | null;
  /** MATERIAL APPEARANCE AUTHORITY: material realism only — zero geometry. */
  materialAuthority?: MaterialAppearanceAuthority | null;
  /** CONNECTED PRODUCT SYSTEMS (§30): attachment rules for connected parts. */
  connectedAssets?: ConnectedAssetModel | null;

}) {
  let cursor = 2; // image 1 is the source frame
  const lines: string[] = [];
  const refLabels: string[] = [];
  const cadRefNums: number[] = [];
  let cadActive = false;
  // Prompt image number of the material-appearance authority, when that
  // reference is actually part of THIS frame's payload.
  const materialAuthorityUrl = String(args.materialAuthority?.referenceUrl ?? "").trim();
  let materialRefNum: number | null = null;

  // Resolved spec per piece, computed BEFORE the piece lines so the visible
  // product identity (type/metal/stone/color/setting) always comes from the
  // confirmed spec and never from a raw, possibly-default card field.
  const specs = args.pieces.map((piece) => resolveTargetSpec(piece));

  args.pieces.forEach((piece, pieceIndex) => {
    const refs = pieceReferences(piece);
    if (!refs.length) return;
    const spec = specs[pieceIndex];
    const refNums: number[] = [];
    for (const ref of refs) {
      const num = cursor++;
      refNums.push(num);
      refLabels.push(`reference image ${num} = ${ref.role ? ref.role : "Unlabeled view"}`);
      if (materialAuthorityUrl && ref.url === materialAuthorityUrl) materialRefNum = num;
      if (ref.cad) {
        cadActive = true;
        cadRefNums.push(num);
      }
    }
    // Product identity comes from the confirmed spec first, then the project's
    // MASTER PRODUCT LOCK — never a per-frame re-derivation of the product.
    const type = spec.type ?? masterLockProductType(args.masterLock ?? null) ??
      String(piece.type ?? "").trim() ?? "";
    const applyTo = String(piece.person ?? "Main subject").trim() || "Main subject";
    const notes = String(piece.notes ?? "").trim();
    if (piece.cad === true) cadActive = true;

    let line = `Replace the ${(type || "jewelry piece").toLowerCase()} on ${applyTo.toLowerCase()} with the piece in reference image(s) ${
      refListPhrase(refNums)
    }${notes ? `, described as "${notes}"` : ""}.`;

    if (spec.dimensions) {
      line += ` Physical size ${spec.dimensions} — believable mass and thickness, not paper-thin.`;
    }

    // Replacement scope: default to the narrowest safe scope (this piece only).
    const scope = String(piece.scope ?? "").trim().toLowerCase();
    line += scope === "piece_chain" || /chain/.test(scope)
      ? " SCOPE: this piece PLUS its attached chain/bracelet may be replaced together; everything else in SOURCE_FRAME stays untouched."
      : " SCOPE: replace ONLY this piece; keep SOURCE_FRAME's existing chain, bracelet, clasp, other jewelry and surroundings.";

    lines.push(line);
  });

  const preferred = String(args.preferredRole ?? "").trim();
  const correction = failureCorrection(args.failureReason);
  const manualMode = normalizeMode(args.mode, args.macro === true);
  const manualCoverage = normalizeCoverage(args.coverage, manualMode);
  const frameAnalysis = normalizeFrameAnalysis(args.frameAnalysis ?? null);
  const productAnalysis = normalizeProductAnalysis(args.productAnalysis ?? null);
  // Auto ONLY: Stage-A analysis resolves standard vs macro reconstruct and the
  // framing. Any manual selection wins outright.
  const mode = manualMode === "auto" ? (modeFromAnalysis(frameAnalysis) ?? "auto") : manualMode;
  const coverage = manualCoverage === "auto"
    ? (coverageFromAnalysis(frameAnalysis) ?? normalizeCoverage(null, mode))
    : manualCoverage;

  const specLines = specs.map((spec) => targetSpecLine(spec)).filter(Boolean) as string[];
  const declaredSettings = declaredSettingList(specs);
  const colorless = isColorlessSpec(specs);
  const engineeringLock = engineeringLockLines(specs, productAnalysis);
  // MASTER PRODUCT LOCK: derived once per reference set and inherited by every
  // frame. Sits UNDER the user's confirmed spec in the authority order.
  const masterLockBlock = masterLockPromptLines(args.masterLock ?? null, { compact: true });

  // §E4 — the prompt is compiled from ordered NAMED blocks. Each block holds the
  // same concise directives as before (no re-expansion, no raw JSON) and is
  // emitted only when its data exists.
  const prompt = compilePromptBlocks({
    /* TASK — REPLACEMENT LEADS. */
    TASK: [
      "TASK — FULL JEWELRY REPLACEMENT. Replace the jewelry in image 1 (SOURCE_FRAME) with the EXACT piece shown in the reference images. This is a full replacement, NOT a restyle: do NOT keep, blend or lightly edit the original jewelry. Remove the original piece's stones, setting pattern, metal geometry and decorative detail completely and rebuild that region as the referenced product.",
      "",
      `PIECES: ${lines.join(" ")}`,
    ],

    /* MASTER PRODUCT LOCK — inherited project product identity (§E1). */
    MASTER_PRODUCT_LOCK: masterLockBlock.length ? masterLockBlock : null,

    /* TARGET SPEC — mandatory identity, above every preservation rule. */
    TARGET_SPEC: [
      "TARGET IDENTITY — MANDATORY. The specification below defines WHAT must appear. It outranks aesthetics, model inference and the preservation rules further down. Never substitute another product type, metal, stone, stone color or setting construction.",
      specLines.length ? specLines.join("\n") : null,
      declaredSettings.length
        ? `SETTING LOCK: ${declaredSettings.join("; ")} — reproduce each declared construction exactly as built on the references; never swap it for another setting family and never regularize it into a uniform stone field.`
        : null,
    ],

    /* STONE ENGINEERING — engineering lock + stone-color rule. */
    STONE_ENGINEERING: [
      engineeringLock,
      colorless
        ? "STONE COLOR: keep the specified body color across the whole piece; colorless/white diamonds stay visually colorless. Spectral fire is allowed and never changes body color."
        : "STONE COLOR: keep the specified gemstone body color across the whole piece. Spectral fire is allowed and never changes body color.",
    ],

    /* CONNECTED ASSET — physical attachment rules (§30 / D8). */
    CONNECTED_ASSET: connectedAssetPromptLines(args.connectedAssets ?? null),

    /* SOURCE CAMERA — swap mode keeps the SOURCE cinematography. The campaign
       photography profile is deliberately NOT used on the swap path. */
    SOURCE_CAMERA: [
      "PRESERVE FROM SOURCE_FRAME (secondary — this must NEVER cause the original jewelry to be kept): camera position and angle, perspective, crop, zoom, composition, depth of field, focus plane, lighting, background, subject, skin, hair, clothing, hands, occlusion order, and the jewelry's position, orientation, rotation, tilt, visible percentage and scale. Only the jewelry's identity changes — never the shot. Geometry comes from the REFERENCES; framing comes from SOURCE_FRAME.",
    ],

    /* LIGHTING — swap mode inherits SOURCE_FRAME light (stated above). */
    LIGHTING: null,

    /* OPTICS — Diamond Optics Profile lines. */
    OPTICS: opticsPromptLines({
      profile: args.opticsProfile ?? null,
      controls: args.opticsControls ?? undefined,
      colorlessStones: colorless,
      stoneFamily: args.opticsProfile?.stoneFamily ?? null,
      temporal: args.opticsTemporal === true,
    }),

    /* FRAME INSTRUCTION — reconstruct mode + coverage for THIS frame. */
    FRAME_INSTRUCTION: [compactModeLine(mode), compactCoverageLine(coverage, mode)],

    /* REFERENCE ROUTING — which reference answers which region (§E2/§C3). */
    REFERENCE_ROUTING: [
      "REFERENCES = IDENTITY SOURCE. CAD / design-authority references are engineering truth for geometry, stone sizes, placement and construction. Photographic references are truth for material only (metal alloy and finish, polish, diamond appearance, micro-texture).",
      refLabels.length ? `REFERENCE VIEWS: ${refLabels.join("; ")}.` : null,
      refLabels.length
        ? "Identify which region of the piece SOURCE_FRAME shows, then rebuild that region from the best-matching labeled reference; use the others to stay consistent with the same physical object."
        : null,
      preferred
        ? `PREFERRED ANGLE REFERENCE: prioritize the reference labeled "${preferred}" as the primary geometry match for this frame.`
        : null,
      cadActive
        ? `CAD AUTHORITY: treat the CAD / design-authority reference as engineering truth, not inspiration${
          cadRefNums.length ? ` (image ${refListPhrase(cadRefNums)})` : ""
        }.`
        : null,
      ...materialAuthorityPromptLines(args.materialAuthority ?? null, {
        imageNumber: materialRefNum,
      }),
    ],

    /* CONTEXT FIREWALL — reference context never leaks into the frame. */
    CONTEXT_FIREWALL: [
      "CONTEXT FIREWALL: hands, gloves, wrists, necks, boxes, trays, backgrounds, shadows and studio context in the references are DISPOSABLE — never reproduce them. A reference controls ONLY the target jewelry object's construction and material.",
    ],

    /* NEGATIVES. */
    NEGATIVES: [
      "NEGATIVES: no hybrid of old and new piece, no invented stones/prongs/halos/center stones, no resized or recut stones, no regularized layouts, no stone-color drift, no reference background or props leaking in, no reframing, beautification or product-shot conversion, no rotating lettering upright for legibility.",
    ],

    CORRECTION: correction,
    EXTRA: String(args.extra ?? "").trim() || null,
  });

  return prompt;
}



/* ------------------------------------------------------------------ *
 * SEEDANCE DIRECTOR TIMELINE (reconstruct stage ONLY)
 * ------------------------------------------------------------------ *
 * The Seedance reference-to-video pass now gets a real luxury-jewelry
 * director's TIMED SHOT PLAN generated per run from the approved frames'
 * stored view/coverage/mode metadata + the structured product spec.
 * This builder is used ONLY by startReconstruction — the per-frame image
 * prompt (buildJewelryPrompt) and the Kling animate prompt are untouched.
 */

/** What one approved frame can be used for, cinematographically. */
type FrameRole =
  | "Full Hero"
  | "Full Front"
  | "Full 3-4"
  | "Side"
  | "Back"
  | "Overhead"
  | "Partial Detail"
  | "Macro Stones"
  | "Macro Setting"
  | "Macro Link"
  | "Macro Clasp"
  | "Macro Engraving"
  | "Chain-Link Track"
  | "Surface Detail";

/** One approved frame + the metadata the swap stage stored for it. */
type ApprovedFrame = {
  url: string;
  coverage: string | null;
  mode: string | null;
  roles: string[];
  index: number;
};

/** Classify a frame's cinematographic role from its stored view + coverage. */
function classifyFrameRole(frame: ApprovedFrame): FrameRole {
  const roleText = frame.roles.join(" ").toLowerCase();
  const coverage = String(frame.coverage ?? "auto").toLowerCase();
  const macro = coverage === "macro" || String(frame.mode ?? "").toLowerCase() === "macro";

  if (macro) {
    if (/clasp|closure|lock/.test(roleText)) return "Macro Clasp";
    if (/link|chain/.test(roleText)) return "Macro Link";
    if (/engrav|letter|logo|caseback/.test(roleText)) return "Macro Engraving";
    if (/setting|prong|bezel|channel|pav|gallery/.test(roleText)) return "Macro Setting";
    if (/stone|diamond|mosaic|ice|dial/.test(roleText)) return "Macro Stones";
    return "Surface Detail";
  }
  if (coverage === "partial") {
    if (/link|chain/.test(roleText)) return "Chain-Link Track";
    return "Partial Detail";
  }
  if (/back|caseback|underside/.test(roleText)) return "Back";
  if (/overhead|top/.test(roleText)) return "Overhead";
  if (/3\/4|3-4|three quarter/.test(roleText)) return "Full 3-4";
  if (/side|sidewall|profile|left|right|shank|bezel|case\b/.test(roleText)) return "Side";
  if (/front|face|crown|dial|main/.test(roleText)) return "Full Front";
  return "Full Hero";
}

/** Strongest-first ordering used when trimming the selected frame set. */
const FRAME_ROLE_PRIORITY: FrameRole[] = [
  "Full Hero",
  "Full Front",
  "Macro Stones",
  "Full 3-4",
  "Side",
  "Macro Setting",
  "Macro Link",
  "Macro Clasp",
  "Chain-Link Track",
  "Partial Detail",
  "Macro Engraving",
  "Surface Detail",
  "Back",
  "Overhead",
];

/** Dedupe near-identical frames by role and keep the ~5–9 strongest. */
function selectDirectorFrames(frames: ApprovedFrame[]) {
  const byRole = new Map<FrameRole, ApprovedFrame>();
  for (const frame of frames) {
    const role = classifyFrameRole(frame);
    if (!byRole.has(role)) byRole.set(role, frame);
  }
  const ordered = FRAME_ROLE_PRIORITY
    .filter((role) => byRole.has(role))
    .map((role) => ({ role, frame: byRole.get(role)! }));
  return ordered.slice(0, 9);
}

/** What camera geometry the approved set actually supports. */
type DirectorGeometry = {
  front: boolean;
  threeQuarter: boolean;
  side: boolean;
  back: boolean;
  overhead: boolean;
  macro: boolean;
  clasp: boolean;
  link: boolean;
  engraving: boolean;
  full: boolean;
};

function directorGeometry(selected: { role: FrameRole }[]): DirectorGeometry {
  const has = (role: FrameRole) => selected.some((entry) => entry.role === role);
  return {
    front: has("Full Front") || has("Full Hero"),
    threeQuarter: has("Full 3-4"),
    side: has("Side"),
    back: has("Back"),
    overhead: has("Overhead"),
    macro: has("Macro Stones") || has("Macro Setting") || has("Macro Link") ||
      has("Macro Clasp") || has("Macro Engraving") || has("Surface Detail"),
    clasp: has("Macro Clasp"),
    link: has("Macro Link") || has("Chain-Link Track"),
    engraving: has("Macro Engraving"),
    full: has("Full Hero") || has("Full Front") || has("Full 3-4") || has("Side") || has("Back"),
  };
}

/** One camera move + the geometry the approved references must support. */
type MotionShot = {
  key: string;
  /** Camera move + what it reveals. */
  text: (roleName: string) => string;
  /** Frame role this shot draws its geometry from. */
  needs: FrameRole[];
  supported: (geometry: DirectorGeometry) => boolean;
  /** Energy band: 1 = calm open, 2 = detail, 3 = dimensional, 4 = high energy, 5 = macro, 6 = hero end. */
  band: number;
};

/** Exact required wording — the jewelry NEVER whips, only the camera does. */
const WHIP_WORDING =
  "The camera performs the rapid whip-pan while the jewelry remains completely stationary. Motion blur is produced exclusively by camera movement.";

const MOTION_LIBRARY: MotionShot[] = [
  {
    key: "Hero Push",
    band: 1,
    needs: ["Full Hero", "Full Front"],
    supported: (g) => g.front,
    text: (role) => `slow hero push straight in on the ${role} view, revealing overall silhouette and proportion; product rigid`,
  },
  {
    key: "Surface-Contour Track",
    band: 2,
    needs: ["Macro Stones", "Surface Detail", "Partial Detail"],
    supported: (g) => g.macro,
    text: (role) => `camera tracks along the surface contour of the ${role} reference, reading stone field texture and metal separation; product rigid`,
  },
  {
    key: "Rack Focus",
    band: 2,
    needs: ["Macro Stones", "Macro Setting", "Full Front"],
    supported: (g) => g.macro || g.front,
    text: (role) => `static frame with a real optical rack focus across the ${role} detail, near plane sharpening as the far plane softens; product rigid`,
  },
  {
    key: "Micro Orbit",
    band: 3,
    needs: ["Full 3-4", "Side"],
    supported: (g) => g.threeQuarter || g.side,
    text: (role) => `micro orbit of only 3-8 degrees toward the ${role} reference, revealing real dimensional thickness; product rigid`,
  },
  {
    key: "Sidewall Glide",
    band: 3,
    needs: ["Side"],
    supported: (g) => g.side,
    text: (role) => `lateral glide along the ${role} reference, reading sidewall depth and machined edges; product rigid`,
  },
  {
    key: "Diagonal Parallax Slide",
    band: 3,
    needs: ["Full 3-4", "Full Front"],
    supported: (g) => g.threeQuarter || g.front,
    text: (role) => `diagonal parallax slide across the ${role} view, lights sweeping to build dimension; product rigid`,
  },
  {
    key: "Chain/Link Track",
    band: 3,
    needs: ["Chain-Link Track", "Macro Link"],
    supported: (g) => g.link,
    text: (role) => `camera tracks link to link along the ${role} reference, each link holding its exact engineered shape; product rigid`,
  },
  {
    key: "Overhead Descent",
    band: 3,
    needs: ["Overhead"],
    supported: (g) => g.overhead,
    text: (role) => `slow overhead descent onto the ${role} reference; product rigid`,
  },
  {
    key: "Hero-Whip Transition",
    band: 4,
    needs: ["Full Hero", "Full Front", "Side"],
    supported: (g) => g.front && (g.side || g.threeQuarter),
    text: (role) => `rapid whip-pan off the ${role} view into the next supported angle. ${WHIP_WORDING}`,
  },
  {
    key: "Rapid Macro Pass",
    band: 4,
    needs: ["Macro Setting", "Macro Stones", "Macro Link"],
    supported: (g) => g.macro,
    text: (role) => `fast macro pass over the ${role} detail, glints firing as the light source travels; product rigid`,
  },
  {
    key: "Extreme Macro Scan",
    band: 5,
    needs: ["Macro Stones", "Macro Setting", "Macro Engraving", "Macro Clasp", "Surface Detail"],
    supported: (g) => g.macro,
    text: (role) => `extreme macro scan at roughly 2-3cm across the ${role} detail — stay macro, never pull back; product rigid`,
  },
  {
    key: "Low Surface Creep",
    band: 5,
    needs: ["Macro Clasp", "Macro Link", "Surface Detail", "Partial Detail"],
    supported: (g) => g.macro,
    text: (role) => `low creeping move barely above the ${role} surface, grazing light raking across the finish; product rigid`,
  },
  {
    key: "Micro Pull-back",
    band: 6,
    needs: ["Full Hero", "Full Front", "Full 3-4"],
    supported: (g) => g.full,
    text: (role) => `restrained micro pull-back settling on the ${role} hero view as the final resting composition; product rigid`,
  },
];

/** Max safe camera change, derived from the geometry the refs actually cover. */
function safeCameraLine(geometry: DirectorGeometry) {
  if (!geometry.full && geometry.macro) {
    return "MAX SAFE CAMERA CHANGE: macro-only coverage — remain at local-detail scale for the entire clip, never pull back to a full product view and never orbit.";
  }
  if (geometry.back) {
    return "MAX SAFE CAMERA CHANGE: front, side and rear coverage exist — rear and side detail may be revealed, but only construction visible in the references.";
  }
  if (geometry.side) {
    return "MAX SAFE CAMERA CHANGE: front and side coverage exist — a stronger side reveal is allowed, but never rotate to unseen rear construction.";
  }
  if (geometry.threeQuarter) {
    return "MAX SAFE CAMERA CHANGE: front and 3/4 coverage only — keep parallax within about 8 degrees; no full orbit.";
  }
  return "MAX SAFE CAMERA CHANGE: front coverage only — small push plus a 3-5 degree arc maximum. No orbit, no side or rear reveal, no invented sidewalls.";
}

/** Timestamps summing exactly to `duration`, ~2-3s per shot. */
function shotWindows(duration: number, count: number) {
  const windows: { start: number; end: number }[] = [];
  let cursor = 0;
  for (let i = 0; i < count; i += 1) {
    const remaining = duration - cursor;
    const left = count - i;
    const span = i === count - 1 ? remaining : Math.max(1, Math.round(remaining / left));
    windows.push({ start: cursor, end: Math.min(duration, cursor + span) });
    cursor += span;
  }
  return windows;
}

/** Build the ordered shot plan across the energy curve, respecting geometry. */
function buildShotPlan(
  selected: { role: FrameRole; frame: ApprovedFrame }[],
  geometry: DirectorGeometry,
  duration: number,
) {
  const shotCount = Math.max(3, Math.min(7, Math.round(duration / 2.5) || 3));
  const windows = shotWindows(duration, shotCount);
  const available = new Set(selected.map((entry) => entry.role));
  const usable = MOTION_LIBRARY.filter(
    (shot) => shot.supported(geometry) && shot.needs.some((role) => available.has(role)),
  );

  const plan: { start: number; end: number; key: string; role: FrameRole; text: string }[] = [];
  const usedKeys = new Set<string>();

  for (let i = 0; i < windows.length; i += 1) {
    // Energy curve derived from position in the clip, not a hard-coded order.
    const progress = windows.length === 1 ? 0 : i / (windows.length - 1);
    const targetBand = i === windows.length - 1 ? 6 : Math.max(1, Math.round(1 + progress * 5));
    const ranked = usable
      .slice()
      .sort((a, b) => {
        const fresh = Number(usedKeys.has(a.key)) - Number(usedKeys.has(b.key));
        if (fresh !== 0) return fresh;
        return Math.abs(a.band - targetBand) - Math.abs(b.band - targetBand);
      });
    const shot = ranked[0];
    if (!shot) break;
    usedKeys.add(shot.key);
    const role = shot.needs.find((needed) => available.has(needed)) ?? selected[0]?.role ?? "Full Hero";
    plan.push({ ...windows[i], key: shot.key, role, text: shot.text(role) });
  }
  return plan;
}

const DIRECTOR_HARD_NEGATIVES =
  "HARD NEGATIVES: no object morphing, no link/letter/pattern redesign, no changing link or stone count, no substituting a different setting style for the declared one, no stone drift, no changed stone cuts, no invented center stones, no melted or disappearing prongs, no fused clasp or joints, no geometry wobble, no fake glitter overlays, no static starburst or sparkle filter (any flare must originate from a physically plausible reflection and track with the camera or light), no excessive bloom, no uniform blur gradient, no plastic metal, no invented back, side, gallery or hinge construction not shown by the references, no random rotation.";

const DIRECTOR_PHYSICS =
  "GLOBAL PHYSICS: The jewelry remains physically rigid and locked in its existing world position; primary motion is produced by the camera, optical focus and moving studio lights.";

const DIRECTOR_TEMPORAL_LOCK =
  "TEMPORAL GEOMETRY LOCK: Treat the approved references as multiple observations of ONE manufactured physical object — do not regenerate the object between shots; every view is the same object from a different supported camera position.";

const DIRECTOR_OPTICS =
  "OPTICS: 90-120mm macro character, an extremely shallow real focus plane, physical bokeh and natural focus breathing — never a uniform blur gradient.";

const DIRECTOR_LIGHTING =
  "LIGHTING: narrow diffused strip lights plus pinpoint sources that MOVE and sweep across the piece; every glint originates from a real surface.";

const DIRECTOR_GEMSTONES =
  "GEMSTONE RESPONSE: independent per-facet scintillation, white brilliance, internal refraction and spectral dispersion; different stones flash at different moments with no synchronized blinking. The specified stone body color never changes while spectral fire is allowed.";

const DIRECTOR_COLORLESS = "Colorless stones stay visually colorless and white.";

const DIRECTOR_METAL =
  "METAL RESPONSE: crisp machined and beveled edges, real mirror polish with subtle microtexture and true dimensional thickness — never plastic, liquid or CGI-featureless metal.";

const DIRECTOR_TRANSITIONS =
  "TRANSITIONS: physical camera moves only — no editorial wipes, dissolves or graphic effects.";

/** Setting-agnostic construction lock for the video director. */
function directorSettingLine(settings: string[]) {
  return `SETTING CONSTRUCTION (${settings.join("; ")}): preserve the engineered stone size and shape variation, orientation, interlock, spacing and metal work exactly as constructed — never regularize or substitute it for another setting style.`;
}

const DIRECTOR_MAX_CHARS = 2400;

/**
 * The confirmed product type across the resolved specs: user-confirmed first,
 * then analysis-detected, then a neutral generic. Fully universal — no product
 * name is ever hardcoded or defaulted here.
 */
function confirmedProductType(specs: TargetSpec[], masterLock?: MasterProductLock | null) {
  const byProvenance = (want: string) =>
    specs.find((spec) => spec.type && spec.sources?.type === want)?.type ?? null;
  return (
    byProvenance("user_override") ??
    byProvenance("gemini_detected") ??
    specs.find((spec) => spec.type)?.type ??
    // The project's MASTER PRODUCT LOCK before any generic fallback.
    masterLockProductType(masterLock ?? null) ??
    "jewelry piece"
  );
}


/**
 * A dynamic luxury-jewelry-director shot plan for the Seedance
 * reference-to-video reconstruction. Universal for any jewelry type.
 */
function buildSeedanceDirectorPrompt(args: {
  frames: ApprovedFrame[];
  specs: TargetSpec[];
  notes?: string | null;
  duration: number;
  aspectRatio?: string | null;
  extra?: string | null;
  /** DIAMOND OPTICS: pre-synthesised optical lines (analysed × user controls). */
  opticsText?: string | null;
  /** MASTER PRODUCT LOCK: the project's authoritative product identity. */
  masterLock?: MasterProductLock | null;
  /** MATERIAL APPEARANCE AUTHORITY: material realism only — zero geometry. */
  materialAuthority?: MaterialAppearanceAuthority | null;
}) {
  const duration = Math.max(1, Math.round(Number(args.duration) || 5));
  const selected = selectDirectorFrames(args.frames);
  const geometry = directorGeometry(selected);
  const plan = buildShotPlan(selected, geometry, duration);
  const specLines = args.specs.map((spec) => targetSpecLine(spec)).filter(Boolean) as string[];
  // The ACTUAL confirmed product type: a user-confirmed value first, then the
  // analysis-detected value, then the project's Master Product Lock, and only a
  // neutral generic word if none exists. Never a hardcoded product name.
  const productType = confirmedProductType(args.specs, args.masterLock ?? null);
  const masterLockBlock = masterLockPromptLines(args.masterLock ?? null, { compact: true });

  const hasStones = args.specs.some((spec) => spec.stone && !/no stones/i.test(spec.stone)) ||
    geometry.macro;
  const directorSettings = declaredSettingList(args.specs);
  const colorless = isColorlessSpec(args.specs);
  const aspect = String(args.aspectRatio ?? "").trim();

  const timeline = plan.length
    ? [
      "SHOT TIMELINE:",
      ...plan.map((shot) => `${shot.start}-${shot.end}s — ${shot.text}`),
    ].join("\n")
    : "SHOT TIMELINE:\n0-" + duration + "s — slow hero push on the approved view; product rigid";

  // Shorter timeline wording used when the descriptive one blows the budget —
  // the shot plan itself is never dropped.
  const shortTimeline = plan.length
    ? ["SHOT TIMELINE:", ...plan.map((shot) => `${shot.start}-${shot.end}s — ${shot.key} (${shot.role}); product rigid`)].join("\n")
    : timeline;

  // The exact whip wording must survive even the compact timeline.
  const whipUsed = plan.some((shot) => shot.key === "Hero-Whip Transition");

  const buildCore = (timelineText: string) =>
    [
      `OBJECTIVE: Direct a ${duration}s luxury product film of ONE ${productType}${aspect ? ` framed ${aspect}` : ""}, built strictly from the approved reference views.`,
      specLines.length ? `PRODUCT LOCK — ${specLines.join(" ")} These are HARD constraints.` : null,
      DIRECTOR_PHYSICS,
      DIRECTOR_TEMPORAL_LOCK,
      timelineText,
      whipUsed && !timelineText.includes(WHIP_WORDING) ? WHIP_WORDING : null,
      safeCameraLine(geometry),
      directorSettings.length ? directorSettingLine(directorSettings) : null,
    ].filter(Boolean) as string[];


  // Always protected: PRODUCT LOCK + GLOBAL PHYSICS + timeline + HARD NEGATIVES.
  const negatives = DIRECTOR_HARD_NEGATIVES;
  const fullCore = buildCore(timeline);
  const coreLength = (sections: string[]) =>
    sections.join("\n\n").length + negatives.length + 2;
  const core = coreLength(fullCore) <= DIRECTOR_MAX_CHARS ? fullCore : buildCore(shortTimeline);

  const optional = [
    // Product identity first: the Master Product Lock is the highest-value
    // optional section inside the character budget.
    masterLockBlock.length ? masterLockBlock.join("\n") : null,
    // MATERIAL APPEARANCE AUTHORITY (§31): material realism only, zero geometry.
    (() => {
      const materialLines = materialAuthorityPromptLines(args.materialAuthority ?? null);
      return materialLines.length ? materialLines.join("\n") : null;
    })(),
    hasStones ? `${DIRECTOR_GEMSTONES}${colorless ? ` ${DIRECTOR_COLORLESS}` : ""}` : null,
    DIRECTOR_METAL,
    String(args.opticsText ?? "").trim() || null,
    DIRECTOR_OPTICS,
    DIRECTOR_LIGHTING,
    DIRECTOR_TRANSITIONS,
    String(args.notes ?? "").trim() ? `NOTES: ${String(args.notes).trim()}` : null,
    String(args.extra ?? "").trim() || null,
  ].filter(Boolean) as string[];


  // Insert optional sections before HARD NEGATIVES while the budget allows.
  const kept: string[] = [];
  let length = coreLength(core);
  for (const section of optional) {
    if (length + section.length + 2 > DIRECTOR_MAX_CHARS) continue;
    kept.push(section);
    length += section.length + 2;
  }

  const prompt = [...core, ...kept, negatives].join("\n\n").slice(0, DIRECTOR_MAX_CHARS);


  return {
    prompt,
    shotPlan: plan.map((shot) => ({
      start: shot.start,
      end: shot.end,
      move: shot.key,
      reference: shot.role,
    })),
    frameRoles: selected.map((entry) => entry.role),
    geometry,
  };
}

/**
 * MASTER PRODUCT LOCK INHERITANCE (§E1)
 * ---------------------------------------------------------------------------
 * The single product-identity source for EVERY Nano generation in a project
 * (swap frames, canonical masters, component masters, matched pairs, campaign
 * plates). The product is decided ONCE per project and inherited, never
 * re-derived per frame.
 *
 * Resolution order (authority is preserved — the lock itself already carries the
 * user-confirmed facts that outrank it):
 *   1. the lock the client sent with this request (the live in-session lock),
 *   2. the lock persisted on the ACTIVE project's `project_state`.
 * When neither exists the result is null and behaviour is unchanged (legacy
 * sessions keep working exactly as before).
 */
async function resolveInheritedMasterLock(admin: AdminClient, args: {
  userId: string;
  projectId?: unknown;
  provided?: unknown;
}): Promise<MasterProductLock | null> {
  const direct = normalizeMasterLock(args.provided ?? null);
  if (direct) return direct;

  const projectId = String(args.projectId ?? "").trim();
  if (!projectId) return null;

  try {
    const { data } = await admin
      .from("jewelry_swap_projects")
      .select("project_state")
      .eq("id", projectId)
      .eq("user_id", args.userId)
      .maybeSingle();
    const state = (data?.project_state ?? null) as Record<string, any> | null;
    return normalizeMasterLock(state?.masterProductLock ?? null);
  } catch (_error) {
    // Inheritance is best-effort: a missing project must never block a run.
    return null;
  }
}

/**
 * VALIDATED CANONICAL MASTERS (§E2) — resolved the same way as the lock: from the
 * request when the client sent its live state, otherwise from the ACTIVE
 * project's `project_state.canonicalMasters`. Only D2-validated masters survive
 * `collectValidatedMasterRefs`; none → reference selection is unchanged.
 */
async function resolveValidatedMasterRefs(admin: AdminClient, args: {
  userId: string;
  projectId?: unknown;
  provided?: unknown;
}): Promise<JewelryReference[]> {
  const direct = collectValidatedMasterRefs(args.provided ?? null);
  if (direct.length) return direct as unknown as JewelryReference[];

  const projectId = String(args.projectId ?? "").trim();
  if (!projectId) return [];

  try {
    const { data } = await admin
      .from("jewelry_swap_projects")
      .select("project_state")
      .eq("id", projectId)
      .eq("user_id", args.userId)
      .maybeSingle();
    const state = (data?.project_state ?? null) as Record<string, any> | null;
    return collectValidatedMasterRefs(state?.canonicalMasters ?? null) as unknown as JewelryReference[];
  } catch (_error) {
    // Best effort: masters are an enhancement, never a requirement.
    return [];
  }
}


/**
 * CANONICAL MASTER REFERENCE SET (§22)
 * ---------------------------------------------------------------------------
 * Renders ONE canonical master of the active product for ONE view, reusing the
 * EXISTING Nano path (`IMAGE_MODEL` / `IMAGE_MODEL_ALT` + `submitFalJob`) with
 * the same webhook, pricing and `studio_generations` bookkeeping as a frame
 * swap. No new provider, no new endpoint, no routing change.
 *
 * It is ALWAYS user-triggered: the caller is an explicit "Generate canonical
 * masters" action, so it spends credits exactly like any other Nano run and is
 * never fired automatically by analysis or by opening a project.
 *
 * A master has NO source frame — the product references are the only images
 * sent, and the product identity comes from the Master Product Lock.
 */
async function startCanonicalMaster(admin: AdminClient, args: {
  userId: string;
  view: string;
  /** Dynamic component name when the view is a mechanical component. */
  componentLabel?: string | null;
  pieces: JewelryPiece[];
  aspectRatio?: string;
  resolution?: string;
  extraPrompt?: string;
  imageModel?: string;
  masterProductLock?: unknown;
  /** Active project id — used to INHERIT the persisted lock when none is sent. */
  projectId?: unknown;
  materialAuthority?: unknown;
  /** CONNECTED PRODUCT SYSTEMS (§30): attachment rules, derived from the lock. */
  connectedAssets?: unknown;
  /** CAMPAIGN PHOTOGRAPHY PROFILE (§C4): campaign plates (D5) only. */
  campaignPhotography?: unknown;
  /** Which slot of the requested master set this is (audit only). */
  setIndex?: number;
  setSize?: number;
  webhookBase: string;
}) {
  const view: CanonicalMasterView = isCanonicalMasterView(args.view)
    ? args.view
    : (() => {
      throw new Error("Unknown canonical master view");
    })();

  const pieces = (Array.isArray(args.pieces) ? args.pieces : [])
    .filter((piece) => pieceUrls(piece ?? {}).length);
  if (!pieces.length) throw new Error("Add at least one jewelry reference");

  const imageModelKey = String(args.imageModel ?? "pro").trim().toLowerCase() === "nb2"
    ? "nb2"
    : "pro";
  const endpointId = imageModelKey === "nb2" ? IMAGE_MODEL_ALT : IMAGE_MODEL;

  const masterLock = await resolveInheritedMasterLock(admin, {
    userId: args.userId,
    projectId: args.projectId,
    provided: args.masterProductLock,
  });
  const materialAuthority = normalizeMaterialAuthority(args.materialAuthority ?? null);

  // Product references only — a master is rendered FROM the evidence, so there
  // is no source frame to preserve and no per-frame routing to apply.
  const referenceIds = buildReferenceIdMap(pieces);
  const references = pieces.flatMap((piece) => pieceReferences(piece));
  const imageUrls = cleanUrls(references.map((ref) => ref.url));
  if (!imageUrls.length) throw new Error("Add at least one jewelry reference image");

  const componentLabel = String(args.componentLabel ?? "").trim() || null;
  const connectedAssets = normalizeConnectedAssets(args.connectedAssets ?? null);
  const campaignPhotography = normalizeCampaignPhotographyProfile(args.campaignPhotography ?? null);
  const prompt = buildCanonicalMasterPrompt({
    view,
    componentLabel,
    masterLock,
    materialAuthority,
    connectedAssets: normalizeConnectedAssets(args.connectedAssets ?? null),
    // Campaign plates (D5) carry the photography profile; neutral masters do not.
    campaignPhotography: normalizeCampaignPhotographyProfile(args.campaignPhotography ?? null),
    extra: args.extraPrompt,
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
    throw new Error(insertError?.message ?? "Could not start the canonical master");
  }

  try {
    const estimatedCostUsd = await estimateUsd({
      endpointId,
      fallbackFlatUsd: IMAGE_FALLBACK_USD,
    });

    const aspect = String(args.aspectRatio ?? "").trim();
    // Pro accepts 1K/2K/4K; an unsupported request is rejected, never
    // silently downgraded to 1K. NB2 has no resolution field at all.
    const resolution = imageModelKey === "nb2" ? "" : normalizeImageResolution(args.resolution);
    const falInput: Record<string, unknown> = imageModelKey === "nb2"
      ? {
        prompt,
        image_urls: imageUrls,
        output_format: "png",
      }
      : {
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
          stage: "canonical_master",
          canonical_master_view: view,
          canonical_master_label: canonicalMasterLabel(view, componentLabel),
          canonical_master_component: componentLabel,
          canonical_master_set_index: Number(args.setIndex ?? 0),
          canonical_master_set_size: Number(args.setSize ?? 0),
          // Masters are NOT auto-trusted — validation is a later commit.
          canonical_master_validated: false,
          image_model: imageModelKey,
          image_endpoint: endpointId,
          nano_quality: imageModelKey === "pro" && ["2K", "4K"].includes(resolution)
            ? resolution.toLowerCase()
            : null,
          // requested === submitted for the Pro path; null for NB2 (no field).
          requested_resolution: imageModelKey === "pro" ? resolution : null,
          submitted_resolution: imageModelKey === "pro" ? resolution : null,
          master_product_lock: masterLock,
          master_product_lock_summary: masterLockSummaryLine(masterLock),
          material_appearance_authority: materialAuthority,
          material_appearance_authority_summary: materialAuthoritySummaryLine(materialAuthority),
          campaign_photography_summary: campaignPhotographySummaryLine(campaignPhotography),
          connected_assets_count: connectedAssets?.connectedAssets.length ?? 0,
          all_reference_ids_analyzed: [...referenceIds.values()],
          references_sent: imageUrls.length,
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

/**
 * MATCHED-PAIR MANUFACTURING (§29)
 * ---------------------------------------------------------------------------
 * Renders the OTHER manufacturing state of an existing approved plate (a
 * canonical master or an approved swapped frame) — e.g. FINISHED → PRE-SETTING.
 * Camera, crop, composition, lighting, orientation, scale and background are
 * held identical; the manufacturing stage is the only degree of freedom.
 *
 * Reuses the EXISTING Nano path (`IMAGE_MODEL` / `IMAGE_MODEL_ALT` +
 * `submitFalJob`) with the same webhook, pricing and `studio_generations`
 * bookkeeping as any other image run. No new provider, no new endpoint, no
 * routing change, no pricing change.
 *
 * ALWAYS user-triggered: the caller is an explicit "Generate matched pair"
 * button, so nothing here fires from analysis, restore or autosave.
 */
async function startMatchedPair(admin: AdminClient, args: {
  userId: string;
  /** The approved plate this pair is derived from (the photographic authority). */
  sourceImageUrl: string;
  /** Client-side id of the source plate (master key / frame id) — linkage only. */
  sourceId?: string | null;
  sourceLabel?: string | null;
  sourceStage?: string | null;
  /** Requested target stage; defaults to the opposite of the source stage. */
  targetStage?: string | null;
  /** Product references — construction evidence for seats/retention only. */
  pieces: JewelryPiece[];
  aspectRatio?: string;
  resolution?: string;
  extraPrompt?: string;
  imageModel?: string;
  masterProductLock?: unknown;
  /** Active project id — used to INHERIT the persisted lock when none is sent. */
  projectId?: unknown;
  materialAuthority?: unknown;
  webhookBase: string;
}) {
  const sourceImageUrl = String(args.sourceImageUrl ?? "").trim();
  if (!sourceImageUrl) throw new Error("Select an approved plate to pair first");

  const sourceStage: ManufacturingStage = isManufacturingStage(args.sourceStage)
    ? args.sourceStage
    : "finished";
  const targetStage: ManufacturingStage = isManufacturingStage(args.targetStage)
    ? args.targetStage
    : oppositeManufacturingStage(sourceStage);
  if (targetStage === sourceStage) {
    throw new Error("A matched pair must change the manufacturing stage");
  }

  const imageModelKey = String(args.imageModel ?? "pro").trim().toLowerCase() === "nb2"
    ? "nb2"
    : "pro";
  const endpointId = imageModelKey === "nb2" ? IMAGE_MODEL_ALT : IMAGE_MODEL;

  const masterLock = await resolveInheritedMasterLock(admin, {
    userId: args.userId,
    projectId: args.projectId,
    provided: args.masterProductLock,
  });
  const materialAuthority = normalizeMaterialAuthority(args.materialAuthority ?? null);

  const pieces = (Array.isArray(args.pieces) ? args.pieces : [])
    .filter((piece) => pieceUrls(piece ?? {}).length);
  const referenceIds = buildReferenceIdMap(pieces);
  const references = pieces.flatMap((piece) => pieceReferences(piece));
  // SOURCE PLATE FIRST — the prompt names image 1 as the photographic authority.
  const imageUrls = cleanUrls([sourceImageUrl, ...references.map((ref) => ref.url)]);

  const prompt = buildMatchedPairPrompt({
    targetStage,
    sourceStage,
    sourceLabel: args.sourceLabel,
    masterLock,
    materialAuthority,
    extra: args.extraPrompt,
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
    throw new Error(insertError?.message ?? "Could not start the matched pair");
  }

  try {
    const estimatedCostUsd = await estimateUsd({
      endpointId,
      fallbackFlatUsd: IMAGE_FALLBACK_USD,
    });

    const aspect = String(args.aspectRatio ?? "").trim();
    // Pro accepts 1K/2K/4K; an unsupported request is rejected, never
    // silently downgraded to 1K. NB2 has no resolution field at all.
    const resolution = imageModelKey === "nb2" ? "" : normalizeImageResolution(args.resolution);
    const falInput: Record<string, unknown> = imageModelKey === "nb2"
      ? {
        prompt,
        image_urls: imageUrls,
        output_format: "png",
      }
      : {
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
          stage: "matched_pair",
          matched_pair_source_id: String(args.sourceId ?? "").trim() || null,
          matched_pair_source_url: sourceImageUrl,
          matched_pair_source_stage: sourceStage,
          matched_pair_target_stage: targetStage,
          matched_pair_target_label: manufacturingStageLabel(targetStage),
          matched_pair_summary: matchedPairSummaryLine({
            sourceStage,
            targetStage,
            sourceLabel: args.sourceLabel,
          }),
          image_model: imageModelKey,
          image_endpoint: endpointId,
          nano_quality: imageModelKey === "pro" && ["2K", "4K"].includes(resolution)
            ? resolution.toLowerCase()
            : null,
          // requested === submitted for the Pro path; null for NB2 (no field).
          requested_resolution: imageModelKey === "pro" ? resolution : null,
          submitted_resolution: imageModelKey === "pro" ? resolution : null,
          master_product_lock: masterLock,
          master_product_lock_summary: masterLockSummaryLine(masterLock),
          material_appearance_authority: materialAuthority,
          material_appearance_authority_summary: materialAuthoritySummaryLine(materialAuthority),
          all_reference_ids_analyzed: [...referenceIds.values()],
          references_sent: imageUrls.length,
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
  /** Per-frame replacement mode: "auto" | "standard" | "macro". */
  mode?: string | null;
  /** Per-frame coverage/framing: "auto" | "full" | "partial" | "macro". */
  coverage?: string | null;
  /** Legacy per-frame Macro toggle (equivalent to mode = "macro"). */
  macro?: boolean;
  /** Stage-A still analysis for THIS frame (advisory, optional). */
  frameAnalysis?: unknown;
  /** Stage-A product analysis of the references (advisory, optional). */
  productAnalysis?: unknown;
  /** DIAMOND OPTICS: cached global source-clip optics profile. */
  opticsProfile?: unknown;
  /** DIAMOND OPTICS: cached per-frame refinement of the global profile. */
  frameOpticsProfile?: unknown;
  /** DIAMOND OPTICS: Sparkle / Rainbow-Fire / advanced controls (AUTO default). */
  opticsControls?: unknown;
  /** MASTER PRODUCT LOCK derived once per reference set on the client. */
  masterProductLock?: unknown;
  /** Active project id — used to INHERIT the persisted lock when none is sent. */
  projectId?: unknown;
  /**
   * §E2 — the client's live canonical/component master state. Only D2-VALIDATED
   * entries become reference candidates; omitted → read from the project.
   */
  canonicalMasters?: unknown;
  /** MATERIAL APPEARANCE AUTHORITY derived from the existing evidence strengths. */
  materialAuthority?: unknown;
  /** CONNECTED PRODUCT SYSTEMS (§30): attachment rules, derived from the lock. */
  connectedAssets?: unknown;
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

  // Stage-A still analysis (advisory). Absent or malformed → deterministic path.
  const frameAnalysis = normalizeFrameAnalysis(args.frameAnalysis ?? null);
  const productAnalysis = normalizeProductAnalysis(args.productAnalysis ?? null);
  // MASTER PRODUCT LOCK: every frame in the project inherits the SAME lock.
  const masterLock = await resolveInheritedMasterLock(admin, {
    userId: args.userId,
    projectId: args.projectId,
    provided: args.masterProductLock,
  });
  // MATERIAL APPEARANCE AUTHORITY: material realism only — never geometry.
  const materialAuthority = normalizeMaterialAuthority(args.materialAuthority ?? null);
  // CONNECTED PRODUCT SYSTEMS (§30): present → attachment rules are appended.
  const connectedAssets = normalizeConnectedAssets(args.connectedAssets ?? null);

  // DIAMOND OPTICS (additive): cached analysed optics × user controls. No Gemini
  // call happens here — moving a slider only re-synthesises these prompt lines.
  const opticsControls = readOpticsControls(args.opticsControls);
  const opticsProfile = mergeFrameOptics(
    normalizeOpticsProfile(args.opticsProfile),
    normalizeOpticsProfile(args.frameOpticsProfile),
  );
  const resolvedOptics = opticsProfile
    ? applyOpticsControls(opticsProfile, opticsControls)
    : null;


  // Deterministic image-payload routing: computed ONCE and used for BOTH the
  // payload order and the prompt's "reference image N = role" numbering so the
  // two can never drift. SOURCE_FRAME is always image 1.
  const referenceIds = buildReferenceIdMap(pieces);
  // §E2 — VALIDATED canonical/component masters of THIS project become extra
  // reference candidates (below originals/CAD). None → unchanged behaviour.
  const validatedMasters = await resolveValidatedMasterRefs(admin, {
    userId: args.userId,
    projectId: args.projectId,
    provided: args.canonicalMasters,
  });
  const routed = pieces.map((piece) =>
    routePiece(
      piece,
      args.mode ?? null,
      args.preferredRole ?? null,
      frameAnalysis,
      referenceIds,
      validatedMasters,
    )
  );
  const routedPieces = routed.map((entry) => entry.piece);
  const selectedRefs = routed.flatMap((entry) => entry.refs);


  const imageUrls = cleanUrls([
    sourceFrameUrl,
    ...selectedRefs.map((ref) => ref.url),
  ]);
  const prompt = buildJewelryPrompt({
    pieces: routedPieces,
    extra: args.extraPrompt,
    preferredRole: args.preferredRole ?? null,
    failureReason: args.failureReason ?? null,
    mode: args.mode ?? null,
    coverage: args.coverage ?? null,
    macro: args.macro === true,
    frameAnalysis,
    productAnalysis,
    opticsProfile,
    opticsControls,
    masterLock,
    materialAuthority,
    connectedAssets,
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
    // Pro accepts 1K/2K/4K; an unsupported request is rejected, never
    // silently downgraded to 1K. NB2 has no resolution field at all.
    const resolution = imageModelKey === "nb2" ? "" : normalizeImageResolution(args.resolution);
    // The standard nano-banana edit endpoint rejects Pro-only fields (resolution,
    // aspect_ratio) with a 422 — the alt path sends only the supported fields.
    const falInput: Record<string, unknown> = imageModelKey === "nb2"
      ? {
        prompt,
        image_urls: imageUrls,
        output_format: "png",
      }
      : {
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
          // Quality is an API parameter (never prompt text) and only the Pro
          // endpoint accepts it — the nb2 path never carries a resolution.
          nano_quality: imageModelKey === "pro" && ["2K", "4K"].includes(resolution)
            ? resolution.toLowerCase()
            : null,
          // requested === submitted for the Pro path; null for NB2 (no field).
          requested_resolution: imageModelKey === "pro" ? resolution : null,
          submitted_resolution: imageModelKey === "pro" ? resolution : null,
          geometry_fidelity: "strict",

          // DIAMOND OPTICS telemetry (analysed × controls, no media).
          diamond_optics: resolvedOptics
            ? {
              version: resolvedOptics.version ?? null,
              scope: opticsProfile?.scope ?? null,
              controls: opticsControls,
              summary: opticsSummaryLine(resolvedOptics),
            }
            : null,


          // Structured product authority resolved for this run (verification hook).
          target_spec: routedPieces.map((piece) => resolveTargetSpec(piece)),

          // MASTER PRODUCT LOCK inherited by this frame (audit + reconstruct reuse).
          master_product_lock: masterLock,
          master_product_lock_summary: masterLockSummaryLine(masterLock),

          // MATERIAL APPEARANCE AUTHORITY used for this run (material realism only).
          material_appearance_authority: materialAuthority,
          material_appearance_authority_summary: materialAuthoritySummaryLine(materialAuthority),



          preferred_role: args.preferredRole ?? null,
          failure_reason: args.failureReason ?? null,
          replacement_mode: normalizeMode(args.mode, args.macro === true),
          coverage: normalizeCoverage(args.coverage, normalizeMode(args.mode, args.macro === true)),
          macro_mode: normalizeMode(args.mode, args.macro === true) === "macro",
          source_frame_url: sourceFrameUrl,
          frame_index: Number(args.frameIndex ?? 0),
          frame_time: Number(args.frameTime ?? 0),
          // Verification of the deterministic routing (payload order = prompt order).
          selected_reference_roles: selectedRefs.map((ref) => ref.role || "Unlabeled view"),
          selected_reference_cad: selectedRefs.map((ref) => isCadRef(ref)),
          references_sent: selectedRefs.length,
          references_available: pieces.reduce((sum, piece) => sum + pieceReferences(piece).length, 0),
          // Stage-A debug trail (never contains any API key).
          gemini_analysis_used: !!frameAnalysis,
          gemini_view: frameAnalysis?.view ?? null,
          gemini_coverage: frameAnalysis?.coverage ?? null,
          gemini_detailType: frameAnalysis?.detailType ?? null,
          gemini_magnification: frameAnalysis?.magnification ?? null,
          gemini_recommended_roles: frameAnalysis?.recommendedReferenceRoles ?? null,
          gemini_avoid_roles: frameAnalysis?.avoidReferenceRoles ?? null,
          gemini_risk_flags: frameAnalysis?.riskFlags ?? null,

          // REFERENCE-ROUTING AUDIT TRAIL (upload order carries no authority).
          all_reference_ids_analyzed: [...referenceIds.values()],
          gemini_ranked_reference_ids: frameAnalysis?.recommendedReferences ?? null,
          gemini_rank_reasons: frameAnalysis?.rankingReasons ?? null,
          gemini_avoid_reference_ids: frameAnalysis?.avoidReferences ?? null,
          user_preferred_reference: args.preferredRole ?? null,
          final_selected_reference_ids: selectedRefs.map((ref) =>
            referenceIds.get(ref.url) ?? "REF_?"
          ),
          final_selected_reference_roles: selectedRefs.map((ref) => ref.role || "Unlabeled view"),
          final_payload_order: [
            "SOURCE_FRAME",
            ...selectedRefs.map((ref) =>
              `${referenceIds.get(ref.url) ?? "REF_?"}${isCadRef(ref) ? " [CAD]" : ""} · ${
                ref.role || "Unlabeled view"
              }`
            ),
          ],

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

/** Hard provider limit for bytedance/seedance-2.0 reference-to-video. */
const SEEDANCE_MAX_REFERENCES = 9;

/** Evenly-spaced subset of `items`, always keeping the first and last entry. */
function pickEvenlySpaced<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  if (max <= 1) return items.slice(0, Math.max(0, max));
  const picked: T[] = [];
  for (let i = 0; i < max; i += 1) {
    const index = Math.round((i * (items.length - 1)) / (max - 1));
    const value = items[index];
    if (!picked.includes(value)) picked.push(value);
  }
  return picked;
}

/**
 * SINGLE SOURCE OF TRUTH for the Seedance director prompt. Both the non-paid
 * preview action and the real reconstruction submit run this exact prep, so the
 * previewed prompt can never drift from the one Seedance receives.
 * Deterministic + local: reads persisted swap metadata only, never Gemini.
 */
type ReconstructionPrep = {
  userId: string;
  frameUrls: string[];
  model?: string;
  duration?: number | string;
  resolution?: string;
  aspectRatio?: string;
  generateAudio?: boolean;
  extraPrompt?: string;
  /** DIAMOND OPTICS: cached global source optics profile. */
  opticsProfile?: unknown;
  /** DIAMOND OPTICS: Sparkle / Rainbow-Fire / advanced controls. */
  opticsControls?: unknown;
  /** MASTER PRODUCT LOCK for this project (falls back to the stored one). */
  masterProductLock?: unknown;
  /** MATERIAL APPEARANCE AUTHORITY (falls back to the stored one). */
  materialAuthority?: unknown;
};

async function prepareReconstruction(admin: AdminClient, args: ReconstructionPrep) {

  const availableUrls = cleanUrls(args.frameUrls);
  if (!availableUrls.length) throw new Error("Approve at least one swapped frame first");
  // Seedance reference-to-video accepts at most 9 reference images — sample
  // evenly (keeping the first and last) so the rebuild still spans the clip.
  const referenceUrls = pickEvenlySpaced(availableUrls, SEEDANCE_MAX_REFERENCES);

  const videoModel = getVideoModel(
    args.model === "seedance-2.0-fast" ? "seedance-2.0-fast" : "seedance-2.0",
  );
  const endpointId = referenceToVideoEndpoint(videoModel.key);
  const duration = clampSeedanceDuration(args.duration ?? 5, videoModel);

  // The swap stage already stored each approved frame's view/coverage/mode and
  // the structured product spec — read it back so the director timeline is
  // generated from the real run instead of a generic constraint block.
  const { data: metaRows } = await admin
    .from("studio_generations")
    .select("output_url,input_payload")
    .eq("user_id", args.userId)
    .in("output_url", referenceUrls)
    .limit(SEEDANCE_MAX_REFERENCES * 2);

  const metaByUrl = new Map<string, any>();
  for (const row of metaRows ?? []) {
    const url = (row as any)?.output_url;
    if (url && !metaByUrl.has(url)) metaByUrl.set(url, (row as any)?.input_payload ?? {});
  }

  const frames: ApprovedFrame[] = referenceUrls.map((url, index) => {
    const payload = metaByUrl.get(url) ?? {};
    const roles = Array.isArray(payload.selected_reference_roles)
      ? payload.selected_reference_roles.map((role: unknown) => String(role ?? ""))
      : [];
    return {
      url,
      coverage: typeof payload.coverage === "string" ? payload.coverage : null,
      mode: typeof payload.replacement_mode === "string" ? payload.replacement_mode : null,
      roles,
      index: Number(payload.frame_index ?? index),
    };
  });

  const specPieces: JewelryPiece[] = (() => {
    for (const url of referenceUrls) {
      const payload = metaByUrl.get(url);
      if (Array.isArray(payload?.pieces) && payload.pieces.length) return payload.pieces as JewelryPiece[];
    }
    return [];
  })();
  /** The spec the swap stage already resolved and stored for these frames. */
  const storedSpecs: TargetSpec[] = (() => {
    for (const url of referenceUrls) {
      const payload = metaByUrl.get(url);
      if (Array.isArray(payload?.target_spec) && payload.target_spec.length) {
        return payload.target_spec as TargetSpec[];
      }
    }
    return [];
  })();

  /**
   * MASTER PRODUCT LOCK: the same lock the approved frames were generated with.
   * Sent by the client; otherwise read back from the stored swap payload so the
   * rebuild can never re-decide the product.
   */
  const masterLock = normalizeMasterLock(args.masterProductLock ?? null) ?? (() => {
    for (const url of referenceUrls) {
      const stored = normalizeMasterLock(metaByUrl.get(url)?.master_product_lock ?? null);
      if (stored) return stored;
    }
    return null;
  })();


  /**
   * Reconstruct reads the SAME confirmed spec the swap used: resolved from the
   * stored pieces, with any field still missing filled from the stored spec.
   * No field is ever defaulted to a product name here.
   */
  const specs: TargetSpec[] = specPieces.length
    ? specPieces.map((piece, index) => {
      const resolved = resolveTargetSpec(piece);
      const stored = storedSpecs[index] ?? null;
      if (!stored) return resolved;
      const fill = (field: keyof TargetSpec) =>
        (resolved[field] ?? null) || ((stored as any)[field] ?? null);
      return {
        ...resolved,
        type: fill("type") as string | null,
        metal: fill("metal") as string | null,
        stone: fill("stone") as string | null,
        stoneColor: fill("stoneColor") as string | null,
        quality: fill("quality") as string | null,
        dimensions: fill("dimensions") as string | null,
        settings: resolved.settings.length ? resolved.settings : (stored.settings ?? []),
        sources: (() => {
          const merged: Record<string, string> = { ...(stored.sources ?? {}) };
          for (const [field, value] of Object.entries(resolved.sources ?? {})) {
            if (value && value !== "unknown") merged[field] = value;
          }
          return merged;
        })(),

      };
    })
    : storedSpecs;

  const notes = specPieces.map((piece) => String(piece?.notes ?? "").trim()).filter(Boolean).join(" ");

  // DIAMOND OPTICS (temporal): the cached profile drives one consistent optical
  // character across the rebuilt clip. Cached only — never a Gemini call here.
  const reconstructControls = readOpticsControls(args.opticsControls);
  const reconstructOptics = normalizeOpticsProfile(args.opticsProfile);
  const opticsText = reconstructOptics
    ? opticsPromptLines({
      profile: reconstructOptics,
      controls: reconstructControls,
      colorlessStones: isColorlessSpec(specs),
      stoneFamily: reconstructOptics.stoneFamily ?? null,
      temporal: true,
    }).join("\n")
    : null;

  /**
   * MATERIAL APPEARANCE AUTHORITY: the same reference the approved frames used,
   * read back from the stored swap payload when the client omits it. Material
   * realism only — it never contributes geometry to the rebuild.
   */
  const materialAuthority = normalizeMaterialAuthority(args.materialAuthority ?? null) ?? (() => {
    for (const url of referenceUrls) {
      const stored = normalizeMaterialAuthority(
        metaByUrl.get(url)?.material_appearance_authority ?? null,
      );
      if (stored) return stored;
    }
    return null;
  })();

  const director = buildSeedanceDirectorPrompt({
    frames,
    specs,
    notes: notes || null,
    duration,
    aspectRatio: args.aspectRatio ?? null,
    extra: args.extraPrompt ?? null,
    opticsText,
    masterLock,
    materialAuthority,
  });
  return {
    availableUrls,
    referenceUrls,
    videoModel,
    endpointId,
    duration,
    specs,
    director,
    masterLock,
    materialAuthority,
  };
}

/** Non-paid preview: same prep, no FAL submit, no row insert, no credits. */
async function previewReconstructionPrompt(admin: AdminClient, args: ReconstructionPrep) {
  const prep = await prepareReconstruction(admin, args);
  return {
    prompt: prep.director.prompt,
    shotPlan: prep.director.shotPlan,
    frameRoles: prep.director.frameRoles,
    geometry: prep.director.geometry,
    characterCount: prep.director.prompt.length,
    maxCharacters: DIRECTOR_MAX_CHARS,
    referencesUsed: prep.referenceUrls.length,
    referencesAvailable: prep.availableUrls.length,
  };
}

/**
 * §F1 — the EXACT user-edited string is what gets submitted: this only
 * validates it (non-empty, within the Seedance limit) and NEVER rewrites,
 * trims, merges or truncates it, so the text previewed in the UI is byte-for-byte
 * the text sent to the provider.
 */
function normalizePromptOverride(value: unknown) {
  if (typeof value !== "string") return null;
  if (!value.trim()) return null;
  if (value.length > DIRECTOR_MAX_CHARS) {
    throw new Error(
      `Your prompt is ${value.length} characters — Seedance accepts at most ${DIRECTOR_MAX_CHARS}. Shorten it and try again.`,
    );
  }
  return value;
}


/**
 * §F2 — resolutions the Seedance reference-to-video endpoints truly accept,
 * read from the live fal OpenAPI schema (see note in startReconstruction).
 */
export const REFERENCE_VIDEO_RESOLUTIONS_BY_MODEL: Record<string, string[]> = {
  "seedance-2.0": ["480p", "720p", "1080p", "4k"],
  "seedance-2.0-fast": ["480p", "720p"],
};

async function startReconstruction(admin: AdminClient, args: ReconstructionPrep & {
  /** When set, this exact text becomes the final Seedance prompt. */
  promptOverride?: unknown;
  inputFingerprint?: unknown;
  webhookBase: string;
}) {
  const {
    availableUrls,
    referenceUrls,
    videoModel,
    endpointId,
    duration,
    specs,
    director,
    masterLock,
    materialAuthority,
  } = await prepareReconstruction(admin, args);

  const autoPrompt = director.prompt;
  const override = normalizePromptOverride(args.promptOverride);
  const prompt = override ?? autoPrompt;




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

    /**
     * §F2 — RESOLUTION TRUTHFULNESS. These sets come from the LIVE fal OpenAPI
     * schema for the reference-to-video endpoints we actually submit to
     * (verified 2026-08-21):
     *   bytedance/seedance-2.0/reference-to-video      → 480p, 720p, 1080p, 4k
     *   bytedance/seedance-2.0/fast/reference-to-video → 480p, 720p
     * The UI offers exactly these options per model. An unsupported request is
     * REJECTED (never silently downgraded).
     */
    const requestedResolution = String(args.resolution ?? "").trim().toLowerCase() || "720p";
    const supportedResolutions = REFERENCE_VIDEO_RESOLUTIONS_BY_MODEL[videoModel.key] ??
      ["480p", "720p"];
    if (!supportedResolutions.includes(requestedResolution)) {
      throw new Error(
        `${videoModel.label} cannot render ${requestedResolution.toUpperCase()} — supported resolutions: ${
          supportedResolutions.map((value) => value.toUpperCase()).join(", ")
        }`,
      );
    }
    const resolution = requestedResolution;
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
    // §F3 — bounded retry is safe here ONLY because no request id exists yet
    // (the job was never accepted, so no paid submission can be duplicated).
    const requestId = await submitWithTransientRetry(endpointId, falInput, webhookUrl);


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
          // §F2 — these are always equal: an unsupported request throws above,
          // so no silent downgrade can ever be recorded.
          requested_resolution: requestedResolution,
          submitted_resolution: resolution,
          supported_resolutions: supportedResolutions,
          video_model: videoModel.key,
          references_used: referenceUrls.length,
          references_available: availableUrls.length,
          // Director-timeline verification hooks.
          director_prompt: prompt,
          shot_plan: director.shotPlan,
          frame_roles: director.frameRoles,
          available_geometry: director.geometry,
          target_spec: specs,
          // MASTER PRODUCT LOCK inherited by the rebuild (same lock as the frames).
          master_product_lock: masterLock,
          master_product_lock_summary: masterLockSummaryLine(masterLock),

          // MATERIAL APPEARANCE AUTHORITY used for this run (material realism only).
          material_appearance_authority: materialAuthority,
          material_appearance_authority_summary: materialAuthoritySummaryLine(materialAuthority),
          // Prompt audit trail: FUSE's version vs the exact text submitted.
          director_prompt_auto: autoPrompt,
          director_prompt_final: prompt,
          director_prompt_user_edited: override !== null,
          director_prompt_character_count: prompt.length,
          director_prompt_input_fingerprint:
            typeof args.inputFingerprint === "string" ? args.inputFingerprint : null,


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

/** Kling 3.0 caps `prompt` at 2500 chars; stay safely under it. */
const ANIMATE_PROMPT_MAX = 2400;

const LOCK_GEOMETRY_COMPACT =
  "Preserve the object identity, geometry and proportions exactly — only the features actually visible in the first frame, never adding, removing, redesigning or inventing anything.";

const OPTICS_DIAMONDS_COMPACT =
  "Any visible faceted stones show physically realistic brilliance and scintillation, each stone responding independently to the changing camera and light angle — no synchronized blinking, no glitter or sparkle particles, no glow, no heavy bloom.";

const OPTICS_METAL_COMPACT =
  "Visible metal keeps its exact colour and finish; the moving camera and lights create realistic specular travel — never liquid chrome, never a material change.";

const NEGATIVES_COMPACT =
  "Negative: no morphing, no geometry drift, no deformation, no changed or disappearing or added stones, no changed logos or lettering, no floating, no object rotation, no fake glitter, no recentering, no scene change, no invented unseen geometry.";

/** Hard-trim to the cap on a sentence/word boundary. */
function capPrompt(text: string, max = ANIMATE_PROMPT_MAX) {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max);
  const sentence = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf(".\n"));
  if (sentence > max * 0.6) return slice.slice(0, sentence + 1).trim();
  const word = slice.lastIndexOf(" ");
  return (word > max * 0.6 ? slice.slice(0, word) : slice).trim();
}

/**
 * §F6 — MOTION PRESETS. The live Kling schema (see §F5) has NO dedicated camera
 * motion field, so motion is routed exclusively through the `prompt` input as a
 * curated directive. `shot_type` stays untouched (its enum is only
 * "customize" | "intelligent" — a multi-shot switch, not a camera control).
 * "auto" contributes NO directive, so the default reproduces today's output.
 */
const MOTION_PRESET_DIRECTIVES: Record<string, string> = {
  slow_orbit:
    "MOTION — Slow Orbit: the CAMERA arcs slowly and continuously around the piece at a fixed distance, revealing form through parallax only.",
  push_in:
    "MOTION — Push-In: the CAMERA advances slowly and steadily straight toward the piece, tightening the frame without any cut or zoom snap.",
  locked_off:
    "MOTION — Locked-Off: the CAMERA is completely static on a tripod; the only change in frame is light and specular movement.",
  tilt_reveal:
    "MOTION — Tilt Reveal: the CAMERA tilts slowly from below or above the piece to reveal it progressively, ending on a settled framing.",
};

function resolveMotionDirective(preset: unknown) {
  const key = String(preset ?? "auto").trim().toLowerCase();
  if (!key || key === "auto") return { key: "auto", directive: "" };
  const directive = MOTION_PRESET_DIRECTIVES[key];
  if (!directive) {
    throw new Error(
      `Motion preset "${key}" is not supported. Supported: auto, ${
        Object.keys(MOTION_PRESET_DIRECTIVES).join(", ")
      }.`,
    );
  }
  return { key, directive };
}

/** Compose the final Kling prompt for one clip, in strict priority order. */
function buildAnimationPrompt(
  shot: ShotSpec | null,
  customPrompt?: string | null,
  motionDirective?: string,
) {

  const custom = String(customPrompt ?? "").trim();

  const direction = [
    shot ? `SHOT — ${shot.label}. ${shot.body}` : "",
    // §F6 — empty for "auto", so the default prompt is byte-identical to before.
    String(motionDirective ?? "").trim(),

    custom
      ? capPrompt(
          `DIRECTOR NOTE (camera, focus and lighting only; the object never moves): ${custom}`,
          900,
        )
      : "",
    "The CAMERA performs every move; the first-frame object remains rigid and unchanged, and motion blur is produced exclusively by camera movement.",
  ]
    .filter(Boolean)
    .join(" ");

  // Exact priority order. The first four parts are deliberately concise and
  // mandatory; optics and negatives are appended only when they fit.
  const required = [LOCK_FIRST_FRAME, LOCK_OBJECT, direction, LOCK_GEOMETRY_COMPACT];
  const optional = [OPTICS_DIAMONDS_COMPACT, OPTICS_METAL_COMPACT, NEGATIVES_COMPACT];

  const parts: string[] = [];
  let length = 0;
  for (const part of [...required, ...optional]) {
    const add = (parts.length ? 2 : 0) + part.length;
    if (length + add > ANIMATE_PROMPT_MAX) {
      if (required.includes(part)) {
        const remaining = ANIMATE_PROMPT_MAX - length - (parts.length ? 2 : 0);
        if (remaining > 0) parts.push(capPrompt(part, remaining));
      }
      continue;
    }
    parts.push(part);
    length += add;
  }

  // Final hard guard before this value can reach the provider payload.
  return capPrompt(parts.join("\n\n"), ANIMATE_PROMPT_MAX);
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
/**
 * §F4 — schema-derived. Read from the live fal OpenAPI schema for
 * fal-ai/kling-video/v3/pro/image-to-video: `duration` is a string enum
 * ["3".."15"] (default "5"). Do not widen without re-reading the schema.
 */
const ANIMATE_DURATIONS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;

function resolveAnimateDuration(value: unknown) {
  if (value === undefined || value === null || value === "") return ANIMATE_DURATION;
  const requested = Number(value);
  if (!Number.isFinite(requested) || !ANIMATE_DURATIONS.includes(requested as 3)) {
    throw new Error(
      `Clip duration ${String(value)}s is not supported by Kling 3.0 Pro. Supported: ${
        ANIMATE_DURATIONS.join(", ")
      } seconds.`,
    );
  }
  return requested;
}


async function startAnimateFrame(admin: AdminClient, args: {
  userId: string;
  imageUrl: string;
  /** Client-conditioned (<=9.5 MB) copy of the frame; the 4K original stays the approved asset. */
  animateInputUrl?: unknown;
  /** §F4 — per-clip duration in seconds; must be one of ANIMATE_DURATIONS. */
  durationSeconds?: unknown;
  frameIndex?: number;
  frameTime?: number;
  /** "auto" | a shot key | "custom" */
  cameraDirection?: unknown;
  customPrompt?: string | null;
  /** §F6 — per-clip motion preset ("auto" | slow_orbit | push_in | locked_off | tilt_reveal). */
  motionPreset?: unknown;

  /** Position of this clip inside the approved set + the set size (Auto mode). */
  setIndex?: number;
  setSize?: number;
  pieceTypes?: unknown;
  webhookBase: string;
}) {
  const imageUrl = String(args.imageUrl ?? "").trim();
  if (!imageUrl) throw new Error("A swapped frame is required");
  const clientInputUrl = String(args.animateInputUrl ?? "").trim();
  // §F4 — throws (never clamps) when the requested duration is unsupported.
  const requestedDuration = resolveAnimateDuration(args.durationSeconds);


  const videoModel = getVideoModel(ANIMATE_MODEL_KEY);
  const endpointId = videoModel.endpointId;

  const direction = String(args.cameraDirection ?? "auto").trim().toLowerCase() || "auto";
  const pieceTypes = (Array.isArray(args.pieceTypes) ? args.pieceTypes : [])
    .map((entry) => String(entry ?? "").trim())
    .filter(Boolean);
  const setSize = Math.max(1, Number(args.setSize ?? 1) || 1);
  const setIndex = Math.max(0, Number(args.setIndex ?? 0) || 0);

  let shot: ShotSpec | null = null;
  if (direction === "custom") {
    shot = null;
  } else if (direction === "auto" || !direction) {
    const plan = planShotSet(setSize, pieceTypes);
    shot = plan[Math.min(setIndex, plan.length - 1)] ?? null;
  } else {
    shot = resolveShot(direction) ?? planShotSet(setSize, pieceTypes)[0] ?? null;
  }

  // §F6 — throws (never silently ignores) on an unknown preset.
  const motion = resolveMotionDirective(args.motionPreset);
  const prompt = buildAnimationPrompt(shot, args.customPrompt, motion.directive);

  const summary = shot ? shot.summary : CUSTOM_SUMMARY;

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
    throw new Error(insertError?.message ?? "Could not start the clip");
  }

  try {
    const estimatedCostUsd = await estimateUsd({
      endpointId,
      seconds: requestedDuration,
      fallbackUsdPerSecond: videoFallbackUsdPerSecond(videoModel, false) ?? null,
    });

    // Kling rejects input images over 10 MB. The client now conditions the
    // frame, so this server-side pass is only a safety fallback and early-returns.
    const conditioned = await conditionImageForKling(
      admin as any,
      clientInputUrl || imageUrl,
      args.userId,
    );


    const falInput = buildVideoModelInput(ANIMATE_MODEL_KEY, {
      imageUrl: conditioned.url,
      prompt,
      duration: requestedDuration,
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
          /**
           * §F5 — schema-derived. The live fal OpenAPI schema for
           * fal-ai/kling-video/v3/pro/image-to-video exposes ONLY:
           * start_image_url, end_image_url, prompt, negative_prompt, duration,
           * cfg_scale, generate_audio, shot_type, multi_prompt, elements.
           * There is NO resolution/quality/size/aspect_ratio input, and the
           * output schema declares only a video File. Output resolution is
           * provider-fixed and NOT configurable — never advertise a value.
           */
          resolution_configurable: false,
          requested_quality: null,
          submitted_quality: null,

          // §F4 — requested === submitted, persisted for audit.
          requested_duration_seconds: requestedDuration,
          submitted_duration_seconds: Number(falInput.duration ?? requestedDuration),
          supported_duration_seconds: [...ANIMATE_DURATIONS],
          source_frame_url: imageUrl,
          animate_input_url: conditioned.url,
          animate_input_conditioned: conditioned.conditioned,
          animate_input_note: conditioned.note ?? null,
          animate_input_client_conditioned: !!clientInputUrl,

          frame_index: Number(args.frameIndex ?? 0),
          frame_time: Number(args.frameTime ?? 0),
          camera_direction: direction,
          // §F6 — motion routes through `prompt` only; recorded for audit.
          motion_preset: motion.key,
          motion_routed_via: "prompt",

          shot_key: shot?.key ?? "custom",
          shot_label: shot?.label ?? "Custom direction",
          shot_energy: shot?.energy ?? "custom",
          direction_summary: summary,
          animation_prompt: prompt,
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

/* ==================== §F3 — transient provider resilience ==================== */

const F3_POLL_RETRIES = 3;
const F3_POLL_BACKOFF_MS = [400, 1200, 2500];
const F3_SUBMIT_RETRIES = 2;
const F3_SUBMIT_BACKOFF_MS = [600, 1800];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * §F3 — transient provider/gateway failures. These NEVER mean the paid job
 * failed; they only mean we could not READ its state right now.
 */
function isTransientProviderError(message: string) {
  return /\b(502|503|504)\b|bad gateway|gateway time-?out|service unavailable|downstream_service_unavailable|temporarily unavailable|timed? ?out|timeout|econnreset|socket hang up|fetch failed|network|queue status lookup failed|queue result lookup failed|result lookup failed/i
    .test(message);
}

/**
 * §F3 — submit-side bounded retry. Only safe BEFORE a request id exists: a
 * failed submit was never accepted, so no paid job can be duplicated. Once a
 * request id is returned we never resubmit (see `syncRow`).
 */
async function submitWithTransientRetry(
  endpointId: string,
  falInput: Record<string, unknown>,
  webhookUrl: string,
) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= F3_SUBMIT_RETRIES; attempt += 1) {
    try {
      return await submitFalJob(endpointId, falInput, webhookUrl);
    } catch (error) {
      lastError = error;
      const message = errorMessage(error);
      // Hard rejections (bad input, auth, 4xx) must fail fast — never loop.
      if (!isTransientProviderError(message) || attempt === F3_SUBMIT_RETRIES) throw error;
      await sleep(F3_SUBMIT_BACKOFF_MS[attempt] ?? 1800);
    }
  }
  throw lastError;
}

/**
 * Poll fal for an in-flight row and persist any terminal result.
 *
 * §F3 — the row already carries `provider_request_id`, i.e. a PAID accepted
 * job. Transient lookup failures retry the SAME request id with bounded
 * backoff and, if still unreadable, leave the row `running` with a
 * "still tracking" marker. The job is NEVER resubmitted from this path.
 */
async function syncRow(admin: AdminClient, row: any) {
  if (row.status !== "running" && row.status !== "queued") return serialize(row);
  if (!row.provider_request_id || !row.provider_model) return serialize(row);

  const markTransient = async (message: string, attempts: number) => {
    const payload = (row.input_payload ?? {}) as Record<string, unknown>;
    const { data: updated } = await admin
      .from("studio_generations")
      .update({
        input_payload: {
          ...payload,
          provider_transient: true,
          provider_transient_note: message.slice(0, 500),
          provider_transient_attempts: attempts,
          provider_transient_at: new Date().toISOString(),
        },
      })
      .eq("id", row.id)
      .select("*")
      .single();
    return serialize(updated ?? row);
  };

  const clearTransient = async (patch: Record<string, unknown>) => {
    const payload = (row.input_payload ?? {}) as Record<string, unknown>;
    const nextPayload = { ...payload };
    delete nextPayload.provider_transient;
    delete nextPayload.provider_transient_note;
    delete nextPayload.provider_transient_attempts;
    delete nextPayload.provider_transient_at;
    const { data: updated } = await admin
      .from("studio_generations")
      .update({ ...patch, input_payload: nextPayload })
      .eq("id", row.id)
      .select("*")
      .single();
    return updated ?? row;
  };

  let lastTransient = "";
  for (let attempt = 0; attempt <= F3_POLL_RETRIES; attempt += 1) {
    try {
      // Same provider request id on every attempt — read-only, never a resubmit.
      const status = await getFalQueueStatus(row.provider_model, row.provider_request_id);
      const normalized = String(status ?? "").toUpperCase();
      if (normalized !== "COMPLETED" && normalized !== "OK") {
        // Still in flight: clear any stale transient marker and keep waiting.
        if ((row.input_payload as any)?.provider_transient) {
          return serialize(await clearTransient({}));
        }
        return serialize(row);
      }

      const result = await getFalQueueResult(row.provider_model, row.provider_request_id);
      const output = extractOutput(result);
      if (!output) throw new Error("The provider finished without returning a file");

      return serialize(await clearTransient({
        status: "complete",
        output_url: output.url,
        output_type: output.type,
        completed_at: new Date().toISOString(),
      }));
    } catch (error) {
      const message = errorMessage(error);
      if (isTransientProviderError(message)) {
        lastTransient = message;
        if (attempt < F3_POLL_RETRIES) {
          await sleep(F3_POLL_BACKOFF_MS[attempt] ?? 2500);
          continue;
        }
        // Still unreadable: keep the job alive and tell the user we're tracking.
        return await markTransient(message, attempt + 1);
      }

      // Confirmed hard failure reported by the provider — terminal.
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

  return await markTransient(lastTransient || "Provider temporarily unavailable", F3_POLL_RETRIES + 1);
}


type LibraryAssetRow = {
  id: string;
  outputUrl: string;
  outputType: "image" | "video";
  kind: string | null;
  prompt: string | null;
  feature: string | null;
  createdAt: string | null;
  source: "generated" | "upload";
};

/** Auto-extracted source frames (frame-45-00.jpg) are noise, not user uploads. */
function isExtractedFrame(name: string) {
  return /frame-\d/i.test(name);
}

function guessTypeFromName(name: string): "image" | "video" | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "webp", "gif", "avif", "heic"].includes(ext)) return "image";
  if (["mp4", "mov", "webm", "m4v", "quicktime"].includes(ext)) return "video";
  return null;
}

/**
 * Enumerate the caller's OWN uploaded media in the `fuse-assets` bucket.
 * Every listing prefix embeds the caller's user id (system/<feature>/<userId>/...),
 * so another user's objects can never be reached.
 */
async function listUserUploads(
  admin: any,
  userId: string,
  typeFilter: string,
): Promise<LibraryAssetRow[]> {
  const base = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/fuse-assets/`;
  const bucket = admin.storage.from("fuse-assets");
  const results: LibraryAssetRow[] = [];

  const listAt = async (prefix: string) => {
    const { data, error } = await bucket.list(prefix, {
      limit: 200,
      sortBy: { column: "created_at", order: "desc" },
    });
    if (error) return [] as any[];
    return data ?? [];
  };

  try {
    const features = (await listAt("system")).filter((entry: any) => !entry.id);

    for (const feature of features) {
      // user-scoped prefix — never lists outside the caller's own folder
      const userPrefix = `system/${feature.name}/${userId}`;
      const level1 = await listAt(userPrefix);

      const pending: { prefix: string; entries: any[] }[] = [{ prefix: userPrefix, entries: level1 }];
      const subfolders = level1.filter((entry: any) => !entry.id).slice(0, 40);
      for (const folder of subfolders) {
        const prefix = `${userPrefix}/${folder.name}`;
        pending.push({ prefix, entries: await listAt(prefix) });
      }

      for (const group of pending) {
        for (const entry of group.entries) {
          if (!entry.id) continue; // folder
          const name = entry.name as string;
          if (name === ".emptyFolderPlaceholder") continue;
          if (isExtractedFrame(name)) continue;

          const mime = String(entry.metadata?.mimetype ?? "");
          const outputType = mime.startsWith("video/")
            ? "video"
            : mime.startsWith("image/")
            ? "image"
            : guessTypeFromName(name);
          if (!outputType) continue;
          if ((typeFilter === "image" || typeFilter === "video") && outputType !== typeFilter) continue;

          const path = `${group.prefix}/${name}`;
          results.push({
            id: `upload:${path}`,
            outputUrl: `${base}${path.split("/").map(encodeURIComponent).join("/")}`,
            outputType,
            kind: "upload",
            prompt: null,
            feature: "upload",
            createdAt: entry.created_at ?? entry.updated_at ?? null,
            source: "upload",
          });
        }
      }
    }
  } catch {
    // Uploads are a bonus source — never break the library on a storage hiccup.
  }

  return results;
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
        mode: typeof body.mode === "string" ? body.mode : null,
        coverage: typeof body.coverage === "string" ? body.coverage : null,
        macro: body.macro === true,
        frameAnalysis: body.frameAnalysis ?? null,
        productAnalysis: body.productAnalysis ?? null,
        opticsProfile: body.opticsProfile ?? null,
        frameOpticsProfile: body.frameOpticsProfile ?? null,
        opticsControls: body.opticsControls ?? null,
        masterProductLock: body.masterProductLock ?? null,
        projectId: body.projectId ?? null,
        materialAuthority: body.materialAuthority ?? null,
        canonicalMasters: body.canonicalMasters ?? null,
        connectedAssets: body.connectedAssets ?? null,
        webhookBase,
      });
      return json(await signDeepDisplayUrls(admin, { generation }));
    }

    // CANONICAL MASTER (§22): explicit user action only — one paid Nano run per
    // requested view, on the EXISTING Nano path.
    if (action === "generate_canonical_master") {
      const generation = await startCanonicalMaster(admin, {
        userId: user.id,
        view: String(body.view ?? ""),
        componentLabel: body.componentLabel ?? null,
        pieces: body.pieces ?? [],
        aspectRatio: body.aspectRatio,
        resolution: body.resolution,
        extraPrompt: body.extraPrompt,
        imageModel: body.imageModel,
        masterProductLock: body.masterProductLock ?? null,
        projectId: body.projectId ?? null,
        materialAuthority: body.materialAuthority ?? null,
        connectedAssets: body.connectedAssets ?? null,
        campaignPhotography: body.campaignPhotography ?? null,
        setIndex: body.setIndex,
        setSize: body.setSize,
        webhookBase,
      });
      return json(await signDeepDisplayUrls(admin, { generation }));
    }

    // MATCHED PAIR (§29): explicit user action only — one paid Nano run that
    // changes ONLY the manufacturing stage of an existing approved plate.
    if (action === "generate_matched_pair") {
      const generation = await startMatchedPair(admin, {
        userId: user.id,
        sourceImageUrl: String(body.sourceImageUrl ?? ""),
        sourceId: body.sourceId ?? null,
        sourceLabel: body.sourceLabel ?? null,
        sourceStage: body.sourceStage ?? null,
        targetStage: body.targetStage ?? null,
        pieces: body.pieces ?? [],
        aspectRatio: body.aspectRatio,
        resolution: body.resolution,
        extraPrompt: body.extraPrompt,
        imageModel: body.imageModel,
        masterProductLock: body.masterProductLock ?? null,
        projectId: body.projectId ?? null,
        materialAuthority: body.materialAuthority ?? null,
        webhookBase,
      });
      return json(await signDeepDisplayUrls(admin, { generation }));
    }



    // NON-PAID: prompt preview only — no FAL submit, no generation row, no credits.
    if (action === "preview_reconstruction_prompt") {
      const preview = await previewReconstructionPrompt(admin, {
        userId: user.id,
        frameUrls: body.frameUrls ?? [],
        model: body.model,
        duration: body.duration,
        resolution: body.resolution,
        aspectRatio: body.aspectRatio,
        extraPrompt: body.extraPrompt,
        opticsProfile: body.opticsProfile ?? null,
        opticsControls: body.opticsControls ?? null,
        masterProductLock: body.masterProductLock ?? null,
        materialAuthority: body.materialAuthority ?? null,
      });
      return json(await signDeepDisplayUrls(admin, { preview }));
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
        opticsProfile: body.opticsProfile ?? null,
        opticsControls: body.opticsControls ?? null,
        masterProductLock: body.masterProductLock ?? null,
        materialAuthority: body.materialAuthority ?? null,
        promptOverride: body.promptOverride ?? null,
        inputFingerprint: body.promptInputFingerprint ?? null,
        webhookBase,
      });
      return json(await signDeepDisplayUrls(admin, { generation }));
    }

    if (action === "animate_frame") {
      const generation = await startAnimateFrame(admin, {
        userId: user.id,
        imageUrl: body.imageUrl ?? body.sourceFrameUrl,
        animateInputUrl: body.animateInputUrl ?? null,
        durationSeconds: body.durationSeconds ?? null,
        frameIndex: body.frameIndex,
        frameTime: body.frameTime,
        cameraDirection: body.cameraDirection,
        customPrompt: body.customPrompt ?? null,
        motionPreset: body.motionPreset ?? "auto",

        setIndex: body.setIndex,
        setSize: body.setSize,
        pieceTypes: body.pieceTypes ?? [],
        webhookBase,
      });
      return json(await signDeepDisplayUrls(admin, { generation }));
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
      return json(await signDeepDisplayUrls(admin, { generations }));
    }

    // Read-only asset library: the caller's completed generations + their own
    // previously uploaded media from storage, newest first.
    if (action === "list_assets") {
      const typeFilter = String(body.type ?? "all");
      const limit = Math.min(60, Math.max(1, Number(body.limit ?? 60)));

      let query = admin
        .from("studio_generations")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "complete")
        .not("output_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (typeFilter === "image" || typeFilter === "video") {
        query = query.eq("output_type", typeFilter);
      }

      const { data: rows, error } = await query;
      if (error) throw new Error(error.message);

      const generated = (rows ?? []).map((row: any) => {
        const payload = (row.input_payload ?? {}) as Record<string, unknown>;
        return {
          id: row.id,
          outputUrl: row.output_url,
          outputType: row.output_type === "video" ? "video" : "image",
          kind: row.kind ?? null,
          prompt: typeof payload.prompt === "string" ? payload.prompt.slice(0, 240) : null,
          feature: typeof payload.feature === "string" ? payload.feature : (row.kind ?? "studio"),
          createdAt: row.created_at,
          source: "generated" as const,
        };
      });

      const uploads = await listUserUploads(admin, user.id, typeFilter);

      const seen = new Set<string>();
      const assets = [...generated, ...uploads]
        .filter((asset) => {
          if (!asset.outputUrl || seen.has(asset.outputUrl)) return false;
          seen.add(asset.outputUrl);
          return true;
        })
        .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))
        .slice(0, limit);

      return json(await signDeepDisplayUrls(admin, { assets }));
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
      return json(await signDeepDisplayUrls(admin, { generations }));
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
