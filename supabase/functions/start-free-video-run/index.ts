import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  getUserRoles,
  json,
  logAuditEvent,
  requireUser,
} from "../_shared/supabase-admin.ts";
import { runGraphJob } from "../_shared/executor.ts";
import { buildTemplateInputPlan } from "../_shared/template-inputs.ts";
import { resolveRegenerationSubgraphFromGraph } from "../_shared/regeneration.ts";
import {
  FREE_RUN_MODE,
  FREE_RUN_MODE_KEY,
  FREE_VIDEO_ENTITLEMENT_TYPE,
  FREE_VIDEO_META_KEY,
} from "../_shared/free-video.ts";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

class FreeVideoError extends Error {
  constructor(message: string, readonly status = 400, readonly code = "FREE_VIDEO_ERROR") {
    super(message);
  }
}

type Body = {
  templateId?: string;
  inputs?: Record<string, string>;
  inputFiles?: Record<string, { dataUrl: string; filename?: string }>;
  attribution?: Record<string, unknown>;
};

type VersionNode = {
  id: string;
  name: string;
  node_type?: string | null;
  prompt_config?: Record<string, unknown> | null;
  default_asset_id?: string | null;
};

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new FreeVideoError("Invalid image payload");
  const [, contentType, base64] = match;
  const extension = contentType.includes("png")
    ? "png"
    : contentType.includes("jpeg") || contentType.includes("jpg")
    ? "jpg"
    : contentType.includes("webp")
    ? "webp"
    : "bin";
  return {
    contentType,
    extension,
    bytes: Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)),
  };
}

