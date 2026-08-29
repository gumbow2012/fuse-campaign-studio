/**
 * OUTFIT SWAP V2 — PHASE 5: the single-pass frame-generation contract.
 *
 * THE ONE CRITICAL RULE
 *   Each rebuilt frame = SOURCE FRAME + MODEL identity refs + GARMENT front/back
 *   refs + structured instructions → ONE image edit (nano-banana-pro/edit).
 *   NEVER a clothing-swap edit followed by an identity-swap edit.
 *
 * Inputs come from the earlier phases:
 *   Phase 1 → per-frame subject tracks + garment orientation (outfit_swap_analyses)
 *   Phase 2 → garments with FRONT / optional BACK references
 *   Phase 3 → subject track → garment assignment
 *   Phase 4 → subject track → model assignment (keep_original|upload|avatar|cast)
 *
 * BACKWARD COMPATIBILITY: `requiresFusedAssembly()` returns false for the simple
 * case (1 subject, keep_original, no back-design/orientation work). Callers then
 * keep the EXISTING request/prompt untouched. Only multi-subject / model-swap /
 * back-design frames go through `assembleFrameEdit()`.
 *
 * This module is pure request assembly — it never calls a provider.
 */

export type SwapOrientation =
  | "FRONT"
  | "BACK"
  | "LEFT_3_4"
  | "RIGHT_3_4"
  | "SIDE"
  | "OCCLUDED"
  | "UNCERTAIN";

export type AssemblyGarment = {
  id?: string | null;
  /** Primary reference used today; mirrors frontUrl. */
  url?: string | null;
  frontUrl?: string | null;
  backUrl?: string | null;
  hasBackDesign?: boolean;
  type?: string | null;
  label?: string | null;
  person?: string | null;
};

export type AssemblyFrameSubject = {
  subjectId: string;
  faceOrientation?: SwapOrientation | string | null;
  bodyOrientation?: SwapOrientation | string | null;
  garmentOrientation?: SwapOrientation | string | null;
  torsoVisibility?: number | null;
  garmentVisibility?: number | null;
  occlusion?: "none" | "partial" | "heavy" | string | null;
  confidence?: number | null;
};

export type AssemblySubjectWardrobe = {
  topGarmentId?: string | null;
  bottomGarmentId?: string | null;
};

export type AssemblyModelSource = "keep_original" | "upload" | "avatar" | "cast";

/**
 * Phase 4 selection, already resolved server-side: `identityRefs` is the ordered
 * identity reference pack (master first) produced from _shared/identity-lock.ts
 * for avatar/cast models, or the user's uploaded references for `upload`.
 */
export type AssemblySubjectModel = {
  modelSource?: AssemblyModelSource | string | null;
  avatarId?: string | null;
  label?: string | null;
  /** Master-first ordered pack. */
  identityRefs?: string[] | null;
  /** Angle-keyed approved references (avatar/cast only). */
  identityAngles?: Record<string, string | null> | null;
};

export type AssembledReference = {
  url: string;
  /** 1-based index in the final image_urls array. */
  index: number;
  role: "source_frame" | "identity" | "garment_front" | "garment_back";
  subjectId?: string;
  garmentId?: string | null;
  note?: string;
};

export type AssembledFrameEdit = {
  mode: "fused_single_pass";
  imageUrls: string[];
  prompt: string;
  references: AssembledReference[];
  /** Structured, loggable description of what this ONE edit does. */
  plan: {
    sourceFrameUrl: string;
    subjectCount: number;
    subjects: {
      subjectId: string;
      garmentOrientation: SwapOrientation;
      modelSource: AssemblyModelSource;
      identityRefCount: number;
      garmentRefs: { slot: "top" | "bottom"; side: "front" | "back"; garmentId: string | null }[];
    }[];
    droppedReferences: number;
    editCount: 1;
  };
};

const MAX_IDENTITY_REFS_PER_SUBJECT = 2;

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOrientation(value: unknown): SwapOrientation {
  const raw = trimmed(value).toUpperCase().replace(/[\s-]+/g, "_");
  switch (raw) {
    case "FRONT":
    case "BACK":
    case "LEFT_3_4":
    case "RIGHT_3_4":
    case "SIDE":
    case "OCCLUDED":
      return raw;
    default:
      return "UNCERTAIN";
  }
}

