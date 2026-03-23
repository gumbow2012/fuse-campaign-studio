import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { corsHeaders, createAdminClient, errorMessage, hasValidRunnerCode, json, requireTesterUser } from "../_shared/supabase-admin.ts";
import { buildTemplateInputPlan } from "../_shared/template-inputs.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const admin = createAdminClient();
  const runnerAccess = hasValidRunnerCode(req);

  try {
    if (!runnerAccess) {
      await requireTesterUser(req, admin);
    }

    const { data: templates, error: templateError } = await admin
      .from("fuse_templates")
      .select("id, name");
    if (templateError) throw new Error(templateError.message);

    const { data: versions, error: versionError } = await admin
      .from("template_versions")
      .select("id, template_id, version_number")
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

    const templateMap = new Map((templates ?? []).map((template: any) => [template.id, template]));

    const catalog = (versions ?? [])
      .map((version: any) => {
        const template = templateMap.get(version.template_id);
        const versionNodes = (nodes ?? []).filter((node: any) => node.version_id === version.id);
        const inputNodes = versionNodes.filter((node: any) => node.node_type === "user_input");
        const inputPlan = buildTemplateInputPlan(template?.name ?? "", inputNodes);

        return {
          templateId: version.template_id,
          templateName: template?.name ?? "Untitled Template",
          versionId: version.id,
          versionNumber: version.version_number,
          counts: {
            inputs: inputPlan.slots.length,
            imageSteps: versionNodes.filter((node: any) => node.node_type === "image_gen").length,
            videoSteps: versionNodes.filter((node: any) => node.node_type === "video_gen").length,
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