/** Same private bucket + path convention as start-template-run. */
async function uploadInputFiles(
  admin: ReturnType<typeof createAdminClient>,
  jobId: string,
  inputFiles: Body["inputFiles"],
) {
  const uploadedInputs: Record<string, string> = {};
  for (const [nodeName, file] of Object.entries(inputFiles ?? {})) {
    const { bytes, contentType, extension } = parseDataUrl(file.dataUrl);
    const safeName = (file.filename ?? nodeName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "input";
    const storagePath = `system/lab-inputs/${jobId}/${safeName}.${extension}`;
    const { error: uploadError } = await admin.storage
      .from("fuse-assets")
      .upload(storagePath, bytes, { upsert: true, contentType });
    if (uploadError) throw new Error(uploadError.message);
    uploadedInputs[nodeName] =
      `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/fuse-assets/${storagePath}`;
  }
  return uploadedInputs;
}

/** Mirrors start-template-run input fan-out so inputs land on the same nodes. */
function expandInputsForTemplate(args: {
  templateName: string;
  inputNodes: VersionNode[];
  suppliedInputs: Record<string, string>;
}) {
  const finalInputs: Record<string, string> = {};
  const plan = buildTemplateInputPlan(args.templateName, args.inputNodes);
  const mappedNodeIds = new Set<string>();
  const userFacingNodeIds = new Set(plan.slots.flatMap((slot) => slot.nodeIds));
  const implicitReferenceNodeIds = new Set(plan.implicitReferenceNodeIds);

  for (const slot of plan.slots) {
    const value = args.suppliedInputs[slot.id] ?? args.suppliedInputs[slot.name];
    if (!value) continue;
    for (const nodeId of slot.nodeIds) {
      finalInputs[nodeId] = value;
      mappedNodeIds.add(nodeId);
    }
  }

  for (const node of args.inputNodes) {
    const directValue = args.suppliedInputs[node.id] ?? args.suppliedInputs[node.name];
    if (directValue) {
      finalInputs[node.id] = directValue;
      mappedNodeIds.add(node.id);
      continue;
    }
    if (mappedNodeIds.has(node.id)) continue;
    if (userFacingNodeIds.has(node.id)) continue;
    if (!implicitReferenceNodeIds.has(node.id)) continue;
    const sampleUrl = typeof node.prompt_config?.sample_url === "string"
      ? node.prompt_config.sample_url
      : null;
    if (sampleUrl) finalInputs[node.id] = sampleUrl;
  }

  return finalInputs;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const admin = createAdminClient();
  const requestId = crypto.randomUUID();
  let reservedEntitlementId: string | null = null;

  try {
    const user = await requireUser(req, admin);

    // (a) EMAIL VERIFICATION GATE — server-authoritative, read from auth admin API.
    const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(user.id);
    if (authUserError) throw new Error(authUserError.message);
    if (!authUser?.user?.email_confirmed_at) {
      throw new FreeVideoError("Email verification required", 403, "EMAIL_NOT_VERIFIED");
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const requestedTemplate = typeof body.templateId === "string" ? body.templateId.trim() : "";
    if (!requestedTemplate) throw new FreeVideoError("templateId is required");

    // (b) TEMPLATE GATE — free preview must be explicitly enabled with a target node.
    // The gate may pass a template NAME or the canonical uuid; resolve both.
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      requestedTemplate,
    );
    const templateQuery = admin
      .from("fuse_templates")
      .select("id, name, free_preview_enabled, activation_video_node_id");
    const { data: template, error: templateError } = await (isUuid
      ? templateQuery.eq("id", requestedTemplate)
      : templateQuery.ilike("name", requestedTemplate)
    ).maybeSingle();
    if (templateError) throw new Error(templateError.message);
    if (!template || (template as any).free_preview_enabled !== true || !(template as any).activation_video_node_id) {
      throw new FreeVideoError("Free video not available for this template", 400, "FREE_VIDEO_UNAVAILABLE");
    }
    const templateId = String((template as any).id);
    const targetNodeId = String((template as any).activation_video_node_id);
    const templateName = String((template as any).name ?? "");

    const { data: version, error: versionError } = await admin
      .from("template_versions")
      .select("id, template_id")
      .eq("template_id", templateId)
      .eq("is_active", true)
      .maybeSingle();
    if (versionError) throw new Error(versionError.message);
    if (!version) throw new FreeVideoError("Free video not available for this template", 400, "FREE_VIDEO_UNAVAILABLE");

    // (c) ELIGIBILITY — creators are excluded from the customer activation grant.
    const roles = await getUserRoles(user.id, admin);
    if (roles.includes("creator")) {
      throw new FreeVideoError("Free video not available for creator accounts", 403, "FREE_VIDEO_INELIGIBLE");
    }

    const { data: existing, error: existingError } = await admin
      .from("free_video_entitlements")
      .select("id, status, selected_template_id, generation_job_id")
      .eq("user_id", user.id)
      .eq("entitlement_type", FREE_VIDEO_ENTITLEMENT_TYPE)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    if (existing?.status === "consumed") {
      throw new FreeVideoError("Free video already used", 403, "FREE_VIDEO_USED");
    }

    if (!existing) {
      const { error: insertError } = await admin
        .from("free_video_entitlements")
        .insert({
          user_id: user.id,
          entitlement_type: FREE_VIDEO_ENTITLEMENT_TYPE,
          selected_template_id: templateId,
          selected_preview_output_id: targetNodeId,
          status: "available",
          attribution: body.attribution ?? {},
        });
      // A racing tab may have inserted first — the unique constraint is the gate.
      if (insertError && !/duplicate key|unique/i.test(insertError.message)) {
        throw new Error(insertError.message);
      }
    } else {
      await admin
        .from("free_video_entitlements")
        .update({
          selected_template_id: templateId,
          selected_preview_output_id: targetNodeId,
          ...(body.attribution ? { attribution: body.attribution } : {}),
        })
        .eq("id", existing.id)
        .eq("status", "available");
    }

    // (d) ATOMIC RESERVATION — only the writer that flips available->reserved runs.
    const { data: reserved, error: reserveError } = await admin
      .from("free_video_entitlements")
      .update({ status: "reserved", reserved_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("entitlement_type", FREE_VIDEO_ENTITLEMENT_TYPE)
      .eq("status", "available")
      .select("id")
      .maybeSingle();
    if (reserveError) throw new Error(reserveError.message);
    if (!reserved?.id) {
      throw new FreeVideoError(
        "Free generation already in progress or used",
        409,
        "FREE_VIDEO_LOCKED",
      );
    }
    reservedEntitlementId = String(reserved.id);

    // ---- everything below is inside the reservation: restore on failure ----
    const [nodesResult, edgesResult] = await Promise.all([
      admin.from("nodes").select("id, name, node_type, prompt_config, default_asset_id").eq("version_id", version.id),
      admin.from("edges").select("source_node_id, target_node_id").eq("version_id", version.id),
    ]);
    if (nodesResult.error) throw new Error(nodesResult.error.message);
    if (edgesResult.error) throw new Error(edgesResult.error.message);

    const allNodes = (nodesResult.data ?? []) as VersionNode[];
    const allEdges = (edgesResult.data ?? []) as Array<{ source_node_id: string; target_node_id: string }>;
    if (!allNodes.some((node) => node.id === targetNodeId)) {
      throw new FreeVideoError("Free video not available for this template", 400, "FREE_VIDEO_UNAVAILABLE");
    }

    const inputNodes = allNodes.filter((node) => node.node_type === "user_input");
    const targetNodeIds = new Set(allEdges.map((edge) => edge.target_node_id).filter(Boolean));
    const executionNodes = allNodes.filter((node) =>
      node.node_type !== "user_input" && node.node_type !== "prompt" && targetNodeIds.has(node.id)
    );
    if (!executionNodes.length) throw new Error("Template version has no connected execution nodes");

    // (f) SINGLE-OUTPUT EXECUTION — same resolver as per-output regeneration.
    const estimate = resolveRegenerationSubgraphFromGraph({
      nodes: allNodes,
      edges: allEdges,
      steps: [],
      target: { nodeId: targetNodeId },
    });
    const toRun = new Set(estimate.toRunNodeIds.map(String));

    // (e) JOB — tagged with the free run mode that drives waiver + royalty exclusion.
    const { data: job, error: jobError } = await admin
      .from("execution_jobs")
      .insert({
        user_id: user.id,
        template_id: templateId,
        version_id: version.id,
        status: "queued",
        progress: 0,
        input_payload: {},
        result_payload: {},
      })
      .select("id")
      .single();
    if (jobError || !job) throw new Error(jobError?.message ?? "Failed to create job");

    const uploadedInputs = await uploadInputFiles(admin, job.id, body.inputFiles);
    const finalInputs = expandInputsForTemplate({
      templateName,
      inputNodes,
      suppliedInputs: { ...uploadedInputs, ...(body.inputs ?? {}) },
    });

    // (g)+(i) promotional waiver marker + internal cost accounting. No wallet debit.
    const freeVideoMeta = {
      promotional: true,
      entitlement_id: reservedEntitlementId,
      entitlement_type: FREE_VIDEO_ENTITLEMENT_TYPE,
      template_id: templateId,
      template_name: templateName,
      version_id: version.id,
      selected_output_node_id: targetNodeId,
      charged_credits: 0,
      internal_estimated_credits: estimate.estimatedCredits,
      internal_node_breakdown: {
        imageNodes: estimate.breakdown.imageNodes,
        videoNodes: estimate.breakdown.videoNodes,
        toRunNodeIds: estimate.toRunNodeIds,
      },
      attribution: body.attribution ?? {},
      request_id: requestId,
    };

    const { error: inputUpdateError } = await admin
      .from("execution_jobs")
      .update({
        input_payload: {
          ...finalInputs,
          [FREE_RUN_MODE_KEY]: FREE_RUN_MODE,
          [FREE_VIDEO_META_KEY]: freeVideoMeta,
        },
      })
      .eq("id", job.id);
    if (inputUpdateError) throw new Error(inputUpdateError.message);

    // Best-effort promotional marker on the job row itself (column may not exist).
    await admin
      .from("execution_jobs")
      .update({ charged_credits: 0 })
      .eq("id", job.id)
      .then((result: any) => {
        if (result?.error) {
          console.warn(`[free-video] charged_credits marker skipped: ${result.error.message}`);
        }
      });

    const { error: stepsError } = await admin
      .from("execution_steps")
      .insert(executionNodes.map((node) => ({
        job_id: job.id,
        node_id: node.id,
        status: "pending",
        input_payload: {},
        output_payload: {},
      })));
    if (stepsError) throw new Error(stepsError.message);

    // Everything outside the minimal subgraph is a completed no-op: the full
    // campaign must NOT execute for a free activation run.
    const skipNodeIds = executionNodes
      .map((node) => node.id)
      .filter((nodeId) => !toRun.has(String(nodeId)));
    if (skipNodeIds.length) {
      const completedAt = new Date().toISOString();
      const { error: skipError } = await admin
        .from("execution_steps")
        .update({
          status: "complete",
          completed_at: completedAt,
          execution_time_ms: 0,
          error_log: null,
          output_payload: {
            status: "skipped",
            rawPayload: { detail: "Skipped — outside free first video subgraph" },
          },
        })
        .eq("job_id", job.id)
        .in("node_id", skipNodeIds);
      if (skipError) throw new Error(skipError.message);
    }

    // (h) bind the entitlement to this job.
    const { error: linkError } = await admin
      .from("free_video_entitlements")
      .update({ generation_job_id: job.id })
      .eq("id", reservedEntitlementId);
    if (linkError) throw new Error(linkError.message);

    EdgeRuntime.waitUntil((async () => {
      try {
        await runGraphJob(admin, job.id);
      } catch (error) {
        const message = errorMessage(error);
        await admin
          .from("execution_jobs")
          .update({ status: "failed", error_log: message, completed_at: new Date().toISOString() })
          .eq("id", job.id);
        // Terminal failure restores the grant (reserved -> available).
        await admin
          .from("free_video_entitlements")
          .update({ status: "available", reserved_at: null })
          .eq("generation_job_id", job.id)
          .eq("status", "reserved");
      }
    })());

    await logAuditEvent({
      eventType: "free_video.run.started",
      message: `Free first video queued for ${templateName || templateId}.`,
      source: "template-runner",
      requestId,
      jobId: job.id,
      templateId,
      versionId: version.id,
      metadata: { user_id: user.id, ...freeVideoMeta },
    }, admin);

    return json({
      jobId: job.id,
      status: "queued",
      free: true,
      credits: 0,
      selectedOutputNodeId: targetNodeId,
    }, 202);
  } catch (error) {
    // Any failure after reservation must hand the free video back.
    if (reservedEntitlementId) {
      await admin
        .from("free_video_entitlements")
        .update({ status: "available", reserved_at: null })
        .eq("id", reservedEntitlementId)
        .eq("status", "reserved");
    }
    if (error instanceof FreeVideoError) {
      return json({ error: error.message, code: error.code }, error.status);
    }
    return json({ error: errorMessage(error) }, 400);
  }
});
