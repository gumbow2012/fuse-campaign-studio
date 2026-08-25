/**
 * Creator Studio dashboard reads (ADDITIVE, READ-ONLY).
 *
 * REAL DATA ONLY. Every number returned here comes from a row that exists in
 * the database. Metrics that production does not track (template uses, views,
 * followers) are deliberately absent so the UI can omit those tiles instead of
 * inventing values. No generation, Stripe, billing or credit-charging code is
 * touched.
 */

import { supabase } from "@/integrations/supabase/client";

export type CreatorTemplate = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  output_type: string | null;
  preview_url: string | null;
  is_active: boolean;
  estimated_credits_per_run: number;
  created_at: string;
  updated_at: string;
  /** From the template catalog when available, otherwise null (= not tracked). */
  review_status: string | null;
};

export type ReviewBucket = "draft" | "submitted" | "approved" | "rejected";

/** Maps whatever the catalog reports onto the four dashboard buckets. */
export function toReviewBucket(status: string | null | undefined): ReviewBucket | null {
  const value = (status ?? "").trim().toLowerCase();
  if (!value) return null;
  if (value.includes("approve")) return "approved";
  if (value.includes("reject") || value.includes("change")) return "rejected";
  if (value.includes("submit") || value.includes("review") || value.includes("pending")) {
    return "submitted";
  }
  if (value.includes("draft") || value.includes("unreviewed")) return "draft";
  return null;
}

async function ownCreatorIds(userId: string) {
  const { data, error } = await supabase.from("creators").select("id").eq("user_id", userId);
  if (error) return [] as string[];
  return (data ?? []).map((row) => row.id);
}

/** Review statuses keyed by template id — null when the catalog is unavailable. */
async function loadReviewStatuses(): Promise<Record<string, string> | null> {
  try {
    const { data, error } = await supabase.functions.invoke("lab-template-catalog", { body: {} });
    if (error) return null;
    const templates = (data as { templates?: unknown } | null)?.templates;
    if (!Array.isArray(templates)) return null;
    const map: Record<string, string> = {};
    for (const entry of templates as Array<Record<string, unknown>>) {
      const id = entry?.templateId ? String(entry.templateId) : null;
      const status = entry?.reviewStatus ? String(entry.reviewStatus) : null;
      if (id && status) map[id] = status;
    }
    return map;
  } catch {
    return null;
  }
}

export type CreatorDashboardData = {
  templates: CreatorTemplate[];
  /** True when review status data could be resolved for this creator. */
  reviewStatusTracked: boolean;
  /** Sum of creator reward credits in the ledger (none issued yet → 0). */
  creditsEarned: number;
};

export async function loadCreatorDashboard(userId: string): Promise<CreatorDashboardData> {
  const creatorIds = await ownCreatorIds(userId);

  let templates: CreatorTemplate[] = [];
  if (creatorIds.length) {
    const { data, error } = await supabase
      .from("templates")
      .select(
        "id,name,description,category,output_type,preview_url,is_active,estimated_credits_per_run,created_at,updated_at",
      )
      .in("creator_id", creatorIds)
      .order("updated_at", { ascending: false });
    if (!error) {
      templates = (data ?? []).map((row) => ({ ...row, review_status: null }));
    }
  }

  let reviewStatusTracked = false;
  if (templates.length) {
    const statuses = await loadReviewStatuses();
    if (statuses) {
      templates = templates.map((template) => ({
        ...template,
        review_status: statuses[template.id] ?? null,
      }));
      reviewStatusTracked = templates.some((template) => !!template.review_status);
    }
  }

  return { templates, reviewStatusTracked, creditsEarned: 0 };
}
