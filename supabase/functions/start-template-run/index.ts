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
import {
  buildStoredRunEconomics,
  resolveRunEconomics,
  RUN_ECONOMICS_KEY,
} from "../_shared/creatorSurcharge.ts";
import {
  assertRegenerationAccess,
  resolveRegenerationSubgraph,
} from "../_shared/regeneration.ts";
import {
  performOutputRegeneration,
  RegenerationError,
} from "../_shared/regeneration-run.ts";
import { assertForkOwnership, resolveForkEntitlement } from "../_shared/template-fork.ts";
import {
  buildForkRunMarker,
  compileForkEdges,
  compileForkNodes,
  findForkRunJob,
  forkInputsFromSourceJob,
  FORK_RUN_MARKER_KEY,
  ForkRunError,
  PERSONAL_FORK_REVIEW_STATUS,
} from "../_shared/fork-run.ts";

/** Private fork versions live in a high, non-colliding version_number band. */
const FORK_VERSION_NUMBER_BASE = 1_000_000;



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

/**
 * TR7 — per-output regeneration execution. Lives here because this function
 * already owns the credit-charge + run-kick pattern. The read-only
 * `regenerate-estimate` function stays read-only.
 */
async function handleRegenerateOutput(
  req: Request,
  admin: ReturnType<typeof createAdminClient>,
  body: Record<string, unknown>,
) {
  const user = await requireUser(req, admin);
  if (!user) throw new Error("Authentication required");

  const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
  if (!jobId) throw new Error("jobId is required");

  const hasOutputNumber = Number.isFinite(Number(body.outputNumber));
  const nodeId = typeof body.nodeId === "string" && body.nodeId.trim() ? body.nodeId.trim() : null;
  if (!hasOutputNumber && !nodeId) throw new Error("outputNumber or nodeId is required");

  const idempotencyKey = typeof body.idempotencyKey === "string" && body.idempotencyKey.trim()
    ? body.idempotencyKey.trim()
    : null;

  // Server-side resolve — any client-supplied cost is ignored entirely.
  const { job, estimate } = await resolveRegenerationSubgraph(admin, jobId, {
    nodeId,
    outputNumber: hasOutputNumber ? Number(body.outputNumber) : null,
  });

  const roles = await getUserRoles(user.id, admin);
  assertRegenerationAccess({ jobUserId: job.user_id, userId: user.id, roles });
  const privileged = roles.some((role) => role === "admin" || role === "dev");

  try {
    const result = await performOutputRegeneration(admin, {
      jobId: job.id,
      estimate,
      userId: user.id,
      privileged,
      idempotencyKey,
      runGraphJob: (client, id) => runGraphJob(client as never, id),
    });

    await logAuditEvent({
      eventType: "template.output.regenerated",
      message: `Regenerated output ${result.outputNumber ?? estimate.targetNodeId} (rev ${result.revision}).`,
      source: "template-runner",
      jobId: job.id,
      templateId: job.template_id,
      versionId: job.version_id,
      metadata: {
        user_id: user.id,
        privileged,
        idempotent: !!result.idempotent,
        credits: result.estimatedCredits,
        to_run_node_ids: result.toRunNodeIds,
      },
    }, admin);

    return json(result, 200);
  } catch (error) {
    if (error instanceof RegenerationError) {
      return json({ error: error.code, detail: error.message }, error.code === "INSUFFICIENT_CREDITS" ? 402 : 400);
    }
    throw error;
  }
}

/**
 * TR10 — run a Pro user's PRIVATE fork with full marketplace isolation.
 *
 * The fork is materialized into ONE reusable private template_versions row per
 * fork (is_active=false, review_status='personal_fork', fork_id=forkId). The
 * marketplace template, its active version, nodes and edges are never mutated.
 */
