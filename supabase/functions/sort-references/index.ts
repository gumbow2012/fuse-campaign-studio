// Sorts a customer's dropped photos into a template's upload slots (front, back, sides, logo, ...).
// Read-only: Gemini looks at small copies and names the best slot for each. Nothing is generated or stored.
// Public (the campaign page works signed out), so every request is capped: 16 photos, 16 slots, small images.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { GoogleGenAI, Type } from "https://esm.sh/@google/genai@1.29.0";

const MODEL = Deno.env.get("GEMINI_ANALYSIS_MODEL")?.trim() || "gemini-3.6-flash";
const MAX_IMAGES = 16;
const MAX_SLOTS = 16;
const MAX_IMAGE_CHARS = 2_000_000; // base64 characters, about 1.5 MB
const ATTEMPTS = 3;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    assignments: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          image: { type: Type.INTEGER },
          slot: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          seen: { type: Type.STRING },
        },
        required: ["image", "slot", "confidence", "seen"],
      },
    },
  },
  required: ["assignments"],
};

type Slot = { id: string; label: string; hint: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json({ ok: false, reason: "Photo sorting is not configured." }, 500);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const slots: Slot[] = (Array.isArray(body.slots) ? body.slots : [])
    .slice(0, MAX_SLOTS)
    .map((s: any) => ({ id: String(s?.id ?? "").slice(0, 120), label: String(s?.label ?? "").slice(0, 120), hint: String(s?.hint ?? "").slice(0, 200) }))
    .filter((s) => s.id && s.label);
  const images = (Array.isArray(body.images) ? body.images : [])
    .slice(0, MAX_IMAGES)
    .map((u: unknown) => String(u ?? "").match(/^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i))
    .map((m) => (m && m[2].length <= MAX_IMAGE_CHARS ? { mimeType: m[1], data: m[2] } : null));
  if (!slots.length || !images.length) return json({ ok: false, reason: "Send at least one photo and one slot." }, 400);

  const prompt = [
    "You sort product photos into the upload slots of an ad template.",
    "Slots (id: label - hint):",
    ...slots.map((s) => `- ${s.id}: ${s.label}${s.hint ? ` - ${s.hint}` : ""}`),
    "",
    `There are ${images.length} photos, given in order as Photo 1..${images.length}.`,
    "For EVERY photo return one assignment: the id of the ONE slot it fits best, or \"none\" when it fits no slot or is unusable.",
    "Rules: judge only what is visible. A slot labelled with a view (front, back, side, inside, underside, detail) needs that exact view of the product.",
    "\"Wearer's left side\" means the side on the left of the person wearing it. A logo slot takes a flat logo or brand mark, not a product photo.",
    "Each slot should receive at most one photo; if two photos fit the same slot, give it to the clearer one and mark the other \"none\".",
    "confidence is 0-1. seen is a few words describing the photo (e.g. \"black cap, back view\").",
    "Return strict JSON.",
  ].join("\n");

  const parts: unknown[] = [{ text: prompt }];
  images.forEach((img, i) => {
    parts.push({ text: `Photo ${i + 1}:` });
    parts.push(img ? { inlineData: img } : { text: "(unreadable image)" });
  });

  const ai = new GoogleGenAI({ apiKey });
  let parsed: any = null;
  let lastError = "";
  for (let attempt = 0; attempt < ATTEMPTS && !parsed; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: [{ role: "user", parts }] as any,
        config: { responseMimeType: "application/json", responseSchema: SCHEMA as any, maxOutputTokens: 8192, temperature: 0, thinkingConfig: { thinkingLevel: "low" } as any },
      });
      const raw = (response.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      parsed = JSON.parse(raw);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  if (!parsed) return json({ ok: false, reason: lastError || "Could not sort the photos." }, 502);

  // One photo per slot (highest confidence wins); anything else stays unplaced so the customer decides.
  const ids = new Set(slots.map((s) => s.id));
  const best = new Map<string, { image: number; confidence: number }>();
  const seen: Record<number, string> = {};
  for (const a of Array.isArray(parsed.assignments) ? parsed.assignments : []) {
    const image = Number(a?.image) - 1;
    if (!Number.isInteger(image) || image < 0 || image >= images.length || !images[image]) continue;
    seen[image] = String(a?.seen ?? "").slice(0, 80);
    const slot = String(a?.slot ?? "");
    const confidence = Number(a?.confidence) || 0;
    if (!ids.has(slot) || confidence < 0.4) continue;
    const current = best.get(slot);
    if (!current || confidence > current.confidence) best.set(slot, { image, confidence });
  }
  const slotOf = new Map<number, string>();
  for (const [slot, { image }] of best) slotOf.set(image, slot);
  return json({
    ok: true,
    assignments: images.map((_, image) => ({ image, slot: slotOf.get(image) ?? null, seen: seen[image] ?? "" })),
  });
});
