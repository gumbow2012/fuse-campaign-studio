import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";

export type SwapGeneration = {
  id: string;
  status: "queued" | "running" | "complete" | "failed" | "canceled";
  kind: string | null;
  stage?: string | null;
  prompt: string | null;
  outputUrl: string | null;
  outputType: string | null;
  error: string | null;
  estimatedCredits: number | null;
  estimatedCostUsd: number | null;
  providerModel: string | null;
  frameIndex: number | null;
  frameTime: number | null;
  sourceFrameUrl: string | null;
  createdAt: string | null;
};

/** Call the outfit-swap edge function with a just-in-time session token. */
export async function callOutfitSwap<T = any>(body: Record<string, unknown>): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/outfit-swap`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session?.access_token ?? SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) {
    throw new Error(data?.error ?? `Request failed (${response.status})`);
  }
  return data as T;
}

export type OutfitSwapTemplateResult = {
  templateId: string;
  templateName: string;
  versionId: string;
  previewUrl: string | null;
  inputSlotCount: number;
  productReferenceCount: number;
  klingClipCount: number;
  nodeCount: number;
  edgeCount: number;
  positions: Record<string, { x: number; y: number }>;
};

/**
 * Serializes the current Outfit Swap run into a real, editable template
 * (fuse_templates + template_versions + nodes + edges).
 */
export async function createTemplateFromOutfitSwap(
  body: Record<string, unknown>,
): Promise<OutfitSwapTemplateResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/outfit-swap-to-template`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session?.access_token ?? SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) {
    throw new Error(data?.error ?? `Request failed (${response.status})`);
  }
  return data as OutfitSwapTemplateResult;
}

/** The canvas stores node positions locally, keyed by template version. */
export function persistTemplateLayout(
  versionId: string,
  positions: Record<string, { x: number; y: number }>,
) {
  try {
    window.localStorage.setItem(
      `fuse-template-canvas-layout-v1:${versionId}`,
      JSON.stringify(positions),
    );
  } catch {
    // Layout is a convenience only — the canvas falls back to auto lanes.
  }
}

/* ------------------------------------------------------------------ *
 * PHASE 1 — SOURCE ANALYSIS (analysis only, never generation)
 * ------------------------------------------------------------------ */

export type OutfitSwapOrientation =
  | "FRONT"
  | "BACK"
  | "LEFT_3_4"
  | "RIGHT_3_4"
  | "SIDE"
  | "OCCLUDED"
  | "UNCERTAIN";

export type OutfitSwapFrameSubject = {
  subjectId: string;
  faceOrientation: OutfitSwapOrientation;
  bodyOrientation: OutfitSwapOrientation;
  garmentOrientation: OutfitSwapOrientation;
  torsoVisibility: number;
  garmentVisibility: number;
  occlusion: "none" | "partial" | "heavy";
  confidence: number;
};

export type OutfitSwapSourceAnalysis = {
  version: string;
  frameCount: number;
  subjectCount: number;
  subjectTracks: {
    subjectId: string;
    description: string;
    appearsStart: number;
    appearsEnd: number;
    frameCount: number | null;
    confidence: number;
  }[];
  frames: { frameId: string; timestamp: number; subjects: OutfitSwapFrameSubject[] }[];
};

export type OutfitSwapAnalysisResult = {
  cached: boolean;
  fingerprint: string;
  version: string;
  analyzedAt: string | null;
  analysis: OutfitSwapSourceAnalysis;
};

/**
 * Detects the subjects (with stable temporal ids) and wardrobe orientation in
 * the already-extracted source frames. This performs NO generation and does not
 * touch the frame-edit or video reconstruction paths.
 */
export async function analyzeOutfitSwapSource(
  frames: { frameId: string; timestamp: number; imageUrl: string }[],
): Promise<OutfitSwapAnalysisResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/outfit-swap-analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session?.access_token ?? SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ frames }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) {
    throw new Error(data?.error ?? `Analysis failed (${response.status})`);
  }
  return data as OutfitSwapAnalysisResult;
}

/* ------------------------------------------------------------------ *
 * PHASE 2 — STRUCTURED GARMENT REFERENCES (capture + storage only)
 * ------------------------------------------------------------------ */

/**
 * A clothing reference in the Outfit Swap run.
 *
 * `url` stays the PRIMARY reference the generation already consumes and always
 * mirrors `frontUrl`. `backUrl` / `detailUrl` / `sideUrl` are captured and
 * persisted with the run, but are intentionally NOT wired into the swap or
 * reconstruction calls yet — orientation-driven reference selection is a later
 * phase.
 */
