// TEMPLATE FACTORY — TF1: reference analyzer.
//
// HARD BOUNDARIES:
//   * Owned by the Template Factory. Does not import or modify Cinema Studio,
//     Jewelry Swap, Outfit Swap, Madden Media, billing, or the template runner.
//   * The only provider call is a Gemini VISION ANALYSIS returning strict JSON.
//     No image generation, no video generation, no credit spend.
//   * Admin/dev only. Creators and other roles get 403.

import { GoogleGenAI, Type } from "https://esm.sh/@google/genai@1.29.0";
import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  requireBuilderUser,
} from "../_shared/supabase-admin.ts";

const BLUEPRINT_VERSION = "factory-reference-blueprint-v1";
const GEMINI_ANALYSIS_MODEL =
  Deno.env.get("GEMINI_ANALYSIS_MODEL")?.trim() || "gemini-3.6-flash";
const IMAGE_FETCH_TIMEOUT_MS = 15_000;

async function inlineImage(url: string) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: abort.signal });
    if (!response.ok) throw new Error(`Could not read the reference image (${response.status})`);
    const mimeType = (response.headers.get("content-type") ?? "image/jpeg")
      .split(";")[0]
      .trim();
    if (!/^image\//.test(mimeType)) throw new Error("Only still images can be analysed");
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

const BLUEPRINT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    shot_list: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          framing: { type: Type.STRING },
          subject: { type: Type.STRING },
          action: { type: Type.STRING },
        },
        required: ["name", "framing", "subject", "action"],
      },
    },
    subject_treatment: { type: Type.STRING },
    garment_focus: { type: Type.STRING },
    composition: { type: Type.STRING },
    camera: { type: Type.STRING },
    lighting: { type: Type.STRING },
    color_grade: { type: Type.STRING },
    mood: { type: Type.STRING },
    setting: { type: Type.STRING },
    motion: { type: Type.STRING },
    suggested_output_count: { type: Type.INTEGER },
    uncertain: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    "shot_list",
    "subject_treatment",
    "garment_focus",
    "composition",
    "camera",
    "lighting",
    "color_grade",
    "mood",
    "setting",
    "motion",
    "suggested_output_count",
    "uncertain",
  ],
};

function buildPrompt(title: string, category: string | null, tags: string[]) {
  return [
    "You are a CREATIVE DIRECTION analyst for a streetwear campaign template factory.",
    "You are given ONE reference image used as a creative brief.",
    title ? `Curator title: ${title}` : "",
    category ? `Category: ${category}` : "",
    tags.length ? `Tags: ${tags.join(", ")}` : "",
    "",
    "GOAL: return a reusable CREATIVE BLUEPRINT that a campaign template could be built from.",
    "",
    "ABSOLUTE RULES:",
    "- NEVER identify, name, or guess real people, celebrities, or brands. No logos by name.",
    "- NEVER infer or output protected or sensitive attributes: race, ethnicity, nationality,",
    "  religion, health, age bracket, gender identity, sexuality.",
    "- Describe only reusable-for-generation visual descriptors.",
    "- Do not speculate. If something is not clearly visible, say 'not visible' and list the",
    "  field name in `uncertain`.",
    "",
    "Give a 3-6 shot shot_list (each with a short name, framing, subject description, action),",
    "then subject treatment, garment focus, composition, camera (lens/angle/distance), lighting,",
    "color grade, mood, setting, and motion (camera/subject movement if the reference reads as",
    "video-like, otherwise 'still'). suggested_output_count is a realistic asset count (1-8).",
    "Keep every field short and concrete. Return strict JSON matching the schema. No prose outside JSON.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function analyzeReference(body: Record<string, unknown>, admin: ReturnType<typeof createAdminClient>) {
  const referenceId = String(body.referenceId ?? "").trim();
  if (!referenceId) {
    return { ok: false as const, reason: "referenceId is required." };
  }

  const { data: reference, error } = await admin
    .from("streetwear_references")
    .select("id, title, category, tags, image_url")
    .eq("id", referenceId)
    .maybeSingle();
  if (error) return { ok: false as const, reason: error.message };
  if (!reference) return { ok: false as const, reason: "Reference not found." };

  const imageUrl = String((reference as any).image_url ?? "").trim();
  if (!/^https?:\/\//.test(imageUrl)) {
    return { ok: false as const, reason: "This reference has no image URL to analyse." };
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
  if (!apiKey) {
    return { ok: false as const, reason: "Reference analysis is not configured yet." };
  }

  let imagePart: unknown;
  try {
    imagePart = await inlineImage(imageUrl);
  } catch (err) {
    return { ok: false as const, reason: errorMessage(err) };
  }

  let blueprint: Record<string, unknown>;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: GEMINI_ANALYSIS_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: buildPrompt(
                String((reference as any).title ?? ""),
                (reference as any).category ?? null,
                Array.isArray((reference as any).tags) ? (reference as any).tags.map(String) : [],
              ),
            },
            imagePart,
          ],
        },
      ] as any,
      config: {
        responseMimeType: "application/json",
        responseSchema: BLUEPRINT_SCHEMA as any,
        maxOutputTokens: 4096,
        temperature: 0.2,
      },
    });

    const text = (response.text ?? "").trim();
    if (!text) return { ok: false as const, reason: "The analysis returned nothing — try again." };
    try {
      blueprint = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { ok: false as const, reason: "The analysis returned an unreadable result." };
    }
  } catch (err) {
    console.error("template-factory analyze_reference failed:", errorMessage(err));
    return { ok: false as const, reason: errorMessage(err) };
  }

  const stored = {
    ...blueprint,
    version: BLUEPRINT_VERSION,
    model: GEMINI_ANALYSIS_MODEL,
    analyzed_image_url: imageUrl,
  };
  const generatedAt = new Date().toISOString();

  const { error: updateError } = await admin
    .from("streetwear_references")
    .update({ blueprint: stored, blueprint_generated_at: generatedAt })
    .eq("id", referenceId);
  if (updateError) return { ok: false as const, reason: updateError.message };

  return {
    ok: true as const,
    referenceId,
    blueprint: stored,
    blueprintGeneratedAt: generatedAt,
  };
}

