/**
 * P5C — ONE authoritative server-side source for creator marketplace economics.
 *
 * Never trust the client for any number in here. Every consumer (charging,
 * earning creation, reversal, read-only cost preview) MUST use this helper —
 * the surcharge formula is defined exactly once.
 *
 * Base campaign pricing is NOT touched here: the surcharge is additive only.
 */

type AdminLike = {
  from: (table: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export type RunEconomics =
  | { monetized: false; surchargeCredits: 0 }
  | {
    monetized: true;
    creatorId: string;
    royaltyCents: number;
    shareBps: number;
    fuseShareBps: number;
    surchargeCredits: number;
    economicsVersion: number | string | null;
    earningCents: number;
    fuseRevenueCents: number;
    payoutHoldDays: number;
  };

const NOT_MONETIZED: RunEconomics = { monetized: false, surchargeCredits: 0 };

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Identical math to P5B: royalty grossed up by the creator share, in credits. */
export function computeSurchargeCredits(args: {
  royaltyCents: number;
  shareBps: number;
  creditsPerUsd: number;
}) {
  const share = args.shareBps / 10000;
  if (!share || !Number.isFinite(share)) return 0;
  return Math.ceil((args.royaltyCents / 100 / share) * args.creditsPerUsd);
}

/**
 * Authoritative economics for a run of `templateId`.
 * Returns `{ monetized: false, surchargeCredits: 0 }` for every FUSE/admin/
 * non-monetized template — those run base-only, completely unchanged.
 */
export async function resolveRunEconomics(
  admin: AdminLike,
  templateId: string | null | undefined,
): Promise<RunEconomics> {
  if (!templateId) return NOT_MONETIZED;

  const { data: template, error: templateError } = await admin
    .from("fuse_templates")
    .select("id, created_by, creator_royalty_cents, monetization_enabled")
    .eq("id", templateId)
    .maybeSingle();
  if (templateError || !template) return NOT_MONETIZED;

  const creatorId = (template as any).created_by ? String((template as any).created_by) : "";
  const monetizationEnabled = (template as any).monetization_enabled === true;
  const rawRoyalty = (template as any).creator_royalty_cents;
  const royaltyRaw = rawRoyalty === null || rawRoyalty === undefined ? 0 : num(rawRoyalty);
  if (!monetizationEnabled || !creatorId || royaltyRaw <= 0) return NOT_MONETIZED;

  const { data: configRow, error: configError } = await admin
    .from("platform_economics_config")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (configError || !configRow) return NOT_MONETIZED;

  const config = configRow as Record<string, unknown>;
  const minCents = num(config.creator_royalty_min_cents, 0);
  const adminMaxCents = num(config.admin_exception_max_cents, num(config.creator_royalty_max_cents, 0));
  const creditsPerUsd = num(config.royalty_credits_per_usd, 0);
  if (creditsPerUsd <= 0) return NOT_MONETIZED;

  const { data: shareData, error: shareError } = await admin.rpc("effective_creator_share_bps", {
    p_user: creatorId,
    p_template: templateId,
  });
  if (shareError) return NOT_MONETIZED;
  const shareBps = Math.round(num(Array.isArray(shareData) ? shareData[0] : shareData, 0));
  if (shareBps <= 0 || shareBps > 10000) return NOT_MONETIZED;

  // Server truth: never above the admin exception ceiling, never below the floor.
  const royaltyCents = Math.round(
    Math.min(Math.max(royaltyRaw, minCents), adminMaxCents > 0 ? adminMaxCents : royaltyRaw),
  );
  if (royaltyCents <= 0) return NOT_MONETIZED;

  const surchargeCredits = computeSurchargeCredits({ royaltyCents, shareBps, creditsPerUsd });
  if (surchargeCredits <= 0) return NOT_MONETIZED;

  const fuseShareBps = 10000 - shareBps;

  return {
    monetized: true,
    creatorId,
    royaltyCents,
    shareBps,
    fuseShareBps,
    surchargeCredits,
    economicsVersion: (config.version as number | string | null) ?? null,
    earningCents: royaltyCents,
    fuseRevenueCents: Math.round((royaltyCents * fuseShareBps) / shareBps),
    payoutHoldDays: num(config.payout_hold_days, 0),
  };
}

/** Key used to stash the immutable run economics snapshot on the job payload. */
export const RUN_ECONOMICS_KEY = "__fuse_run_economics";

export type StoredRunEconomics = {
  base_run_credits: number;
  surcharge_credits: number;
  total_customer_credits: number;
  creator_id: string;
  creator_share_bps: number;
  fuse_share_bps: number;
  royalty_cents: number;
  creator_earning_cents: number;
  fuse_marketplace_revenue_cents: number;
  economics_version: number | string | null;
  payout_hold_days: number;
};

export function buildStoredRunEconomics(
  economics: RunEconomics,
  baseCredits: number,
): StoredRunEconomics | null {
  if (!economics.monetized) return null;
  return {
    base_run_credits: Math.max(0, Math.round(baseCredits)),
    surcharge_credits: economics.surchargeCredits,
    total_customer_credits: Math.max(0, Math.round(baseCredits)) + economics.surchargeCredits,
    creator_id: economics.creatorId,
    creator_share_bps: economics.shareBps,
    fuse_share_bps: economics.fuseShareBps,
    royalty_cents: economics.royaltyCents,
    creator_earning_cents: economics.earningCents,
    fuse_marketplace_revenue_cents: economics.fuseRevenueCents,
    economics_version: economics.economicsVersion,
    payout_hold_days: economics.payoutHoldDays,
  };
}

export function readStoredRunEconomics(payload: unknown): StoredRunEconomics | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>)[RUN_ECONOMICS_KEY];
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (!row.creator_id) return null;
  return {
    base_run_credits: num(row.base_run_credits),
    surcharge_credits: num(row.surcharge_credits),
    total_customer_credits: num(row.total_customer_credits),
    creator_id: String(row.creator_id),
    creator_share_bps: num(row.creator_share_bps),
    fuse_share_bps: num(row.fuse_share_bps),
    royalty_cents: num(row.royalty_cents),
    creator_earning_cents: num(row.creator_earning_cents),
    fuse_marketplace_revenue_cents: num(row.fuse_marketplace_revenue_cents),
    economics_version: (row.economics_version as number | string | null) ?? null,
    payout_hold_days: num(row.payout_hold_days),
  };
}
