import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  requireTesterUser,
} from "../_shared/supabase-admin.ts";

type Body = {
  versionId?: string;
  nodeId?: string;
  displayLabel?: string | null;
  prompt?: string | null;
  expected?: string | null;
  editorMode?: "upload" | "reference" | "workflow" | null;
  slotKey?: string | null;
  sampleUrl?: string | null;
  outputExposed?: boolean | null;
  detachAsset?: boolean | null;
};

function normalizeNullable(value: string | null | undefined) {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createAdminClient();

  try {
    await requireTesterUser(req, admin);

    const body = await req.json() as Body;
    const versionId = normalizeNullable(body.versionId);
    const nodeId = normalizeNullable(body.nodeId);

    if (!versionId) throw new Error("versionId is required");
    if (!nodeId) throw new Error("nodeId is required");

    const { data: node, error: nodeError } = await admin
      .from("nodes")
      .select("id, version_id, node_type, name, prompt_config, default_asset_id")
      .eq("id", nodeId)
      .eq("version_id", versionId)
      .single();
    if (nodeError || !node) throw new Error(nodeError?.message ?? "Node not found");

    const nextPromptConfig = {
      ...(node.prompt_config ?? {}),
    } as Record<string, unknown>;

    if ("displayLabel" in body) {
      nextPromptConfig.editor_label = normalizeNullable(body.displayLabel);
    }

    if ("prompt" in body) {
      nextPromptConfig.prompt = normalizeNullable(body.prompt);
    }

    if ("expected" in body) {
      const nextExpected = normalizeNullable(body.expected);
      nextPromptConfig.editor_expected = nextExpected;
      nextPromptConfig.expected = nextExpected;
    }

    if ("editorMode" in body && node.node_type === "user_input") {
      const nextMode = body.editorMode === "upload" || body.editorMode === "reference" || body.editorMode === "workflow"
        ? body.editorMode
        : null;
      nextPromptConfig.editor_mode = nextMode;
    }

    if ("slotKey" in body && node.node_type === "user_input") {
      nextPromptConfig.editor_slot_key = normalizeNullable(body.slotKey);
    }

    if ("sampleUrl" in body && node.node_type === "user_input") {
      nextPromptConfig.sample_url = normalizeNullable(body.sampleUrl);
    }

    if ("outputExposed" in body && (node.node_type === "image_gen" || node.node_type === "video_gen")) {
      nextPromptConfig.output_exposed = typeof body.outputExposed === "boolean" ? body.outputExposed : null;
    }

    let nextDefaultAssetId = node.default_asset_id;

    if (body.detachAsset === true) {
      delete nextPromptConfig.sample_url;
      nextPromptConfig.weavy_exposed = false;

      if (node.node_type === "user_input" && nextPromptConfig.editor_mode !== "upload") {
        nextPromptConfig.editor_mode = "workflow";
      }

      nextDefaultAssetId = null;
    }

    const { error: updateError } = await admin
      .from("nodes")
      .update({
        prompt_config: nextPromptConfig,
        default_asset_id: nextDefaultAssetId,
      })
      .eq("id", node.id);
    if (updateError) throw new Error(updateError.message);

    return json({
      ok: true,
      nodeId: node.id,
      versionId,
      promptConfig: nextPromptConfig,
    });
  } catch (error) {
    return json({ error: errorMessage(error) }, 400);
  }
});
