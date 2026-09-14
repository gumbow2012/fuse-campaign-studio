/**
 * Exports: snapshot the saved edit (RPC create_campaign_export) and dispatch the
 * private render worker when one is configured. Mirrors the deployed
 * `export-campaign` function; if the worker is not configured the export stays
 * honestly `queued` with render_pipeline = "awaiting_worker".
 */
import type { Admin, AuthContext } from "../auth.ts";
import { FuseError } from "../errors.ts";
import { ensureEditProject } from "./editor.ts";
import { campaignName, listRunOutputs, requireOwnedJob, slugify } from "./outputs.ts";

const BUCKET = "fuse-assets";
const CRF: Record<string, number> = { draft: 28, standard: 23, high: 20, maximum: 17 };
const DIMS: Record<string, [number, number]> = { "9:16": [1080, 1920], "16:9": [1920, 1080], "4:5": [1080, 1350], "1:1": [1080, 1080] };
const toKey = (u: string) => (u.match(/\/object\/(?:public|sign)\/fuse-assets\/(.+)$/)?.[1] ?? u).split("?")[0];

async function cfg(admin: Admin, key: string, envName: string) {
  const { data } = await admin.from("app_config").select("value").eq("key", key).maybeSingle();
  return String((data as any)?.value ?? Deno.env.get(envName) ?? "").trim();
}

