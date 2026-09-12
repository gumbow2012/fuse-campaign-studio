// Public customer-facing template PDP bundle for /templates/:slug — friendly customer inputs, customer counts, video hero, merchandised published gallery.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const RATIOS = new Set(["9:16", "16:9", "1:1", "4:5", "3:4", "2:3", "4:3", "3:2", "5:4", "21:9"]);
const INTERNAL = /swap\s*frame|approved|reference\s*frame|\bframe\s*\d|\bframe\b/i;
const PLACEHOLDER = /^(new\s*input|input|untitled|node|slot|reference)\s*\d*$/i;
function friendly(name: string): string {
  const raw = String(name ?? "").trim();
  const parts = raw.split("·");
  let s = (parts.length > 1 ? parts[parts.length - 1] : raw)
    .replace(/^\s*(product\s+reference|reference|input|ref)\s*\d*\s*[:\-]?\s*/i, "").trim();
  if (!s || PLACEHOLDER.test(s) || PLACEHOLDER.test(raw)) return "Product";
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  let slug: string | null = null, tid: string | null = null;
  if (req.method === "GET") { const u = new URL(req.url); slug = u.searchParams.get("slug"); tid = u.searchParams.get("template_id"); }
  else { const b = await req.json().catch(() => ({})) as any; slug = b.slug ?? null; tid = b.template_id ?? null; }
  if (!slug && !tid) return json({ error: "slug or template_id required" }, 400);

  let q = admin.from("fuse_templates").select("id,slug,name,description,preview_url,preview_asset_type,allow_customer_edit");
  q = slug ? q.eq("slug", slug) : q.eq("id", tid!);
  const { data: t } = await q.maybeSingle();
  if (!t) return json({ error: "not found" }, 404);

  const { data: ver } = await admin.from("template_versions").select("id").eq("template_id", t.id).eq("is_active", true).order("version_number", { ascending: false }).limit(1).maybeSingle();
  const vid = ver?.id;

  let required_inputs: any[] = [], image_count = 0, video_count = 0, aspect_ratio = "9:16";
  if (vid) {
    const { data: nodes } = await admin.from("nodes").select("id,node_type,name,prompt_config").eq("version_id", vid);
    // Aspect ratio is whatever the exposed video nodes actually declare (most frequent wins).
    const ratioCounts: Record<string, number> = {};
    for (const n of nodes ?? []) {
      const c = (n as any).prompt_config ?? {};
      // Every upload slot the customer fills, whether or not it is flagged required.
      if (n.node_type === "user_input" && String(c.editor_mode ?? "") === "upload" && !INTERNAL.test(String(n.name))) {
        required_inputs.push({
          key: String(c.editor_slot_key ?? n.name),
          name: n.name,
          label: friendly(String(c.editor_label ?? n.name)),
          expected: c.expected ?? "image",
          required: c.required !== false,
          sort_order: Number(c.sort_order ?? 0) || 0,
        });
      }
      const exposed = c.output_exposed === true || c.output_exposed === "true";
      if (exposed && n.node_type === "image_gen") image_count++;
      if (exposed && n.node_type === "video_gen") {
        video_count++;
        const r = String(c.aspect_ratio ?? "").trim();
        if (r && RATIOS.has(r)) ratioCounts[r] = (ratioCounts[r] ?? 0) + 1;
      }
    }
    const ranked = Object.entries(ratioCounts).sort((a, b) => b[1] - a[1]);
    if (ranked.length) aspect_ratio = ranked[0][0];

    required_inputs.sort((a, b) => (a.sort_order - b.sort_order) || String(a.name).localeCompare(String(b.name)));
    for (const r of required_inputs) delete r.sort_order;
    // number duplicate labels ("Product", "Product" -> "Product 1", "Product 2")
    const counts: Record<string, number> = {};
    for (const r of required_inputs) counts[r.label] = (counts[r.label] ?? 0) + 1;
    const seen: Record<string, number> = {};
    for (const r of required_inputs) { if (counts[r.label] > 1) { seen[r.label] = (seen[r.label] ?? 0) + 1; r.label = `${r.label} ${seen[r.label]}`; } }
  }

  const { data: media } = await admin.from("template_preview_media")
    .select("id,media_type,source_path,poster_path,alt,label,category,sort_order,is_primary")
    .eq("template_id", t.id).eq("published", true).order("is_primary", { ascending: false }).order("sort_order", { ascending: true });
  // Storage key only for fuse-assets object URLs or bare keys. Absolute http(s) URLs AND site-relative
  // paths (/template-previews/x.gif) pass through untouched — treating the latter as a key made
  // createSignedUrl fail → null → "Preview coming soon".
  const keyOf = (u: string) => { if (!u) return null; const m = u.match(/\/object\/(?:public|sign|authenticated)\/fuse-assets\/([^?]+)$/); if (m) return m[1]; if (/^https?:/i.test(u) || u.startsWith("/")) return null; return u; };
  const sign = async (p: string | null) => { if (!p) return null; const k = keyOf(p); if (!k) return p; const { data } = await admin.storage.from("fuse-assets").createSignedUrl(k, 3600); return data?.signedUrl ?? null; };
  const gallery = [];
  for (const m of media ?? []) gallery.push({ id: m.id, media_type: m.media_type, url: await sign(m.source_path), poster_url: await sign(m.poster_path), alt: m.alt, label: m.label, category: m.category ?? null, is_primary: m.is_primary });

  const featured = gallery.find((g) => g.is_primary) ?? gallery[0]
    ?? { id: null, media_type: t.preview_asset_type ?? "image", url: await sign(t.preview_url), poster_url: null, category: null, is_primary: true };
  const hero = (featured.media_type === "video" ? featured : null) ?? gallery.find((g) => g.media_type === "video") ?? featured;

  return json({ template: {
    id: t.id, slug: t.slug, name: t.name, description: t.description,
    aspect_ratio, image_count, video_count, total_outputs: image_count + video_count,
    required_inputs, input_count: required_inputs.length,
    allow_customer_edit: t.allow_customer_edit, hero, featured, gallery,
  } });
});
