/**
 * Campaign history transport (presentation-only wrapper).
 *
 * Reuses the EXISTING paginated `list-recent-runs` edge function untouched —
 * this file only moves the fetch out of TemplateStudioPage so the Studio, the
 * history drawer, and /app/campaigns can share one query.
 */
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";
import type { CampaignRun } from "@/lib/campaignHistory";

export const CAMPAIGN_HISTORY_QUERY_KEY = ["mvp-run-catalog"] as const;
export const CAMPAIGN_HISTORY_PAGE_SIZE = 8;

export type CampaignHistoryPage = {
  jobs: CampaignRun[];
  hasMore: boolean;
  nextOffset: number | null;
};

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Missing authenticated session.");
  }

  return session.access_token;
}

export async function fetchCampaignHistoryPage(limit: number, offset: number): Promise<CampaignHistoryPage> {
  const token = await getAccessToken();
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/list-recent-runs?limit=${limit}&offset=${offset}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_PUBLISHABLE_KEY,
      },
    },
  );

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error ?? "Could not load your campaigns.");
  }

  return {
    jobs: Array.isArray(data?.jobs) ? (data.jobs as CampaignRun[]) : [],
    hasMore: Boolean(data?.hasMore),
    nextOffset: typeof data?.nextOffset === "number" ? data.nextOffset : null,
  };
}
