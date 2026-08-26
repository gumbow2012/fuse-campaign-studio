import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  requireBuilderUser,
} from "../_shared/supabase-admin.ts";
import { assertVersionAccess, FORBIDDEN_TEMPLATE_MESSAGE } from "../_shared/template-scope.ts";
import { assertVersionActivatable } from "../_shared/fork-run.ts";

type Body = { versionId?: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createAdminClient();

  try {
    const access = await requireBuilderUser(req, admin);
    const body = await req.json().catch(() => ({})) as Body;
    const versionId = typeof body.versionId === "string" ? body.versionId.trim() : "";
    if (!versionId) throw new Error("versionId is required");

    // Creators may only submit versions of templates they own.
    await assertVersionAccess(admin, access, versionId);

    const { data: version, error: versionError } = await admin
      .from("template_versions")
      .select("id, is_active, review_status")
      .eq("id", versionId)
      .maybeSingle();
    if (versionError) throw new Error(versionError.message);
    if (!version) throw new Error("Template version not found");
    // TR10 ISOLATION: personal fork versions can never enter review/publish.
    assertVersionActivatable(version as never);

    const { error: updateError } = await admin
      .from("template_versions")
      .update({
        review_status: "Submitted",
        reviewed_at: null,
        reviewed_by: null,
      })
      .eq("id", versionId);
    if (updateError) throw new Error(updateError.message);

    return json({ ok: true, versionId, reviewStatus: "Submitted" });
  } catch (error) {
    const message = errorMessage(error);
    return json({ error: message }, message === FORBIDDEN_TEMPLATE_MESSAGE ? 403 : 400);
  }
});
