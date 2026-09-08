// creator-connect — real Stripe Connect (Express) onboarding for creators.
// TEST MODE ONLY (livemode=false) until live money is explicitly authorized.
// Status is always derived from Stripe's actual account requirements — never hand-set,
// and connect_status=ACTIVE can never substitute for Stripe verification.
import {
  createAdminClient,
  requireUser,
  getUserRoles,
  json,
  errorMessage,
  corsHeaders,
} from "../_shared/supabase-admin.ts";

const LIVEMODE = false; // test-mode build; flip only under explicit live authorization

function stripeKey() {
  const k = Deno.env.get("STRIPE_SECRET_KEY_TEST") || "";
  if (!k) throw new Error("Stripe test key not configured (STRIPE_SECRET_KEY_TEST).");
  if (!k.startsWith("sk_test")) throw new Error("STRIPE_SECRET_KEY_TEST is not a test key.");
  return k;
}

async function stripe(path: string, method = "POST", form?: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${stripeKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ${res.status}`);
  return data;
}

/** Derive a clear onboarding state from the real Stripe account object. */
function mapStatus(acct: any): string {
  const req = acct.requirements ?? {};
  const currentlyDue = (req.currently_due ?? []).length;
  const pastDue = (req.past_due ?? []).length;
  const pending = (req.pending_verification ?? []).length;
  const disabled = req.disabled_reason as string | null;
  if (acct.charges_enabled && acct.payouts_enabled && currentlyDue === 0) return "ready";
  if (disabled && /reject|fraud|terms|listed|platform_paused|other/i.test(disabled)) return "restricted";
  if (pastDue > 0) return "action_required";
  if (pending > 0) return "verification_pending";
  if (!acct.details_submitted) return "not_started";
  return "action_required";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createAdminClient();
    const user = await requireUser(req, admin);
    const roles = await getUserRoles(user.id, admin);
    if (!roles.some((r) => r === "creator" || r === "admin" || r === "dev")) {
      return json({ error: "Creator access required" }, 403);
    }

    const { action, returnPath } = await req.json().catch(() => ({ action: "status" }));
    const origin = req.headers.get("origin") || "https://fuse-us.com";
    const ret = typeof returnPath === "string" && returnPath.startsWith("/app/") ? returnPath : "/app/creator/payouts";

    const { data: existing } = await admin
      .from("creator_connect_accounts")
      .select("*").eq("user_id", user.id).eq("livemode", LIVEMODE).maybeSingle();

    async function sync(acctId: string) {
      const acct = await stripe(`accounts/${acctId}`, "GET");
      const patch = {
        onboarding_status: mapStatus(acct),
        charges_enabled: !!acct.charges_enabled,
        payouts_enabled: !!acct.payouts_enabled,
        details_submitted: !!acct.details_submitted,
        disabled_reason: acct.requirements?.disabled_reason ?? null,
        requirements: acct.requirements ?? {},
        default_currency: acct.default_currency ?? null,
        country: acct.country ?? null,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await admin.from("creator_connect_accounts").update(patch).eq("stripe_account_id", acctId);
      return patch;
    }

    // Read-only status (also reconciles from Stripe so a stale DB flag can't lie).
    if (action === "status") {
      if (!existing) return json({ connected: false, status: "not_started", payouts_enabled: false });
      const p = await sync(existing.stripe_account_id);
      return json({
        connected: true, status: p.onboarding_status,
        payouts_enabled: p.payouts_enabled, charges_enabled: p.charges_enabled,
        details_submitted: p.details_submitted, disabled_reason: p.disabled_reason,
        requirements_currently_due: (p.requirements as any)?.currently_due ?? [],
      });
    }

    // Create or reuse the Express account, then hand back a fresh hosted onboarding link.
    if (action === "onboard" || action === "refresh_link") {
      let acctId = existing?.stripe_account_id as string | undefined;
      if (!acctId) {
        const acct = await stripe("accounts", "POST", {
          type: "express",
          "capabilities[transfers][requested]": "true",
          business_type: "individual",
          "metadata[fuse_user_id]": user.id,
          "metadata[env]": "test",
        });
        acctId = acct.id;
        await admin.from("creator_connect_accounts").insert({
          user_id: user.id, livemode: LIVEMODE, stripe_account_id: acctId,
          account_type: "express", country: acct.country ?? null,
          default_currency: acct.default_currency ?? null, onboarding_status: "not_started",
        });
      }
      const link = await stripe("account_links", "POST", {
        account: acctId!,
        refresh_url: `${origin}${ret}?connect=refresh`,
        return_url: `${origin}${ret}?connect=return`,
        type: "account_onboarding",
      });
      return json({ url: link.url, expires_at: link.expires_at, account_id: acctId });
    }

    // Express dashboard login link — only meaningful once the account can transact.
    if (action === "dashboard") {
      if (!existing) return json({ error: "No connected account yet" }, 400);
      const p = await sync(existing.stripe_account_id);
      if (!p.details_submitted) return json({ error: "Finish onboarding first" }, 400);
      const login = await stripe(`accounts/${existing.stripe_account_id}/login_links`, "POST", {});
      return json({ url: login.url });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (e) {
    return json({ error: errorMessage(e) }, 500);
  }
});
