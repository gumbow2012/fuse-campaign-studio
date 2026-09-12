// creator-connect — Stripe Connect (Accounts v2) onboarding for creators as PAYOUT RECIPIENTS.
// LIVE. Reads the DEDICATED Connect platform key (STRIPE_CONNECT_SECRET_KEY_*) — the payout
// account is a different Stripe account from customer billing (STRIPE_SECRET_KEY_LIVE); never share.
// FUSE collects ALL customer payments; creators only RECEIVE transfers + bank payouts, so the
// connected account uses the v2 `recipient` configuration (stripe_balance.stripe_transfers) —
// NOT merchant/card_payments. Onboarding status is always read LIVE from Stripe, never from a
// stored flag, so an admin-set value can never substitute for real Stripe verification.
import {
  createAdminClient,
  requireUser,
  getUserRoles,
  json,
  errorMessage,
  corsHeaders,
} from "../_shared/supabase-admin.ts";

const LIVEMODE = true;                        // live mode enabled
const STRIPE_VERSION = "2026-08-26.dahlia";   // V2 Core endpoints require an explicit version header

// The payout (Connect) platform account is a DIFFERENT Stripe account from customer billing.
// Read its own key so a billing-key change can never repoint creator transfers, and vice versa.
function stripeKey() {
  if (LIVEMODE) {
    const k = Deno.env.get("STRIPE_CONNECT_SECRET_KEY_LIVE") || "";
    if (!k) throw new Error("Connect LIVE key not configured (STRIPE_CONNECT_SECRET_KEY_LIVE).");
    if (!k.startsWith("sk_live")) throw new Error("STRIPE_CONNECT_SECRET_KEY_LIVE is not a live key (must start with sk_live).");
    return k;
  }
  const k = Deno.env.get("STRIPE_CONNECT_SECRET_KEY_TEST") || "";
  if (!k) throw new Error("Connect test key not configured (STRIPE_CONNECT_SECRET_KEY_TEST).");
  if (!k.startsWith("sk_test")) throw new Error("STRIPE_CONNECT_SECRET_KEY_TEST is not a test key.");
  return k;
}

// V2 Core API: JSON body + Stripe-Version header. Optional idempotency key for safe retries.
async function stripeV2(path: string, method: "POST" | "GET", body?: unknown, idempotencyKey?: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${stripeKey()}`,
    "Stripe-Version": STRIPE_VERSION,
  };
  if (body) headers["Content-Type"] = "application/json";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const res = await fetch(`https://api.stripe.com/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || data?.message || `Stripe ${res.status}`);
  return data;
}

// Express-dashboard login links still live on the v1 endpoint and accept v2 account ids.
async function stripeV1Form(path: string, form: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${stripeKey()}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ${res.status}`);
  return data;
}

async function stripeV1Get(path: string) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${stripeKey()}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ${res.status}`);
  return data;
}

const transferCapStatus = (acct: any): string | undefined =>
  acct?.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;

/** Clear onboarding state derived from the recipient transfer capability + requirements. */
function mapStatus(acct: any): string {
  const cap = transferCapStatus(acct); // active | pending | inactive | unrequested | restricted | undefined
  const reqStatus = acct?.requirements?.summary?.minimum_deadline?.status; // e.g. currently_due | past_due
  const hasDue = reqStatus === "currently_due" || reqStatus === "past_due";
  if (cap === "active") return "ready";
  if (cap === "restricted") return "restricted";
  if (cap === "pending") return "verification_pending";
  if (hasDue) return "action_required";
  return "not_started";
}