function normalizeModelSource(value: unknown): AssemblyModelSource {
  const raw = trimmed(value).toLowerCase();
  return raw === "upload" || raw === "avatar" || raw === "cast" ? raw : "keep_original";
}

function isRearFacing(orientation: SwapOrientation) {
  return orientation === "BACK";
}

function isFrontFacing(orientation: SwapOrientation) {
  return orientation === "FRONT" || orientation === "LEFT_3_4" || orientation === "RIGHT_3_4";
}

function garmentFrontUrl(garment: AssemblyGarment | null | undefined) {
  if (!garment) return "";
  return trimmed(garment.frontUrl) || trimmed(garment.url);
}

function garmentBackUrl(garment: AssemblyGarment | null | undefined) {
  if (!garment) return "";
  return garment.hasBackDesign === false ? "" : trimmed(garment.backUrl);
}

/**
 * TRUE only when this frame actually needs the new fused assembly. Everything
 * else keeps the pre-Phase-5 request byte-for-byte.
 *
 * Fused assembly is required when ANY of the following holds:
 *   - more than one subject track is present in this frame
 *   - any subject swaps its model (upload / avatar / cast)
 *   - any assigned garment has a back design AND the frame shows a rear/side view
 */
export function requiresFusedAssembly(args: {
  frameSubjects?: AssemblyFrameSubject[] | null;
  garments?: AssemblyGarment[] | null;
  castAssignment?: Record<string, AssemblySubjectWardrobe> | null;
  modelAssignment?: Record<string, AssemblySubjectModel> | null;
}): boolean {
  const subjects = (args.frameSubjects ?? []).filter((subject) => trimmed(subject?.subjectId));
  if (subjects.length > 1) return true;

  const models = args.modelAssignment ?? {};
  const swapsModel = Object.values(models).some(
    (model) => normalizeModelSource(model?.modelSource) !== "keep_original",
  );
  if (swapsModel) return true;

  const garments = args.garments ?? [];
  const hasBackDesign = garments.some(
    (garment) => garment?.hasBackDesign === true && trimmed(garment?.backUrl),
  );
  if (!hasBackDesign) return false;

  // A back design only changes the request when the frame is not purely frontal.
  return subjects.some((subject) => {
    const orientation = normalizeOrientation(subject.garmentOrientation);
    return orientation !== "FRONT";
  });
}

/** Angle-appropriate identity references (max 2), master first. */
function pickIdentityRefs(model: AssemblySubjectModel, orientation: SwapOrientation): string[] {
  const source = normalizeModelSource(model.modelSource);
  if (source === "keep_original") return [];

  if (source === "upload") {
    return (model.identityRefs ?? [])
      .map((url) => trimmed(url))
      .filter(Boolean)
      .slice(0, MAX_IDENTITY_REFS_PER_SUBJECT);
  }

  const angles = model.identityAngles ?? {};
  const angleFor = (key: string) => trimmed(angles[key]);
  let preferred = "";
  switch (orientation) {
    case "LEFT_3_4":
      preferred = angleFor("left_3_4") || angleFor("front");
      break;
    case "RIGHT_3_4":
      preferred = angleFor("right_3_4") || angleFor("front");
      break;
    case "SIDE":
      preferred = angleFor("left_profile") || angleFor("right_profile") || angleFor("front");
      break;
    case "BACK":
      preferred = angleFor("full_body") || angleFor("front");
      break;
    default:
      preferred = angleFor("front");
  }

  const pack = (model.identityRefs ?? []).map((url) => trimmed(url)).filter(Boolean);
  const ordered = [pack[0] ?? "", preferred, ...pack.slice(1)].filter(Boolean);
  return Array.from(new Set(ordered)).slice(0, MAX_IDENTITY_REFS_PER_SUBJECT);
}

/**
 * Assembles ONE nano-banana edit request for ONE source frame.
 *
 * REFERENCE-LIMIT STRATEGY: image 1 is always the source frame; after that only
 * references relevant to the subjects visible in THIS frame are included —
 * orientation-relevant garment refs and at most 2 identity refs per subject.
 * The whole project reference set is never dumped into a frame.
 */
