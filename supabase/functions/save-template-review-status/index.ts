import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  requireTesterUser,
} from "../_shared/supabase-admin.ts";

type Body = {
  versionId?: string;
  reviewStatus?: string | null;
};

const ALLOWED_STATUSES = new Set([
  "Unreviewed",
  "Structurally Correct",
  "Prompt Drift",
  "Blocked by Provider",
  "Approved",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createAdminClient();

  try {
    const user = await requireTesterUser(req, admin);
    const body = await req.json() as Body;
    const versionId = typeof body.versionId === "string" ? body.versionId.trim() : "";
    const reviewStatus = typeof body.reviewStatus === "string" ? body.reviewStatus.trim() : "";

    if (!versionId) throw new Error("versionId is required");
    if (!ALLOWED_STATUSES.has(reviewStatus)) {
      throw new Error("Invalid review status");
    }

    const { data: version, error: versionError } = await admin
      .from("template_versions")
      .select("id")
      .eq("id", versionId)
      .single();
    if (versionError || !version) throw new Error(versionError?.message ?? "Template version not found");

    const nextReviewedAt = reviewStatus === "Unreviewed" ? null : new Date().toISOString();
    const nextReviewedBy = reviewStatus === "Unreviewed" ? null : user.id;

    const { error: updateError } = await admin
      .from("template_versions")
      .update({
        review_status: reviewStatus,
        reviewed_at: nextReviewedAt,
        reviewed_by: nextReviewedBy,
      })
      .eq("id", versionId);
    if (updateError) throw new Error(updateError.message);

    return json({
      ok: true,
      versionId,
      reviewStatus,
      reviewedAt: nextReviewedAt,
      reviewedBy: nextReviewedBy,
    });
  } catch (error) {
    return json({ error: errorMessage(error) }, 400);
  }
});

