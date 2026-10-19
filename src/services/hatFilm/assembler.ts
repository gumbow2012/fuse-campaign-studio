/**
 * Hat Brand Film browser assembly coordinator. Browser rendering only — the
 * tab must stay open. Lock + result live on the server; a reload resumes from
 * the persisted clips (the same tab keeps its lock token in sessionStorage).
 * "Ready" is only ever set by the server after it re-probes the uploaded file.
 */
import { supabase } from "@/integrations/supabase/client";
import type { HfSegment } from "@/lib/hatFilmFramePlan";
import type { HatFilmWorkerRequest, HatFilmWorkerResponse } from "@/workers/hatFilm.worker";

export type HatFilmState = {
  phase: string;
  job_status: string;
  shots: Array<{ shot_id: string; status: string; still_url: string | null; clip_url: string | null }>;
  assembly: { status: string; attempts: number; error: string | null; locked: boolean };
  final_url: string | null;
  manifest: { segments: HfSegment[]; logo_url: string; soundtrack_url: string } | null;
  manifest_error: string | null;
};

async function call<T>(action: string, jobId: string, extra: Record<string, unknown> = {}): Promise<T> {
  await supabase.auth.getSession();
  const { data, error } = await supabase.functions.invoke("hat-film-assembly", { body: { action, jobId, ...extra } });
  if (error) {
    let message = error.message;
    try { const body = await (error as { context?: Response }).context?.json(); message = body?.reason ?? body?.error ?? message; } catch { /* keep */ }
    throw new Error(message);
  }
  return data as T;
}

export const fetchHatFilmState = (jobId: string) => call<HatFilmState>("state", jobId);

const tokenFor = (jobId: string) => {
  const key = `hatfilm:lock:${jobId}`;
  let token = sessionStorage.getItem(key);
  if (!token) { token = crypto.randomUUID(); sessionStorage.setItem(key, token); }
  return token;
};

export async function assembleHatFilm(jobId: string, state: HatFilmState, onProgress: (p: number, stage: string) => void) {
  if (!state.manifest) throw new Error(state.manifest_error ?? "Shots aren't ready to assemble.");
  const token = tokenFor(jobId);
  await call("claim", jobId, { token });
  try {
    const worker = new Worker(new URL("../../workers/hatFilm.worker.ts", import.meta.url), { type: "module" });
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<HatFilmWorkerResponse>) => {
        const m = e.data;
        if (m.type === "progress") onProgress(m.progress, m.stage);
        else if (m.type === "done") resolve(m.buffer);
        else reject(new Error(m.message));
      };
      worker.onerror = (e) => reject(new Error(e.message || "Assembler crashed."));
      const req: HatFilmWorkerRequest = { type: "assemble", jobId, segments: state.manifest!.segments, logoUrl: state.manifest!.logo_url, soundtrackUrl: state.manifest!.soundtrack_url };
      worker.postMessage(req);
    }).finally(() => worker.terminate());

    onProgress(97, "Saving to your library");
    const up = await call<{ path: string; upload_token: string }>("upload", jobId, { token });
    const { error } = await supabase.storage.from("fuse-assets").uploadToSignedUrl(up.path, up.upload_token, new Blob([buffer], { type: "video/mp4" }), { contentType: "video/mp4" });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    onProgress(99, "Verifying film");
    const done = await call<{ status: string; error: string | null; final_url: string | null }>("complete", jobId, { token, path: up.path });
    if (done.status !== "ready") throw new Error(done.error ?? "The film didn't pass verification.");
    sessionStorage.removeItem(`hatfilm:lock:${jobId}`);
    return done.final_url;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await call("fail", jobId, { token, message }).catch(() => undefined);
    sessionStorage.removeItem(`hatfilm:lock:${jobId}`);
    throw error;
  }
}
