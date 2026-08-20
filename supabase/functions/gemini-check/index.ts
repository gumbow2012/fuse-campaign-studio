// Gemini connectivity check — ANALYSIS ONLY.
// This function must never generate or return images, video, or any media.
// No Imagen / Veo / image-generation methods are imported or called here.

import { GoogleGenAI, Type } from "https://esm.sh/@google/genai@1.29.0";
import { corsHeaders, errorMessage, json, requireUser } from "../_shared/supabase-admin.ts";

/** Single source of truth for the analysis model. */
export const GEMINI_ANALYSIS_MODEL =
  Deno.env.get("GEMINI_ANALYSIS_MODEL")?.trim() || "gemini-2.5-flash";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await requireUser(req);
  } catch (error) {
    return json({ error: errorMessage(error) }, 401);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
  const keyPresent = !!apiKey;

  if (!keyPresent) {
    return json({
      keyPresent: false,
      connection: "FAIL",
      model: GEMINI_ANALYSIS_MODEL,
      structuredOutput: "FAIL",
      error: "GEMINI_API_KEY is not configured in server secrets.",
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: GEMINI_ANALYSIS_MODEL,
      contents: 'Reply with JSON only: {"ok": true}',
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: { ok: { type: Type.BOOLEAN } },
          required: ["ok"],
        },
        maxOutputTokens: 32,
      },
    });

    const text = (response.text ?? "").trim();
    let structuredOutput: "PASS" | "FAIL" = "FAIL";
    let parseError: string | undefined;

    try {
      const parsed = JSON.parse(text);
      structuredOutput = parsed?.ok === true ? "PASS" : "FAIL";
      if (structuredOutput === "FAIL") {
        parseError = `Model returned JSON without ok:true (keys: ${Object.keys(parsed ?? {}).join(",")})`;
      }
    } catch (e) {
      parseError = `Response was not valid JSON: ${errorMessage(e)}`;
    }

    return json({
      keyPresent: true,
      connection: "PASS",
      model: GEMINI_ANALYSIS_MODEL,
      structuredOutput,
      ...(parseError ? { error: parseError } : {}),
    });
  } catch (error) {
    // Never include the key in the surfaced message.
    const raw = errorMessage(error);
    const safe = apiKey ? raw.split(apiKey).join("[redacted]") : raw;
    return json({
      keyPresent: true,
      connection: "FAIL",
      model: GEMINI_ANALYSIS_MODEL,
      structuredOutput: "FAIL",
      error: safe.slice(0, 2000),
    });
  }
});
