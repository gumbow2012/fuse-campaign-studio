// OUTFIT SWAP — RENDER JUDGE (analysis only).
//
// Shown the garment photos and, per moment, the ORIGINAL frame next to the
// RENDERED frame, Gemini answers three questions for the person who should be
// wearing the garment: are they wearing THIS garment, do they face the same way
// as in the original, and are they the same person. The client re-renders the
// shots that fail. Never generates anything; one Gemini call per batch.

import { GoogleGenAI, Type } from "https://esm.sh/@google/genai@1.29.0";
import { corsHeaders, errorMessage, json, requireUser } from "../_shared/supabase-admin.ts";

const MODEL = Deno.env.get("GEMINI_ANALYSIS_MODEL")?.trim() || "gemini-3.6-flash";
const MAX_FRAMES_PER_CALL = 8;
const MAX_GARMENT_IMAGES = 4;
const FETCH_TIMEOUT_MS = 15_000;

type JudgeFrame = { id: number; sourceUrl: string; outputUrl: string };
const ANSWER = { type: Type.STRING, enum: ["yes", "no", "unclear"] };

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    frames: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.INTEGER },
          person_visible: { type: Type.BOOLEAN },
          wearing_garment: ANSWER,
          facing_matches: ANSWER,
          same_person: ANSWER,
          notes: { type: Type.STRING },
        },
        required: ["id", "person_visible", "wearing_garment", "facing_matches", "same_person"],
      },
    },
  },
  required: ["frames"],
};

async function inlineImage(url: string) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: abort.signal });
    if (!response.ok) throw new Error(`Could not read an image (${response.status})`);
    const mimeType = (response.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
    if (!/^image\//.test(mimeType)) throw new Error("Only still images can be judged");
    const buffer = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let i = 0; i < buffer.length; i += 8192) binary += String.fromCharCode(...buffer.subarray(i, i + 8192));
    return { inlineData: { mimeType, data: btoa(binary) } };
  } finally {
    clearTimeout(timer);
  }
}

function buildPrompt(garmentCount: number, subject: string, frames: JudgeFrame[], replacingPerson: boolean) {
  return [
    "You check an outfit-swap video render. Return JSON only.",
    `Images 1-${garmentCount} are product photos of THE GARMENT (front, and back if given).`,
    `The person who must wear it: ${subject || "the main person in the frame"}.`,
    "Then come PAIRS: an ORIGINAL video frame followed by the RENDERED frame at the same moment.",
    "For each pair, about that person in the RENDERED frame, answer:",
    "- person_visible: is that person visible at all (false for empty rooms, title cards, text-only frames, or only other people).",
    "- wearing_garment: yes = they wear THE GARMENT (same colors and the same print/graphic as the product photos; the back print counts when seen from behind). no = they still wear their ORIGINAL clothing, or a different garment. Close-ups count: if the visible fabric, zipper, hood, collar or texture belongs to the ORIGINAL clothing rather than THE GARMENT, answer no. unclear = the garment area truly is not visible at all.",
    "- facing_matches: does the person face the same way (toward camera / side / away) and hold roughly the same pose as in the ORIGINAL frame? no = turned the other way, e.g. back shown where the original shows the front.",
    replacingPerson
      ? "- same_person: always answer unclear (the person is intentionally replaced)."
      : "- same_person: is it the same person as in the ORIGINAL (face, hair, skin tone, body)?",
    "- notes: at most 100 characters, the main problem, or empty.",
    "Judge each pair on its own. When unsure, answer unclear rather than guessing.",
    ...frames.map((f, i) => `PAIR ${i + 1}: id ${f.id}. Images ${garmentCount + i * 2 + 1} (ORIGINAL) and ${garmentCount + i * 2 + 2} (RENDERED).`),
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    await requireUser(req);
  } catch (error) {
    return json({ error: errorMessage(error) }, 401);
  }
  try {
    const body = await req.json().catch(() => ({}));
    const isUrl = (u: unknown) => typeof u === "string" && /^https?:\/\//.test(u);
    const garmentUrls = (Array.isArray(body?.garmentUrls) ? body.garmentUrls : []).filter(isUrl).slice(0, MAX_GARMENT_IMAGES);
    const frames: JudgeFrame[] = (Array.isArray(body?.frames) ? body.frames : [])
      .map((f: any) => ({ id: Number(f?.id), sourceUrl: f?.sourceUrl, outputUrl: f?.outputUrl }))
      .filter((f: JudgeFrame) => Number.isInteger(f.id) && isUrl(f.sourceUrl) && isUrl(f.outputUrl))
      .slice(0, MAX_FRAMES_PER_CALL);
    if (!garmentUrls.length) return json({ error: "Send at least one garment photo" }, 400);
    if (!frames.length) return json({ error: "No frames to judge" }, 400);

    const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
    if (!apiKey) return json({ error: "Judge unavailable (analysis key not configured)" }, 503);

    const images = await Promise.all([...garmentUrls, ...frames.flatMap((f) => [f.sourceUrl, f.outputUrl])].map(inlineImage));
    const prompt = buildPrompt(garmentUrls.length, String(body?.subject ?? "").slice(0, 200), frames, body?.replacingPerson === true);
    const response = await new GoogleGenAI({ apiKey }).models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }, ...images] }] as any,
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA as any,
        maxOutputTokens: Math.min(8192, 300 * frames.length + 800),
        temperature: 0.1,
        thinkingConfig: { thinkingLevel: "low" },
      },
    });
    const raw = JSON.parse((response.text ?? "").trim() || "{}");
    const ids = new Set(frames.map((f) => f.id));
    const answer = (v: unknown) => (v === "yes" || v === "no" ? v : "unclear");
    return json({
      frames: (Array.isArray(raw?.frames) ? raw.frames : [])
        .filter((f: any) => ids.has(Number(f?.id)))
        .map((f: any) => ({
          id: Number(f.id),
          personVisible: f.person_visible !== false,
          wearingGarment: answer(f.wearing_garment),
          facingMatches: answer(f.facing_matches),
          samePerson: answer(f.same_person),
          notes: String(f.notes ?? "").slice(0, 100),
        })),
    });
  } catch (error) {
    console.error("[outfit-swap-judge] failed:", errorMessage(error).slice(0, 1000));
    return json({ error: errorMessage(error) }, 500);
  }
});
