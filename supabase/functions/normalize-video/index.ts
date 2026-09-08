// normalize-video — client calls this after upload. Idempotent per source_path.
// Mints short-lived signed download+upload URLs, kicks the stateless worker, and
// doubles as the poll endpoint. Also returns a fresh playback URL when ready.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "fuse-assets";
const STALE_MS = 10 * 60 * 1000; // re-kick a 'converting' job only if older than this

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function normalizedPathFor(p: string) {
  const slash = p.lastIndexOf("/");
  const dir = slash >= 0 ? p.slice(0, slash + 1) : "";
  const name = slash >= 0 ? p.slice(slash + 1) : p;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${dir}normalized/${base}.h264.mp4`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const svc = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const authHeader = req.headers.get("Authorization") || "";
    const { data: userData } = await svc.auth.getUser(authHeader.replace("Bearer ", ""));
    const userId = userData?.user?.id ?? null;

    const { sourcePath, retry } = await req.json();
    if (!sourcePath) return json({ error: "sourcePath required" }, 400);

    const { data: existing } = await svc
      .from("video_normalizations").select("*").eq("source_path", sourcePath).maybeSingle();

    if (existing && existing.status === "ready" && !retry) {
      return json(await withPlayback(svc, existing));
    }
    if (
      existing && existing.status === "converting" && !retry &&
      Date.now() - new Date(existing.updated_at).getTime() < STALE_MS
    ) {
      return json(await withPlayback(svc, existing));
    }

    const normPath = normalizedPathFor(sourcePath);
    const callbackToken = crypto.randomUUID();

    const [{ data: cfgRows }, dl, ul] = await Promise.all([
      svc.from("service_config").select("key,value").in("key", ["normalize_worker_url", "normalize_worker_key"]),
      svc.storage.from(BUCKET).createSignedUrl(sourcePath, 1800),
      svc.storage.from(BUCKET).createSignedUploadUrl(normPath, { upsert: true }),
    ]);
    const cfg = Object.fromEntries((cfgRows ?? []).map((r) => [r.key, r.value]));
    if (dl.error || !dl.data?.signedUrl) return fail(svc, sourcePath, userId, `sign download: ${dl.error?.message}`);
    if (ul.error || !ul.data?.signedUrl) return fail(svc, sourcePath, userId, `sign upload: ${ul.error?.message}`);

    const workerUrl = cfg["normalize_worker_url"];
    const workerKey = cfg["normalize_worker_key"];
    if (!workerUrl) return fail(svc, sourcePath, userId, "normalization worker not configured");

    await svc.from("video_normalizations").upsert({
      source_path: sourcePath, user_id: userId, original_path: sourcePath,
      normalized_path: normPath, status: "converting", callback_token: callbackToken,
      error: null, attempts: (existing?.attempts ?? 0) + 1, updated_at: new Date().toISOString(),
    }, { onConflict: "source_path" });

    // The worker processes synchronously (keeps its Cloud Run request in-flight so the
    // instance stays alive + CPU allocated until the job finishes). We fire it via
    // waitUntil so this response returns immediately; the client then polls for status.
    const kick = fetch(`${workerUrl.replace(/\/$/, "")}/normalize`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-normalize-key": workerKey },
      body: JSON.stringify({
        sourcePath, normalizedPath: normPath,
        downloadUrl: dl.data.signedUrl, uploadUrl: ul.data.signedUrl,
        callbackUrl: `${SUPABASE_URL}/functions/v1/normalize-callback`, callbackToken,
      }),
    }).then(async (r) => {
      if (r.status === 400 || r.status === 401) {
        await svc.from("video_normalizations").update({
          status: "failed", error: `worker rejected (${r.status})`, updated_at: new Date().toISOString(),
        }).eq("source_path", sourcePath);
      }
    }).catch(async (e) => {
      await svc.from("video_normalizations").update({
        status: "failed", error: `worker unreachable: ${e}`, updated_at: new Date().toISOString(),
      }).eq("source_path", sourcePath);
    });
    // @ts-ignore EdgeRuntime is provided by the Supabase edge runtime
    try { EdgeRuntime.waitUntil(kick); } catch { await kick; }

    const { data: row } = await svc.from("video_normalizations").select("*").eq("source_path", sourcePath).maybeSingle();
    return json(row);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

async function withPlayback(svc: any, row: any) {
  const path = row.normalized_path || row.original_path || row.source_path;
  const { data } = await svc.storage.from(BUCKET).createSignedUrl(path, 3600);
  return { ...row, playback_url: data?.signedUrl ?? null };
}
async function fail(svc: any, sourcePath: string, userId: string | null, error: string) {
  await svc.from("video_normalizations").upsert({
    source_path: sourcePath, user_id: userId, status: "failed", error, updated_at: new Date().toISOString(),
  }, { onConflict: "source_path" });
  return json({ source_path: sourcePath, status: "failed", error });
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
}
