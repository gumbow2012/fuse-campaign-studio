import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  getOptionalUser,
  getUserRoles,
  hasValidRunnerCode,
  json,
  requireUser,
} from "../_shared/supabase-admin.ts";
import { buildJobStatusResponse } from "../_shared/job-status.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const admin = createAdminClient();

  try {
    const runnerAccess = hasValidRunnerCode(req);
    const user = runnerAccess ? await getOptionalUser(req, admin) : await requireUser(req, admin);
    if (!user && !runnerAccess) throw new Error("Authentication required");

    const url = new URL(req.url);
    const jobId = url.searchParams.get("jobId");
    if (!jobId) throw new Error("jobId is required");

    // TR2: only runner/admin/dev callers receive prompts, mapping and provider internals.
    let isPrivileged = runnerAccess;
    if (!isPrivileged && user) {
      const roles = await getUserRoles(user.id, admin);
      isPrivileged = roles.includes("admin") || roles.includes("dev");
    }

    const detail = await buildJobStatusResponse(admin, jobId, runnerAccess, user?.id ?? null, {
      includeSensitive: isPrivileged,
    });

    return json(detail);
  } catch (error) {
    return json({ error: errorMessage(error) }, 400);
  }
});
