// HAT BRAND FILM — browser-assembly coordinator.
//
// The final film is rendered in the customer's browser by the FUSE export
// engine. This function only: reports shot/assembly state, holds a durable
// compare-and-set lock (one assembler at a time, resumable after expiry),
// issues an authenticated upload URL, and accepts the final file only after
// verifying it exists and its reported probe matches 1080x1920 / 645 frames /
// audio. No provider calls, no credit changes. Owner (or admin) only.
import { probeMp4 } from "../_shared/mp4-source-audio-finish.ts";
import { corsHeaders, createAdminClient, errorMessage, getUserRoles, json, requireUser } from "../_shared/supabase-admin.ts";
import { resolveDisplayUrl } from "../_shared/asset-access.ts";
import { HAT_FILM_CONTEXT_KEY, HAT_FILM_SHOTS } from "../_shared/hat-film-recipe.ts";
import { parseHatFilmContext } from "../_shared/hat-film-prompts.ts";
import {
  acceptAssembly, buildRenderManifest, canClaim, claimed, failedAssembly, HAT_FILM_ASSEMBLY_KEY,
  parseAssembly, phaseFor, type HatFilmAssemblyState, type ShotState,
} from "../_shared/hat-film-assembly.ts";

const BUCKET = "fuse-assets";
type Admin = ReturnType<typeof createAdminClient>;

async function loadJob(admin: Admin, jobId: string, userId: string) {
  const { data: job, error } = await admin.from("execution_jobs")
    .select("id, user_id, status, input_payload, result_payload").eq("id", jobId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!job) throw Object.assign(new Error("Run not found"), { status: 404 });
  if ((job as any).user_id !== userId) {
    const roles = await getUserRoles(userId, admin);
    if (!roles.includes("admin")) throw Object.assign(new Error("Not your run"), { status: 403 });
  }
  const context = parseHatFilmContext((job as any).input_payload?.[HAT_FILM_CONTEXT_KEY]);
  if (!context) throw Object.assign(new Error("This run is not a Hat Brand Film"), { status: 400 });
  return { job: job as any, context };
}

async function loadShots(admin: Admin, jobId: string): Promise<ShotState[]> {
  const { data: steps, error } = await admin.from("execution_steps")
    .select("status, nodes!execution_steps_node_id_fkey(prompt_config), assets!execution_steps_output_asset_id_fkey(supabase_storage_url)")
    .eq("job_id", jobId);
  if (error) throw new Error(error.message);
  const byShot = new Map<string, { still?: any; clip?: any }>();
  for (const step of (steps ?? []) as any[]) {
    const cfg = step.nodes?.prompt_config ?? {};
    if (typeof cfg.hat_film_shot !== "string") continue;
    const entry = byShot.get(cfg.hat_film_shot) ?? {};
    if (cfg.hat_film_stage === "still") entry.still = step;
    if (cfg.hat_film_stage === "clip") entry.clip = step;
    byShot.set(cfg.hat_film_shot, entry);
  }
  return HAT_FILM_SHOTS.map((shot) => {
    const e = byShot.get(shot.id) ?? {};
    const stillUrl = e.still?.status === "complete" ? e.still.assets?.supabase_storage_url ?? null : null;
    const clipUrl = e.clip?.status === "complete" ? e.clip.assets?.supabase_storage_url ?? null : null;
    const failed = e.still?.status === "failed" || e.clip?.status === "failed";
    const done = shot.kind === "logo_hold" ? !!stillUrl : !!clipUrl;
    return {
      shot_id: shot.id,
      status: failed ? "failed" : done ? "ready" : stillUrl ? "animating" : "pending",
      still_url: stillUrl, clip_url: clipUrl, clip_duration_ms: null, retries: 0,
    } as ShotState;
  });
}

/** Atomic compare-and-set: writes only if the stored lock still matches `expect`. */
async function casAssembly(admin: Admin, job: any, next: HatFilmAssemblyState, expect: { token: string | null; expiredBefore?: string }) {
  let q = admin.from("execution_jobs")
    .update({ result_payload: { ...(job.result_payload ?? {}), [HAT_FILM_ASSEMBLY_KEY]: next } })
    .eq("id", job.id)
    .or(`result_payload->${HAT_FILM_ASSEMBLY_KEY}->>status.is.null,result_payload->${HAT_FILM_ASSEMBLY_KEY}->>status.neq.ready`);
  if (expect.expiredBefore) q = q.lt(`result_payload->${HAT_FILM_ASSEMBLY_KEY}->>lock_expires_at`, expect.expiredBefore);
  else if (expect.token === null) q = q.is(`result_payload->${HAT_FILM_ASSEMBLY_KEY}->>lock_token`, null);
  else q = q.eq(`result_payload->${HAT_FILM_ASSEMBLY_KEY}->>lock_token`, expect.token);
  const { data, error } = await q.select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length === 1;
}

