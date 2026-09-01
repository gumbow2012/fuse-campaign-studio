import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  requireAdminUser,
} from "../_shared/supabase-admin.ts";
import { resolveRegenerationSubgraphFromGraph } from "../_shared/regeneration.ts";

/**
 * F3 — Admin FREE FIRST VIDEO configuration.
 *
 * Server-authoritative: a template can only be flagged free_preview_enabled
 * when the admin-chosen video_gen node validates against the SAME dependency
 * resolver used by per-output regeneration (and by start-free-video-run). The
 * UI display is informational only — "enable" always re-validates here.
 *
 * Internal cost estimates are admin-only and must never be exposed publicly.
 */

const USD_PER_CREDIT = 0.098;

type Body = { action?: string; templateId?: string; nodeId?: string | null };

type GraphNode = {
  id: string;
  name?: string | null;
  node_type?: string | null;
  prompt_config?: Record<string, unknown> | null;
  default_asset_id?: string | null;
};

async function loadTemplate(admin: ReturnType<typeof createAdminClient>, templateId: string) {
  const { data: template, error } = await admin
    .from("fuse_templates")
    .select("id, name, free_preview_enabled, activation_video_node_id")
    .eq("id", templateId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!template) throw new Error("Template not found");

  const { data: version, error: versionError } = await admin
    .from("template_versions")
    .select("id")
    .eq("template_id", templateId)
    .eq("is_active", true)
    .maybeSingle();
  if (versionError) throw new Error(versionError.message);

  return { template: template as Record<string, unknown>, versionId: version?.id ? String(version.id) : null };
}

async function loadGraph(admin: ReturnType<typeof createAdminClient>, versionId: string) {
  const [nodesResult, edgesResult] = await Promise.all([
    admin.from("nodes").select("id, name, node_type, prompt_config, default_asset_id").eq("version_id", versionId),
    admin.from("edges").select("source_node_id, target_node_id").eq("version_id", versionId),
  ]);
  if (nodesResult.error) throw new Error(nodesResult.error.message);
  if (edgesResult.error) throw new Error(edgesResult.error.message);
  return {
    nodes: (nodesResult.data ?? []) as GraphNode[],
    edges: (edgesResult.data ?? []) as Array<{ source_node_id: string; target_node_id: string }>,
  };
}

type ValidationResult = {
  valid: boolean;
  reason: string | null;
  isVideo: boolean;
  reachable: boolean;
  dependencyNodeCount: number;
  requiredInputs: Array<{ nodeId: string; name: string }>;
  estimatedCredits: number;
  estimatedCostUsd: number;
};

function invalid(reason: string, patch: Partial<ValidationResult> = {}): ValidationResult {
  return {
    valid: false,
    reason,
    isVideo: false,
    reachable: false,
    dependencyNodeCount: 0,
    requiredInputs: [],
    estimatedCredits: 0,
    estimatedCostUsd: 0,
    ...patch,
  };
}

async function validate(
  admin: ReturnType<typeof createAdminClient>,
  templateId: string,
  nodeId: string,
): Promise<ValidationResult> {
  const { versionId } = await loadTemplate(admin, templateId);
  if (!versionId) return invalid("This template has no active version.");

  const { nodes, edges } = await loadGraph(admin, versionId);
  const target = nodes.find((node) => String(node.id) === nodeId);
  if (!target) return invalid("That output does not exist in the active version.");

  const isVideo = String(target.node_type ?? "") === "video_gen";
  if (!isVideo) return invalid("The free preview output must be a video output.");

  let estimate: ReturnType<typeof resolveRegenerationSubgraphFromGraph>;
  try {
    // Empty steps => nothing is reusable, so the resolver returns the FULL
    // dependency path a fresh free run would have to execute.
    estimate = resolveRegenerationSubgraphFromGraph({ nodes, edges, steps: [], target: { nodeId } });
  } catch (error) {
    return invalid(
      `Dependency path could not be resolved: ${errorMessage(error)}`,
      { isVideo: true },
    );
  }

  const toRun = estimate.toRunNodeIds ?? [];
  if (!toRun.length) {
    return invalid("No executable steps remain for this output.", { isVideo: true });
  }

  const pathNodeIds = new Set<string>([...toRun, ...(estimate.reusedNodeIds ?? [])]);
  if (pathNodeIds.size > nodes.length) {
    return invalid("The graph appears to contain a cycle or deadlock.", { isVideo: true });
  }

  const estimatedCredits = Number(estimate.estimatedCredits);
  if (!Number.isFinite(estimatedCredits) || estimatedCredits <= 0) {
    return invalid("Cost could not be computed for this output.", {
      isVideo: true,
      reachable: true,
      dependencyNodeCount: toRun.length,
    });
  }

  const requiredInputs = nodes
    .filter((node) =>
      pathNodeIds.has(String(node.id)) &&
      String(node.node_type ?? "") === "user_input" &&
      !node.default_asset_id
    )
    .map((node) => ({ nodeId: String(node.id), name: String(node.name ?? "Input") }));

  return {
    valid: true,
    reason: null,
    isVideo: true,
    reachable: true,
    dependencyNodeCount: toRun.length,
    requiredInputs,
    estimatedCredits,
    estimatedCostUsd: Number((estimatedCredits * USD_PER_CREDIT).toFixed(2)),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const admin = createAdminClient();

  try {
    await requireAdminUser(req, admin);

    const body = (await req.json().catch(() => ({}))) as Body;
    const action = String(body.action ?? "");
    const templateId = typeof body.templateId === "string" ? body.templateId.trim() : "";
    if (!templateId) throw new Error("templateId is required");
    const nodeId = typeof body.nodeId === "string" && body.nodeId.trim() ? body.nodeId.trim() : null;

    if (action === "get") {
      const { template, versionId } = await loadTemplate(admin, templateId);
      const videoOutputs: Array<{ id: string; name: string }> = [];
      if (versionId) {
        const { nodes } = await loadGraph(admin, versionId);
        for (const node of nodes) {
          if (String(node.node_type ?? "") === "video_gen") {
            videoOutputs.push({ id: String(node.id), name: String(node.name ?? "Video output") });
          }
        }
      }
      return json({
        templateId,
        activeVersionId: versionId,
        freePreviewEnabled: template.free_preview_enabled === true,
        activationVideoNodeId: template.activation_video_node_id
          ? String(template.activation_video_node_id)
          : null,
        videoOutputs,
      });
    }

    if (action === "validate") {
      if (!nodeId) throw new Error("nodeId is required");
      return json(await validate(admin, templateId, nodeId));
    }

    if (action === "enable") {
      if (!nodeId) throw new Error("nodeId is required");
      const validation = await validate(admin, templateId, nodeId);
      if (!validation.valid) {
        return json({ enabled: false, reason: validation.reason, validation });
      }
      const { error } = await admin
        .from("fuse_templates")
        .update({ free_preview_enabled: true, activation_video_node_id: nodeId })
        .eq("id", templateId);
      if (error) throw new Error(error.message);
      return json({ enabled: true, reason: null, activationVideoNodeId: nodeId, validation });
    }

    if (action === "disable") {
      const { error } = await admin
        .from("fuse_templates")
        .update({ free_preview_enabled: false, activation_video_node_id: null })
        .eq("id", templateId);
      if (error) throw new Error(error.message);
      return json({ enabled: false, reason: null, activationVideoNodeId: null });
    }

    throw new Error("Unsupported action");
  } catch (error) {
    const message = errorMessage(error);
    const status = /admin access required|authentication|authorization|bearer/i.test(message) ? 403 : 400;
    return json({ error: message }, status);
  }
});