export function assembleFrameEdit(args: {
  sourceFrameUrl: string;
  frameSubjects: AssemblyFrameSubject[];
  garments: AssemblyGarment[];
  castAssignment?: Record<string, AssemblySubjectWardrobe> | null;
  modelAssignment?: Record<string, AssemblySubjectModel> | null;
  maxReferenceImages: number;
  extraPrompt?: string | null;
  identityAuthorityBlock?: string | null;
}): AssembledFrameEdit {
  const sourceFrameUrl = trimmed(args.sourceFrameUrl);
  if (!sourceFrameUrl) throw new Error("A source frame is required");

  const garmentById = new Map<string, AssemblyGarment>();
  for (const garment of args.garments ?? []) {
    const id = trimmed(garment?.id);
    if (id) garmentById.set(id, garment);
  }

  const subjects = (args.frameSubjects ?? []).filter((subject) => trimmed(subject?.subjectId));
  const cast = args.castAssignment ?? {};
  const models = args.modelAssignment ?? {};

  const references: AssembledReference[] = [
    { url: sourceFrameUrl, index: 1, role: "source_frame", note: "authority for pose/motion/framing/environment/camera/lighting" },
  ];
  const seen = new Set([sourceFrameUrl]);
  let dropped = 0;

  const push = (ref: Omit<AssembledReference, "index">) => {
    const url = trimmed(ref.url);
    if (!url) return null;
    if (seen.has(url)) {
      // Already conditioning this edit — reuse its slot instead of a duplicate.
      return references.find((entry) => entry.url === url) ?? null;
    }
    if (references.length >= args.maxReferenceImages) {
      dropped += 1;
      return null;
    }
    seen.add(url);
    const entry: AssembledReference = { ...ref, url, index: references.length + 1 };
    references.push(entry);
    return entry;
  };

  const planSubjects: AssembledFrameEdit["plan"]["subjects"] = [];
  const subjectInstructions: string[] = [];

  subjects.forEach((subject, order) => {
    const subjectId = trimmed(subject.subjectId);
    const orientation = normalizeOrientation(subject.garmentOrientation);
    const model = models[subjectId] ?? {};
    const modelSource = normalizeModelSource(model.modelSource);
    const subjectLabel = subjects.length > 1 ? `subject ${order + 1} (${subjectId})` : "the subject";

    // 1. IDENTITY — model refs only when the person is actually replaced.
    const identityRefs = pickIdentityRefs(model, orientation);
    const identityIndexes: number[] = [];
    for (const url of identityRefs) {
      const entry = push({ url, role: "identity", subjectId });
      if (entry) identityIndexes.push(entry.index);
    }

    if (modelSource === "keep_original" || !identityIndexes.length) {
      subjectInstructions.push(
        `For ${subjectLabel}: KEEP the original person from image 1 — preserve that exact face, hair, skin tone, body proportions and expression. Change wardrobe only.`,
      );
    } else {
      subjectInstructions.push(
        `For ${subjectLabel}: REPLACE the person's identity with the model shown in reference image ${identityIndexes.join(" and ")}${
          trimmed(model.label) ? ` (${trimmed(model.label)})` : ""
        }. That reference is the sole identity authority for this subject; keep the original pose, body position, framing and scene from image 1.`,
      );
    }

    // 2. WARDROBE — orientation-correct garment references.
    const wardrobe = cast[subjectId] ?? {};
    const slots: { slot: "top" | "bottom"; garment: AssemblyGarment | undefined }[] = [
      { slot: "top", garment: garmentById.get(trimmed(wardrobe.topGarmentId)) },
      { slot: "bottom", garment: garmentById.get(trimmed(wardrobe.bottomGarmentId)) },
    ];

    const garmentPlan: AssembledFrameEdit["plan"]["subjects"][number]["garmentRefs"] = [];

    for (const { slot, garment } of slots) {
      if (!garment) continue;
      const garmentId = trimmed(garment.id) || null;
      const type = trimmed(garment.type).toLowerCase() || slot;
      const label = trimmed(garment.label);
      const front = garmentFrontUrl(garment);
      const back = garmentBackUrl(garment);

      const wanted: ("front" | "back")[] = isRearFacing(orientation) && back
        ? ["back"]
        : isFrontFacing(orientation)
        ? ["front"]
        : // SIDE / OCCLUDED / UNCERTAIN — supply both when there is room.
          back
        ? ["front", "back"]
        : ["front"];

      for (const side of wanted) {
        const url = side === "back" ? back : front;
        const entry = push({
          url,
          role: side === "back" ? "garment_back" : "garment_front",
          subjectId,
          garmentId,
        });
        if (!entry) continue;
        garmentPlan.push({ slot, side, garmentId });
        const authority = side === "back" && garment.hasBackDesign
          ? " The back reference is the authority for the rear print — reproduce it exactly, never mirror or invent it."
          : "";
        subjectInstructions.push(
          `For ${subjectLabel}: replace the ${type}${label ? ` (${label})` : ""} with the ${side} view shown in reference image ${entry.index}; this subject's ${type} is currently seen ${orientation.toLowerCase().replace(/_/g, " ")}.${authority}`,
        );
      }
    }

    planSubjects.push({
      subjectId,
      garmentOrientation: orientation,
      modelSource,
      identityRefCount: identityIndexes.length,
      garmentRefs: garmentPlan,
    });
  });

  const swapsAnyIdentity = planSubjects.some(
    (subject) => subject.modelSource !== "keep_original" && subject.identityRefCount > 0,
  );

  const promptLines = [
    "Use image 1 as the exact primary image. This is ONE precise composite edit, not a redesign and not a sequence of edits.",
    "AUTHORITY HIERARCHY: identity references define WHO each person is; garment references define WHAT they wear; image 1 defines pose, motion, framing, composition, environment, camera and lighting.",
    "Preserve image 1's camera angle, framing, background, environment, lighting and every subject's pose, hands and body position exactly.",
    ...subjectInstructions,
    "Match every product's exact colors, graphics, logos, text, materials, construction and fit as shown in its reference image.",
    "Preserve all unrelated clothing, jewelry, shoes and accessories that were not supplied as references.",
    "Leave every person, object and surface not named above exactly as in image 1.",
    "Apply all of the above in a single pass — do not restyle the scene, do not change the number of people, do not re-frame.",
    trimmed(args.extraPrompt),
  ].filter(Boolean);

  const base = promptLines.join(" ");
  const authorityBlock = trimmed(args.identityAuthorityBlock);
  const prompt = swapsAnyIdentity && authorityBlock ? `${authorityBlock}\n\n${base}` : base;

  return {
    mode: "fused_single_pass",
    imageUrls: references.map((entry) => entry.url),
    prompt,
    references,
    plan: {
      sourceFrameUrl,
      subjectCount: subjects.length,
      subjects: planSubjects,
      droppedReferences: dropped,
      editCount: 1,
    },
  };
}

