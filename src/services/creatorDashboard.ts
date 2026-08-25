/**
 * Creator Studio dashboard reads (ADDITIVE, READ-ONLY).
 *
 * PRODUCTION SCHEMA: authorship lives in `fuse_templates.created_by` +
 * `template_versions.review_status`, which are NOT reachable from the browser
 * client. All creator/template/authorship reads therefore go through the
 * `creator-portfolio` edge function (service role, real prod tables). Never
 * query `.from("templates")` / `.from("creators")` for this data — those tables
 * only exist in the preview project.
 *
 * REAL DATA ONLY. Metrics production does not track (template uses, views,
 * followers) are deliberately absent so the UI can omit those tiles. No
 * generation, Stripe, billing or credit-charging code is touched.
 */

import { supabase } from "@/integrations/supabase/client";

export type CreatorTemplate = {
  id: string;
  name: string | null;
  description: string | null;
  preview_url: string | null;
  created_at: string | null;
  updated_at: string | null;
  /** Latest `template_versions.review_status`, or null when not tracked. */
  review_status: string | null;
};

export type ReviewBucket = "draft" | "submitted" | "approved" | "rejected";

export type ReviewBucketCounts = Record<ReviewBucket, number>;

const EMPTY_BUCKETS: ReviewBucketCounts = {
  draft: 0,
  submitted: 0,
  approved: 0,
  rejected: 0,
};

/** Maps whatever review_status production reports onto the four buckets. */
export function toReviewBucket(status: string | null | undefined): ReviewBucket | null {
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

export type CreatorDashboardData = {
  templates: CreatorTemplate[];
  /** Real count from `fuse_templates.created_by` via `creator-portfolio`. */
  publishedCount: number;
  /** Latest `template_versions.review_status` collapsed into review buckets. */
  reviewBuckets: ReviewBucketCounts;
  /** True when review status data could be resolved for this creator. */
  reviewStatusTracked: boolean;
  /** Sum of creator reward credits in the ledger (no reward type yet → 0). */
  creditsEarned: number;
};

type PortfolioResponse = {
  templates?: CreatorTemplate[];
  publishedCount?: number;
  buckets?: Partial<ReviewBucketCounts> | null;
  reviewStatusTracked?: boolean;
  error?: string;
};

function normalizeBuckets(input: PortfolioResponse["buckets"]): ReviewBucketCounts {
  return {
    draft: Number(input?.draft ?? 0),
    submitted: Number(input?.submitted ?? 0),
    approved: Number(input?.approved ?? 0),
    rejected: Number(input?.rejected ?? 0),
  };
}

export async function loadCreatorDashboard(_userId: string): Promise<CreatorDashboardData> {
  const empty: CreatorDashboardData = {
    templates: [],
    publishedCount: 0,
    reviewBuckets: { ...EMPTY_BUCKETS },
    reviewStatusTracked: false,
    creditsEarned: 0,
  };

  const { data, error } = await supabase.functions.invoke("creator-portfolio", {
    body: { mode: "own" },
  });
  if (error) return empty;

  const payload = (data ?? {}) as PortfolioResponse;
  if (payload.error || !Array.isArray(payload.templates)) return empty;

  return {
    templates: payload.templates,
    publishedCount:
      typeof payload.publishedCount === "number" ? payload.publishedCount : payload.templates.length,
    reviewBuckets: normalizeBuckets(payload.buckets),
    reviewStatusTracked: !!payload.reviewStatusTracked,
    creditsEarned: 0,
  };
}

/** Public profile metric — real prod count via the same edge function. */
export async function countCreatorTemplatesPublic(input: {
  handle?: string;
  userId?: string;
}): Promise<number> {
  const { data, error } = await supabase.functions.invoke("creator-portfolio", {
    body: { mode: "public", handle: input.handle, user_id: input.userId },
  });
  if (error) return 0;
  const count = (data as { publishedCount?: unknown } | null)?.publishedCount;
  return typeof count === "number" ? count : 0;
}

export type CreatorReward = {
  id: string;
  amount: number;
  description: string | null;
  created_at: string | null;
};

/**
 * READ-ONLY creator reward ledger rows. The `creator_reward` ledger type does
 * not exist yet, so this legitimately returns an empty array today.
 */
export async function loadCreatorRewards(userId: string): Promise<CreatorReward[]> {
  try {
    const { data, error } = await supabase
      .from("credit_ledger")
      .select("id, amount, description, created_at")
      .eq("user_id", userId)
      .eq("type", "creator_reward" as never)
      .order("created_at", { ascending: false });
    if (error || !Array.isArray(data)) return [];
    return data.map((row) => ({
      id: String(row.id),
      amount: Number(row.amount ?? 0),
      description: row.description ?? null,
      created_at: row.created_at ?? null,
    }));
  } catch {
    return [];
  }
}

