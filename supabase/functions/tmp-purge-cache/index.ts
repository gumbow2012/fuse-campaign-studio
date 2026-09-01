import { createClient } from "jsr:@supabase/supabase-js@2";

const GUARD = "purge-7x2k9q";
const BUCKET = "fuse-assets";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== GUARD) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const body = await req.json().catch(() => ({}));
  const paths: string[] = Array.isArray(body?.paths) ? body.paths : [];
  let ok = 0;
  const failed: string[] = [];
  for (const p of paths) {
    try {
      const dl = await admin.storage.from(BUCKET).download(p);
      if (dl.error || !dl.data) { failed.push(p + " (download)"); continue; }
      const buf = new Uint8Array(await dl.data.arrayBuffer());
      const up = await admin.storage.from(BUCKET).upload(p, buf, {
        contentType: dl.data.type || "application/octet-stream",
        upsert: true,
      });
      if (up.error) { failed.push(p + " (upload: " + up.error.message + ")"); continue; }
      ok++;
    } catch (e) {
      failed.push(p + " (" + String(e) + ")");
    }
  }
  return new Response(JSON.stringify({ requested: paths.length, ok, failed }, null, 2), {
    headers: { "content-type": "application/json" },
  });
});
