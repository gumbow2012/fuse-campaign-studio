// HAT BRAND FILM — admin-only, idempotent draft seed.
// Creates (or reports) the draft template, an INACTIVE version, and its graph
// using fixed ids. Never touches any other template. No provider calls.
// POST {"action":"status"} or {"action":"seed"}.
import { corsHeaders, createAdminClient, errorMessage, json, requireTesterUser } from "../_shared/supabase-admin.ts";
import { buildHatFilmGraph, HAT_FILM_TEMPLATE_ID, HAT_FILM_VERSION_ID } from "../_shared/hat-film-graph.ts";
import { HAT_FILM_SOUNDTRACK_PATH } from "../_shared/hat-film-recipe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createAdminClient();
  try {
    const user = await requireTesterUser(req, admin);
    const body = await req.json().catch(() => ({}));
    const graph = buildHatFilmGraph();

    const status = async () => {
      const [{ data: t }, { data: v }, { count: nodeCount }, { count: edgeCount }, sound] = await Promise.all([
        admin.from("fuse_templates").select("id, name").eq("id", HAT_FILM_TEMPLATE_ID).maybeSingle(),
        admin.from("template_versions").select("id, is_active, review_status").eq("id", HAT_FILM_VERSION_ID).maybeSingle(),
        admin.from("nodes").select("id", { count: "exact", head: true }).eq("version_id", HAT_FILM_VERSION_ID),
        admin.from("edges").select("id", { count: "exact", head: true }).eq("version_id", HAT_FILM_VERSION_ID),
        admin.storage.from("fuse-assets").createSignedUrl(HAT_FILM_SOUNDTRACK_PATH, 60),
      ]);
      return {
        template_id: HAT_FILM_TEMPLATE_ID, version_id: HAT_FILM_VERSION_ID,
        template_exists: !!t, version: v ?? null,
        nodes: nodeCount ?? 0, edges: edgeCount ?? 0, expected_nodes: graph.nodes.length, expected_edges: graph.edges.length,
        soundtrack_present: !!sound.data?.signedUrl,
      };
    };

    if (body.action === "seed") {
      // Upserts on fixed ids: a partial earlier seed is completed, never duplicated.
      // The version stays inactive; nothing else is touched.
      const steps: Array<[string, () => PromiseLike<{ error: { message: string } | null }>]> = [
        ["template", () => admin.from("fuse_templates").upsert({ ...graph.template, created_by: user.id }, { onConflict: "id", ignoreDuplicates: true })],
        ["version", () => admin.from("template_versions").upsert({ ...graph.version, is_active: false }, { onConflict: "id", ignoreDuplicates: true })],
        ["nodes", () => admin.from("nodes").upsert(graph.nodes, { onConflict: "id" })],
        ["edges", () => admin.from("edges").upsert(graph.edges, { onConflict: "id" })],
      ];
      for (const [name, run] of steps) {
        const { error } = await run();
        if (error) throw new Error(`${name}: ${error.message}`);
      }
      const after = await status();
      const complete = after.nodes === after.expected_nodes && after.edges === after.expected_edges;
      return json({ seeded: complete, ...after });
    }
    return json(await status());
  } catch (error) {
    return json({ error: errorMessage(error) }, /access|auth|token/i.test(errorMessage(error)) ? 403 : 400);
  }
});
