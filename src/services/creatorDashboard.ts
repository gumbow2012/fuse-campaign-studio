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


export type CreatorAnalyticsTemplate = {
  template_id: string;
  name: string | null;
  runs: number;
  successfulRuns: number;
  lastRunAt: string | null;
};

export type CreatorAnalytics = {
  totalRuns: number;
  runsLast30d: number;
  runsLast7d: number;
  successfulRuns: number;
  failedRuns: number;
  successRate: number;
  perTemplate: CreatorAnalyticsTemplate[];
  daily: Array<{ date: string; runs: number }>;
  templateCount: number;
};

/**
 * READ-ONLY run attribution for the creator's own templates, aggregated
 * server-side by the `creator-analytics` edge function (execution_jobs is
 * RLS-scoped per running user, so it cannot be aggregated in the browser).
 */
export async function loadCreatorAnalytics(): Promise<CreatorAnalytics> {
  const { data, error } = await supabase.functions.invoke("creator-analytics", {
    body: {},
  });
  if (error) throw new Error(error.message);

  const payload = (data ?? {}) as Partial<CreatorAnalytics> & { error?: string };
  if (payload.error) throw new Error(payload.error);

  return {
    totalRuns: Number(payload.totalRuns ?? 0),
    runsLast30d: Number(payload.runsLast30d ?? 0),
    runsLast7d: Number(payload.runsLast7d ?? 0),
    successfulRuns: Number(payload.successfulRuns ?? 0),
    failedRuns: Number(payload.failedRuns ?? 0),
    successRate: Number(payload.successRate ?? 0),
    perTemplate: Array.isArray(payload.perTemplate) ? payload.perTemplate : [],
    daily: Array.isArray(payload.daily) ? payload.daily : [],
    templateCount: Number(payload.templateCount ?? 0),
  };
}

export type CreatorChallenge = {
  id: string;
  title: string | null;
  description: string | null;
  brief: string | null;
  reward_note: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string | null;
};

/**
 * READ-ONLY active challenges from `public.creator_challenges` (public SELECT
 * is limited to status='active' by RLS). Preview types don't include the table,
 * so the client is loosely typed here.
 */
export async function loadCreatorChallenges(): Promise<CreatorChallenge[]> {
  const client = supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          order: (
            column: string,
            options: { ascending: boolean },
          ) => Promise<{ data: unknown; error: { message: string } | null }>;
        };
      };
    };
  };

  const { data, error } = await client
    .from("creator_challenges")
    .select("id,title,description,brief,reward_note,starts_at,ends_at,created_at")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) return [];

  return (data as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    title: row.title ? String(row.title) : null,
    description: row.description ? String(row.description) : null,
    brief: row.brief ? String(row.brief) : null,
    reward_note: row.reward_note ? String(row.reward_note) : null,
    starts_at: row.starts_at ? String(row.starts_at) : null,
    ends_at: row.ends_at ? String(row.ends_at) : null,
    created_at: row.created_at ? String(row.created_at) : null,
  }));
}

/* ------------------------- SOCIAL (additive, public) ------------------------ */

/** Earned-only public badge (never criteria, rewards or locked progress). */
export type CreatorPublicAchievement = {
  key: string;
  title: string;
  description: string | null;
  icon: string | null;
  tier: string | null;
  unlockedAt: string | null;
};

export type CreatorSocialPublic = {
  followerCount: number;
  isFollowing: boolean;
  /** 'creator' | 'verified' | 'featured' | 'partner'. Never includes a reason. */
  verificationStatus: string;
  verifiedAt: string | null;
  publishedCount: number;
  /** Only achievements the creator has actually earned. */
  achievements: CreatorPublicAchievement[];
};

/**
 * Public follower count + the viewer's follow state + PUBLIC verification
 * fields + EARNED achievements, resolved server-side by `creator-portfolio`
 * (service role). The viewer is resolved from the request's bearer token inside
 * the function — `verification_reason` is never returned.
 */
export async function loadCreatorSocialPublic(input: {
  handle?: string;
  userId?: string;
}): Promise<CreatorSocialPublic> {
  const empty: CreatorSocialPublic = {
    followerCount: 0,
    isFollowing: false,
    verificationStatus: "creator",
    verifiedAt: null,
    publishedCount: 0,
    achievements: [],
  };

  const { data, error } = await supabase.functions.invoke("creator-portfolio", {
    body: { mode: "public", handle: input.handle, user_id: input.userId },
  });
  if (error) return empty;

  const payload = (data ?? {}) as Record<string, unknown>;
  const achievements = Array.isArray(payload.achievements)
    ? (payload.achievements as Array<Record<string, unknown>>)
        .filter((row) => row && typeof row === "object")
        .map((row) => ({
          key: String(row.key ?? ""),
          title: String(row.title ?? row.key ?? ""),
          description: row.description ? String(row.description) : null,
          icon: row.icon ? String(row.icon) : null,
          tier: row.tier ? String(row.tier) : null,
          unlockedAt: row.unlocked_at ? String(row.unlocked_at) : null,
        }))
        .filter((row) => row.key.length > 0)
    : [];

  return {
    followerCount: Number(payload.followerCount ?? 0),
    isFollowing: payload.isFollowing === true,
    verificationStatus: String(payload.verification_status ?? "creator"),
    verifiedAt: payload.verified_at ? String(payload.verified_at) : null,
    publishedCount: Number(payload.publishedCount ?? 0),
    achievements,
  };
}