export type OutfitSwapGarment = {
  /** Stable id inside the run — used by the Phase 3 cast assignment. */
  id: string;
  /** Primary reference used by generation today (mirrors `frontUrl`). */
  url: string;
  name: string;
  type: string;
  label: string;
  person: string;
  /** FRONT reference (required) — the garment authority. */
  frontUrl: string;
  hasBackDesign: boolean;
  backUrl: string | null;
  detailUrl?: string | null;
  sideUrl?: string | null;
};

/* ------------------------------------------------------------------ *
 * PHASE 3 — SUBJECT → GARMENT ASSIGNMENT (mapping + storage only)
 * ------------------------------------------------------------------ */

/** Wardrobe assigned to ONE detected subject track. */
export type OutfitSwapSubjectWardrobe = {
  topGarmentId: string | null;
  bottomGarmentId: string | null;
};

/** subject track id → assigned garment ids. */
export type OutfitSwapCastAssignment = Record<string, OutfitSwapSubjectWardrobe>;

const TOP_TYPES = ["Shirt / Top", "Hoodie / Jacket"];
const BOTTOM_TYPES = ["Pants", "Shorts"];

export function isTopGarment(garment: OutfitSwapGarment) {
  return TOP_TYPES.includes(garment.type);
}

export function isBottomGarment(garment: OutfitSwapGarment) {
  return BOTTOM_TYPES.includes(garment.type);
}

/**
 * Offers an obvious mapping when one exists — never applied silently, the user
 * accepts or changes it. Returns null when there is nothing obvious to suggest.
 */
export function suggestCastAssignment(
  subjectIds: string[],
  garments: OutfitSwapGarment[],
): OutfitSwapCastAssignment | null {
  if (!subjectIds.length || !garments.length) return null;
  const tops = garments.filter(isTopGarment);
  const bottoms = garments.filter(isBottomGarment);
  if (!tops.length && !bottoms.length) return null;

  const pick = (pool: OutfitSwapGarment[], index: number) => {
    if (!pool.length) return null;
    // One item for everyone, otherwise one per subject in order.
    return (pool.length === 1 ? pool[0] : pool[index % pool.length]).id;
  };

  const suggestion: OutfitSwapCastAssignment = {};
  subjectIds.forEach((subjectId, index) => {
    suggestion[subjectId] = {
      topGarmentId: pick(tops, index),
      bottomGarmentId: pick(bottoms, index),
    };
  });
  return suggestion;
}

const CAST_KEY = (fingerprint: string) => `fuse-outfit-swap-cast-v1:${fingerprint}`;

/** The mapping is stored with the run so returning here does not recompute it. */
export function loadCastAssignment(fingerprint: string): OutfitSwapCastAssignment | null {
  try {
    const raw = window.localStorage.getItem(CAST_KEY(fingerprint));
    return raw ? (JSON.parse(raw) as OutfitSwapCastAssignment) : null;
  } catch {
    return null;
  }
}

export function saveCastAssignment(fingerprint: string, assignment: OutfitSwapCastAssignment) {
  try {
    window.localStorage.setItem(CAST_KEY(fingerprint), JSON.stringify(assignment));
  } catch {
    // Assignment is a convenience mapping — a storage failure must not break the run.
  }
}

/* ------------------------------------------------------------------ *
 * PHASE 4 — MODEL / PERSON REFERENCE (choose + store only)
 * ------------------------------------------------------------------ */

/**
 * Where the person for a subject track comes from.
 *  - keep_original: today's behaviour — the source identity is preserved and
 *    only the clothing changes. This is the default and the only value the
 *    current (clothing-only) generation path knows about.
 *  - avatar / cast: an existing avatar_profiles row picked with the shared
 *    FUSE Cast picker (My avatars = USER, FUSE Cast = FUSE).
 *  - upload: 1–5 loose reference photos forming a temporary, project-scoped
 *    identity set. These are NEVER auto-saved into "My avatars".
 */
export type OutfitSwapModelSource = "keep_original" | "upload" | "avatar" | "cast";

export const MAX_MODEL_REFERENCES = 5;

export type OutfitSwapSubjectModel = {
  modelSource: OutfitSwapModelSource;
  avatarId?: string | null;
  uploadedRefUrls?: string[];
};

/** subject track id → chosen model. Stored with the run, not sent to generation. */
export type OutfitSwapModelAssignment = Record<string, OutfitSwapSubjectModel>;

export const KEEP_ORIGINAL_MODEL: OutfitSwapSubjectModel = {
  modelSource: "keep_original",
  avatarId: null,
  uploadedRefUrls: [],
};

