/**
 * F5 — FREE FIRST VIDEO client helpers.
 *
 * Entitlement reads use the owner-select RLS policy on
 * `free_video_entitlements`. The run itself is server-authoritative: the
 * `start-free-video-run` edge function reserves the entitlement, waives credits
 * and executes only the designated video subgraph.
 */

import { supabase, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";

export type FreeVideoEntitlement = {
  status: "available" | "reserved" | "consumed" | "expired";
  selectedTemplateId: string | null;
  generationJobId: string | null;
};

/** The signed-in user's FIRST_VIDEO_FREE entitlement row (null when none). */
export async function fetchMyFreeVideoEntitlement(): Promise<FreeVideoEntitlement | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return null;

  const { data, error } = await supabase
    .from("free_video_entitlements" as never)
    .select("status, selected_template_id, generation_job_id")
    .eq("user_id", session.user.id)
    .eq("entitlement_type", "FIRST_VIDEO_FREE")
    .maybeSingle();

  if (error || !data) return null;
  const row = data as unknown as {
    status?: string | null;
    selected_template_id?: string | null;
    generation_job_id?: string | null;
  };
  return {
    status: (row.status ?? "available") as FreeVideoEntitlement["status"],
    selectedTemplateId: row.selected_template_id ? String(row.selected_template_id) : null,
    generationJobId: row.generation_job_id ? String(row.generation_job_id) : null,
  };
}

/** Starts the free single-video run. `templateId` is the fuse_templates UUID. */
export async function startFreeVideoRun(args: {
  templateId: string;
  inputs: Record<string, string>;
}): Promise<{ jobId: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Missing authenticated session.");

  const response = await fetch(`${SUPABASE_URL}/functions/v1/start-free-video-run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ templateId: args.templateId, inputs: args.inputs }),
  });

  const data = (await response.json().catch(() => ({}))) as { jobId?: string; error?: string };
  if (!response.ok || !data.jobId) {
    throw new Error(data.error ?? "Could not start your free video.");
  }
  return { jobId: String(data.jobId) };
}
