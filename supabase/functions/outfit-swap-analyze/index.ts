// OUTFIT SWAP — PHASE 1 SOURCE ANALYSIS (analysis only).
//
// HARD BOUNDARY:
//   * ANALYSIS ONLY. This function never generates an image or a video, and it
//     never calls a generation provider. It returns strict JSON describing what
//     is present in the SOURCE frames the user already extracted.
//   * ONE Gemini call returns everything: per-frame subjects with STABLE
//     temporal track ids, orientations, visibility, occlusion and confidence,
//     plus run-level subject_count and subject_tracks.
//   * Results are cached by input fingerprint, so navigating back never
//     recomputes the analysis.

import { GoogleGenAI, Type } from "https://esm.sh/@google/genai@1.29.0";
import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  requireUser,
} from "../_shared/supabase-admin.ts";

const ANALYSIS_VERSION = "outfit-swap-source-analysis-v1";
const GEMINI_ANALYSIS_MODEL = Deno.env.get("GEMINI_ANALYSIS_MODEL")?.trim() || "gemini-3.6-flash";

/** Frames per analysis call — one batch call, never one call per frame. */
const MAX_FRAMES_PER_CALL = 16;
const IMAGE_FETCH_TIMEOUT_MS = 15_000;
const FETCH_CONCURRENCY = 5;

type SourceFrame = { frameId: string; timestamp: number; imageUrl: string };

const ORIENTATIONS = [
  "FRONT",
  "BACK",
  "LEFT_3_4",
  "RIGHT_3_4",
  "SIDE",
  "OCCLUDED",
  "UNCERTAIN",
];

/* ------------------------------------------------------------------ *
 * Structured output schema — everything in a SINGLE response
 * ------------------------------------------------------------------ */

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    subject_count: { type: Type.INTEGER },
    subject_tracks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          subject_id: { type: Type.STRING },
          description: { type: Type.STRING },
          appears_start: { type: Type.NUMBER },
          appears_end: { type: Type.NUMBER },
          frame_count: { type: Type.INTEGER },
          confidence: { type: Type.NUMBER },
        },
        required: ["subject_id", "appears_start", "appears_end", "confidence"],
      },
    },
    frames: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          frame_id: { type: Type.STRING },
          timestamp: { type: Type.NUMBER },
          subjects: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                subject_id: { type: Type.STRING },
                face_orientation: { type: Type.STRING, enum: ORIENTATIONS },
                body_orientation: { type: Type.STRING, enum: ORIENTATIONS },
                garment_orientation: { type: Type.STRING, enum: ORIENTATIONS },
                torso_visibility: { type: Type.NUMBER },
                garment_visibility: { type: Type.NUMBER },
                occlusion: { type: Type.STRING, enum: ["none", "partial", "heavy"] },
                confidence: { type: Type.NUMBER },
              },
              required: [
                "subject_id",
                "face_orientation",
                "body_orientation",
                "garment_orientation",
                "torso_visibility",
                "garment_visibility",
                "occlusion",
                "confidence",
              ],
            },
          },
        },
        required: ["frame_id", "timestamp", "subjects"],
      },
    },
  },
  required: ["subject_count", "subject_tracks", "frames"],
};

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

async function inlineImage(url: string) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: abort.signal });
    if (!response.ok) throw new Error(`Could not read a source frame (${response.status})`);
    const mimeType = (response.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
    if (!/^image\//.test(mimeType)) throw new Error("Only extracted still frames can be analysed");
    const buffer = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let i = 0; i < buffer.length; i += 8192) {
      binary += String.fromCharCode(...buffer.subarray(i, i + 8192));
    }
    return { inlineData: { mimeType, data: btoa(binary) } };
  } finally {
    clearTimeout(timer);
  }
}

async function inlineFrames(frames: SourceFrame[]) {
  const parts: unknown[] = new Array(frames.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(FETCH_CONCURRENCY, frames.length) }, async () => {
    while (cursor < frames.length) {
      const index = cursor++;
      parts[index] = await inlineImage(frames[index].imageUrl);
    }
  });
  await Promise.all(workers);
  return parts;
}