/* ------------------------------------------------------------------------- *
 * PHASE 7 — video reconstruction prompt enrichment.
 *
 * The Seedance reference-to-video pass stays exactly as it is today for the
 * simple case (1 subject, keep_original, no back designs): callers pass their
 * existing legacy prompt through and it is returned untouched. Only runs that
 * needed the Phase 5 fused assembly get the enriched prompt, built from the
 * SAME structured facts (subject tracks, cast assignment, model assignment).
 *
 * This is pure string assembly — it never calls a provider and never triggers
 * a generation. The approved rebuilt stills remain the reference frames.
 * ------------------------------------------------------------------------- */

export type ReconstructionPromptResult = {
  prompt: string;
  enriched: boolean;
  plan: {
    subjectCount: number;
    subjects: {
      subjectId: string;
      modelSource: AssemblyModelSource;
      top: string | null;
      bottom: string | null;
      hasBackDesign: boolean;
    }[];
  };
};

function garmentDescriptor(garment: AssemblyGarment | undefined): string | null {
  if (!garment) return null;
  const label = trimmed(garment.label);
  const type = trimmed(garment.type).toLowerCase();
  return label && type ? `${label} (${type})` : label || type || null;
}

/**
 * Builds the reconstruction prompt for the video pass.
 * `legacyPrompt` is returned VERBATIM whenever the run did not need fused
 * assembly, guaranteeing byte-identical behaviour for single-subject runs.
 */
