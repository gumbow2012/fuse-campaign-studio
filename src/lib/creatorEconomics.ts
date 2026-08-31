/**
 * Single source of truth for creator economics settings.
 *
 * Reads the active row from `public.platform_economics_config` (authenticated-readable).
 * NEVER hardcode share/royalty/payout numbers anywhere in the app — read them from here.
 */

import { supabase } from "@/integrations/supabase/client";

export type PlatformEconomicsConfig = {
  id: string;
  defaultCreatorShareBps: number;
  creatorShareMinBps: number;
  creatorShareMaxBps: number;
  creatorRoyaltyMinCents: number;
  creatorRoyaltyMaxCents: number;
  adminExceptionMaxCents: number;
  recommendedRoyaltyCents: number;
  royaltyCreditsPerUsd: number;
  payoutHoldDays: number;
  payoutMinimumCents: number;
  payoutCadence: string;
};

type LooseResult = { data: unknown; error: { message: string } | null };
interface LooseBuilder extends PromiseLike<LooseResult> {
  select: (columns?: string) => LooseBuilder;
  eq: (column: string, value: unknown) => LooseBuilder;
  order: (column: string, options?: { ascending: boolean }) => LooseBuilder;
  limit: (count: number) => LooseBuilder;
  maybeSingle: () => PromiseLike<LooseResult>;
}
const db = supabase as unknown as { from: (table: string) => LooseBuilder };

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

let cached: PlatformEconomicsConfig | null = null;
let inFlight: Promise<PlatformEconomicsConfig | null> | null = null;

export function bpsToPercent(bps: number): number {
  return Math.round(bps / 100);
}

export function percentToBps(percent: number): number {
  return Math.round(percent) * 100;
}

/** Fetches (and memoizes) the active economics config. Returns null if unavailable. */
export async function loadPlatformEconomicsConfig(
  options: { force?: boolean } = {},
): Promise<PlatformEconomicsConfig | null> {
  if (cached && !options.force) return cached;
  if (inFlight && !options.force) return inFlight;

  inFlight = (async () => {
    const { data, error } = await db
      .from("platform_economics_config")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data || typeof data !== "object") return null;

    const row = data as Record<string, unknown>;
    const config: PlatformEconomicsConfig = {
      id: String(row.id ?? ""),
      defaultCreatorShareBps: num(row.default_creator_share_bps),
      creatorShareMinBps: num(row.creator_share_min_bps),
      creatorShareMaxBps: num(row.creator_share_max_bps),
      creatorRoyaltyMinCents: num(row.creator_royalty_min_cents),
      creatorRoyaltyMaxCents: num(row.creator_royalty_max_cents),
      adminExceptionMaxCents: num(row.admin_exception_max_cents),
      recommendedRoyaltyCents: num(row.recommended_royalty_cents),
      royaltyCreditsPerUsd: num(row.royalty_credits_per_usd),
      payoutHoldDays: num(row.payout_hold_days),
      payoutMinimumCents: num(row.payout_minimum_cents),
      payoutCadence: String(row.payout_cadence ?? ""),
    };
    cached = config;
    return config;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}
