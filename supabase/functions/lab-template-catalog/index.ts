import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { corsHeaders, createAdminClient, errorMessage, json } from "../_shared/supabase-admin.ts";
import { buildTemplateInputPlan } from "../_shared/template-inputs.ts";
import { getTemplateCreditCost } from "../_shared/template-pricing.ts";

function parseOutputExposed(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true";
  return null;
}

function mediaTypeFromUrl(url: string | null | undefined) {
  if (!url) return null;
  return /\.(mp4|mov|webm)(\?|$)/i.test(url) ? "video" : "image";
}

const VIDEO_FIRST_COVER_TEMPLATES = new Set([
  "amazon guy",
  "blue lab",
  "gas station",
  "jeans",
  "paparazzi",
  "ugc mirror",
  "unboxing",
]);

const CURATED_TEMPLATE_COVERS = new Map<string, { url: string; type: "image" | "video" }>([
  [
    "amazon guy",
    {
      url: "https://ykrrwgkxgidoavtzcumk.supabase.co/storage/v1/object/public/fuse-assets/system/jobs/91bed503-70b5-4fa0-905d-405c8af5b392/67da8716-4d44-4712-92e5-a99548274ea7.mp4",
      type: "video",
    },
  ],
  [
    "gas station",
    {
      url: "https://ykrrwgkxgidoavtzcumk.supabase.co/storage/v1/object/public/fuse-assets/system/jobs/3e7cf01e-9147-4c67-aee6-030d70650045/d938e459-0d37-4b23-b1a5-c63dbaf09702.mp4",
      type: "video",
    },
  ],
  [
    "jeans",
    {
      url: "https://ykrrwgkxgidoavtzcumk.supabase.co/storage/v1/object/public/fuse-assets/system/jobs/52f214f5-a932-4307-a3cd-18009e349318/b4842a5d-5ab4-4c6a-bf41-02d81d3b20fd.mp4",
      type: "video",
    },
  ],
]);

