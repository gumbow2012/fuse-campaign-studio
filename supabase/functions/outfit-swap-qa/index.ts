// OUTFIT SWAP — PHASE 6 FRAME QA (analysis only).
//
// HARD BOUNDARY:
//   * ANALYSIS ONLY. This function never generates an image or a video and it
//     never calls a generation provider. It inspects the ALREADY rebuilt frames
//     next to their source frames and reports whether each rebuild looks safe.
//   * ONE Gemini call per batch — never one call per frame.
//   * Results are cached by input fingerprint so navigating back never
//     recomputes the QA pass.

import { GoogleGenAI, Type } from "https://esm.sh/@google/genai@1.29.0";
import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  requireUser,
} from "../_shared/supabase-admin.ts";

const QA_VERSION = "outfit-swap-frame-qa-v1";
const GEMINI_ANALYSIS_MODEL = Deno.env.get("GEMINI_ANALYSIS_MODEL")?.trim() || "gemini-3.6-flash";

/** Each frame costs TWO images (source + rebuild), so the batch stays small. */
const MAX_FRAMES_PER_CALL = 8;
const IMAGE_FETCH_TIMEOUT_MS = 15_000;
const FETCH_CONCURRENCY = 4;

type QaFrame = {
  frameIndex: number;
  sourceFrameUrl: string;
  rebuiltUrl: string;
  expectedSubjectCount: number;
  /** Neutral, non-PII wardrobe expectation per tracked subject. */
  expectations: { subjectId: string; wardrobe: string; model: string }[];
};

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    frames: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          frame_index: { type: Type.INTEGER },
          detected_people: { type: Type.INTEGER },
          subject_preserved: { type: Type.BOOLEAN },
          duplicated_subject: { type: Type.BOOLEAN },
          face_corruption: { type: Type.STRING, enum: ["none", "minor", "severe"] },
          garment_corruption: { type: Type.STRING, enum: ["none", "minor", "severe"] },
          wardrobe_matches_assignment: { type: Type.STRING, enum: ["yes", "unclear", "no"] },
          confidence: { type: Type.NUMBER },
          notes: { type: Type.STRING },
        },
        required: [
          "frame_index",
          "detected_people",
          "subject_preserved",
          "duplicated_subject",
          "face_corruption",
          "garment_corruption",
          "wardrobe_matches_assignment",
          "confidence",
        ],
      },
    },
  },
  required: ["frames"],
};

