import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  logAuditEvent,
  requireBuilderUser,
} from "../_shared/supabase-admin.ts";
import { assertCanPublish, FORBIDDEN_PUBLISH_MESSAGE } from "../_shared/template-scope.ts";
import { assertVersionActivatable } from "../_shared/fork-run.ts";

type Body = {
  versionId?: string;
  reviewStatus?: string | null;
  reviewNote?: string | null;
};

const ALLOWED_STATUSES = new Set([
  "Unreviewed",
  "Submitted",
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
    const access = await requireBuilderUser(req, admin);
    assertCanPublish(access);
    const user = access.user;
    const body = await req.json() as Body;
    const versionId = typeof body.versionId === "string" ? body.versionId.trim() : "";
    const reviewStatus = typeof body.reviewStatus === "string" ? body.reviewStatus.trim() : "";

    if (!versionId) throw new Error("versionId is required");
    if (!ALLOWED_STATUSES.has(reviewStatus)) {
      throw new Error("Invalid review status");
    }

    const { data: version, error: versionError } = await admin
      .from("template_versions")
      .select("id, review_status, fork_id")
      .eq("id", versionId)
      .single();
    if (versionError || !version) throw new Error(versionError?.message ?? "Template version not found");
    // TR10 ISOLATION: personal fork versions are outside the review/publish pipeline.
    assertVersionActivatable(version as never);

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

    const reviewNote = typeof body.reviewNote === "string" ? body.reviewNote.trim().slice(0, 1000) : "";
    if (reviewNote) {
      await logAuditEvent({
        eventType: "template_review_note",
        message: reviewNote,
        source: "admin",
        versionId,
        metadata: { reviewStatus },
      }, admin);
    }



    return json({
      ok: true,
      versionId,
      reviewStatus,
      reviewedAt: nextReviewedAt,
      reviewedBy: nextReviewedBy,
    });
  } catch (error) {
    const message = errorMessage(error);
    return json({ error: message }, message === FORBIDDEN_PUBLISH_MESSAGE ? 403 : 400);
  }
});

