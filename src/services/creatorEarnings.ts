/**
 * CREATOR CASH EARNINGS (read-only).
 *
 * Cash amounts in cents from `creator_earnings` / `creator_payouts`, scoped by
 * RLS to the signed-in creator. These are DOLLARS, never FUSE credits — the two
 * are deliberately kept apart. Payout setup state comes from the existing
 * `creator-connect` edge function; nothing here writes money data.
 */

import { supabase } from "@/integrations/supabase/client";
import { looseTable } from "@/services/looseTable";

export type CreatorEarningRow = {
  id: string;
  created_at: string | null;
  template_id: string | null;
  template_name: string | null;
  creator_earning_cents: number;
  status: string;
  available_at: string | null;
  payout_id: string | null;
};

export type CreatorPayoutRow = {
  id: string;
  created_at: string | null;
  amount_cents: number;
  status: string;
};

export type CreatorEarningsData = {
  pendingCents: number;
  availableCents: number;
  paidCents: number;
  earnings: CreatorEarningRow[];
  payouts: CreatorPayoutRow[];
};

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function str(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

export function formatUsd(cents: number): string {
  return (num(cents) / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

export async function loadCreatorEarnings(userId: string): Promise<CreatorEarningsData> {
  const [earningsRes, payoutsRes] = await Promise.all([
    looseTable("creator_earnings")
      .select("*")
      .eq("creator_id", userId)
      .order("created_at", { ascending: false }),
    looseTable("creator_payouts")
      .select("id, created_at, amount_cents, status")
      .eq("creator_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  if (earningsRes.error) {
    throw new Error((earningsRes.error as { message?: string })?.message ?? "Could not load earnings");
  }

  const rawEarnings = Array.isArray(earningsRes.data)
    ? (earningsRes.data as Array<Record<string, unknown>>)
    : [];

  const earnings: CreatorEarningRow[] = rawEarnings.map((row) => ({
    id: String(row.id ?? ""),
    created_at: str(row.created_at),
    template_id: str(row.template_id),
    template_name: str(row.template_name),
    creator_earning_cents: num(row.creator_earning_cents),
    status: String(row.status ?? ""),
    available_at: str(row.available_at),
    payout_id: str(row.payout_id),
  }));

  const payouts: CreatorPayoutRow[] = (
    Array.isArray(payoutsRes.data) ? (payoutsRes.data as Array<Record<string, unknown>>) : []
  ).map((row) => ({
    id: String(row.id ?? ""),
    created_at: str(row.created_at),
    amount_cents: num(row.amount_cents),
    status: String(row.status ?? ""),
  }));

  const now = Date.now();
  const availableAt = (row: CreatorEarningRow) =>
    row.available_at ? new Date(row.available_at).getTime() : now;

  let pendingCents = 0;
  let availableCents = 0;
  let paidCents = 0;

  for (const row of earnings) {
    if (row.status === "paid") {
      paidCents += row.creator_earning_cents;
      continue;
    }
    if (row.status === "pending" && availableAt(row) > now) {
      pendingCents += row.creator_earning_cents;
      continue;
    }
    if (
      !row.payout_id &&
      availableAt(row) <= now &&
      (row.status === "pending" || row.status === "available")
    ) {
      availableCents += row.creator_earning_cents;
    }
  }

  return { pendingCents, availableCents, paidCents, earnings, payouts };
}

export type ConnectStatus = {
  connected: boolean;
  status: string;
  payouts_enabled: boolean;
};

export async function loadConnectStatus(): Promise<ConnectStatus> {
  const { data, error } = await supabase.functions.invoke("creator-connect", {
    body: { action: "status" },
  });
  if (error) throw new Error(error.message);
  const payload = (data ?? {}) as Record<string, unknown>;
  if (payload.error) throw new Error(String(payload.error));
  return {
    connected: payload.connected === true,
    status: String(payload.status ?? "not_started"),
    payouts_enabled: payload.payouts_enabled === true,
  };
}

/** Returns a Stripe-hosted URL for onboarding or the payouts dashboard. */
export async function requestConnectLink(
  action: "onboard" | "dashboard",
  returnPath?: string,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke("creator-connect", {
    body: returnPath ? { action, returnPath } : { action },
  });
  if (error) throw new Error(error.message);
  const payload = (data ?? {}) as Record<string, unknown>;
  if (payload.error) throw new Error(String(payload.error));
  const url = payload.url ? String(payload.url) : "";
  if (!url) throw new Error("No payout link was returned");
  return url;
}

export type BankAccountRow = {
  id: string | null;
  bank_name: string | null;
  last4: string | null;
  currency: string | null;
  country: string | null;
  status: string | null;
  default_for_currency: boolean;
};

export type BankStatus = ConnectStatus & { bank_accounts: BankAccountRow[] };

/** Read-only: which bank account(s) payouts will land in. */
export async function loadBankStatus(): Promise<BankStatus> {
  const { data, error } = await supabase.functions.invoke("creator-connect", {
    body: { action: "bank_status" },
  });
  if (error) throw new Error(error.message);
  const payload = (data ?? {}) as Record<string, unknown>;
  if (payload.error) throw new Error(String(payload.error));
  const list = Array.isArray(payload.bank_accounts)
    ? (payload.bank_accounts as Array<Record<string, unknown>>)
    : [];
  return {
    connected: payload.connected === true,
    status: String(payload.status ?? "not_started"),
    payouts_enabled: payload.payouts_enabled === true,
    bank_accounts: list.map((row) => ({
      id: str(row.id),
      bank_name: str(row.bank_name),
      last4: str(row.last4),
      currency: str(row.currency),
      country: str(row.country),
      status: str(row.status),
      default_for_currency: row.default_for_currency === true,
    })),
  };
}
