import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  hasValidRunnerCode,
  json,
  requireAdminUser,
} from "../_shared/supabase-admin.ts";

type AssetPayload = {
  id: string;
  url: string;
  assetType?: string;
  metadata?: Record<string, unknown>;
};

type NodePayload = {
  key: string;
  name: string;
  nodeType: string;
  defaultAssetId?: string | null;
  promptConfig?: Record<string, unknown>;
};

type EdgePayload = {
  key: string;
  sourceKey: string;
  targetKey: string;
  mappingLogic?: Record<string, unknown>;
};

type Body = {
  templateName?: string;
  recipeId?: string;
  assets?: AssetPayload[];
  nodes?: NodePayload[];
  edges?: EdgePayload[];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createAdminClient();
  const runnerAccess = hasValidRunnerCode(req);

  try {
    if (!runnerAccess) {
      await requireAdminUser(req, admin);
    }

    const body = await req.json() as Body;
    const templateName = body.templateName?.trim();
    const recipeId = body.recipeId?.trim() ?? null;
    const assets = Array.isArray(body.assets) ? body.assets : [];
    const nodes = Array.isArray(body.nodes) ? body.nodes : [];
    const edges = Array.isArray(body.edges) ? body.edges : [];

    if (!templateName) throw new Error("templateName is required");
    if (!nodes.length) throw new Error("nodes are required");

    const { data: template, error: templateError } = await admin
      .from("fuse_templates")
      .select("id")
      .eq("name", templateName)
      .maybeSingle();
    if (templateError) throw new Error(templateError.message);
    if (!template?.id) throw new Error(`Template not found: ${templateName}`);

    const { data: latestVersion, error: versionError } = await admin
      .from("template_versions")
      .select("version_number")
      .eq("template_id", template.id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (versionError) throw new Error(versionError.message);

    const nextVersion = Number(latestVersion?.version_number ?? 0) + 1;
    const newVersionId = crypto.randomUUID();

    if (assets.length) {
      const { error: assetsError } = await admin
        .from("assets")
        .upsert(
          assets.map((asset) => ({
            id: asset.id,
            supabase_storage_url: asset.url,
            asset_type: asset.assetType ?? "reference_image",
            metadata: asset.metadata ?? {},
          })),
          { onConflict: "id" },
        );
      if (assetsError) throw new Error(assetsError.message);
    }

    const { error: deactivateError } = await admin
      .from("template_versions")
      .update({ is_active: false })
      .eq("template_id", template.id)
      .eq("is_active", true);
    if (deactivateError) throw new Error(deactivateError.message);

    const { error: insertVersionError } = await admin
      .from("template_versions")
      .insert({
        id: newVersionId,
        template_id: template.id,
        version_number: nextVersion,
        is_active: true,
      });
    if (insertVersionError) throw new Error(insertVersionError.message);

    const nodeIdMap = new Map<string, string>();
    const nodeRows = nodes.map((node) => {
      const id = crypto.randomUUID();
      nodeIdMap.set(node.key, id);
      return {
        id,
        version_id: newVersionId,
        node_type: node.nodeType,
        model_id: null,
        prompt_config: node.promptConfig ?? {},
        default_asset_id: node.defaultAssetId ?? null,
        name: node.name,
      };
    });

    const { error: nodesError } = await admin.from("nodes").insert(nodeRows);
    if (nodesError) throw new Error(nodesError.message);

    if (edges.length) {
      const edgeRows = edges.map((edge) => {
        const sourceNodeId = nodeIdMap.get(edge.sourceKey);
        const targetNodeId = nodeIdMap.get(edge.targetKey);
        if (!sourceNodeId || !targetNodeId) {
          throw new Error(`Edge references missing node mapping: ${edge.key}`);
        }

        return {
          id: crypto.randomUUID(),
          version_id: newVersionId,
          source_node_id: sourceNodeId,
          target_node_id: targetNodeId,
          mapping_logic: edge.mappingLogic ?? {},
          condition_logic: null,
        };
      });

      const { error: edgesError } = await admin.from("edges").insert(edgeRows);
      if (edgesError) throw new Error(edgesError.message);
    }

    const visibleInputs = nodes.filter(
      (node) => node.nodeType === "user_input" && node.defaultAssetId == null,
    ).length;
    const hiddenInputs = nodes.filter(
      (node) => node.nodeType === "user_input" && node.defaultAssetId != null,
    ).length;
    const imageSteps = nodes.filter((node) => node.nodeType === "image_gen").length;
    const videoSteps = nodes.filter((node) => node.nodeType === "video_gen").length;

    return json({
      ok: true,
      templateName,
      recipeId,
      versionId: newVersionId,
      versionNumber: nextVersion,
      counts: {
        visibleInputs,
        hiddenInputs,
        imageSteps,
        videoSteps,
        edges: edges.length,
      },
    });
  } catch (error) {
    return json({ error: errorMessage(error) }, 400);
  }
});