function shouldPreferVideoCover(templateName: string | null | undefined) {
  return VIDEO_FIRST_COVER_TEMPLATES.has(String(templateName ?? "").trim().toLowerCase());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const admin = createAdminClient();

  try {
    const { data: templates, error: templateError } = await admin
      .from("fuse_templates")
      .select("id, name");
    if (templateError) throw new Error(templateError.message);

    const { data: versions, error: versionError } = await admin
      .from("template_versions")
      .select("id, template_id, version_number, review_status")
      .eq("is_active", true);
    if (versionError) throw new Error(versionError.message);

    const versionIds = (versions ?? []).map((version: any) => version.id);
    const { data: nodes, error: nodeError } = versionIds.length
      ? await admin
          .from("nodes")
          .select("id, version_id, name, node_type, prompt_config, default_asset_id")
          .in("version_id", versionIds)
      : { data: [], error: null };
    if (nodeError) throw new Error(nodeError.message);

    const { data: recentJobs, error: recentJobsError } = versionIds.length
      ? await admin
          .from("execution_jobs")
          .select("id, version_id, started_at")
          .in("version_id", versionIds)
          .eq("status", "complete")
          .order("started_at", { ascending: false })
          .limit(250)
      : { data: [], error: null };
    if (recentJobsError) throw new Error(recentJobsError.message);

    const recentJobIds = (recentJobs ?? []).map((job: any) => job.id);
    const { data: outputSteps, error: outputStepError } = recentJobIds.length
      ? await admin
          .from("execution_steps")
          .select("id, job_id, node_id, created_at, nodes!execution_steps_node_id_fkey(node_type), assets!execution_steps_output_asset_id_fkey(supabase_storage_url)")
          .in("job_id", recentJobIds)
          .not("output_asset_id", "is", null)
          .order("created_at", { ascending: true })
      : { data: [], error: null };
    if (outputStepError) throw new Error(outputStepError.message);

    const templateMap = new Map((templates ?? []).map((template: any) => [template.id, template]));
    const nodeById = new Map((nodes ?? []).map((node: any) => [node.id, node]));
    const jobsByVersionId = new Map<string, any[]>();
    for (const job of recentJobs ?? []) {
      const list = jobsByVersionId.get(job.version_id) ?? [];
      list.push(job);
      jobsByVersionId.set(job.version_id, list);
    }

    const stepsByJobId = new Map<string, any[]>();
    for (const step of outputSteps ?? []) {
      const list = stepsByJobId.get(step.job_id) ?? [];
      list.push(step);
      stepsByJobId.set(step.job_id, list);
    }

    const resolveCoverForVersion = (versionId: string, templateName: string | null | undefined) => {
      const curated = CURATED_TEMPLATE_COVERS.get(String(templateName ?? "").trim().toLowerCase());
      if (curated) return curated;

      for (const job of jobsByVersionId.get(versionId) ?? []) {
        const steps = stepsByJobId.get(job.id) ?? [];
        const stepsWithUrls = steps
          .map((step: any) => {
            const node = nodeById.get(step.node_id) as any;
            return {
              url: step.assets?.supabase_storage_url ?? null,
              nodeType: step.nodes?.node_type ?? node?.node_type ?? null,
              outputExposed: parseOutputExposed(node?.prompt_config?.output_exposed),
            };
          })
          .filter((step) => step.url);

        if (!stepsWithUrls.length) continue;

        const hasExplicitOutputFlags = stepsWithUrls.some((step) => step.outputExposed !== null);
        const eligible = hasExplicitOutputFlags
          ? stepsWithUrls.filter((step) => step.outputExposed === true)
          : stepsWithUrls;

        const preferVideo = shouldPreferVideoCover(templateName);
        const candidates = preferVideo
          ? [
              eligible.find((step) => step.nodeType === "video_gen"),
              stepsWithUrls.find((step) => step.nodeType === "video_gen"),
              eligible.find((step) => step.nodeType === "image_gen"),
              stepsWithUrls.find((step) => step.nodeType === "image_gen"),
              eligible[0],
              stepsWithUrls[0],
            ]
          : [
              eligible.find((step) => step.nodeType === "image_gen"),
              eligible.find((step) => step.nodeType === "video_gen"),
              stepsWithUrls.find((step) => step.nodeType === "image_gen"),
              stepsWithUrls.find((step) => step.nodeType === "video_gen"),
              eligible[0],
              stepsWithUrls[0],
            ];
        const cover = candidates.find(Boolean);
        if (cover?.url) {
          return {
            url: cover.url,
            type: mediaTypeFromUrl(cover.url) ?? (cover.nodeType === "video_gen" ? "video" : "image"),
          };
        }
      }

      return { url: null, type: null };
    };

    const catalog = (versions ?? [])
      .map((version: any) => {
        const template = templateMap.get(version.template_id);
        const versionNodes = (nodes ?? []).filter((node: any) => node.version_id === version.id);
        const inputNodes = versionNodes.filter((node: any) => node.node_type === "user_input");
        const inputPlan = buildTemplateInputPlan(template?.name ?? "", inputNodes);
        const imageNodes = versionNodes.filter((node: any) => node.node_type === "image_gen");
        const videoNodes = versionNodes.filter((node: any) => node.node_type === "video_gen");
        const imageFlags = imageNodes.map((node: any) => parseOutputExposed(node.prompt_config?.output_exposed));
        const videoFlags = videoNodes.map((node: any) => parseOutputExposed(node.prompt_config?.output_exposed));
        const hasExplicitImageFlags = imageFlags.some((flag) => flag !== null);
        const hasExplicitVideoFlags = videoFlags.some((flag) => flag !== null);
        const cover = resolveCoverForVersion(version.id, template?.name);

        const counts = {
          imageOutputs: hasExplicitImageFlags
            ? imageNodes.filter((node: any) => parseOutputExposed(node.prompt_config?.output_exposed) === true).length
            : imageNodes.length,
          videoOutputs: hasExplicitVideoFlags
            ? videoNodes.filter((node: any) => parseOutputExposed(node.prompt_config?.output_exposed) === true).length
            : videoNodes.length,
        };

        return {
          templateId: version.template_id,
          templateName: template?.name ?? "Untitled Template",
          versionId: version.id,
          versionNumber: version.version_number,
          reviewStatus: version.review_status ?? "Unreviewed",
          previewUrl: cover.url,
          previewAssetType: cover.type,
          estimatedCreditsPerRun: getTemplateCreditCost(template?.name, counts),
          counts: {
            inputs: inputPlan.slots.length,
            imageOutputs: counts.imageOutputs,
            videoOutputs: counts.videoOutputs,
          },
          inputs: inputPlan.slots.map((slot) => ({
            id: slot.id,
            name: slot.name,
            expected: slot.expected,
            defaultAssetUrl: null,
          })),
        };
      })
      .sort((a, b) => a.templateName.localeCompare(b.templateName));

    return json({ templates: catalog });
  } catch (error) {
    return json({ error: errorMessage(error) }, 400);
  }
});
