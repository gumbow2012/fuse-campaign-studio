import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { corsHeaders, createAdminClient, errorMessage, getUserRoles, json, requireUser } from "../_shared/supabase-admin.ts";
import { buildTemplateInputPlan } from "../_shared/template-inputs.ts";
import { getNodeEditorConfig } from "../_shared/template-editor.ts";

function summarizeNode(args: {
  nodeName: string;
  nodeType: string;
  prompt: string | null;
  defaultAssetUrl?: string | null;
  isReferenceInput?: boolean;
  isUserFacingInput?: boolean;
  incoming: Array<{ sourceName: string; targetParam: string | null }>;
}) {
  if (args.nodeType === "user_input") {
    return args.isReferenceInput || args.isUserFacingInput === false
      ? `${args.nodeName} is a built-in reference image.`
      : `${args.nodeName} is an uploaded input that you must provide at run time.`;
  }

  if (args.nodeType === "image_gen") {
    const parts = [];
    if (args.defaultAssetUrl) {
      parts.push("uses a built-in reference scene");
    }
    if (args.incoming.length) {
      parts.push(
        `pulls from ${args.incoming.map((item) => `${item.sourceName}${item.targetParam ? ` as ${item.targetParam}` : ""}`).join(", ")}`,
      );
    }
    if (args.prompt) {
      parts.push(`prompt: "${args.prompt}"`);
    }
    return `${args.nodeName} ${parts.join("; ")}.`;
  }

  if (args.nodeType === "video_gen") {
    const sourceText = args.incoming.length
      ? args.incoming.map((item) => `${item.sourceName}${item.targetParam ? ` as ${item.targetParam}` : ""}`).join(", ")
      : "no upstream image";
    return `${args.nodeName} turns ${sourceText} into video${args.prompt ? ` with prompt "${args.prompt}"` : ""}.`;
  }

  return `${args.nodeName} is a ${args.nodeType} node.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const admin = createAdminClient();

  try {
    const user = await requireUser(req, admin);
    const roles = await getUserRoles(user.id, admin);
    const canInspectGraph = roles.some((role) => role === "admin" || role === "dev");

    const url = new URL(req.url);
    let versionId = url.searchParams.get("versionId");
    if (!versionId && req.method !== "GET") {
      try {
        const body = await req.json();
        versionId = typeof body?.versionId === "string" ? body.versionId : null;
      } catch {
        // Ignore malformed JSON and fall through to the required check.
      }
    }
    if (!versionId) throw new Error("versionId is required");

    const { data: version, error: versionError } = await admin
      .from("template_versions")
      .select("id, template_id, version_number, is_active, review_status, fuse_templates!inner(id, name)")
      .eq("id", versionId)
      .single();
    if (versionError || !version) throw new Error(versionError?.message ?? "Template version not found");

    const { data: nodes, error: nodeError } = await admin
      .from("nodes")
      .select("id, name, node_type, prompt_config, default_asset_id")
      .eq("version_id", versionId);
    if (nodeError) throw new Error(nodeError.message);

    const { data: edges, error: edgeError } = await admin
      .from("edges")
      .select("id, source_node_id, target_node_id, mapping_logic")
      .eq("version_id", versionId);
    if (edgeError) throw new Error(edgeError.message);

    const assetIds = [...new Set((nodes ?? []).map((node: any) => node.default_asset_id).filter(Boolean))];
    const { data: assets, error: assetError } = assetIds.length
      ? await admin.from("assets").select("id, asset_type, supabase_storage_url").in("id", assetIds)
      : { data: [], error: null };
    if (assetError) throw new Error(assetError.message);

    const assetMap = new Map((assets ?? []).map((asset: any) => [asset.id, asset]));
    const nodeMap = new Map((nodes ?? []).map((node: any) => [node.id, node]));
    const inputPlan = buildTemplateInputPlan(
      (version as any).fuse_templates.name,
      (nodes ?? []).filter((node: any) => node.node_type === "user_input"),
    );
    const userFacingInputNodeIds = new Set(inputPlan.slots.flatMap((slot) => slot.nodeIds));
    const implicitReferenceNodeIds = new Set(inputPlan.implicitReferenceNodeIds);

    const detailNodes = (nodes ?? [])
      .map((node: any) => {
        const defaultAsset = node.default_asset_id ? assetMap.get(node.default_asset_id) : null;
        const sampleUrl = typeof node.prompt_config?.sample_url === "string"
          ? node.prompt_config.sample_url
          : null;
        const slot = inputPlan.slotByNodeId[node.id] ?? null;
        const editorConfig = getNodeEditorConfig(node);
        const isUserFacingInput = node.node_type !== "user_input" || userFacingInputNodeIds.has(node.id);
        const editorMode = editorConfig.mode ?? (
          node.node_type === "user_input" && (
            implicitReferenceNodeIds.has(node.id) || !isUserFacingInput
          )
            ? "reference"
            : "upload"
        );
        const isReferenceInput =
          editorMode === "reference" ||
          implicitReferenceNodeIds.has(node.id) ||
          (node.node_type === "user_input" && !isUserFacingInput);
        const incoming = (edges ?? [])
          .filter((edge: any) => edge.target_node_id === node.id)
          .map((edge: any) => {
            const source = nodeMap.get(edge.source_node_id);
            return {
              edgeId: edge.id,
              sourceNodeId: edge.source_node_id,
              sourceName: source?.name ?? "Unknown",
              sourceType: source?.node_type ?? "unknown",
              targetParam: edge.mapping_logic?.target_param ?? null,
            };
          });

        const prompt = typeof node.prompt_config?.prompt === "string"
          ? node.prompt_config.prompt
          : null;
        const displayName = editorConfig.label ?? slot?.name ?? node.name;
        const expected = editorConfig.expected ?? slot?.expected ?? node.prompt_config?.expected ?? null;
        const defaultAssetUrl = defaultAsset?.supabase_storage_url ?? sampleUrl;

        return {
          id: node.id,
          rawName: node.name,
          name: displayName,
          nodeType: node.node_type,
          outputExposed: typeof node.prompt_config?.output_exposed === "boolean"
            ? node.prompt_config.output_exposed
            : typeof node.prompt_config?.output_exposed === "string"
            ? node.prompt_config.output_exposed === "true"
            : null,
          prompt,
          expected,
          defaultAssetId: defaultAsset?.id ?? null,
          defaultAssetUrl,
          defaultAssetType: defaultAsset?.asset_type ?? null,
          incoming,
          summary: summarizeNode({
            nodeName: displayName,
            nodeType: node.node_type,
            prompt,
            defaultAssetUrl,
            isReferenceInput,
            isUserFacingInput,
            incoming,
          }),
          editor: {
            mode: editorMode,
            slotKey: editorConfig.slotKey ?? slot?.id ?? null,
            label: editorConfig.label ?? slot?.name ?? node.name,
            expected,
            outputExposed: node.node_type === "image_gen" || node.node_type === "video_gen"
              ? node.prompt_config?.output_exposed ?? null
              : null,
            isUserFacingInput,
            isReferenceInput,
            sampleUrl,
          },
        };
      })
      .sort((a: any, b: any) => a.name.localeCompare(b.name));

    const hasExplicitOutputFlags = detailNodes.some((node: any) =>
      (node.nodeType === "image_gen" || node.nodeType === "video_gen") &&
      node.outputExposed !== null
    );
    let nextOutputNumber = 1;
    const numberedNodes = detailNodes.map((node: any, index: number) => {
      const isOutputNode = node.nodeType === "image_gen" || node.nodeType === "video_gen";
      const isDeliverable = isOutputNode && (
        hasExplicitOutputFlags ? node.outputExposed === true : true
      );
      const outputNumber = isDeliverable ? nextOutputNumber++ : null;
      return {
        ...node,
        nodeNumber: index + 1,
        outputNumber,
      };
    });

    const userInputs = inputPlan.slots.map((slot) => ({
      key: slot.id,
      label: slot.name,
      type: slot.expected ?? "image",
      required: true,
      hint: `${slot.name} is required for this template.`,
    }));

    if (!canInspectGraph) {
      return json({
        templateId: (version as any).fuse_templates.id,
        templateName: (version as any).fuse_templates.name,
        versionId: version.id,
        versionNumber: version.version_number,
        reviewStatus: version.review_status ?? "Unreviewed",
        isActive: version.is_active,
        userInputs,
        nodes: [],
        edges: [],
      });
    }

    return json({
      templateId: (version as any).fuse_templates.id,
      templateName: (version as any).fuse_templates.name,
      versionId: version.id,
      versionNumber: version.version_number,
      reviewStatus: version.review_status ?? "Unreviewed",
      isActive: version.is_active,
      userInputs,
      nodes: numberedNodes,
      edges: (edges ?? []).map((edge: any) => ({
        id: edge.id,
        sourceNodeId: edge.source_node_id,
        targetNodeId: edge.target_node_id,
        targetParam: edge.mapping_logic?.target_param ?? null,
      })),
    });
  } catch (error) {
    return json({ error: errorMessage(error) }, 400);
  }
});