// ---------------------------------------------------------------------------
// TF2 — compile a stored blueprint into a DRAFT template graph.
// Reuses the existing data model exactly: fuse_templates + template_versions
// + nodes + edges. NO provider generation happens here — this only writes rows.
// ---------------------------------------------------------------------------

const CUSTOMER_INPUTS = [
  {
    slotKey: "product_image",
    label: "Product / garment image",
    hint: "Upload the flat-lay or on-body shot of the product this campaign sells.",
  },
  {
    slotKey: "brand_logo",
    label: "Brand logo (optional)",
    hint: "Transparent PNG preferred. Used for subtle brand placement.",
  },
];

function bpText(blueprint: Record<string, unknown>, key: string): string {
  const value = blueprint[key];
  return typeof value === "string" ? value.trim() : "";
}

function buildShotPrompt(
  blueprint: Record<string, unknown>,
  shot: Record<string, unknown>,
  index: number,
) {
  const line = (label: string, value: string) => (value ? `${label}: ${value}` : "");
  const shotText = (key: string) =>
    typeof shot[key] === "string" ? String(shot[key]).trim() : "";

  return [
    `SHOT ${index + 1} — ${shotText("name") || `Campaign frame ${index + 1}`}`,
    "",
    "Create a premium streetwear campaign image.",
    line("Framing", shotText("framing")),
    line("Subject", shotText("subject") || bpText(blueprint, "subject_treatment")),
    line("Action", shotText("action")),
    line("Subject treatment", bpText(blueprint, "subject_treatment")),
    line("Garment focus", bpText(blueprint, "garment_focus")),
    line("Composition", bpText(blueprint, "composition")),
    line("Camera", bpText(blueprint, "camera")),
    line("Lighting", bpText(blueprint, "lighting")),
    line("Color grade", bpText(blueprint, "color_grade")),
    line("Mood", bpText(blueprint, "mood")),
    line("Setting", bpText(blueprint, "setting")),
    "",
    "The supplied product image is the strict visual authority for the product: its design,",
    "graphics, typography, colors, materials, texture and construction must match it exactly.",
    "Do not redesign the product, invent logos, or add text that is not supplied.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function compileBlueprint(
  body: Record<string, unknown>,
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
) {
  const referenceId = String(body.referenceId ?? "").trim();
  if (!referenceId) return { ok: false as const, reason: "referenceId is required." };

  const { data: reference, error } = await admin
    .from("streetwear_references")
    .select("id, title, category, tags, image_url, notes, blueprint, compiled_template_id")
    .eq("id", referenceId)
    .maybeSingle();
  if (error) return { ok: false as const, reason: error.message };
  if (!reference) return { ok: false as const, reason: "Reference not found." };

  const blueprint = (reference as any).blueprint as Record<string, unknown> | null;
  if (!blueprint || typeof blueprint !== "object") {
    return { ok: false as const, reason: "Analyze this reference first." };
  }

  const rawShots = Array.isArray((blueprint as any).shot_list)
    ? ((blueprint as any).shot_list as unknown[])
    : [];
  const shots = rawShots
    .filter((shot) => shot && typeof shot === "object")
    .map((shot) => shot as Record<string, unknown>)
    .slice(0, 8);
  if (!shots.length) {
    return { ok: false as const, reason: "This blueprint has no shot list to compile." };
  }

  const title = String((reference as any).title ?? "").trim();
  const name = (title || "Factory Draft").slice(0, 120);
  const description = [
    bpText(blueprint, "mood"),
    bpText(blueprint, "setting"),
    bpText(blueprint, "garment_focus"),
  ]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 400) ||
    "Draft campaign template compiled from a curated streetwear reference.";
  const previewUrl = String((reference as any).image_url ?? "").trim() || null;

  let templateId: string | null = null;
  let versionId: string | null = null;

  try {
    const { data: template, error: templateError } = await admin
      .from("fuse_templates")
      .insert({
        name,
        description,
        created_by: userId,
        preview_url: previewUrl,
        preview_asset_type: "image",
      })
      .select("id")
      .single();
    if (templateError || !template) {
      throw new Error(templateError?.message ?? "Template create failed");
    }
    templateId = String((template as any).id);

    versionId = crypto.randomUUID();
    const { error: versionError } = await admin.from("template_versions").insert({
      id: versionId,
      template_id: templateId,
      version_number: 1,
      is_active: false,
      review_status: "Unreviewed",
    });
    if (versionError) throw new Error(versionError.message);

    const nodes: Record<string, unknown>[] = [];
    const edges: Record<string, unknown>[] = [];
    const positions: Record<string, { x: number; y: number }> = {};

    // --- Customer upload inputs (editor_mode "upload" => real customer inputs) ---
    const inputNodes = CUSTOMER_INPUTS.map((input, index) => {
      const id = crypto.randomUUID();
      nodes.push({
        id,
        version_id: versionId,
        node_type: "user_input",
        model_id: null,
        prompt_config: {
          editor_mode: "upload",
          editor_slot_key: input.slotKey,
          editor_label: input.label,
          editor_expected: "image",
          editor_hint: input.hint,
          optional: index > 0,
          sort_order: index + 1,
          factory_role: "customer_input",
        },
        default_asset_id: null,
        name: input.label,
      });
      positions[id] = { x: 80, y: 80 + index * 240 };
      return { id, slotKey: input.slotKey };
    });

    // --- One image_gen node per blueprint shot, all exposed as final outputs ---
    shots.forEach((shot, index) => {
      const id = crypto.randomUUID();
      const shotName = (typeof shot.name === "string" ? shot.name.trim() : "") ||
        `Shot ${index + 1}`;
      nodes.push({
        id,
        version_id: versionId,
        node_type: "image_gen",
        model_id: null,
        prompt_config: {
          prompt: buildShotPrompt(blueprint, shot, index),
          aspect_ratio: "9:16",
          output_exposed: true,
          factory_role: "shot",
          factory_shot_index: index,
          factory_reference_id: referenceId,
        },
        default_asset_id: null,
        name: `${String(index + 1).padStart(2, "0")} · ${shotName}`.slice(0, 120),
      });
      positions[id] = { x: 620, y: 80 + index * 240 };

      inputNodes.forEach((input, inputIndex) => {
        edges.push({
          id: crypto.randomUUID(),
          version_id: versionId,
          source_node_id: input.id,
          target_node_id: id,
          mapping_logic: {
            target_param: `image_${inputIndex + 1}`,
            edge_order: inputIndex + 1,
          },
          condition_logic: null,
        });
      });
    });

    const { error: nodesError } = await admin.from("nodes").insert(nodes);
    if (nodesError) throw new Error(nodesError.message);
    const { error: edgesError } = await admin.from("edges").insert(edges);
    if (edgesError) throw new Error(edgesError.message);

    const { error: linkError } = await admin
      .from("streetwear_references")
      .update({ compiled_template_id: templateId })
      .eq("id", referenceId);
    if (linkError) throw new Error(linkError.message);

    return {
      ok: true as const,
      referenceId,
      templateId,
      versionId,
      templateName: name,
      shotCount: shots.length,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      positions,
    };
  } catch (err) {
    // Best-effort cleanup so a partial failure never leaves garbage behind.
    try {
      if (versionId) {
        await admin.from("edges").delete().eq("version_id", versionId);
        await admin.from("nodes").delete().eq("version_id", versionId);
        await admin.from("template_versions").delete().eq("id", versionId);
      }
      if (templateId) {
        await admin.from("fuse_templates").delete().eq("id", templateId);
      }
    } catch (cleanupError) {
      console.error("template-factory compile cleanup failed:", errorMessage(cleanupError));
    }
    console.error("template-factory compile_blueprint failed:", errorMessage(err));
    return { ok: false as const, reason: errorMessage(err) };
  }
}



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createAdminClient();

  let access;
  try {
    access = await requireBuilderUser(req, admin);
  } catch (error) {
    return json({ ok: false, reason: errorMessage(error) }, 401);
  }

  if (!access.isAdmin && !access.isDev) {
    return json({ ok: false, reason: "Admin access required" }, 403);
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "").trim();

    if (action === "analyze_reference") {
      return json(await analyzeReference(body, admin));
    }

    return json({ ok: false, reason: `Unknown action: ${action || "(none)"}` }, 400);
  } catch (error) {
    return json({ ok: false, reason: errorMessage(error) }, 500);
  }
});
