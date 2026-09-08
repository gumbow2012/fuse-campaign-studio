// normalize-callback — the worker posts results here. Public (no user JWT); authed
// by the per-job callback_token matching the row. Writes the final metadata.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  try {
    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const b = await req.json();
    if (!b.sourcePath || !b.callbackToken) return new Response("bad request", { status: 400 });

    const { data: row } = await svc
      .from("video_normalizations").select("callback_token").eq("source_path", b.sourcePath).maybeSingle();
    if (!row || row.callback_token !== b.callbackToken) return new Response("unauthorized", { status: 401 });

    await svc.from("video_normalizations").update({
      status: b.status ?? "failed",
      source_codec: b.source_codec ?? null,
      width: b.width ?? null,
      height: b.height ?? null,
      duration: b.duration ?? null,
      fps: b.fps ?? null,
      rotation: b.rotation ?? null,
      is_hdr: b.is_hdr ?? null,
      needs_normalization: b.needs_normalization ?? null,
      normalized_path: b.normalized_path ?? null,
      error: b.error ?? null,
      callback_token: null,
      updated_at: new Date().toISOString(),
    }).eq("source_path", b.sourcePath);

    return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
