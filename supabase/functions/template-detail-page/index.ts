// Public customer-facing template PDP bundle for /templates/:slug — friendly customer inputs, customer counts, video hero, merchandised published gallery.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { canSeeTemplate } from "../_shared/template-visibility.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const RATIOS = new Set(["9:16", "16:9", "1:1", "4:5", "3:4", "2:3", "4:3", "3:2", "5:4", "21:9"]);
const INTERNAL = /swap\s*frame|approved|reference\s*frame|\bframe\s*\d|\bframe\b/i;
const PLACEHOLDER = /^(new\s*input|input|untitled|node|slot|reference)\s*\d*$/i;
/** Same rule as the site's templateSlug(): "Hat Brand Studio" -> "hat-brand-studio". */
const slugify = (name: string) => String(name ?? "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

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

  const COLS = "id,slug,name,description,preview_url,preview_asset_type,allow_customer_edit,visibility";
  let q = admin.from("fuse_templates").select(COLS);
  q = slug ? q.eq("slug", slug) : q.eq("id", tid!);
  let { data: t } = await q.maybeSingle();
  // Cards link by the stored slug when the catalog has one, otherwise by the name. Resolve both, so a
  // template never shows "Campaign not found" just because its link was built from its name.
  if (!t && slug) {
    const { data: all } = await admin.from("fuse_templates").select(COLS);
    t = (all ?? []).find((row: any) => slugify(row.name) === slug) ?? null;
  }
  if (!t) return json({ error: "not found" }, 404);
  if ((t as any).visibility && (t as any).visibility !== "public") {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: who } = token ? await admin.auth.getUser(token) : { data: { user: null } };
    const { data: roleRows } = who?.user ? await admin.from("user_roles").select("role").eq("user_id", who.user.id) : { data: [] };
    if (!canSeeTemplate((t as any).visibility, (roleRows ?? []).map((r: any) => String(r.role)))) return json({ error: "not found" }, 404);
  }

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

  // No cover and no curated gallery: show one of the template's own results (newest finished run, video first).
  let fromRun: any = null;
  if (!gallery.length && !t.preview_url && vid) {
    const { data: job } = await admin.from("execution_jobs").select("id").eq("version_id", vid).eq("status", "complete")
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (job) {
      const { data: steps } = await admin.from("execution_steps")
        .select("nodes!execution_steps_node_id_fkey(node_type,prompt_config), assets!execution_steps_output_asset_id_fkey(supabase_storage_url)")
        .eq("job_id", job.id).not("output_asset_id", "is", null).order("created_at", { ascending: true });
      const outs = (steps ?? []).filter((x: any) => x.assets?.supabase_storage_url && x.nodes?.prompt_config?.output_exposed !== false);
      const pick: any = outs.find((x: any) => x.nodes?.node_type === "video_gen") ?? outs.find((x: any) => x.nodes?.node_type === "image_gen");
      if (pick) {
        fromRun = { id: null, media_type: pick.nodes.node_type === "video_gen" ? "video" : "image", url: await sign(pick.assets.supabase_storage_url), poster_url: null, category: null, is_primary: true };
      }
    }
  }

  const featured = gallery.find((g) => g.is_primary) ?? gallery[0] ?? fromRun
    ?? { id: null, media_type: t.preview_asset_type ?? "image", url: await sign(t.preview_url), poster_url: null, category: null, is_primary: true };
  const hero = (featured.media_type === "video" ? featured : null) ?? gallery.find((g) => g.media_type === "video") ?? featured;

  return json({ template: {
    id: t.id, slug: t.slug, name: t.name, description: t.description,
    aspect_ratio, image_count, video_count, total_outputs: image_count + video_count,
    required_inputs, input_count: required_inputs.length,
    allow_customer_edit: t.allow_customer_edit, hero, featured, gallery,
  } });
});
