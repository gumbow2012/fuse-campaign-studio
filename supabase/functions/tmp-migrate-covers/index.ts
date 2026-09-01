import { createClient } from "jsr:@supabase/supabase-js@2";

const GUARD = "mig-9f3a2c7e";
const SRC = "fuse-assets";
const DST = "fuse-public";
const PREFIX = "system/template-covers/";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== GUARD) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  async function listAll(prefix: string): Promise<string[]> {
    const out: string[] = [];
    const { data, error } = await admin.storage.from(SRC).list(prefix, { limit: 1000 });
    if (error) throw new Error("list " + prefix + ": " + error.message);
    for (const item of data ?? []) {
      const full = prefix + item.name;
      if ((item as any).id === null && !(item as any).metadata) {
        out.push(...await listAll(full + "/"));
      } else {
        out.push(full);
      }
    }
    return out;
  }
  try {
    const paths = await listAll(PREFIX);
    let ok = 0; const failed: string[] = [];
    for (const p of paths) {
      const dl = await admin.storage.from(SRC).download(p);
      if (dl.error || !dl.data) { failed.push(p + " (download)"); continue; }
      const buf = new Uint8Array(await dl.data.arrayBuffer());
      const up = await admin.storage.from(DST).upload(p, buf, {
        contentType: dl.data.type || "application/octet-stream",
        upsert: true,
      });
      if (up.error) { failed.push(p + " (upload: " + up.error.message + ")"); continue; }
      ok++;
    }
    return new Response(JSON.stringify({ total: paths.length, ok, failed }, null, 2), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
