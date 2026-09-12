import { supabase } from "@/integrations/supabase/client";

export type AdminEarningRow = {
  id: string;
  creator_id: string;
  creator_earning_cents: number;
  status: string;
  available_at: string | null;
  payout_id: string | null;
  paid_at: string | null;
  created_at: string;
};

export type AdminPayoutRow = {
  id: string;
  creator_id: string;
  amount_cents: number;
  currency: string | null;
  status: string;
  earning_count: number | null;
  stripe_transfer_id: string | null;
  stripe_payout_id: string | null;
  failure_reason: string | null;
  paid_at: string | null;
  created_at: string;
};

export type AdminConnectRow = {
  user_id: string;
  stripe_account_id: string;
  onboarding_status: string | null;
  payouts_enabled: boolean | null;
  country: string | null;
  last_synced_at: string | null;
};

export type CreatorIdentity = {
  user_id: string;
  name: string | null;
  email: string | null;
};

export type CreatorMoneyRow = {
  creatorId: string;
  name: string | null;
  email: string | null;
  pendingCents: number;
  availableCents: number;
  paidCents: number;
  lifetimeCents: number;
  earningCount: number;
  connect: AdminConnectRow | null;
  payouts: AdminPayoutRow[];
};

export type AdminPayoutsSnapshot = {
  creators: CreatorMoneyRow[];
  payouts: AdminPayoutRow[];
  totals: {
    pendingCents: number;
    availableCents: number;
    paidCents: number;
    creatorsWithMoney: number;
    payoutsReady: number;
  };
};