const sign = (admin: Admin, ref: string | null | undefined) => (ref ? resolveDisplayUrl(admin, ref, 6 * 3600) : Promise.resolve(null));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createAdminClient();
  try {
    const user = await requireUser(req, admin);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const jobId = String(body.jobId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) return json({ error: "jobId required" }, 400);
    const token = typeof body.token === "string" && /^[A-Za-z0-9-]{16,80}$/.test(body.token) ? body.token : null;

    const { job, context } = await loadJob(admin, jobId, user.id);
    const assembly = parseAssembly(job.result_payload?.[HAT_FILM_ASSEMBLY_KEY]);
    const shots = await loadShots(admin, jobId);
    const phase = job.status === "failed" && phaseFor(shots, assembly) !== "ready" ? "needs_review" : phaseFor(shots, assembly);

    if (action === "state") {
      const signedShots = await Promise.all(shots.map(async (s) => ({
        shot_id: s.shot_id, status: s.status,
        still_url: await sign(admin, s.still_url), clip_url: await sign(admin, s.clip_url),
      })));
      const manifestReady = phase === "assembling_video" || phase === "assembly_failed";
      let manifest = null;
      let manifest_error: string | null = null;
      if (manifestReady) {
        try {
          const signedForManifest = shots.map((s, i) => ({ ...s, still_url: signedShots[i].still_url, clip_url: signedShots[i].clip_url }));
          manifest = buildRenderManifest(signedForManifest, {
            logoUrl: await sign(admin, context.logo_url),
            soundtrackUrl: await sign(admin, context.soundtrack_path),
          });
        } catch (error) {
          manifest_error = errorMessage(error);
        }
      }
      return json({
        phase,
        job_status: job.status,
        shots: signedShots,
        assembly: { status: assembly.status, attempts: assembly.attempts, error: assembly.error, verified: assembly.verified, locked: !!assembly.lock_token && !canClaim(assembly, new Date().toISOString()) },
        final_url: assembly.status === "ready" ? await sign(admin, assembly.output_path) : null,
        manifest,
        manifest_error,
      });
    }

    if (!token) return json({ error: "token required" }, 400);

    if (action === "claim") {
      if (job.status !== "complete" || (phase !== "assembling_video" && phase !== "assembly_failed")) {
        return json({ error: "NOT_READY", phase }, 409);
      }
      // Fail before locking if the manifest can't be built (duplicates, gaps, missing logo/soundtrack).
      buildRenderManifest(shots, { logoUrl: context.logo_url, soundtrackUrl: context.soundtrack_path });
      const nowIso = new Date().toISOString();
      // Same session resuming after a reload keeps its lock.
      if (assembly.lock_token === token && assembly.status === "assembling") return json({ claimed: true, resumed: true, lock_expires_at: assembly.lock_expires_at });
      if (!canClaim(assembly, nowIso)) return json({ claimed: false, reason: "Another tab is assembling this film." }, 409);
      const next = claimed(assembly, token, new Date());
      const ok = assembly.lock_token
        ? await casAssembly(admin, job, next, { token: null, expiredBefore: nowIso })
        : await casAssembly(admin, job, next, { token: null });
      return ok ? json({ claimed: true, lock_expires_at: next.lock_expires_at }) : json({ claimed: false, reason: "Another tab is assembling this film." }, 409);
    }

    if (assembly.lock_token !== token) return json({ error: "LOCK_LOST" }, 409);
    const outputPath = `system/hat-film/${job.user_id}/${job.id}/final-${assembly.attempts}.mp4`;

    if (action === "upload") {
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(outputPath, { upsert: true });
      if (error || !data) throw new Error(error?.message ?? "Upload URL failed");
      return json({ path: outputPath, signed_url: data.signedUrl, upload_token: data.token });
    }

    if (action === "complete") {
      if (body.path !== outputPath) return json({ error: "Unexpected output path" }, 400);
      // Verify the uploaded file ourselves; browser-reported numbers are ignored.
      let verified: Record<string, unknown> | null = null;
      try {
        const { data: file, error: dlError } = await admin.storage.from(BUCKET).download(outputPath);
        if (dlError || !file) throw new Error(dlError?.message ?? "Final file missing");
        const p = probeMp4(new Uint8Array(await file.arrayBuffer()));
        const audioOk = p.has_audio && p.audio_codec === "mp4a" && Math.abs(p.audio_duration_ms - 21500) <= 100;
        verified = p.video_codec === "avc1" && audioOk ? { width: p.width, height: p.height, frames: p.frames, has_audio: true, duration_ms: p.duration_ms } : { ...p, has_audio: audioOk };
      } catch (error) {
        const next = failedAssembly(assembly, token, `Final file failed verification: ${errorMessage(error)}`);
        await casAssembly(admin, job, next, { token });
        return json({ status: next.status, error: next.error });
      }
      const next = acceptAssembly(assembly, token, { output_path: outputPath, verified: verified as never });
      const ok = await casAssembly(admin, job, next, { token });
      if (!ok) return json({ error: "LOCK_LOST" }, 409);
      return json({ status: next.status, error: next.error, final_url: next.status === "ready" ? await sign(admin, outputPath) : null });
    }

    if (action === "fail") {
      const next = failedAssembly(assembly, token, String(body.message ?? "Assembly failed in the browser."));
      await casAssembly(admin, job, next, { token });
      return json({ status: next.status, error: next.error });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    const status = (error as any)?.status ?? (/auth|bearer|token/i.test(errorMessage(error)) ? 401 : 400);
    return json({ error: errorMessage(error) }, status);
  }
});
