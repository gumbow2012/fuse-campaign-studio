import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { ACTIVE_CAMPAIGN_STATUSES, type CampaignRun } from "@/lib/campaignHistory";
import {
  CAMPAIGN_HISTORY_PAGE_SIZE,
  CAMPAIGN_HISTORY_QUERY_KEY,
  fetchCampaignHistoryPage,
  type CampaignHistoryPage,
} from "@/services/campaignHistory";

const EMPTY_CAMPAIGNS: CampaignRun[] = [];

/**
 * Shared paginated campaign history. Same query key everywhere, so the Studio,
 * drawer, and library page never refetch each other's pages.
 *
 * History refreshes itself in the background while anything is still building
 * (or while a campaign workspace is open) — no manual refresh control.
 */
export function useCampaignHistory(options: { hasOpenWorkspace?: boolean } = {}) {
  const { hasOpenWorkspace = false } = options;
  const { user } = useAuth();

  const query = useInfiniteQuery<CampaignHistoryPage>({
    queryKey: CAMPAIGN_HISTORY_QUERY_KEY,
    queryFn: ({ pageParam }) => fetchCampaignHistoryPage(CAMPAIGN_HISTORY_PAGE_SIZE, Number(pageParam ?? 0)),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
    enabled: !!user,
    staleTime: 5_000,
    refetchInterval: (q) => {
      const runs = q.state.data?.pages.flatMap((page) => page.jobs) ?? [];
      return hasOpenWorkspace || runs.some((run) => ACTIVE_CAMPAIGN_STATUSES.has(run.status)) ? 5_000 : false;
    },
  });

  const campaigns = useMemo(
    () => query.data?.pages.flatMap((page) => page.jobs) ?? EMPTY_CAMPAIGNS,
    [query.data],
  );

  return { query, campaigns };
}
