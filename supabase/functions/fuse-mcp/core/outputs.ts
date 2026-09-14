/**
 * Outputs of a run: owner-scoped, signed, with the same partial/failed semantics
 * as the web app's results panel. Video posters are only returned when a real
 * poster exists — never a grey placeholder.
 */
import { resolveDisplayUrl } from "../../_shared/asset-access.ts";
import type { Admin, AuthContext } from "../auth.ts";
import { FuseError } from "../errors.ts";

const BUCKET = "fuse-assets";
const isVideoAsset = (t: string, u: string) => t === "generated_video" || /\.(mp4|webm|mov)($|\?)/i.test(u ?? "");
const keyOf = (u: string) => (u?.match(/\/object\/(?:public|sign|authenticated)\/fuse-assets\/(.+)$/)?.[1] ?? u ?? "").split("?")[0];

export type RunOutput = {
  output_id: string;
  type: "image" | "video";
  status: "complete";
  file_name: string;
  preview_url: string | null;
  poster_url: string | null;
  download_url: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  created_at: string | null;
};

export async function requireOwnedJob(admin: Admin, auth: AuthContext, runId: string) {
  if (!auth.userId) throw new FuseError("AUTH_REQUIRED");
  const { data: job } = await admin
    .from("execution_jobs")
    .select("id,user_id,status,template_id,version_id,retry_count,started_at,completed_at,progress,error_log,fuse_templates!execution_jobs_template_id_fkey(name,slug)")
    .eq("id", runId)
    .maybeSingle();
  if (!job) throw new FuseError("NOT_FOUND", "Run not found");
  if ((job as any).user_id !== auth.userId && !auth.isPrivileged) throw new FuseError("FORBIDDEN", "Run belongs to another account");
  return job as any;
}

export async function listRunOutputs(admin: Admin, auth: AuthContext, runId: string, type: "image" | "video" | "all" = "all", opts: { download?: boolean; ttl?: number } = {}) {
  const job = await requireOwnedJob(admin, auth, runId);
  const { data: steps } = await admin
    .from("execution_steps")
    .select("id,node_id,status,output_asset_id,error_log,completed_at,created_at")
    .eq("job_id", runId)
    .order("completed_at", { ascending: true, nullsFirst: false });
  const rows = steps ?? [];
  const completed = rows.filter((s: any) => s.status === "complete" && s.output_asset_id);
  const failed = rows.filter((s: any) => s.status === "failed");
  const ids = completed.map((s: any) => s.output_asset_id);
  const assetMap = new Map<string, any>();
  if (ids.length) {
    const { data: assets } = await admin.from("assets").select("id,supabase_storage_url,asset_type,metadata").in("id", ids);
    for (const a of assets ?? []) assetMap.set((a as any).id, a);
  }
  const name = await campaignName(admin, runId, job);
  const ttl = opts.ttl ?? 3600;
  const outputs: RunOutput[] = [];
  let images = 0, videos = 0;
  for (const s of completed) {
    const a = assetMap.get((s as any).output_asset_id);
    if (!a) continue;
    const video = isVideoAsset(a.asset_type, a.supabase_storage_url);
    if (type === "image" && video) continue;
    if (type === "video" && !video) continue;
    const n = video ? ++videos : ++images;
    const key = keyOf(a.supabase_storage_url);
    const ext = key.split(".").pop()?.split("?")[0] ?? (video ? "mp4" : "png");
    const preview = await resolveDisplayUrl(admin, a.supabase_storage_url, ttl);
    let download: string | null = null;
    if (opts.download !== false) {
      const { data } = await admin.storage.from(BUCKET).createSignedUrl(key, ttl, { download: `${slugify(name)}-${video ? "clip" : "image"}-${String(n).padStart(2, "0")}.${ext}` });
      download = data?.signedUrl ?? null;
    }
    const meta = (a.metadata ?? {}) as Record<string, unknown>;
    outputs.push({
      output_id: (s as any).id,
      type: video ? "video" : "image",
      status: "complete",
      file_name: `${slugify(name)}-${video ? "clip" : "image"}-${String(n).padStart(2, "0")}.${ext}`,
      preview_url: preview,
      poster_url: typeof meta.poster_url === "string" ? await resolveDisplayUrl(admin, meta.poster_url, ttl) : null,
      download_url: download,
      width: Number(meta.width) || null,
      height: Number(meta.height) || null,
      duration_seconds: Number(meta.duration_seconds ?? meta.duration) || null,
      created_at: (s as any).completed_at ?? null,
    });
  }
  return {
    run_id: runId,
    campaign_name: name,
    status: job.status,
    outputs,
    counts: { completed: completed.length, failed: failed.length, expected: rows.length },
    failed_output_ids: failed.map((s: any) => s.id),
    editor_url: `https://fuse-us.com/app/templates?run=${runId}`,
    links_expire_at: new Date(Date.now() + ttl * 1000).toISOString(),
    download_all: { available: false, note: "ZIP bundles are not available through the API yet — download each file, or use Download all in the FUSE studio." },
  };
}

export async function campaignName(admin: Admin, runId: string, job?: any): Promise<string> {
  const { data: named } = await admin.from("campaign_names").select("name").eq("job_id", runId).maybeSingle();
  if ((named as any)?.name) return (named as any).name;
  const { data: proj } = await admin.from("campaign_edit_projects").select("name").eq("execution_job_id", runId).maybeSingle();
  if ((proj as any)?.name) return (proj as any).name;
  const templateName = job?.fuse_templates?.name ?? "Campaign";
  return String(templateName).replace(/\s+/g, " ").trim();
}

export function slugify(name: string): string {
  return String(name ?? "campaign").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "campaign";
}

export async function renameCampaign(admin: Admin, auth: AuthContext, runId: string, name: string) {
  const job = await requireOwnedJob(admin, auth, runId);
  const clean = String(name ?? "").replace(/[<>{}\\]/g, "").replace(/\s+/g, " ").trim();
  if (clean.length < 2 || clean.length > 80) {
    throw new FuseError("INVALID_INPUT", "Name must be 2–80 characters", { nextAction: "Pick a short campaign name like “Kola Hoodie Drop”." });
  }
  await admin.from("campaign_names").upsert({ job_id: runId, user_id: auth.userId, name: clean, updated_at: new Date().toISOString() });
  await admin.from("campaign_edit_projects").update({ name: clean }).eq("execution_job_id", runId).eq("user_id", auth.userId!);
  return { run_id: runId, name: clean, updated: true, template_slug: job.fuse_templates?.slug ?? null };
}
