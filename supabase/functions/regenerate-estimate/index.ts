import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  getUserRoles,
  json,
  requireUser,
} from "../_shared/supabase-admin.ts";
import {
  assertRegenerationAccess,
  resolveRegenerationSubgraph,
} from "../_shared/regeneration.ts";

/**
 * TR6 — dry-run per-output regeneration estimate.
 *
 * READ-ONLY: this endpoint performs SELECTs only. It never creates an
 * execution job or step, never calls a provider and never charges credits.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const admin = createAdminClient();

  try {
    const user = await requireUser(req, admin);
    if (!user) throw new Error("Authentication required");

    const body = await req.json().catch(() => ({})) as {
      action?: string;
      jobId?: string;
      outputNumber?: number;
      nodeId?: string;
    };

    const action = String(body.action ?? "regenerate_estimate");
    if (action !== "regenerate_estimate") throw new Error("Unsupported action");

    const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
    if (!jobId) throw new Error("jobId is required");

    const hasOutputNumber = Number.isFinite(Number(body.outputNumber));
    const nodeId = typeof body.nodeId === "string" && body.nodeId.trim() ? body.nodeId.trim() : null;
    if (!hasOutputNumber && !nodeId) throw new Error("outputNumber or nodeId is required");

    const { job, estimate } = await resolveRegenerationSubgraph(admin, jobId, {
      nodeId,
      outputNumber: hasOutputNumber ? Number(body.outputNumber) : null,
    });

    const roles = await getUserRoles(user.id, admin);
    assertRegenerationAccess({ jobUserId: job.user_id, userId: user.id, roles });

    return json({
      dryRun: true,
      jobId: job.id,
      targetNodeId: estimate.targetNodeId,
      outputNumber: estimate.outputNumber,
      toRunNodeIds: estimate.toRunNodeIds,
      reusedNodeIds: estimate.reusedNodeIds,
      staleDownstreamOutputNumbers: estimate.staleDownstreamOutputNumbers,
      estimatedCredits: estimate.estimatedCredits,
      breakdown: estimate.breakdown,
    });
  } catch (error) {
    const message = errorMessage(error);
    return json({ error: message }, message === "Forbidden" ? 403 : 400);
  }
});