async function handleRunFork(
  req: Request,
  admin: ReturnType<typeof createAdminClient>,
  body: Record<string, unknown>,
  requestId: string,
) {
  const user = await requireUser(req, admin);
  if (!user) throw new ForkRunError("UNAUTHENTICATED", "Authentication required", 401);

  const forkId = typeof body.forkId === "string" ? body.forkId.trim() : "";
  if (!forkId) throw new ForkRunError("BAD_REQUEST", "forkId is required");
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
  const suppliedInputs = { ...(body.inputs as Record<string, string> | undefined ?? {}) };

  const roles = await getUserRoles(user.id, admin);

  const { data: fork, error: forkError } = await admin
    .from("template_user_forks")
    .select("id, user_id, name, source_template_id, source_version_id, personal_graph, prompt_visibility, source_job_id")
    .eq("id", forkId)
    .maybeSingle();
  if (forkError) throw new Error(forkError.message);
  if (!fork) throw new ForkRunError("FORK_NOT_FOUND", "Workflow not found", 404);

  // 1) Ownership + Pro entitlement re-check.
  try {
    assertForkOwnership({ forkUserId: String((fork as any).user_id), userId: user.id, roles });
  } catch {
    throw new ForkRunError("FORBIDDEN", "This workflow belongs to another account", 403);
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("plan, subscription_status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);

  const entitlement = resolveForkEntitlement({ plan: (profile as any)?.plan ?? null, roles });
  if (!entitlement.allowed) {
    throw new ForkRunError("PRO_REQUIRED", "Pro membership required to run personal workflows", 403);
  }

  const privileged = roles.some((role) => role === "admin" || role === "dev");
  const sourceTemplateId = String((fork as any).source_template_id);
  const sourceVersionId = String((fork as any).source_version_id);
  const promptVisibility = (fork as any).prompt_visibility === true;

  // 2) MATERIALIZE — pinned SOURCE version graph (read-only) + personal graph.
  const [sourceNodesResult, sourceEdgesResult, templateResult] = await Promise.all([
    admin.from("nodes").select("id, name, node_type, prompt_config, default_asset_id, model_id")
      .eq("version_id", sourceVersionId),
    admin.from("edges").select("source_node_id, target_node_id, mapping_logic")
      .eq("version_id", sourceVersionId),
    admin.from("fuse_templates").select("id, name").eq("id", sourceTemplateId).maybeSingle(),
  ]);
  if (sourceNodesResult.error) throw new Error(sourceNodesResult.error.message);
  if (sourceEdgesResult.error) throw new Error(sourceEdgesResult.error.message);
  if (templateResult.error) throw new Error(templateResult.error.message);

  const templateName = String((templateResult.data as any)?.name ?? "Untitled Template");
  const compiledNodes = await compileForkNodes({
    forkId,
    sourceNodes: (sourceNodesResult.data ?? []) as never,
    personalGraph: (fork as any).personal_graph,
    promptVisibility,
  });
  const compiledEdges = compileForkEdges((sourceEdgesResult.data ?? []) as never, compiledNodes);

  // Reuse ONE isolated private version per fork.
  const { data: existingVersion, error: existingVersionError } = await admin
    .from("template_versions")
    .select("id, version_number")
    .eq("fork_id", forkId)
    .maybeSingle();
  if (existingVersionError) throw new Error(existingVersionError.message);

  let forkVersionId = existingVersion?.id as string | undefined;
  if (!forkVersionId) {
    const { data: maxRow, error: maxError } = await admin
      .from("template_versions")
      .select("version_number")
      .eq("template_id", sourceTemplateId)
      .gte("version_number", FORK_VERSION_NUMBER_BASE)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxError) throw new Error(maxError.message);
    const nextVersionNumber = Math.max(
      FORK_VERSION_NUMBER_BASE,
      Number((maxRow as any)?.version_number ?? 0) + 1,
    );

    forkVersionId = crypto.randomUUID();
    const { error: createVersionError } = await admin
      .from("template_versions")
      .insert({
        id: forkVersionId,
        template_id: sourceTemplateId,
        version_number: nextVersionNumber,
        // ISOLATION: never active, never publishable.
        is_active: false,
        review_status: PERSONAL_FORK_REVIEW_STATUS,
        fork_id: forkId,
      });
    if (createVersionError) throw new Error(createVersionError.message);
  } else {
    // Defensive: keep the isolation flags pinned on every run.
    const { error: pinError } = await admin
      .from("template_versions")
      .update({ is_active: false, review_status: PERSONAL_FORK_REVIEW_STATUS, fork_id: forkId })
      .eq("id", forkVersionId);
    if (pinError) throw new Error(pinError.message);
  }

  // Replace the private version's graph (deterministic ids → upsert in place).
  const { error: nodeUpsertError } = await admin
    .from("nodes")
    .upsert(
      compiledNodes.map((node) => ({
        id: node.id,
        version_id: forkVersionId,
        name: node.name,
        node_type: node.node_type,
        prompt_config: node.prompt_config,
        default_asset_id: node.default_asset_id,
        model_id: node.model_id,
      })),
      { onConflict: "id" },
    );
  if (nodeUpsertError) throw new Error(nodeUpsertError.message);

  const { error: edgeDeleteError } = await admin.from("edges").delete().eq("version_id", forkVersionId);
  if (edgeDeleteError) throw new Error(edgeDeleteError.message);
  if (compiledEdges.length) {
    const { error: edgeInsertError } = await admin.from("edges").insert(
      compiledEdges.map((edge) => ({ ...edge, version_id: forkVersionId })),
    );
    if (edgeInsertError) throw new Error(edgeInsertError.message);
  }

  // 3) COST — recomputed from the COMPILED fork nodes (models may have changed).
  const targetNodeIds = new Set(compiledEdges.map((edge) => edge.target_node_id));
  const executionNodes = compiledNodes.filter((node) =>
    node.node_type !== "user_input" && node.node_type !== "prompt" && targetNodeIds.has(node.id)
  );
  if (!executionNodes.length) {
    throw new ForkRunError("EMPTY_GRAPH", "This workflow has no connected execution steps");
  }
  const deliverableCounts = countTemplateDeliverables(executionNodes);
  const baseCreditCost = privileged ? 0 : getTemplateCreditCost(templateName, deliverableCounts);

  // P5C — additive creator marketplace surcharge (base pricing unchanged).
  // Skipped for privileged runs and for creators running their own template.
  const forkEconomics = privileged ? null : await resolveRunEconomics(admin, sourceTemplateId);
  const storedEconomics = forkEconomics && forkEconomics.monetized && forkEconomics.creatorId !== user.id
    ? buildStoredRunEconomics(forkEconomics, baseCreditCost)
    : null;
  const creditCost = baseCreditCost + (storedEconomics?.surcharge_credits ?? 0);

  // Idempotency — a retry never charges or runs twice.
  if (idempotencyKey) {
    const { data: recentJobs, error: recentError } = await admin
      .from("execution_jobs")
      .select("id, input_payload")
      .eq("user_id", user.id)
      .eq("version_id", forkVersionId)
      .order("created_at", { ascending: false })
      .limit(25);
    if (recentError) throw new Error(recentError.message);
    const existingJob = findForkRunJob((recentJobs ?? []) as never, { forkId, idempotencyKey });
    if (existingJob) {
      return json({ jobId: existingJob.id, status: "queued", idempotent: true, credits: creditCost }, 200);
    }
  }

  // FREEMIUM: no membership precondition. The credit charge below
  // (apply_credit_transaction, refunded on failure) is the real gate.

  // 4) CHARGE + RUN — same charge/job/run path as a normal run.
  const inputNodes = compiledNodes.filter((node) => node.node_type === "user_input");

  // TR10b — when the client sends no inputs, reuse the assets from the run this
  // fork was created from. OWNER-SCOPED: the source job is only read when it
  // belongs to the authenticated fork owner (.eq("user_id", user.id)).
  let effectiveInputs = suppliedInputs;
  if (!Object.keys(effectiveInputs).length) {
    const sourceJobId = (fork as any).source_job_id
      ? String((fork as any).source_job_id)
      : "";
    if (!sourceJobId) {
      throw new ForkRunError(
        "INPUTS_REQUIRED",
        "Add your assets before running this workflow — there's no earlier run to reuse.",
      );
    }
    const { data: sourceJob, error: sourceJobError } = await admin
      .from("execution_jobs")
      .select("id, input_payload")
      .eq("id", sourceJobId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (sourceJobError) throw new Error(sourceJobError.message);
    if (!sourceJob) {
      throw new ForkRunError(
        "INPUTS_REQUIRED",
        "Add your assets before running this workflow — the original run is no longer available.",
      );
    }
    effectiveInputs = forkInputsFromSourceJob((sourceJob as any).input_payload);
    if (!Object.keys(effectiveInputs).length) {
      throw new ForkRunError(
        "INPUTS_REQUIRED",
        "Add your assets before running this workflow.",
      );
    }
  }

  const remappedInputs: Record<string, string> = { ...effectiveInputs };
  for (const node of inputNodes) {
    const value = effectiveInputs[node.source_node_id] ?? effectiveInputs[node.id] ??
      effectiveInputs[node.name];
    if (value) remappedInputs[node.id] = value;
  }

  const finalInputs = expandInputsForTemplate({
    templateName,
    inputNodes,
    suppliedInputs: remappedInputs,
  });

  const { data: job, error: jobError } = await admin
    .from("execution_jobs")
    .insert({
      user_id: user.id,
      template_id: sourceTemplateId,
      version_id: forkVersionId,
      status: "queued",
      progress: 0,
      input_payload: {
        ...finalInputs,
        [FORK_RUN_MARKER_KEY]: buildForkRunMarker({
          forkId,
          versionId: forkVersionId,
          sourceTemplateId,
          idempotencyKey: idempotencyKey || null,
          credits: creditCost,
        }),
        ...(storedEconomics ? { [RUN_ECONOMICS_KEY]: storedEconomics } : {}),
      },
      result_payload: {},
    })
    .select("id")
    .single();
  if (jobError || !job) throw new Error(jobError?.message ?? "Failed to create job");

  let chargedCredits = 0;
  if (!privileged && creditCost > 0) {
    const { error: creditError } = await admin.rpc("apply_credit_transaction", {
      p_user_id: user.id,
      p_amount: -creditCost,
      p_type: "run_template",
      p_description: `Run personal workflow: ${templateName} (${job.id})`,
      p_template_id: sourceTemplateId,
      p_project_id: null,
      p_step_id: null,
    });
    if (creditError) {
      await admin.from("execution_jobs").delete().eq("id", job.id);
      throw new ForkRunError("INSUFFICIENT_CREDITS", creditError.message, 402);
    }
    chargedCredits = creditCost;
  }

  const { error: stepsError } = await admin
    .from("execution_steps")
    .insert(executionNodes.map((node) => ({
      job_id: job.id,
      node_id: node.id,
      status: "pending",
      input_payload: {},
      output_payload: {},
    })));
  if (stepsError) {
    if (chargedCredits > 0) {
      await refundJobCreditsIfNeeded(admin, { jobId: job.id, reason: stepsError.message, requestId });
    }
    throw new Error(stepsError.message);
  }

  EdgeRuntime.waitUntil((async () => {
    try {
      await runGraphJob(admin, job.id);
    } catch (error) {
      const message = errorMessage(error);
      await admin
        .from("execution_jobs")
        .update({ status: "failed", error_log: message, completed_at: new Date().toISOString() })
        .eq("id", job.id);
      if (chargedCredits > 0) {
        await refundJobCreditsIfNeeded(admin, { jobId: job.id, reason: message, requestId });
      }
    }
  })());

  await logAuditEvent({
    eventType: "template.fork_run.started",
    message: `Personal workflow run queued for ${templateName}.`,
    source: "template-runner",
    requestId,
    jobId: job.id,
    templateId: sourceTemplateId,
    versionId: forkVersionId,
    metadata: {
      user_id: user.id,
      fork_id: forkId,
      prompt_visibility: promptVisibility,
      credit_cost: creditCost,
      privileged,
    },
  }, admin);

  return json({ jobId: job.id, status: "queued", credits: creditCost, forkRun: true }, 202);
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

  let rawBody: Record<string, unknown> = {};
  try {
    rawBody = (await req.json()) as Record<string, unknown>;
  } catch {
    rawBody = {};
  }

  if (String(rawBody.action ?? "") === "regenerate_output") {
    try {
      return await handleRegenerateOutput(req, admin, rawBody);
    } catch (error) {
      return json({ error: errorMessage(error) }, 400);
    }
  }

  if (String(rawBody.action ?? "") === "run_fork") {
    try {
      return await handleRunFork(req, admin, rawBody, requestId);
    } catch (error) {
      if (error instanceof ForkRunError) {
        return json({ error: error.message, code: error.code }, error.status);
      }
      return json({ error: errorMessage(error) }, 400);
    }
  }


  try {
    const runnerAccess = hasValidRunnerCode(req);
    const user = runnerAccess ? await getOptionalUser(req, admin) : await requireUser(req, admin);
    if (!user && !runnerAccess) throw new Error("Authentication required");
    userId = user?.id ?? null;

    const body = rawBody as StartTemplateRunBody;


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
    let baseCreditCost = 0;
    let storedEconomics: ReturnType<typeof buildStoredRunEconomics> = null;
    if (user && !bypassCredits) {
      // FREEMIUM: any signed-in user may run as long as they can afford it.
      // The credit charge (and refund-on-failure) below is the only gate.
      baseCreditCost = getTemplateCreditCost(templateName, deliverableCounts);
      creditCost = baseCreditCost;

      // P5C — creator marketplace surcharge. Base tier pricing is untouched;
      // the surcharge is additive and only applies to monetized templates that
      // the runner does not own.
      const economics = await resolveRunEconomics(admin, version.template_id);
      if (economics.monetized && economics.creatorId !== user.id) {
        storedEconomics = buildStoredRunEconomics(economics, baseCreditCost);
        creditCost = baseCreditCost + economics.surchargeCredits;
      }

      if (creditCost > 0) {
        const { data: balanceRow } = await admin
          .from("profiles")
          .select("credits_balance")
          .eq("user_id", user.id)
          .maybeSingle();
        const balance = Number((balanceRow as any)?.credits_balance ?? 0);
        if (balance < creditCost) {
          return json({
            error: "INSUFFICIENT_CREDITS",
            code: "INSUFFICIENT_CREDITS",
            required: creditCost,
            baseCredits: baseCreditCost,
            surchargeCredits: creditCost - baseCreditCost,
            balance,
          }, 402);
        }
      }
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

    const basePayload = castRuntime ? { ...finalInputs, [CAST_RUNTIME_KEY]: castRuntime } : finalInputs;
    const { error: inputUpdateError } = await admin
      .from("execution_jobs")
      .update({
        // MODE A carries the cast runtime alongside inputs; 0 extra provider calls,
        // 0 extra credits, run-cost calculation unchanged.
        // P5C stores the immutable economics snapshot used by finalize/refund.
        input_payload: storedEconomics
          ? { ...basePayload, [RUN_ECONOMICS_KEY]: storedEconomics }
          : basePayload,
      })
      .eq("id", job.id);
    if (inputUpdateError) throw new Error(inputUpdateError.message);

    if (user && !bypassCredits && creditCost > 0) {
      // ONE debit for base + marketplace surcharge.
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
        return json({
          error: "INSUFFICIENT_CREDITS",
          code: "INSUFFICIENT_CREDITS",
          required: creditCost,
          baseCredits: baseCreditCost,
          surchargeCredits: creditCost - baseCreditCost,
        }, 402);
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
