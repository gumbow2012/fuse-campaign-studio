import { supabase } from "@/integrations/supabase/client";

/**
 * READ-ONLY credit usage analytics.
 * Reads the caller's own credit_ledger rows (RLS scopes to auth.uid()).
 * Never writes to credit_ledger and never touches billing/Stripe.
 */

// Ledger types that represent credits actually SPENT on generations.
const SPEND_TYPES = ["run_template", "rerun_step"] as const;

export interface CreditUsageRow {
  id: string;
  type: string;
  amount: number;
  template_id: string | null;
  description: string | null;
  created_at: string;
}

export interface UsageByType {
  type: string;
  credits: number;
  count: number;
}

export interface UsageByTemplate {
  templateId: string;
  name: string;
  credits: number;
  count: number;
}

export interface CreditUsageSummary {
  cycleStart: Date;
  cycleEnd: Date;
  cycleSource: "subscription" | "last30";
  creditsUsed: number;
  spendEvents: number;
  byType: UsageByType[];
  byTemplate: UsageByTemplate[];
  daysElapsed: number;
  daysInCycle: number;
  /** null when there is not enough data for an honest projection. */
  projectedCredits: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function loadCreditUsage(
  userId: string,
  subscriptionPeriodStart?: string | null,
): Promise<CreditUsageSummary> {
  const now = new Date();
  const parsedStart = subscriptionPeriodStart ? new Date(subscriptionPeriodStart) : null;
  const hasCycle = Boolean(parsedStart && !Number.isNaN(parsedStart.getTime()) && parsedStart < now);
  const cycleStart = hasCycle ? (parsedStart as Date) : new Date(now.getTime() - 30 * DAY_MS);
  const cycleSource: CreditUsageSummary["cycleSource"] = hasCycle ? "subscription" : "last30";
  const cycleEnd = hasCycle ? new Date(cycleStart.getTime() + 30 * DAY_MS) : now;

  const { data, error } = await supabase
    .from("credit_ledger")
    .select("id, type, amount, template_id, description, created_at")
    .eq("user_id", userId)
    .gte("created_at", cycleStart.toISOString())
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) throw error;

  const rows = (data ?? []) as CreditUsageRow[];
  const spendRows = rows.filter((row) => (SPEND_TYPES as readonly string[]).includes(row.type));

  let creditsUsed = 0;
  const typeMap = new Map<string, UsageByType>();
  const templateMap = new Map<string, UsageByTemplate>();

  for (const row of spendRows) {
    const credits = Math.abs(Number(row.amount) || 0);
    creditsUsed += credits;

    const typeEntry = typeMap.get(row.type) ?? { type: row.type, credits: 0, count: 0 };
    typeEntry.credits += credits;
    typeEntry.count += 1;
    typeMap.set(row.type, typeEntry);

    const templateId = row.template_id ?? "unattributed";
    const templateEntry =
      templateMap.get(templateId) ?? { templateId, name: templateId, credits: 0, count: 0 };
    templateEntry.credits += credits;
    templateEntry.count += 1;
    templateMap.set(templateId, templateEntry);
  }

  const templateIds = [...templateMap.keys()].filter((id) => id !== "unattributed");
  if (templateIds.length > 0) {
    const { data: templates } = await supabase
      .from("templates")
      .select("id, name")
      .in("id", templateIds);
    for (const template of templates ?? []) {
      const entry = templateMap.get(template.id);
      if (entry) entry.name = template.name ?? template.id;
    }
  }
  const unattributed = templateMap.get("unattributed");
  if (unattributed) unattributed.name = "Other activity";

  const daysElapsed = Math.max(0, (now.getTime() - cycleStart.getTime()) / DAY_MS);
  const daysInCycle = Math.max(1, (cycleEnd.getTime() - cycleStart.getTime()) / DAY_MS);

  // Honest projection: needs at least 2 days of cycle history and some real spend.
  const projectedCredits =
    daysElapsed >= 2 && creditsUsed > 0
      ? Math.round((creditsUsed / daysElapsed) * daysInCycle)
      : null;

  return {
    cycleStart,
    cycleEnd,
    cycleSource,
    creditsUsed,
    spendEvents: spendRows.length,
    byType: [...typeMap.values()].sort((a, b) => b.credits - a.credits),
    byTemplate: [...templateMap.values()].sort((a, b) => b.credits - a.credits).slice(0, 5),
    daysElapsed,
    daysInCycle,
    projectedCredits,
  };
}
