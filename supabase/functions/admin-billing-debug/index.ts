import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createAdminClient, errorMessage, json, logAuditEvent } from "../_shared/supabase-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-billing-smoke-secret",
};

function ensureSecret(req: Request) {
  const expected = Deno.env.get("BILLING_SMOKE_SECRET")?.trim();
  const actual = req.headers.get("x-billing-smoke-secret")?.trim();
  if (!expected || !actual || actual !== expected) {
    throw new Error("Unauthorized");
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const requestId = crypto.randomUUID();
  const admin = createAdminClient();

  try {
    ensureSecret(req);

    const body = await req.json().catch(() => ({})) as {
      smokeEmail?: string;
      stripeSubscriptionId?: string;
      stripeCustomerId?: string;
      limit?: number;
    };

    const smokeEmail = typeof body.smokeEmail === "string" ? body.smokeEmail.toLowerCase().trim() : null;
    const stripeSubscriptionId = typeof body.stripeSubscriptionId === "string" ? body.stripeSubscriptionId.trim() : null;
    const stripeCustomerId = typeof body.stripeCustomerId === "string" ? body.stripeCustomerId.trim() : null;
    const limit = Math.max(1, Math.min(Number(body.limit ?? 50) || 50, 200));

    const profileQuery = admin
      .from("profiles")
      .select("id, user_id, email, plan, subscription_status, credits_balance, stripe_customer_id, stripe_subscription_id, stripe_price_id, subscription_period_start, subscription_period_end, subscription_cycle_credits, updated_at");

    let profileResult;
    if (stripeCustomerId) {
      profileResult = await profileQuery.eq("stripe_customer_id", stripeCustomerId).maybeSingle();
    } else if (stripeSubscriptionId) {
      profileResult = await profileQuery.eq("stripe_subscription_id", stripeSubscriptionId).maybeSingle();
    } else if (smokeEmail) {
      profileResult = await profileQuery.eq("email", smokeEmail).maybeSingle();
    } else {
      throw new Error("Provide smokeEmail, stripeSubscriptionId, or stripeCustomerId");
    }

    if (profileResult.error) throw new Error(profileResult.error.message);
    const profile = profileResult.data;
    const userId = profile?.user_id ?? null;

    let billingEventsQuery = admin
      .from("billing_events")
      .select("billing_mode, stripe_livemode, event_type, stripe_event_id, stripe_customer_id, stripe_subscription_id, stripe_invoice_id, stripe_price_id, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (stripeSubscriptionId || profile?.stripe_subscription_id) {
      billingEventsQuery = billingEventsQuery.eq("stripe_subscription_id", stripeSubscriptionId ?? profile?.stripe_subscription_id ?? "");
    } else if (stripeCustomerId || profile?.stripe_customer_id) {
      billingEventsQuery = billingEventsQuery.eq("stripe_customer_id", stripeCustomerId ?? profile?.stripe_customer_id ?? "");
    } else {
      billingEventsQuery = billingEventsQuery.eq("stripe_customer_id", "__none__");
    }

    const [{ data: billingEvents, error: billingEventsError }, { data: grants, error: grantsError }, { data: ledger, error: ledgerError }, { data: auditLogs, error: auditLogsError }] = await Promise.all([
      billingEventsQuery,
      userId
        ? admin
          .from("subscription_period_grants")
          .select("id, stripe_event_id, stripe_invoice_id, stripe_price_id, credits_granted, billing_period_start, billing_period_end, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(limit)
        : Promise.resolve({ data: [], error: null }),
      userId
        ? admin
          .from("credit_ledger")
          .select("id, type, amount, description, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(limit)
        : Promise.resolve({ data: [], error: null }),
      admin
        .from("audit_logs")
        .select("event_type, severity, source, message, metadata, created_at")
        .or(`message.ilike.%${smokeEmail ?? ""}%,metadata->>stripe_subscription_id.eq.${stripeSubscriptionId ?? ""},metadata->>stripe_customer_id.eq.${stripeCustomerId ?? profile?.stripe_customer_id ?? ""},metadata->>smoke_email.eq.${smokeEmail ?? ""}`)
        .order("created_at", { ascending: false })
        .limit(limit),
    ]);

    if (billingEventsError) throw new Error(billingEventsError.message);
    if (grantsError) throw new Error(grantsError.message);
    if (ledgerError) throw new Error(ledgerError.message);
    if (auditLogsError) throw new Error(auditLogsError.message);

    return new Response(JSON.stringify({
      ok: true,
      request_id: requestId,
      profile,
      billing_events: billingEvents ?? [],
      subscription_period_grants: grants ?? [],
      credit_ledger: ledger ?? [],
      audit_logs: auditLogs ?? [],
    }, null, 2), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    await logAuditEvent({
      eventType: "billing.debug.failed",
      message: errorMessage(error),
      severity: "error",
      source: "admin-billing-debug",
      requestId,
    }, admin);

    return new Response(JSON.stringify({
      ok: false,
      request_id: requestId,
      error: errorMessage(error),
    }, null, 2), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