function acctInclude() {
  const q = new URLSearchParams();
  q.append("include", "configuration.recipient");
  q.append("include", "requirements");
  q.append("include", "identity");
  return q.toString();
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

    // Reconcile our row from the live Stripe account so a stale DB flag can never lie.
    async function sync(acctId: string) {
      const acct = await stripeV2(`v2/core/accounts/${acctId}?${acctInclude()}`, "GET");
      const status = mapStatus(acct);
      const patch = {
        onboarding_status: status,
        charges_enabled: false, // recipients never charge customers
        payouts_enabled: transferCapStatus(acct) === "active",
        details_submitted: status === "ready" || status === "verification_pending",
        disabled_reason: acct?.requirements?.summary?.minimum_deadline?.status ?? null,
        requirements: acct?.requirements ?? {},
        default_currency: acct?.defaults?.currency ?? null,
        country: acct?.identity?.country ?? null,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await admin.from("creator_connect_accounts").update(patch).eq("stripe_account_id", acctId);
      return { patch, acct };
    }

    // Read-only status (also reconciles from Stripe).
    if (action === "status") {
      if (!existing) return json({ connected: false, status: "not_started", payouts_enabled: false });
      const { patch, acct } = await sync(existing.stripe_account_id);
      return json({
        connected: true,
        status: patch.onboarding_status,
        payouts_enabled: patch.payouts_enabled,
        details_submitted: patch.details_submitted,
        transfer_capability: transferCapStatus(acct) ?? "unrequested",
        requirements_status: acct?.requirements?.summary?.minimum_deadline?.status ?? null,
      });
    }

    // Read-only: the bank account(s) on file for this creator's connected account.
    if (action === "bank_status") {
      if (!existing) {
        return json({ connected: false, status: "not_started", payouts_enabled: false, bank_accounts: [] });
      }
      const { patch } = await sync(existing.stripe_account_id);
      let banks: unknown[] = [];
      try {
        const list = await stripeV1Get(
          `accounts/${existing.stripe_account_id}/external_accounts?object=bank_account&limit=10`,
        );
        banks = (list?.data ?? []).map((b: any) => ({
          id: b?.id ?? null,
          bank_name: b?.bank_name ?? null,
          last4: b?.last4 ?? null,
          currency: b?.currency ?? null,
          country: b?.country ?? null,
          status: b?.status ?? null,
          default_for_currency: b?.default_for_currency === true,
        }));
      } catch (_e) {
        banks = [];
      }
      return json({
        connected: true,
        status: patch.onboarding_status,
        payouts_enabled: patch.payouts_enabled,
        bank_accounts: banks,
      });
    }

    // Create or reuse the v2 recipient account, then hand back a fresh hosted onboarding link.
    if (action === "onboard" || action === "refresh_link") {
      let acctId = existing?.stripe_account_id as string | undefined;
      if (!acctId) {
        const displayName =
          (user.user_metadata?.full_name as string) ||
          (user.user_metadata?.name as string) ||
          (user.email ? user.email.split("@")[0] : "FUSE Creator");
        const acct = await stripeV2(
          "v2/core/accounts",
          "POST",
          {
            contact_email: user.email,
            display_name: displayName,
            dashboard: "express", // Stripe-hosted payouts dashboard for the creator
            identity: { country: "us" }, // entity_type collected during hosted onboarding
            configuration: {
              recipient: {
                capabilities: {
                  // receive platform transfers + bank payouts (replaces v1 `transfers`)
                  stripe_balance: { stripe_transfers: { requested: true } },
                },
              },
            },
            defaults: {
              currency: "usd",
              responsibilities: { fees_collector: "application", losses_collector: "application" },
              locales: ["en-US"],
            },
            metadata: { fuse_user_id: user.id, env: LIVEMODE ? "live" : "test" },
            include: ["configuration.recipient", "requirements", "identity"],
          },
          `connect-create-${user.id}-${LIVEMODE}`, // idempotent: double-clicks can't make two accounts
        );
        acctId = acct.id;
        await admin.from("creator_connect_accounts").upsert(
          {
            user_id: user.id,
            livemode: LIVEMODE,
            stripe_account_id: acctId,
            account_type: "recipient",
            country: acct?.identity?.country ?? "us",
            default_currency: acct?.defaults?.currency ?? "usd",
            onboarding_status: mapStatus(acct),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,livemode", ignoreDuplicates: false },
        );
      }

      const link = await stripeV2("v2/core/account_links", "POST", {
        account: acctId,
        use_case: {
          type: "account_onboarding",
          account_onboarding: {
            configurations: ["recipient"],
            refresh_url: `${origin}${ret}?connect=refresh`,
            return_url: `${origin}${ret}?connect=return`,
          },
        },
      });
      return json({ url: link.url, account_id: acctId });
    }

    // Stripe-hosted Express dashboard login link (only meaningful once onboarding progressed).
    if (action === "dashboard") {
      if (!existing) return json({ error: "No connected account yet" }, 400);
      const login = await stripeV1Form(`accounts/${existing.stripe_account_id}/login_links`, {});
      return json({ url: login.url });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (e) {
    return json({ error: errorMessage(e) }, 500);
  }
});