export function buildReconstructionPromptV2(args: {
  legacyPrompt: string;
  frameSubjects?: AssemblyFrameSubject[] | null;
  garments?: AssemblyGarment[] | null;
  castAssignment?: Record<string, AssemblySubjectWardrobe> | null;
  modelAssignment?: Record<string, AssemblySubjectModel> | null;
  extraPrompt?: string | null;
}): ReconstructionPromptResult {
  const subjects = (args.frameSubjects ?? []).filter((subject) => trimmed(subject?.subjectId));
  const garments = args.garments ?? [];
  const cast = args.castAssignment ?? {};
  const models = args.modelAssignment ?? {};

  const needsEnrichment = requiresFusedAssembly({
    frameSubjects: subjects,
    garments,
    castAssignment: cast,
    modelAssignment: models,
  });

  const garmentById = new Map<string, AssemblyGarment>();
  for (const garment of garments) {
    const id = trimmed(garment?.id);
    if (id) garmentById.set(id, garment);
  }

  const planSubjects: ReconstructionPromptResult["plan"]["subjects"] = subjects.map((subject) => {
    const subjectId = trimmed(subject.subjectId);
    const wardrobe = cast[subjectId] ?? {};
    const top = garmentById.get(trimmed(wardrobe.topGarmentId));
    const bottom = garmentById.get(trimmed(wardrobe.bottomGarmentId));
    return {
      subjectId,
      modelSource: normalizeModelSource(models[subjectId]?.modelSource),
      top: garmentDescriptor(top),
      bottom: garmentDescriptor(bottom),
      hasBackDesign: Boolean(top?.hasBackDesign || bottom?.hasBackDesign),
    };
  });

  if (!needsEnrichment) {
    return {
      prompt: args.legacyPrompt,
      enriched: false,
      plan: { subjectCount: subjects.length, subjects: planSubjects },
    };
  }

  const count = planSubjects.length;
  const lines: string[] = [
    "Recreate the source video exactly: same motion, same action, same timing, same camera movement and framing, same environment and lighting.",
    "The approved reference frames are the absolute authority for who each person is and what each person wears — reproduce them faithfully in motion.",
    count
      ? `There are exactly ${count} ${count === 1 ? "person" : "people"} in this video. Never add, remove, duplicate or merge people.`
      : "Keep the exact same number of people as in the source video.",
    "Each person keeps their own identity and their own wardrobe for the entire clip. No person morphing, no face blending, no swapping wardrobe or identity between people, no identity or garment drift between shots.",
  ];

  planSubjects.forEach((subject, order) => {
    const label = count > 1 ? `Person ${order + 1}` : "The subject";
    const identity = subject.modelSource === "keep_original"
      ? "keeps the original person's face, hair, skin tone and body proportions exactly as in the reference frames"
      : "has the replacement model's identity exactly as locked in the reference frames — that face, hair, skin tone and body proportions, with no drift toward anyone else";
    const wardrobe = [subject.top ? `top: ${subject.top}` : null, subject.bottom ? `bottom: ${subject.bottom}` : null]
      .filter(Boolean)
      .join(", ");
    lines.push(
      `${label} ${identity}${wardrobe ? `, and wears exactly ${wardrobe}` : ""}, consistently in every frame.`,
    );
    if (subject.hasBackDesign) {
      lines.push(
        `${label}'s garment has a distinct back graphic: when they turn away show the exact rear print from the reference frames, and the exact front print when facing camera — never mirror or invent artwork.`,
      );
    }
  });

  lines.push(
    "Keep every logo, colorway, graphic placement, text, material and garment construction identical across the whole clip.",
    "Do not change the environment, background, lighting, or any clothing, jewelry, shoes or accessories that were not replaced.",
    "Same video, same people, new wardrobe.",
    trimmed(args.extraPrompt),
  );

  return {
    prompt: lines.filter(Boolean).join(" "),
    enriched: true,
    plan: { subjectCount: count, subjects: planSubjects },
  };
}