export function formatCents(cents: number | null | undefined) {
  const value = Number(cents ?? 0) / 100;
  return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function formatDateTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Cash-state classification must match the payout function exactly. */
function classify(row: AdminEarningRow, nowMs: number) {
  const availableMs = row.available_at ? new Date(row.available_at).getTime() : 0;
  if (row.status === "paid") return "paid" as const;
  if (row.status === "reversed") return "reversed" as const;
  if (!row.payout_id && availableMs <= nowMs && (row.status === "pending" || row.status === "available")) {
    return "available" as const;
  }
  if (row.status === "pending" && availableMs > nowMs) return "pending" as const;
  return "other" as const;
}

export async function loadAdminPayoutsSnapshot(): Promise<AdminPayoutsSnapshot> {
  const [earningsRes, payoutsRes, connectRes] = await Promise.all([
    supabase
      .from("creator_earnings")
      .select("id, creator_id, creator_earning_cents, status, available_at, payout_id, paid_at, created_at")
      .order("created_at", { ascending: false })
      .limit(5000),
    supabase
      .from("creator_payouts")
      .select(
        "id, creator_id, amount_cents, currency, status, earning_count, stripe_transfer_id, stripe_payout_id, failure_reason, paid_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("creator_connect_accounts")
      .select("user_id, stripe_account_id, onboarding_status, payouts_enabled, country, last_synced_at"),
  ]);

  if (earningsRes.error) throw new Error(earningsRes.error.message);
  if (payoutsRes.error) throw new Error(payoutsRes.error.message);
  if (connectRes.error) throw new Error(connectRes.error.message);

  const earnings = (earningsRes.data ?? []) as AdminEarningRow[];
  const payouts = (payoutsRes.data ?? []) as AdminPayoutRow[];
  const connects = (connectRes.data ?? []) as AdminConnectRow[];

  const creatorIds = Array.from(
    new Set([...earnings.map((e) => e.creator_id), ...payouts.map((p) => p.creator_id)].filter(Boolean)),
  );

  let identities: CreatorIdentity[] = [];
  if (creatorIds.length) {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, name, email")
      .in("user_id", creatorIds);
    identities = (data ?? []) as CreatorIdentity[];
  }
  const identityById = new Map(identities.map((i) => [i.user_id, i]));
  const connectById = new Map(connects.map((c) => [c.user_id, c]));

  const nowMs = Date.now();
  const byCreator = new Map<string, CreatorMoneyRow>();
  const ensure = (creatorId: string): CreatorMoneyRow => {
    let row = byCreator.get(creatorId);
    if (!row) {
      const identity = identityById.get(creatorId);
      row = {
        creatorId,
        name: identity?.name ?? null,
        email: identity?.email ?? null,
        pendingCents: 0,
        availableCents: 0,
        paidCents: 0,
        lifetimeCents: 0,
        earningCount: 0,
        connect: connectById.get(creatorId) ?? null,
        payouts: [],
      };
      byCreator.set(creatorId, row);
    }
    return row;
  };

  for (const earning of earnings) {
    const row = ensure(earning.creator_id);
    const cents = Number(earning.creator_earning_cents ?? 0);
    const state = classify(earning, nowMs);
    row.earningCount += 1;
    if (state === "paid") {
      row.paidCents += cents;
      row.lifetimeCents += cents;
    } else if (state === "available") {
      row.availableCents += cents;
      row.lifetimeCents += cents;
    } else if (state === "pending") {
      row.pendingCents += cents;
      row.lifetimeCents += cents;
    }
  }

  for (const payout of payouts) {
    ensure(payout.creator_id).payouts.push(payout);
  }

  const creators = Array.from(byCreator.values()).sort(
    (a, b) => b.availableCents - a.availableCents || b.pendingCents - a.pendingCents,
  );

  const totals = creators.reduce(
    (acc, c) => {
      acc.pendingCents += c.pendingCents;
      acc.availableCents += c.availableCents;
      acc.paidCents += c.paidCents;
      if (c.pendingCents + c.availableCents + c.paidCents > 0) acc.creatorsWithMoney += 1;
      if (c.availableCents > 0) acc.payoutsReady += 1;
      return acc;
    },
    { pendingCents: 0, availableCents: 0, paidCents: 0, creatorsWithMoney: 0, payoutsReady: 0 },
  );

  return { creators, payouts, totals };
}

export type PayoutPreview = {
  creator_id: string;
  eligible_count: number;
  amount_cents: number;
  min_payout_cents: number;
  meets_minimum: boolean;
};

export type PayoutExecuteResult = {
  payout_id?: string;
  status?: string;
  stripe_transfer_id?: string;
  amount_cents?: number;
  earning_count?: number;
};

function invokeError(error: unknown, data: unknown): string | null {
  const message = (data as { error?: string } | null)?.error;
  if (message) return message;
  if (error) return error instanceof Error ? error.message : String(error);
  return null;
}

/** Read-only check of what a manual payout would send. */
export async function previewPayout(creatorId: string): Promise<PayoutPreview> {
  const { data, error } = await supabase.functions.invoke("process-creator-payout", {
    body: { action: "preview", creatorId },
  });
  const failure = invokeError(error, data);
  if (failure) throw new Error(failure);
  return data as PayoutPreview;
}

/** Sends the money for one creator. */
export async function executePayout(creatorId: string): Promise<PayoutExecuteResult> {
  const { data, error } = await supabase.functions.invoke("process-creator-payout", {
    body: { action: "execute", creatorId },
  });
  const failure = invokeError(error, data);
  if (failure) throw new Error(failure);
  return data as PayoutExecuteResult;
}

export type AutoRunResult = {
  dry_run?: boolean;
  candidates?: number;
  paid?: number;
  skipped?: number;
  failed?: number;
  min_payout_cents?: number;
  results?: Array<{ creator_id: string; status: string; error?: string; amount_cents?: number }>;
};

/** Runs the same batch the daily job runs; dryRun only reports who is eligible. */
export async function runAllReadyPayouts(dryRun = false): Promise<AutoRunResult> {
  const { data, error } = await supabase.functions.invoke("auto-creator-payouts", {
    body: { dry_run: dryRun },
  });
  const failure = invokeError(error, data);
  if (failure) throw new Error(failure);
  return data as AutoRunResult;
}