export async function exportCampaign(admin: Admin, auth: AuthContext, args: {
  run_id: string; edit_id?: string; export_type: "final_video" | "zip_all_assets" | "social_pack"; file_name?: string; aspect_ratio?: string; idempotency_key?: string;
}) {
  const job = await requireOwnedJob(admin, auth, args.run_id);
  if (args.export_type !== "final_video") {
    const outputs = await listRunOutputs(admin, auth, args.run_id, "all");
    return {
      export_id: null,
      status: "not_supported",
      export_type: args.export_type,
      message: "ZIP and social-pack bundles aren't rendered by the API yet. Every file is available individually below, and the FUSE studio has Download all.",
      links: outputs.outputs.map((o) => ({ output_id: o.output_id, type: o.type, file_name: o.file_name, download_url: o.download_url })),
      next_poll_after_seconds: null,
    };
  }
  const proj = await ensureEditProject(admin, auth, args.run_id);
  if (args.edit_id && args.edit_id !== proj.id) throw new FuseError("NOT_FOUND", "edit_id does not match this run");
  const name = await campaignName(admin, args.run_id, job);
  const settings: Record<string, unknown> = { export: { aspect_ratio: args.aspect_ratio ?? proj.aspect_ratio ?? "9:16", quality: "high", fps: 30 }, file_name: `${slugify(args.file_name ?? name)}.mp4` };
  if (args.idempotency_key) {
    const { data: existing } = await admin.from("campaign_edit_exports").select("id,status,output_path,created_at").eq("project_id", proj.id).eq("idempotency_key", args.idempotency_key).maybeSingle();
    if (existing) return describeExport(existing as any, "connected");
  }
  const { data, error } = await admin.rpc("create_campaign_export", { p_project: proj.id, p_user: auth.userId, p_settings: settings });
  if (error) throw new FuseError("INTERNAL", error.message);
  const status = (data as any)?.status;
  if (status === "forbidden") throw new FuseError("FORBIDDEN");
  if (status === "not_found") throw new FuseError("NOT_FOUND", "Edit project not found");
  if (status === "error") throw new FuseError("INVALID_INPUT", String((data as any)?.message ?? "Export rejected"));
  const exp = (data as any).export;
  if (args.idempotency_key) await admin.from("campaign_edit_exports").update({ idempotency_key: args.idempotency_key }).eq("id", exp.id);

  const workerUrl = await cfg(admin, "render_worker_url", "RENDER_WORKER_URL");
  let pipeline: "connected" | "awaiting_worker" | "worker_error" | "dispatch_error" = workerUrl ? "connected" : "awaiting_worker";
  if (workerUrl && status === "queued" && Array.isArray(exp?.manifest)) {
    try {
      const exset = exp?.settings?.export ?? {};
      const [w, h] = DIMS[String(exset.aspect_ratio ?? "9:16")] ?? [1080, 1920];
      const segments = [];
      for (const m of exp.manifest) {
        const { data: su } = await admin.storage.from(BUCKET).createSignedUrl(m.source_path, 21600);
        segments.push({ url: su?.signedUrl ?? null, trim_start_ms: m.trim_start_ms, trim_end_ms: m.trim_end_ms, volume: m.volume, muted: m.muted, adjustments: m.adjustments ?? {} });
      }
      let music = null;
      const mus = exp?.settings?.music;
      if (mus && (mus.path || mus.url)) {
        const { data: msu } = await admin.storage.from(BUCKET).createSignedUrl(mus.path ?? toKey(mus.url), 21600);
        music = { url: msu?.signedUrl ?? null, volume: mus.volume, mute: mus.mute, fade_in_ms: mus.fade_in_ms, fade_out_ms: mus.fade_out_ms };
      }
      const outputPath = `system/exports/${exp.id}.mp4`;
      const { data: up } = await admin.storage.from(BUCKET).createSignedUploadUrl(outputPath);
      const resp = await fetch(workerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-worker-token": await cfg(admin, "render_worker_token", "RENDER_WORKER_TOKEN") },
        body: JSON.stringify({
          export_id: exp.id,
          callback_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/finalize-export`,
          callback_secret: await cfg(admin, "render_callback_secret", "RENDER_CALLBACK_SECRET"),
          upload_url: up?.signedUrl,
          output_path: outputPath,
          output: { width: w, height: h, fps: +(exset.fps) || 30, crf: CRF[String(exset.quality ?? "high").toLowerCase()] ?? 20 },
          segments,
          music,
          text_layers: exp?.settings?.text_layers ?? [],
        }),
      });
      if (resp.ok) await admin.from("campaign_edit_exports").update({ status: "rendering", output_path: outputPath }).eq("id", exp.id);
      else pipeline = "worker_error";
    } catch {
      pipeline = "dispatch_error";
    }
  }
  const { data: fresh } = await admin.from("campaign_edit_exports").select("id,status,output_path,created_at,duration_ms").eq("id", exp.id).maybeSingle();
  return describeExport((fresh ?? exp) as any, pipeline);
}

function describeExport(exp: any, pipeline: string) {
  const ready = exp.status === "ready";
  return {
    export_id: exp.id,
    status: ready ? "ready" : exp.status === "failed" ? "failed" : pipeline === "awaiting_worker" ? "queued_backend_required" : exp.status ?? "queued",
    export_type: "final_video",
    render_pipeline: pipeline,
    estimated_time_seconds: ready ? 0 : 90,
    download_url: null,
    next_poll_after_seconds: ready ? null : 20,
    message: pipeline === "awaiting_worker" ? "Export queued. The render worker isn't connected in this environment yet, so the file will not be produced until it is." : ready ? "Your final video is ready." : "Rendering your final video.",
  };
}

export async function getExportStatus(admin: Admin, auth: AuthContext, exportId: string) {
  if (!auth.userId) throw new FuseError("AUTH_REQUIRED");
  const { data: exp } = await admin.from("campaign_edit_exports").select("id,user_id,project_id,status,output_path,duration_ms,error,created_at,completed_at").eq("id", exportId).maybeSingle();
  if (!exp) throw new FuseError("NOT_FOUND", "Export not found");
  if ((exp as any).user_id !== auth.userId && !auth.isPrivileged) throw new FuseError("FORBIDDEN");
  const e = exp as any;
  let download_url: string | null = null;
  if (e.status === "ready" && e.output_path) {
    const { data } = await admin.storage.from(BUCKET).createSignedUrl(e.output_path, 3600, { download: true });
    download_url = data?.signedUrl ?? null;
  }
  return {
    export_id: e.id,
    status: e.status,
    progress_percent: e.status === "ready" ? 100 : e.status === "rendering" ? 50 : e.status === "failed" ? 0 : 5,
    duration_seconds: e.duration_ms != null ? e.duration_ms / 1000 : null,
    download_url,
    error: e.status === "failed" ? "The render failed. Try exporting again; if it keeps failing, contact support." : null,
    next_poll_after_seconds: e.status === "ready" || e.status === "failed" ? null : 20,
  };
}
