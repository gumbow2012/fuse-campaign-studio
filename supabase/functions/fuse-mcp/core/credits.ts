/**
 * Credits: the authenticated user's real balance vs. the server-computed cost.
 * Never trusts client-supplied credit numbers.
 */
import type { Admin, AuthContext } from "../auth.ts";
import { FuseError } from "../errors.ts";
import { campaignsPerMonth } from "./pricing.ts";

export type AccountCredits = {
  user_id: string;
  plan: string;
  subscription_status: string | null;
  credit_balance: number;
  monthly_credits: number | null;
  approximate_campaigns_per_month: number | null;
  privileged_no_charge: boolean;
};

export async function getAccountCredits(admin: Admin, auth: AuthContext): Promise<AccountCredits> {
  if (!auth.userId) throw new FuseError("AUTH_REQUIRED");
  const { data: p } = await admin
    .from("profiles")
    .select("plan, subscription_status, credits_balance, subscription_cycle_credits")
    .eq("user_id", auth.userId)
    .maybeSingle();
  const plan = String((p as any)?.plan ?? "free");
  const monthly = (p as any)?.subscription_cycle_credits ?? null;
  return {
    user_id: auth.userId,
    plan,
    subscription_status: (p as any)?.subscription_status ?? null,
    credit_balance: Number((p as any)?.credits_balance ?? 0),
    monthly_credits: monthly,
    approximate_campaigns_per_month: monthly ? campaignsPerMonth(plan, monthly) : (plan === "free" ? null : campaignsPerMonth(plan)),
    privileged_no_charge: auth.isPrivileged,
  };
}

export function canRun(account: AccountCredits, estimatedCredits: number) {
  const ok = account.privileged_no_charge || account.credit_balance >= estimatedCredits;
  const missing = ok ? 0 : estimatedCredits - account.credit_balance;
  return {
    can_run: ok,
    missing_credits: missing,
    upgrade_required: !ok,
    recommended_action: ok
      ? "You have enough credits. Prepare the campaign, confirm, and run it."
      : account.plan === "free"
        ? "Start a Starter plan (about 3 campaigns a month) at https://fuse-us.com/pricing, then run this campaign."
        : `Add ${missing} credits or upgrade your plan at https://fuse-us.com/pricing, then run this campaign.`,
  };
}
