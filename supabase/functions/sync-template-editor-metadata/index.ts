import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  requireTesterUser,
} from "../_shared/supabase-admin.ts";
import { buildTemplateEditorSeed } from "../_shared/template-editor.ts";

type Body = {
  versionId?: string;
  force?: boolean;
};

function hasEditorMetadata(promptConfig: Record<string, unknown> | null | undefined) {
  return !!(
    promptConfig?.editor_mode ||
    promptConfig?.editor_label ||
    promptConfig?.editor_slot_key ||
    promptConfig?.editor_expected
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createAdminClient();

  try {
    await requireTesterUser(req, admin);

    const body = await req.json().catch(() => ({})) as Body;
    const force = !!body.force;

    const versionQuery = admin
      .from("template_versions")
      .select("id, template_id, is_active, fuse_templates!inner(name)");

    if (body.versionId?.trim()) {
      versionQuery.eq("id", body.versionId.trim());
    } else {
      versionQuery.eq("is_active", true);
    }

    const { data: versions, error: versionError } = await versionQuery;
    if (versionError) throw new Error(versionError.message);

    let updatedNodes = 0;
    const touchedVersions: string[] = [];

    for (const version of versions ?? []) {
      const { data: nodes, error: nodeError } = await admin
        .from("nodes")
        .select("id, name, node_type, prompt_config, default_asset_id")
        .eq("version_id", version.id)
        .eq("node_type", "user_input");
      if (nodeError) throw new Error(nodeError.message);

      const seedPatches = buildTemplateEditorSeed((version as any).fuse_templates.name, nodes ?? []);

      for (const patch of seedPatches) {
        const node = (nodes ?? []).find((item: any) => item.id === patch.nodeId);
        if (!node) continue;
        if (!force && hasEditorMetadata(node.prompt_config)) continue;

        const nextPromptConfig = {
          ...(node.prompt_config ?? {}),
          ...patch.promptConfigPatch,
        };

        const { error: updateError } = await admin
          .from("nodes")
          .update({
            prompt_config: nextPromptConfig,
          })
          .eq("id", node.id);
        if (updateError) throw new Error(updateError.message);

        updatedNodes += 1;
        if (!touchedVersions.includes(version.id)) {
          touchedVersions.push(version.id);
        }
      }
    }

    return json({
      ok: true,
      updatedNodes,
      touchedVersions,
    });
  } catch (error) {
    return json({ error: errorMessage(error) }, 400);
  }
});