async function inputFingerprint(frames: SourceFrame[]) {
  const payload = JSON.stringify({
    version: ANALYSIS_VERSION,
    model: GEMINI_ANALYSIS_MODEL,
    frames: frames.map((frame) => [frame.frameId, frame.timestamp, frame.imageUrl]),
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function buildPrompt(frames: SourceFrame[]) {
  const frameLines = frames.map((frame, index) =>
    `FRAME ${index + 1}: frameId "${frame.frameId}" (timestamp ${frame.timestamp}s)`
  );
  return [
    "You are a wardrobe-continuity analyst for a video outfit-swap pipeline. Return JSON only. You never generate images or video.",
    "",
    "You are given ordered keyframes sampled from ONE continuous source clip (chronological order, timestamps given).",
    "",
    "TEMPORAL TRACKING (critical): assign each distinct PERSON a STABLE track id — subject_1, subject_2, subject_3, … — and reuse the SAME id for the SAME person in EVERY frame they appear in, even when they move, change position, turn away, get partially cropped, or leave and re-enter. Ids must never be based on screen position: never use 'left person', 'right person', or renumber people because they swapped sides. Assign ids in order of first appearance across the clip. If you truly cannot decide whether a person is an already-tracked subject, reuse the most likely existing id and lower that entry's confidence rather than inventing a new track.",
    "",
    "PER FRAME, PER SUBJECT report:",
    "- face_orientation, body_orientation, garment_orientation — each exactly one of: FRONT, BACK, LEFT_3_4, RIGHT_3_4, SIDE, OCCLUDED, UNCERTAIN. LEFT_3_4/RIGHT_3_4 describe the direction the subject is turned toward from the viewer's point of view. Use OCCLUDED when something blocks the read, UNCERTAIN when the image is too small/blurred/dark to judge.",
    "- torso_visibility — 0 to 1, fraction of the torso visible in frame.",
    "- garment_visibility — 0 to 1, fraction of the worn upper garment actually visible (cropping, occlusion, and turning away all reduce it).",
    "- occlusion — none | partial | heavy.",
    "- confidence — 0 to 1 for this subject's readings in this frame.",
    "",
    "RUN LEVEL report: subject_count (the number of DISTINCT tracked people across the whole clip, not per frame), and subject_tracks — one entry per track with subject_id, a short neutral description (e.g. 'adult in dark hoodie'), approximate appears_start / appears_end timestamps in seconds, frame_count, and confidence.",
    "",
    "Include a frames entry for EVERY frame below, in the same order, echoing the given frameId and timestamp exactly. A frame with no visible person gets an empty subjects array.",
    "Never describe brands, never identify anyone by name, never output URLs, file names, base64 or media of any kind. Short factual values only.",
    "",
    "FRAMES (images follow this text, in this order):",
    ...frameLines,
  ].join("\n");
}

function normalizeOrientation(value: unknown) {
  const raw = String(value ?? "").toUpperCase().trim();
  return ORIENTATIONS.includes(raw) ? raw : "UNCERTAIN";
}

function clamp01(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(1, Math.max(0, num));
}

/** Server-side normalization: ids stay stable, counts stay truthful. */
function normalizeAnalysis(raw: any, frames: SourceFrame[]) {
  const byId = new Map(frames.map((frame) => [frame.frameId, frame]));
  const seen = new Set<string>();

  const outFrames = (Array.isArray(raw?.frames) ? raw.frames : [])
    .map((entry: any) => {
      const frameId = String(entry?.frame_id ?? "").trim();
      const source = byId.get(frameId);
      if (!source) return null;
      const subjects = (Array.isArray(entry?.subjects) ? entry.subjects : [])
        .map((subject: any) => {
          const subjectId = String(subject?.subject_id ?? "").trim() || "subject_1";
          seen.add(subjectId);
          return {
            subjectId,
            faceOrientation: normalizeOrientation(subject?.face_orientation),
            bodyOrientation: normalizeOrientation(subject?.body_orientation),
            garmentOrientation: normalizeOrientation(subject?.garment_orientation),
            torsoVisibility: clamp01(subject?.torso_visibility),
            garmentVisibility: clamp01(subject?.garment_visibility),
            occlusion: ["none", "partial", "heavy"].includes(String(subject?.occlusion))
              ? String(subject?.occlusion)
              : "partial",
            confidence: clamp01(subject?.confidence),
          };
        });
      return { frameId, timestamp: source.timestamp, subjects };
    })
    .filter(Boolean);

  const tracks = (Array.isArray(raw?.subject_tracks) ? raw.subject_tracks : [])
    .map((track: any) => ({
      subjectId: String(track?.subject_id ?? "").trim(),
      description: String(track?.description ?? "").slice(0, 160),
      appearsStart: Number(track?.appears_start ?? 0) || 0,
      appearsEnd: Number(track?.appears_end ?? 0) || 0,
      frameCount: Number.isFinite(Number(track?.frame_count)) ? Number(track.frame_count) : null,
      confidence: clamp01(track?.confidence),
    }))
    .filter((track: any) => track.subjectId);

  // Truthful count: tracks actually referenced by frames win over the model's number.
  const trackIds = new Set<string>([...seen, ...tracks.map((t: any) => t.subjectId)]);
  const subjectCount = trackIds.size || Math.max(0, Number(raw?.subject_count ?? 0) || 0);

  return {
    version: ANALYSIS_VERSION,
    frameCount: outFrames.length,
    subjectCount,
    subjectTracks: tracks,
    frames: outFrames,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const startedAt = Date.now();

  let user;
  try {
    user = await requireUser(req);
  } catch (error) {
    return json({ error: errorMessage(error) }, 401);
  }

  try {
    const body = await req.json().catch(() => ({}));

    // HARD BOUNDARY: this function never accepts a video, only extracted frames.
    for (const key of ["video", "videoUrl", "sourceVideo", "sourceVideoUrl", "clip", "clipUrl"]) {
      if (body?.[key]) {
        return json(
          { error: "outfit-swap-analyze analyses extracted still frames only and never accepts video input" },
          400,
        );
      }
    }

    const frames: SourceFrame[] = (Array.isArray(body?.frames) ? body.frames : [])
      .map((frame: any, index: number) => ({
        frameId: String(frame?.frameId ?? `frame-${index}`).trim(),
        timestamp: Number(frame?.timestamp ?? 0) || 0,
        imageUrl: String(frame?.imageUrl ?? "").trim(),
      }))
      .filter((frame: SourceFrame) => frame.frameId && /^https?:\/\//.test(frame.imageUrl))
      .sort((a: SourceFrame, b: SourceFrame) => a.timestamp - b.timestamp)
      .slice(0, MAX_FRAMES_PER_CALL);

    if (!frames.length) return json({ error: "No source frames to analyse" }, 400);

    const fingerprint = await inputFingerprint(frames);
    const admin = createAdminClient();

    const { data: cached } = await admin
      .from("outfit_swap_analyses")
      .select("analysis, version, analyzed_at")
      .eq("user_id", user.id)
      .eq("fingerprint", fingerprint)
      .maybeSingle();

    if (cached?.analysis && body?.force !== true) {
      return json({
        cached: true,
        fingerprint,
        version: cached.version ?? ANALYSIS_VERSION,
        analyzedAt: cached.analyzed_at,
        analysis: cached.analysis,
        timings: { cacheHit: true, totalMs: Date.now() - startedAt },
      });
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
    // Non-sensitive binding check: presence only, never the value.
    console.log("[outfit-swap-analyze] gemini key present:", Boolean(apiKey));
    if (!apiKey) {
      return json({ error: "Source analysis is unavailable (analysis key not configured)" }, 503);
    }

    const imageParts = await inlineFrames(frames);
    const ai = new GoogleGenAI({ apiKey });

    // ONE call returns per-frame subjects, orientations AND run-level tracks.
    const response = await ai.models.generateContent({
      model: GEMINI_ANALYSIS_MODEL,
      contents: [
        { role: "user", parts: [{ text: buildPrompt(frames) }, ...imageParts] },
      ] as any,
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA as any,
        maxOutputTokens: Math.min(8192, 700 * frames.length + 1200),
        temperature: 0.1,
        thinkingConfig: { thinkingLevel: "low" },
      },
    });

    const raw = JSON.parse((response.text ?? "").trim() || "{}");
    const analysis = normalizeAnalysis(raw, frames);

    const { error: saveError } = await admin
      .from("outfit_swap_analyses")
      .upsert(
        {
          user_id: user.id,
          fingerprint,
          version: ANALYSIS_VERSION,
          analysis,
          analyzed_at: new Date().toISOString(),
        },
        { onConflict: "user_id,fingerprint" },
      );
    if (saveError) console.error("[outfit-swap-analyze] persist failed:", saveError.message);

    return json({
      cached: false,
      fingerprint,
      version: ANALYSIS_VERSION,
      analyzedAt: new Date().toISOString(),
      analysis,
      timings: { cacheHit: false, totalMs: Date.now() - startedAt },
    });
  } catch (error) {
    console.error("[outfit-swap-analyze] failed:", errorMessage(error).slice(0, 1000));
    return json({ error: errorMessage(error) }, 500);
  }
});