async function inlineImage(url: string) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: abort.signal });
    if (!response.ok) throw new Error(`Could not read a frame (${response.status})`);
    const mimeType = (response.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
    if (!/^image\//.test(mimeType)) throw new Error("Only still frames can be checked");
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

async function inlinePairs(frames: QaFrame[]) {
  const urls = frames.flatMap((frame) => [frame.sourceFrameUrl, frame.rebuiltUrl]);
  const parts: unknown[] = new Array(urls.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(FETCH_CONCURRENCY, urls.length) }, async () => {
    while (cursor < urls.length) {
      const index = cursor++;
      parts[index] = await inlineImage(urls[index]);
    }
  });
  await Promise.all(workers);
  return parts;
}

async function inputFingerprint(frames: QaFrame[]) {
  const payload = JSON.stringify({
    version: QA_VERSION,
    model: GEMINI_ANALYSIS_MODEL,
    frames: frames.map((frame) => [
      frame.frameIndex,
      frame.sourceFrameUrl,
      frame.rebuiltUrl,
      frame.expectedSubjectCount,
      frame.expectations.map((entry) => [entry.subjectId, entry.wardrobe, entry.model]),
    ]),
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function buildPrompt(frames: QaFrame[]) {
  const lines = frames.map((frame, index) => {
    const expectations = frame.expectations.length
      ? frame.expectations
          .map((entry) => `${entry.subjectId}: wardrobe = ${entry.wardrobe}; person = ${entry.model}`)
          .join(" | ")
      : "no per-subject wardrobe expectation supplied";
    return [
      `PAIR ${index + 1}: frame_index ${frame.frameIndex}.`,
      `  Image ${index * 2 + 1} = ORIGINAL frame, Image ${index * 2 + 2} = REBUILT frame.`,
      `  Expected people in frame: ${frame.expectedSubjectCount || "unknown"}.`,
      `  Expected per subject → ${expectations}`,
    ].join("\n");
  });

  return [
    "You are a quality-control inspector for a video outfit-swap pipeline. Return JSON only. You never generate images or video.",
    "",
    "For every PAIR below, compare the REBUILT frame against the ORIGINAL frame and report:",
    "- detected_people — how many distinct people are visible in the REBUILT frame.",
    "- subject_preserved — true when every person present in the original is still present in the rebuild (same people, same placement/pose), false when someone is missing or replaced by a different unintended person.",
    "- duplicated_subject — true when the rebuild shows the same person twice, or invents an extra person that is not in the original.",
    "- face_corruption — none | minor | severe. Severe = melted, smeared, doubled, or anatomically broken face.",
    "- garment_corruption — none | minor | severe. Severe = melted or unreadable garment, broken print/logo, garment merged with the body or background.",
    "- wardrobe_matches_assignment — yes | unclear | no. Judge whether each person seems to wear the wardrobe expected for their subject id, and whether wardrobe looks swapped between people. Answer 'unclear' when the expectation cannot be verified from what is visible.",
    "- confidence — 0 to 1 for your readings on this pair.",
    "- notes — at most 140 characters, plain factual description of the biggest problem, or an empty string when the rebuild looks clean.",
    "",
    "Be conservative: when you cannot verify something, lower confidence or answer 'unclear' rather than guessing.",
    "Never describe brands, never identify anyone by name, never output URLs, file names or media of any kind.",
    "Return one entry per pair, echoing frame_index exactly.",
    "",
    "PAIRS (images follow this text, in this order):",
    ...lines,
  ].join("\n");
}

function severity(value: unknown) {
  const raw = String(value ?? "").toLowerCase();
  return raw === "none" || raw === "minor" || raw === "severe" ? raw : "minor";
}

function clamp01(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(1, Math.max(0, num));
}

/**
 * Deterministic status. The vision model reports observations; the RULES here
 * decide PASSED / CHECK / FAILED so the outcome never drifts with prose.
 */
function normalizeReport(raw: any, frames: QaFrame[]) {
  const byIndex = new Map(frames.map((frame) => [frame.frameIndex, frame]));
  const entries = (Array.isArray(raw?.frames) ? raw.frames : [])
    .map((entry: any) => {
      const frameIndex = Number(entry?.frame_index);
      const frame = byIndex.get(frameIndex);
      if (!frame) return null;

      const detectedPeople = Math.max(0, Number(entry?.detected_people ?? 0) || 0);
      const subjectPreserved = entry?.subject_preserved !== false;
      const duplicated = entry?.duplicated_subject === true;
      const face = severity(entry?.face_corruption);
      const garment = severity(entry?.garment_corruption);
      const wardrobe = ["yes", "unclear", "no"].includes(String(entry?.wardrobe_matches_assignment))
        ? String(entry?.wardrobe_matches_assignment)
        : "unclear";
      const confidence = clamp01(entry?.confidence);
      const expected = frame.expectedSubjectCount;

      const issues: string[] = [];
      let status: "PASSED" | "CHECK" | "FAILED" = "PASSED";
      const fail = (issue: string) => {
        issues.push(issue);
        status = "FAILED";
      };
      const check = (issue: string) => {
        issues.push(issue);
        if (status !== "FAILED") status = "CHECK";
      };

      if (expected > 0 && detectedPeople !== expected) {
        if (detectedPeople === 0 || Math.abs(detectedPeople - expected) > 1) {
          fail(`Expected ${expected} people, detected ${detectedPeople}`);
        } else {
          check(`Expected ${expected} people, detected ${detectedPeople}`);
        }
      }
      if (!subjectPreserved) fail("A subject is missing or replaced");
      if (duplicated) fail("A subject looks duplicated");
      if (face === "severe") fail("Face corruption");
      else if (face === "minor") check("Possible face artefacts");
      if (garment === "severe") fail("Garment or print corruption");
      else if (garment === "minor") check("Possible garment artefacts");
      if (frame.expectations.length > 1) {
        if (wardrobe === "no") fail("Wardrobe looks swapped between subjects");
        else if (wardrobe === "unclear") check("Could not verify wardrobe assignment");
      } else if (wardrobe === "no") {
        check("Wardrobe may not match the assignment");
      }
      if (confidence < 0.5) check("Low-confidence check");

      return {
        frameIndex,
        status,
        issues,
        detectedPeople,
        expectedPeople: expected,
        faceCorruption: face,
        garmentCorruption: garment,
        wardrobeMatch: wardrobe,
        confidence,
        notes: String(entry?.notes ?? "").slice(0, 140),
        source: "vision" as const,
      };
    })
    .filter(Boolean);

  // Any frame the model skipped is uncertain, never silently passed.
  for (const frame of frames) {
    if (!entries.some((entry: any) => entry.frameIndex === frame.frameIndex)) {
      entries.push({
        frameIndex: frame.frameIndex,
        status: "CHECK",
        issues: ["No QA reading returned for this frame"],
        detectedPeople: 0,
        expectedPeople: frame.expectedSubjectCount,
        faceCorruption: "minor",
        garmentCorruption: "minor",
        wardrobeMatch: "unclear",
        confidence: 0,
        notes: "",
        source: "vision" as const,
      });
    }
  }

  return entries.sort((a: any, b: any) => a.frameIndex - b.frameIndex);
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

    // HARD BOUNDARY: still frames only, and never a generation request.
    for (const key of ["video", "videoUrl", "sourceVideo", "sourceVideoUrl", "clip", "clipUrl"]) {
      if (body?.[key]) {
        return json({ error: "outfit-swap-qa inspects extracted still frames only" }, 400);
      }
    }

    const frames: QaFrame[] = (Array.isArray(body?.frames) ? body.frames : [])
      .map((frame: any) => ({
        frameIndex: Number(frame?.frameIndex ?? -1),
        sourceFrameUrl: String(frame?.sourceFrameUrl ?? "").trim(),
        rebuiltUrl: String(frame?.rebuiltUrl ?? "").trim(),
        expectedSubjectCount: Math.max(0, Number(frame?.expectedSubjectCount ?? 0) || 0),
        expectations: (Array.isArray(frame?.expectations) ? frame.expectations : [])
          .map((entry: any) => ({
            subjectId: String(entry?.subjectId ?? "").slice(0, 40),
            wardrobe: String(entry?.wardrobe ?? "").slice(0, 120),
            model: String(entry?.model ?? "").slice(0, 60),
          }))
          .filter((entry: any) => entry.subjectId),
      }))
      .filter(
        (frame: QaFrame) =>
          Number.isInteger(frame.frameIndex) &&
          frame.frameIndex >= 0 &&
          /^https?:\/\//.test(frame.sourceFrameUrl) &&
          /^https?:\/\//.test(frame.rebuiltUrl),
      )
      .sort((a: QaFrame, b: QaFrame) => a.frameIndex - b.frameIndex)
      .slice(0, MAX_FRAMES_PER_CALL);

    if (!frames.length) return json({ error: "No rebuilt frames to check" }, 400);

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
        version: cached.version ?? QA_VERSION,
        checkedAt: cached.analyzed_at,
        frames: (cached.analysis as any)?.frames ?? [],
      });
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
    console.log("[outfit-swap-qa] gemini key present:", Boolean(apiKey));
    if (!apiKey) {
      return json({ error: "Frame QA is unavailable (analysis key not configured)" }, 503);
    }

    const imageParts = await inlinePairs(frames);
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: GEMINI_ANALYSIS_MODEL,
      contents: [{ role: "user", parts: [{ text: buildPrompt(frames) }, ...imageParts] }] as any,
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA as any,
        maxOutputTokens: Math.min(8192, 500 * frames.length + 1200),
        temperature: 0.1,
        thinkingConfig: { thinkingLevel: "low" },
      },
    });

    const raw = JSON.parse((response.text ?? "").trim() || "{}");
    const reports = normalizeReport(raw, frames);
    const checkedAt = new Date().toISOString();

    const { error: saveError } = await admin.from("outfit_swap_analyses").upsert(
      {
        user_id: user.id,
        fingerprint,
        version: QA_VERSION,
        analysis: { kind: "frame-qa", frames: reports },
        analyzed_at: checkedAt,
      },
      { onConflict: "user_id,fingerprint" },
    );
    if (saveError) console.error("[outfit-swap-qa] persist failed:", saveError.message);

    return json({
      cached: false,
      fingerprint,
      version: QA_VERSION,
      checkedAt,
      frames: reports,
      timings: { totalMs: Date.now() - startedAt },
    });
  } catch (error) {
    console.error("[outfit-swap-qa] failed:", errorMessage(error).slice(0, 1000));
    return json({ error: errorMessage(error) }, 500);
  }
});
