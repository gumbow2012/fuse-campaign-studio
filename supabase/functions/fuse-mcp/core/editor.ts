/**
 * Non-destructive campaign editing. All ownership + revision checks live in the
 * existing `edit_project_apply` RPC; the original outputs are never modified.
 */
import type { Admin, AuthContext } from "../auth.ts";
import { FuseError } from "../errors.ts";
import { requireOwnedJob } from "./outputs.ts";

export async function ensureEditProject(admin: Admin, auth: AuthContext, runId: string) {
  await requireOwnedJob(admin, auth, runId);
  const { data: proj } = await admin.from("campaign_edit_projects").select("id,revision,name,aspect_ratio,status").eq("execution_job_id", runId).maybeSingle();
  if (proj) return proj as any;
  const { data: created, error } = await admin.rpc("create_edit_project_for_run", { p_job_id: runId });
  if (error || !created) {
    throw new FuseError("NOT_SUPPORTED", "This run has no video clips to edit", {
      userMessage: "This campaign has no video clips, so there is nothing to edit into a video. You can still download the images.",
      nextAction: "Call fuse_list_run_outputs to download the images.",
    });
  }
  const { data: fresh } = await admin.from("campaign_edit_projects").select("id,revision,name,aspect_ratio,status").eq("id", created as string).single();
  return fresh as any;
}

export async function getTimeline(admin: Admin, auth: AuthContext, runId: string) {
  const proj = await ensureEditProject(admin, auth, runId);
  const { data: segs } = await admin
    .from("campaign_edit_segments")
    .select("id,source_step_id,source_label,source_type,source_duration_ms,position,trim_start_ms,trim_end_ms,muted,removed,on_timeline")
    .eq("project_id", proj.id)
    .order("position", { ascending: true });
  const clips = (segs ?? []).map((s: any, i: number) => ({
    output_id: s.source_step_id,
    segment_id: s.id,
    order: s.position ?? i,
    label: s.source_label ?? `Clip ${i + 1}`,
    source_duration_seconds: s.source_duration_ms != null ? s.source_duration_ms / 1000 : null,
    trim_start_seconds: (s.trim_start_ms ?? 0) / 1000,
    trim_end_seconds: s.trim_end_ms != null ? s.trim_end_ms / 1000 : null,
    muted: !!s.muted,
    enabled: !s.removed && s.on_timeline !== false,
  }));
  const total = clips.filter((c) => c.enabled).reduce((acc, c) => {
    const end = c.trim_end_seconds ?? c.source_duration_seconds ?? 0;
    return acc + Math.max(0, end - c.trim_start_seconds);
  }, 0);
  return { edit_id: proj.id, run_id: runId, revision: proj.revision, name: proj.name, aspect_ratio: proj.aspect_ratio, clips, total_duration_seconds: Math.round(total * 100) / 100 };
}

export async function saveCampaignEdit(admin: Admin, auth: AuthContext, args: {
  run_id: string;
  campaign_name?: string;
  clips?: Array<{ output_id: string; order?: number; trim_start_seconds?: number; trim_end_seconds?: number; muted?: boolean; enabled?: boolean }>;
}) {
  const proj = await ensureEditProject(admin, auth, args.run_id);
  const before = await getTimeline(admin, auth, args.run_id);
  const byOutput = new Map(before.clips.map((c) => [c.output_id, c]));
  const warnings: string[] = [];
  let revision = proj.revision as number;

  const apply = async (op: string, payload: Record<string, unknown>) => {
    const { data, error } = await admin.rpc("edit_project_apply", { p_project: proj.id, p_user: auth.userId, p_expected: revision, p_op: op, p_payload: payload });
    if (error) throw new FuseError("INTERNAL", error.message);
    const status = (data as any)?.status;
    if (status === "conflict") throw new FuseError("CONFLICT");
    if (status === "forbidden") throw new FuseError("FORBIDDEN");
    if (status === "not_found") throw new FuseError("NOT_FOUND", "Clip not found");
    if (status !== "ok") throw new FuseError("INVALID_INPUT", String((data as any)?.message ?? `Edit ${op} rejected`));
    revision = Number((data as any)?.revision ?? revision + 1);
  };

  const clips = args.clips ?? [];
  for (const c of clips) {
    const seg = byOutput.get(c.output_id);
    if (!seg) throw new FuseError("INVALID_INPUT", `Clip ${c.output_id} is not part of this campaign`, { nextAction: "Use output_id values from fuse_list_run_outputs (type video)." });
    if (c.enabled === false && seg.enabled) await apply("remove", { segment_id: seg.segment_id });
    if (c.enabled === true && !seg.enabled) await apply("restore", { segment_id: seg.segment_id });
    if (c.muted != null && c.muted !== seg.muted) await apply("mute", { segment_id: seg.segment_id, muted: c.muted });
    if (c.trim_start_seconds != null || c.trim_end_seconds != null) {
      const start = Math.max(0, Number(c.trim_start_seconds ?? seg.trim_start_seconds));
      const maxEnd = seg.source_duration_seconds ?? Number.POSITIVE_INFINITY;
      const end = c.trim_end_seconds != null ? Number(c.trim_end_seconds) : (seg.trim_end_seconds ?? seg.source_duration_seconds);
      if (end != null && (end <= start || end > maxEnd + 0.01)) {
        throw new FuseError("INVALID_INPUT", `Trim for ${c.output_id} must be within 0–${seg.source_duration_seconds ?? "?"}s and end after start`);
      }
      await apply("trim", { segment_id: seg.segment_id, trim_start_ms: Math.round(start * 1000), trim_end_ms: end != null ? Math.round(end * 1000) : null });
    }
  }
  const ordered = clips.filter((c) => c.order != null).sort((a, b) => Number(a.order) - Number(b.order));
  if (ordered.length) {
    const remaining = before.clips.map((c) => c.output_id).filter((id) => !ordered.some((o) => o.output_id === id));
    const sequence = [...ordered.map((o) => o.output_id), ...remaining].map((id) => byOutput.get(id)!.segment_id);
    await apply("reorder", { segment_ids: sequence });
    if (remaining.length) warnings.push(`${remaining.length} clip(s) you didn't mention were kept after the ones you ordered.`);
  }
  if (args.campaign_name) {
    const { renameCampaign } = await import("./outputs.ts");
    await renameCampaign(admin, auth, args.run_id, args.campaign_name);
  }
  const after = await getTimeline(admin, auth, args.run_id);
  return { edit_id: after.edit_id, run_id: args.run_id, saved: true, revision: after.revision, total_duration_seconds: after.total_duration_seconds, clips: after.clips, warnings };
}