/** True when nothing about the source person changes (today's behaviour). */
export function isKeepOriginal(model: OutfitSwapSubjectModel | null | undefined) {
  return !model || model.modelSource === "keep_original";
}

/**
 * The subject a single-subject run refers to. Phase 1 analysis always gives us
 * a stable track id; the fallback keeps storage keys stable if it is missing.
 */
export function primarySubjectId(analysis: OutfitSwapSourceAnalysis | null): string {
  return analysis?.subjectTracks[0]?.subjectId ?? "subject-1";
}

const MODEL_KEY = (fingerprint: string) => `fuse-outfit-swap-models-v1:${fingerprint}`;

export function loadModelAssignment(fingerprint: string): OutfitSwapModelAssignment | null {
  try {
    const raw = window.localStorage.getItem(MODEL_KEY(fingerprint));
    return raw ? (JSON.parse(raw) as OutfitSwapModelAssignment) : null;
  } catch {
    return null;
  }
}

export function saveModelAssignment(fingerprint: string, assignment: OutfitSwapModelAssignment) {
  try {
    window.localStorage.setItem(MODEL_KEY(fingerprint), JSON.stringify(assignment));
  } catch {
    // The model choice is stored for convenience — a failure must not break the run.
  }
}


/* ------------------------------------------------------------------ *
 * PHASE 6 — FRAME QA + MANUAL OVERRIDES (analysis only, never generation)
 * ------------------------------------------------------------------ */

export type OutfitSwapQaStatus = "PASSED" | "CHECK" | "FAILED";

/** One rebuilt frame's quality verdict. Never triggers a paid provider call. */
export type OutfitSwapFrameQa = {
  frameIndex: number;
  status: OutfitSwapQaStatus;
  issues: string[];
  detectedPeople: number;
  expectedPeople: number;
  faceCorruption?: "none" | "minor" | "severe";
  garmentCorruption?: "none" | "minor" | "severe";
  wardrobeMatch?: "yes" | "unclear" | "no";
  confidence: number;
  notes?: string;
  /** `structural` = local rule check only, `vision` = Gemini analysis pass. */
  source: "structural" | "vision";
  checkedAt?: string | null;
  /** Set locally after a manual override so the user can choose to regenerate. */
  needsRegenerate?: boolean;
};

/** frame index → QA verdict. */
export type OutfitSwapQaReport = Record<number, OutfitSwapFrameQa>;

export type OutfitSwapQaResult = {
  cached: boolean;
  fingerprint: string;
  version: string;
  checkedAt: string | null;
  frames: OutfitSwapFrameQa[];
};

export type OutfitSwapQaRequestFrame = {
  frameIndex: number;
  sourceFrameUrl: string;
  rebuiltUrl: string;
  expectedSubjectCount: number;
  expectations: { subjectId: string; wardrobe: string; model: string }[];
};

/**
 * Lightweight Gemini VISION check on the already-rebuilt frames. Analysis only:
 * it never generates an image or video and never spends generation credits.
 */
