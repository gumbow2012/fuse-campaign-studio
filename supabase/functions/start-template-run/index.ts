import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  getOptionalUser,
  getUserRoles,
  hasValidRunnerCode,
  json,
  logAuditEvent,
  requireUser,
} from "../_shared/supabase-admin.ts";
import { PAPARAZZI_VERSION_ID, refundJobCreditsIfNeeded, runGraphJob } from "../_shared/executor.ts";
import { buildTemplateInputPlan } from "../_shared/template-inputs.ts";
import {
  avatarIdentityImage,
  CAST_RUNTIME_KEY,
  CastConfigurationError,
  validateCastSelection,
  type CastRuntime,
} from "../_shared/cast.ts";
import { countTemplateDeliverables, getTemplateCreditCost } from "../_shared/template-pricing.ts";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

type StartTemplateRunBody = {
  templateId?: string;
  versionId?: string;
  inputs?: Record<string, string>;
  inputFiles?: Record<string, { dataUrl: string; filename?: string }>;
  /** FT10 — optional cast selection, e.g. { cast_a: avatarId }. */
  cast?: Record<string, string>;
};

type VersionNode = {
  id: string;
  name: string;
  node_type?: string | null;
  prompt_config?: Record<string, unknown> | null;
  default_asset_id?: string | null;
};

type VersionEdge = {
  source_node_id: string;
  target_node_id: string;
};

function getVersionTemplateName(version: { fuse_templates?: unknown }) {
  const relation = version.fuse_templates;
  const template = Array.isArray(relation) ? relation[0] : relation;
  if (!template || typeof template !== "object" || !("name" in template)) {
    return "Untitled Template";
  }
  return String((template as { name?: unknown }).name ?? "Untitled Template");
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image payload");

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

async function uploadInputFiles(
  admin: ReturnType<typeof createAdminClient>,
  jobId: string,
  inputFiles: StartTemplateRunBody["inputFiles"],
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
      .upload(storagePath, bytes, {
        upsert: true,
        contentType,
      });
    if (uploadError) throw new Error(uploadError.message);

    uploadedInputs[nodeName] =
      `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/fuse-assets/${storagePath}`;
  }

  return uploadedInputs;
}

