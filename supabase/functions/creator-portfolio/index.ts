/**
 * creator-portfolio (ADDITIVE, READ-ONLY)
 *
 * Reads creator authorship data from the REAL production schema:
 *   - public.fuse_templates (created_by = author's auth user id)
 *   - public.template_versions (latest review_status per template)
 *
 * PATTERN: creator/template/authorship data must be read through this function
 * (service role, real prod tables) — never via client `.from("templates")` /
 * `.from("creators")`, which only exist in the preview project.
 *
 * Modes:
 *   { mode: "own" }                      -> requires a valid JWT, resolves the caller
 *   { mode: "public", handle | user_id } -> public-safe fields only, no PII
 *
 * No generation, Stripe, billing or credit-charging logic is touched.
 */

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  getOptionalUser,
  json,
} from "../_shared/supabase-admin.ts";

type ReviewBucket = "draft" | "submitted" | "approved" | "rejected";

type PortfolioTemplate = {
  id: string;
  name: string | null;
  description: string | null;
  preview_url: string | null;
  created_at: string | null;
  updated_at: string | null;
  review_status: string | null;
};

const emptyPortfolio = {
  templates: [],
  publishedCount: 0,
  buckets: {
    draft: 0,
    submitted: 0,
    approved: 0,
    rejected: 0,
  },
  reviewStatusTracked: false,
};

function toBucket(status: string | null): ReviewBucket | null {
  const value = (status ?? "").trim().toLowerCase();
  if (!value) return null;
  if (value.includes("approve") || value === "published" || value === "live") return "approved";
  if (value.includes("reject") || value.includes("change")) return "rejected";
  if (value.includes("submit") || value.includes("review") || value.includes("pending")) {
    return "submitted";
  }
  if (value.includes("draft") || value.includes("unreviewed")) return "draft";
  return null;
}

async function loadTemplates(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await admin
    .from("fuse_templates")
    .select("id,name,description,preview_url,created_at,updated_at")
    .eq("created_by", userId)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const ids = rows.map((row) => String(row.id));

  const statuses: Record<string, string> = {};
  let reviewStatusTracked = false;

  if (ids.length) {
    const { data: versions, error: versionError } = await admin
      .from("template_versions")
      .select("template_id,review_status,reviewed_at")
      .in("template_id", ids);

    if (!versionError) {
      const latestAt: Record<string, string> = {};
      for (const version of (versions ?? []) as Array<Record<string, unknown>>) {
        const templateId = version.template_id ? String(version.template_id) : null;
        const status = version.review_status ? String(version.review_status) : null;
        if (!templateId || !status) continue;
        const stamp = String(version.reviewed_at ?? "");
        if (!latestAt[templateId] || stamp >= latestAt[templateId]) {
          latestAt[templateId] = stamp;
          statuses[templateId] = status;
        }
      }
      reviewStatusTracked = Object.keys(statuses).length > 0;
    }
  }

  const templates: PortfolioTemplate[] = rows.map((row) => {
    const id = String(row.id);
    return {
      id,
      name: row.name ? String(row.name) : null,
      description: row.description ? String(row.description) : null,
      preview_url: row.preview_url ? String(row.preview_url) : null,
      created_at: row.created_at ? String(row.created_at) : null,
      updated_at: row.updated_at ? String(row.updated_at) : null,
      review_status: statuses[id] ?? null,
    };
  });

  const buckets: Record<ReviewBucket, number> = {
    draft: 0,
    submitted: 0,
    approved: 0,
    rejected: 0,
  };
  for (const template of templates) {
    const bucket = toBucket(template.review_status);
    if (bucket) buckets[bucket] += 1;
  }

  return {
    templates,
    publishedCount: templates.length,
    buckets,
    reviewStatusTracked,
  };
}

async function hasCreatorRole(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "creator")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

async function resolvePublicUserId(
  admin: ReturnType<typeof createAdminClient>,
  input: { handle?: unknown; user_id?: unknown },
) {
  const handle = typeof input.handle === "string" ? input.handle.trim().toLowerCase() : "";
  const requestedUserId = typeof input.user_id === "string" ? input.user_id.trim() : "";

  if (handle) {
    const { data, error } = await admin
      .from("creator_profiles")
      .select("user_id,is_public")
      .eq("handle", handle)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || data.is_public === false) return null;
    return String(data.user_id);
  }

  if (requestedUserId) {
    const { data, error } = await admin
      .from("creator_profiles")
      .select("user_id,is_public")
      .eq("user_id", requestedUserId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || data.is_public === false) return null;
    return String(data.user_id);
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createAdminClient();
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const mode = String((body as Record<string, unknown>).mode ?? "own");

    if (mode === "public") {
      const userId = await resolvePublicUserId(admin, body as Record<string, unknown>);
      if (!userId) return json(emptyPortfolio);
      if (!(await hasCreatorRole(admin, userId))) return json(emptyPortfolio);

      const result = await loadTemplates(admin, userId);
      // Public mode: public-safe template/review fields only. No author PII,
      // no email, no private roles/profile/billing data.
      return json({
        templates: result.templates.map((template) => ({
          id: template.id,
          name: template.name,
          description: template.description,
          preview_url: template.preview_url,
          created_at: template.created_at,
          updated_at: template.updated_at,
          review_status: template.review_status,
        })),
        publishedCount: result.publishedCount,
        buckets: result.buckets,
        reviewStatusTracked: result.reviewStatusTracked,
      });
    }

    const user = await getOptionalUser(req, admin);
    if (!user) return json({ error: "Authentication required" }, 401);
    if (!(await hasCreatorRole(admin, user.id))) return json({ error: "Creator access required" }, 403);

    const result = await loadTemplates(admin, user.id);
    return json(result);
  } catch (error) {
    return json({ error: errorMessage(error) }, 400);
  }
});