export async function analyzeOutfitSwapQa(
  frames: OutfitSwapQaRequestFrame[],
  options: { force?: boolean } = {},
): Promise<OutfitSwapQaResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/outfit-swap-qa`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session?.access_token ?? SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ frames, force: options.force === true }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) {
    throw new Error(data?.error ?? `QA check failed (${response.status})`);
  }
  return data as OutfitSwapQaResult;
}

/**
 * Structural fallback used when no vision check has run yet: it only validates
 * what we already know locally (expected subject count and whether every track
 * in the frame carries an assignment). Anything unverifiable is CHECK.
 */
export function structuralFrameQa(args: {
  frameIndex: number;
  frameSubjects: OutfitSwapFrameSubject[];
  castAssignment: OutfitSwapCastAssignment;
  hasOutput: boolean;
}): OutfitSwapFrameQa {
  const { frameIndex, frameSubjects, castAssignment, hasOutput } = args;
  const issues: string[] = [];
  let status: OutfitSwapQaStatus = "PASSED";
  const check = (issue: string) => {
    issues.push(issue);
    if (status !== "FAILED") status = "CHECK";
  };

  if (!hasOutput) {
    return {
      frameIndex,
      status: "CHECK",
      issues: ["Frame has no rebuilt image yet"],
      detectedPeople: 0,
      expectedPeople: frameSubjects.length,
      confidence: 0,
      source: "structural",
    };
  }

  if (frameSubjects.length > 1) {
    for (const subject of frameSubjects) {
      const wardrobe = castAssignment[subject.subjectId];
      if (!wardrobe || (!wardrobe.topGarmentId && !wardrobe.bottomGarmentId)) {
        check(`No wardrobe assigned to ${subject.subjectId}`);
      }
    }
  }
  for (const subject of frameSubjects) {
    if (subject.confidence < 0.5) check(`Low-confidence subject read (${subject.subjectId})`);
    else if (subject.garmentOrientation === "UNCERTAIN" || subject.occlusion === "heavy") {
      check("Garment orientation is hard to read in this frame");
    }
  }

  return {
    frameIndex,
    status,
    issues,
    detectedPeople: frameSubjects.length,
    expectedPeople: frameSubjects.length,
    confidence: frameSubjects.length
      ? Math.min(...frameSubjects.map((subject) => subject.confidence))
      : 0.5,
    source: "structural",
  };
}

/**
 * A per-frame manual correction. This never changes any other frame and never
 * re-runs generation on its own — the user regenerates that frame explicitly.
 */
export type OutfitSwapFrameOverride = {
  topGarmentId?: string | null;
  bottomGarmentId?: string | null;
  model?: OutfitSwapSubjectModel | null;
  /** Forces which garment reference side this frame conditions on. */
  forceGarmentSide?: "front" | "back" | null;
};

/** frame index → subject track id → override. */
export type OutfitSwapFrameOverrides = Record<number, Record<string, OutfitSwapFrameOverride>>;

const QA_KEY = (fingerprint: string) => `fuse-outfit-swap-qa-v1:${fingerprint}`;
const OVERRIDE_KEY = (fingerprint: string) => `fuse-outfit-swap-frame-overrides-v1:${fingerprint}`;

export function loadQaReport(fingerprint: string): OutfitSwapQaReport {
  try {
    const raw = window.localStorage.getItem(QA_KEY(fingerprint));
    return raw ? (JSON.parse(raw) as OutfitSwapQaReport) : {};
  } catch {
    return {};
  }
}

export function saveQaReport(fingerprint: string, report: OutfitSwapQaReport) {
  try {
    window.localStorage.setItem(QA_KEY(fingerprint), JSON.stringify(report));
  } catch {
    // QA is advisory — a storage failure must never break the run.
  }
}

export function loadFrameOverrides(fingerprint: string): OutfitSwapFrameOverrides {
  try {
    const raw = window.localStorage.getItem(OVERRIDE_KEY(fingerprint));
    return raw ? (JSON.parse(raw) as OutfitSwapFrameOverrides) : {};
  } catch {
    return {};
  }
}

export function saveFrameOverrides(fingerprint: string, overrides: OutfitSwapFrameOverrides) {
  try {
    window.localStorage.setItem(OVERRIDE_KEY(fingerprint), JSON.stringify(overrides));
  } catch {
    // Overrides are a convenience — a storage failure must never break the run.
  }
}

/**
 * Applies this frame's overrides to the request payload pieces. Forcing a
 * garment side is expressed as the frame's `garmentOrientation`, which is what
 * the Phase 5 server assembly already uses to pick the front/back reference —
 * so no executor or backend contract changes.
 */
export function applyFrameOverrides(args: {
  frameSubjects: OutfitSwapFrameSubject[];
  castAssignment: OutfitSwapCastAssignment;
  modelAssignment: OutfitSwapModelAssignment;
  overrides: Record<string, OutfitSwapFrameOverride> | undefined;
}) {
  const { frameSubjects, castAssignment, modelAssignment, overrides } = args;
  if (!overrides || !Object.keys(overrides).length) {
    return { frameSubjects, castAssignment, modelAssignment };
  }

  const nextSubjects = frameSubjects.map((subject) => {
    const side = overrides[subject.subjectId]?.forceGarmentSide;
    if (!side) return subject;
    return {
      ...subject,
      garmentOrientation: (side === "back" ? "BACK" : "FRONT") as OutfitSwapOrientation,
    };
  });

  const nextCast: OutfitSwapCastAssignment = { ...castAssignment };
  const nextModels: OutfitSwapModelAssignment = { ...modelAssignment };
  for (const [subjectId, override] of Object.entries(overrides)) {
    if (override.topGarmentId !== undefined || override.bottomGarmentId !== undefined) {
      const current = nextCast[subjectId] ?? { topGarmentId: null, bottomGarmentId: null };
      nextCast[subjectId] = {
        topGarmentId:
          override.topGarmentId !== undefined ? override.topGarmentId : current.topGarmentId,
        bottomGarmentId:
          override.bottomGarmentId !== undefined
            ? override.bottomGarmentId
            : current.bottomGarmentId,
      };
    }
    if (override.model) nextModels[subjectId] = override.model;
  }

  return { frameSubjects: nextSubjects, castAssignment: nextCast, modelAssignment: nextModels };
}
