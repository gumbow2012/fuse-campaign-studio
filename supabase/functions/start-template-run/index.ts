import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  getOptionalUser,
  hasValidRunnerCode,
  json,
  requireTesterUser,
} from "../_shared/supabase-admin.ts";
import { PAPARAZZI_VERSION_ID, runGraphJob } from "../_shared/executor.ts";
import { buildTemplateInputPlan } from "../_shared/template-inputs.ts";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

type StartTemplateRunBody = {
  templateId?: string;
  versionId?: string;
  inputs?: Record<string, string>;
  inputFiles?: Record<string, { dataUrl: string; filename?: string }>;
};

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

  try {
    const runnerAccess = hasValidRunnerCode(req);
    const user = runnerAccess ? await getOptionalUser(req, admin) : await requireTesterUser(req, admin);
    if (!user && !runnerAccess) throw new Error("Authentication required");

    const body = await req.json() as StartTemplateRunBody;

    const versionId = body.versionId ?? PAPARAZZI_VERSION_ID;
    const inputs = { ...(body.inputs ?? {}) };

    const { data: version, error: versionError } = await admin
      .from("template_versions")
      .select("id, template_id, fuse_templates!inner(name)")
      .eq("id", versionId)
      .single();
    if (versionError || !version) throw new Error(versionError?.message ?? "Version not found");

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

    const uploadedInputs = await uploadInputFiles(admin, job.id, body.inputFiles);

    const { data: inputNodes, error: inputNodesError } = await admin
      .from("nodes")
      .select("id, name, prompt_config, default_asset_id")
      .eq("version_id", version.id)
      .eq("node_type", "user_input");
    if (inputNodesError) throw new Error(inputNodesError.message);

    const finalInputs = expandInputsForTemplate({
      templateName: (version as any).fuse_templates.name,
      inputNodes: inputNodes ?? [],
      suppliedInputs: { ...uploadedInputs, ...inputs },
    });

    const { error: inputUpdateError } = await admin
      .from("execution_jobs")
      .update({
        input_payload: finalInputs,
      })
      .eq("id", job.id);
    if (inputUpdateError) throw new Error(inputUpdateError.message);

    const { data: nodes, error: nodesError } = await admin
      .from("nodes")
      .select("id, node_type")
      .eq("version_id", version.id)
      .neq("node_type", "user_input");
    if (nodesError || !nodes) throw new Error(nodesError?.message ?? "Failed to load execution nodes");

    const { error: stepsError } = await admin
      .from("execution_steps")
      .insert(nodes.map((node: any) => ({
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
      }
    })());

    return json({ jobId: job.id, status: "queued" }, 202);
  } catch (error) {
    return json({ error: errorMessage(error) }, 400);
  }
});
