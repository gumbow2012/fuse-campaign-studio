/**
 * F2 — FREE FIRST VIDEO entitlement helpers.
 *
 * One verified new account = ONE free designated video output. This module owns
 * ONLY the entitlement state machine (available -> reserved -> consumed) plus
 * the run-mode marker read by the executor. It never touches credits, never
 * writes to a public path and never changes provider behavior.
 */

export const FREE_RUN_MODE_KEY = "__fuse_run_mode";
export const FREE_RUN_MODE = "FREE_FIRST_VIDEO";
export const FREE_VIDEO_META_KEY = "__fuse_free_video";
export const FREE_VIDEO_ENTITLEMENT_TYPE = "FIRST_VIDEO_FREE";

type AdminClient = { from: (table: string) => any };

/** True when the job was started by the promotional free-first-video path. */
export function isFreeFirstVideoPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  return (payload as Record<string, unknown>)[FREE_RUN_MODE_KEY] === FREE_RUN_MODE;
}

async function loadJobRunMode(admin: AdminClient, jobId: string) {
  const { data } = await admin
    .from("execution_jobs")
    .select("id, input_payload")
    .eq("id", jobId)
    .maybeSingle();
  return isFreeFirstVideoPayload((data as any)?.input_payload);
}

/**
 * Terminal SUCCESS — burn the entitlement. Guarded on reserved -> consumed so
 * repeated webhook deliveries are idempotent. Never throws.
 */
export async function consumeFreeVideoEntitlementForJob(admin: AdminClient, jobId: string) {
  try {
    if (!(await loadJobRunMode(admin, jobId))) return { changed: false };
    const { data, error } = await admin
      .from("free_video_entitlements")
      .update({ status: "consumed", consumed_at: new Date().toISOString() })
      .eq("generation_job_id", jobId)
      .eq("status", "reserved")
      .select("id");
    if (error) {
      console.error(`[free-video] consume failed for job ${jobId}: ${error.message}`);
      return { changed: false };
    }
    return { changed: (data ?? []).length > 0 };
  } catch (error) {
    console.error(`[free-video] consume error: ${error instanceof Error ? error.message : error}`);
    return { changed: false };
  }
}

/**
 * Terminal FAILURE — give the free video back. Provider/system failures must
 * never burn the grant. Guarded on reserved -> available. Never throws.
 */
export async function restoreFreeVideoEntitlementForJob(admin: AdminClient, jobId: string) {
  try {
    if (!(await loadJobRunMode(admin, jobId))) return { changed: false };
    const { data, error } = await admin
      .from("free_video_entitlements")
      .update({ status: "available", reserved_at: null })
      .eq("generation_job_id", jobId)
      .eq("status", "reserved")
      .select("id");
    if (error) {
      console.error(`[free-video] restore failed for job ${jobId}: ${error.message}`);
      return { changed: false };
    }
    return { changed: (data ?? []).length > 0 };
  } catch (error) {
    console.error(`[free-video] restore error: ${error instanceof Error ? error.message : error}`);
    return { changed: false };
  }
}