function expandInputsForTemplate(args: {
  templateName: string;
  inputNodes: Array<{
    id: string;
    name: string;
    prompt_config?: Record<string, unknown> | null;
    default_asset_id?: string | null;
  }>;
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
    if (sampleUrl) {
      finalInputs[node.id] = sampleUrl;
    }
  }

  return finalInputs;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const admin = createAdminClient();
  const requestId = crypto.randomUUID();
  let userId: string | null = null;
  let templateId: string | null = null;
  let versionId: string | null = null;
  let jobId: string | null = null;
  let chargedCredits = 0;

  try {
    const runnerAccess = hasValidRunnerCode(req);
    const user = runnerAccess ? await getOptionalUser(req, admin) : await requireUser(req, admin);
    if (!user && !runnerAccess) throw new Error("Authentication required");
    userId = user?.id ?? null;

    const body = await req.json() as StartTemplateRunBody;

    versionId = body.versionId ?? PAPARAZZI_VERSION_ID;
    const inputs = { ...(body.inputs ?? {}) };

    const { data: version, error: versionError } = await admin
      .from("template_versions")
      .select("id, template_id, cast_config, fuse_templates!inner(name)")
      .eq("id", versionId)
      .single();
    if (versionError || !version) throw new Error(versionError?.message ?? "Version not found");
    templateId = version.template_id;

    const { data: versionNodes, error: versionNodesError } = await admin
      .from("nodes")
      .select("id, name, node_type, prompt_config, default_asset_id")
      .eq("version_id", version.id);
    if (versionNodesError) throw new Error(versionNodesError.message);

    const allVersionNodes = (versionNodes ?? []) as VersionNode[];
    const inputNodes = allVersionNodes.filter((node) => node.node_type === "user_input");

    const { data: versionEdges, error: versionEdgesError } = await admin
      .from("edges")
      .select("source_node_id, target_node_id")
      .eq("version_id", version.id);
    if (versionEdgesError) throw new Error(versionEdgesError.message);

    const targetNodeIds = new Set(
      ((versionEdges ?? []) as VersionEdge[]).map((edge) => edge.target_node_id).filter(Boolean),
    );
    const orphanExecutionNodes = allVersionNodes.filter((node) =>
      node.node_type !== "user_input" && node.node_type !== "prompt" && !targetNodeIds.has(node.id)
    );
    const executionNodes = allVersionNodes.filter((node) =>
      node.node_type !== "user_input" && node.node_type !== "prompt" && targetNodeIds.has(node.id)
    );
    const deliverableCounts = countTemplateDeliverables(executionNodes);

    // FT10 — validate cast BEFORE any credit charge. No cast selection => legacy path.
    const castSelection = body.cast ?? null;
    const selectedAvatarIds = [
      ...new Set(Object.values(castSelection ?? {}).map((value) => String(value ?? "").trim()).filter(Boolean)),
    ];
    const avatarImages: Record<string, string | null> = {};
    if (selectedAvatarIds.length) {
      const { data: avatarRows, error: avatarError } = await admin
        .from("avatar_profiles")
        .select("id, thumbnail_url, reference_assets")
        .in("id", selectedAvatarIds);
      if (avatarError) throw new Error(avatarError.message);
      for (const row of avatarRows ?? []) {
        avatarImages[String((row as any).id)] = avatarIdentityImage(row);
      }
    }
    const castRuntime: CastRuntime | null = validateCastSelection({
      castConfigValue: (version as any).cast_config ?? null,
      selection: castSelection,
      avatarImages,
      versionNodeIds: new Set(allVersionNodes.map((node) => node.id)),
    });

    const userRoles = user ? await getUserRoles(user.id, admin) : [];
    const bypassCredits = runnerAccess || userRoles.some((role) => role === "admin" || role === "dev");
    const templateName = getVersionTemplateName(version);

    let creditCost = 0;
    if (user && !bypassCredits) {
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("subscription_status")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profileError) throw new Error(profileError.message);
      if (!profile) throw new Error("Profile not found");

      const subscriptionStatus = String(profile.subscription_status ?? "").toLowerCase();
      if (!["active", "trialing"].includes(subscriptionStatus)) {
        throw new Error("Active membership required before running templates.");
      }

      creditCost = getTemplateCreditCost(templateName, deliverableCounts);
    }

    const { data: job, error: jobError } = await admin
      .from("execution_jobs")
      .insert({
        user_id: user?.id ?? null,
        template_id: version.template_id,
        version_id: version.id,
        status: "queued",
        progress: 0,
        input_payload: {},
        result_payload: {},
      })
      .select()
      .single();
    if (jobError || !job) throw new Error(jobError?.message ?? "Failed to create job");
    jobId = job.id;

    const uploadedInputs = await uploadInputFiles(admin, job.id, body.inputFiles);

    const finalInputs = expandInputsForTemplate({
      templateName,
      inputNodes: inputNodes ?? [],
      suppliedInputs: { ...uploadedInputs, ...inputs },
    });

    const { error: inputUpdateError } = await admin
      .from("execution_jobs")
      .update({
        // MODE A carries the cast runtime alongside inputs; 0 extra provider calls,
        // 0 extra credits, run-cost calculation unchanged.
        input_payload: castRuntime ? { ...finalInputs, [CAST_RUNTIME_KEY]: castRuntime } : finalInputs,
      })
      .eq("id", job.id);
    if (inputUpdateError) throw new Error(inputUpdateError.message);

    if (user && !bypassCredits && creditCost > 0) {
      const { error: creditError } = await admin.rpc("apply_credit_transaction", {
        p_user_id: user.id,
        p_amount: -creditCost,
        p_type: "run_template",
        p_description: `Run template: ${templateName} (${job.id})`,
        p_template_id: version.template_id,
        p_project_id: null,
        p_step_id: null,
      });
      if (creditError) {
        await admin.from("execution_jobs").delete().eq("id", job.id);
        throw new Error(creditError.message);
      }
      chargedCredits = creditCost;
    }

    if (!executionNodes.length) throw new Error("Template version has no connected execution nodes");

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

    EdgeRuntime.waitUntil((async () => {
      try {
        await runGraphJob(admin, job.id);
      } catch (error) {
        const message = errorMessage(error);
        await admin
          .from("execution_jobs")
          .update({
            status: "failed",
            error_log: message,
            completed_at: new Date().toISOString(),
          })
          .eq("id", job.id);
        if (chargedCredits > 0) {
          await refundJobCreditsIfNeeded(admin, {
            jobId: job.id,
            reason: message,
            requestId,
          });
        }
      }
    })());

    await logAuditEvent({
      eventType: "template.run.started",
      message: `Template run queued for ${templateName}.`,
      source: "template-runner",
      requestId,
      jobId: job.id,
      templateId: version.template_id,
      versionId: version.id,
      metadata: {
        user_id: user?.id ?? null,
        bypass_credits: bypassCredits,
        credit_cost: creditCost,
        runner_access: runnerAccess,
        skipped_orphan_execution_node_ids: orphanExecutionNodes.map((node) => node.id),
      },
    }, admin);

    return json({ jobId: job.id, status: "queued" }, 202);
  } catch (error) {
    if (error instanceof CastConfigurationError) {
      // Fail closed before any provider submission or credit charge.
      return json({ error: error.code, detail: error.message }, 400);
    }
    const message = errorMessage(error);

    if (chargedCredits > 0 && jobId) {
      try {
        await refundJobCreditsIfNeeded(admin, {
          jobId,
          reason: message,
          requestId,
        });
      } catch (refundError) {
        await logAuditEvent({
          eventType: "template.run.refund_failed",
          message: errorMessage(refundError),
          severity: "error",
          source: "template-runner",
          requestId,
          jobId,
          templateId,
          versionId,
          errorCode: "template_run_refund_failed",
          metadata: {
            user_id: userId,
            original_error: message,
          },
        }, admin);
      }
    }

    await logAuditEvent({
      eventType: "template.run.failed_to_start",
      message,
      severity: "error",
      source: "template-runner",
      requestId,
      jobId,
      templateId,
      versionId,
      errorCode: "template_run_failed_to_start",
      metadata: {
        user_id: userId,
      },
    }, admin);

    return json({ error: message }, 400);
  }
});
