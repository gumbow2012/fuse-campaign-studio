import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { createStripeClient, getStripeSecretKey, requireStripeTestMode } from "../_shared/stripe.ts";
import { getStripePlans, type StripePlanKey } from "../_shared/stripe-plans.ts";
import { createAdminClient, errorMessage, logAuditEvent } from "../_shared/supabase-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-billing-smoke-secret",
};

const WAIT_TIMEOUT_MS = Number(Deno.env.get("BILLING_SMOKE_WAIT_TIMEOUT_MS") ?? 120_000);
const WAIT_INTERVAL_MS = Number(Deno.env.get("BILLING_SMOKE_WAIT_INTERVAL_MS") ?? 3_000);
const ADVANCE_PADDING_SECONDS = 3700;
const RATE_LIMIT_PADDING_SECONDS = 300;

function ensureSecret(req: Request) {
  const expected = Deno.env.get("BILLING_SMOKE_SECRET")?.trim();
  const actual = req.headers.get("x-billing-smoke-secret")?.trim();
  if (!expected || !actual || actual !== expected) {
    throw new Error("Unauthorized");
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getSubscriptionPeriodEnd(subscription: Record<string, unknown>) {
  if (typeof subscription.current_period_end === "number") {
    return subscription.current_period_end;
  }

  const items = (subscription.items as { data?: Array<Record<string, unknown>> } | undefined)?.data;
  const firstItem = Array.isArray(items) ? items[0] : null;
  if (firstItem && typeof firstItem.current_period_end === "number") {
    return firstItem.current_period_end;
  }

  throw new Error("Subscription current_period_end missing");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function pickLatestEvent(
  events: Array<{ event_type: string; stripe_event_id: string; stripe_invoice_id: string | null; created_at: string }>,
  eventType: string,
) {
  const matches = events.filter((event) => event.event_type === eventType);
  return matches.at(-1) ?? null;
}

async function waitForCondition<T>(
  label: string,
  fn: () => Promise<T | null>,
  timeoutMs = WAIT_TIMEOUT_MS,
  intervalMs = WAIT_INTERVAL_MS,
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await fn();
    if (result) return result;
    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for ${label}`);
}

async function waitForClockReady(
  stripe: ReturnType<typeof createStripeClient>,
  testClockId: string,
) {
  return await waitForCondition("test clock ready", async () => {
    const clock = await stripe.testHelpers.testClocks.retrieve(testClockId);
    return clock.status === "ready" ? clock : null;
  }, 180_000, 2_000);
}

async function callJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body: unknown = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }

  return {
    status: response.status,
    ok: response.ok,
    body,
  };
}

async function getProfile(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("user_id, email, plan, subscription_status, credits_balance, stripe_customer_id, stripe_subscription_id, stripe_price_id, subscription_period_start, subscription_period_end, subscription_cycle_credits")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

async function getBillingEvents(admin: ReturnType<typeof createAdminClient>, stripeSubscriptionId: string) {
  const { data, error } = await admin
    .from("billing_events")
    .select("event_type, stripe_event_id, stripe_invoice_id, created_at")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

async function getGrantRows(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await admin
    .from("subscription_period_grants")
    .select("id, stripe_event_id, stripe_invoice_id, stripe_price_id, credits_granted, billing_period_start, billing_period_end, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

async function getLedgerRows(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await admin
    .from("credit_ledger")
    .select("id, type, amount, description, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

async function getWebhookAuditRows(
  admin: ReturnType<typeof createAdminClient>,
  stripeEventIds: string[],
) {
  const { data, error } = await admin
    .from("audit_logs")
    .select("event_type, source, message, metadata, created_at")
    .eq("source", "stripe-webhook")
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) throw new Error(error.message);

  const wanted = new Set(stripeEventIds);
  return (data ?? []).filter((row) => {
    const metadata = row.metadata as Record<string, unknown> | null;
    const stripeEventId = typeof metadata?.stripe_event_id === "string"
      ? metadata.stripe_event_id
      : null;
    return stripeEventId ? wanted.has(stripeEventId) : false;
  });
}

async function signInSmokeUser(args: {
  email: string;
  password: string;
}) {
  const publicClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const { data, error } = await publicClient.auth.signInWithPassword({
    email: args.email,
    password: args.password,
  });

  if (error || !data.session?.access_token) {
    throw new Error(error?.message ?? "Failed to create smoke session");
  }

  return data.session.access_token;
}

async function getSubscriptionSnapshot(args: {
  admin: ReturnType<typeof createAdminClient>;
  userId: string;
  stripeSubscriptionId: string;
  checkSubscriptionHeaders: HeadersInit;
}) {
  const [profile, billingEvents, grants, ledger, checkSubscription] = await Promise.all([
    getProfile(args.admin, args.userId),
    getBillingEvents(args.admin, args.stripeSubscriptionId),
    getGrantRows(args.admin, args.userId),
    getLedgerRows(args.admin, args.userId),
    callJson(`${Deno.env.get("SUPABASE_URL")}/functions/v1/check-subscription`, {
      method: "POST",
      headers: args.checkSubscriptionHeaders,
    }),
  ]);

  const interestingEventIds = billingEvents
    .filter((event) => ["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed"].includes(event.event_type))
    .map((event) => event.stripe_event_id);
  const auditRows = await getWebhookAuditRows(args.admin, interestingEventIds);

  return {
    profile,
    billingEvents,
    grants,
    ledger,
    auditRows,
    checkSubscription,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const requestId = crypto.randomUUID();
  const admin = createAdminClient();

  let smokeUserId: string | null = null;
  let smokeEmail: string | null = null;
  let stripeCustomerId: string | null = null;
  let stripeSubscriptionId: string | null = null;
  let testClockId: string | null = null;

  try {
    ensureSecret(req);

    const body = await req.json().catch(() => ({})) as {
      planKey?: StripePlanKey;
      cleanup?: boolean;
      includeCancellation?: boolean;
    };

    const testPlans = getStripePlans("test");
    const planKey = body.planKey && body.planKey in testPlans ? body.planKey : "starter";
    const plan = testPlans[planKey];
    const cleanup = body.cleanup === true;
    const includeCancellation = body.includeCancellation !== false;

    const stripeKey = getStripeSecretKey("test");
    requireStripeTestMode(stripeKey);

    const stripe = createStripeClient(stripeKey);

    const frozenTime = Math.floor(Date.now() / 1000);
    const testClock = await stripe.testHelpers.testClocks.create({ frozen_time: frozenTime, name: `fuse-recurring-smoke-${requestId}` });
    testClockId = testClock.id;

    smokeEmail = `billing-recurring+${Date.now()}@example.com`;
    const smokePassword = `FuseRecurring!${crypto.randomUUID()}!`;

    const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
      email: smokeEmail,
      password: smokePassword,
      email_confirm: true,
      user_metadata: {
        source: "admin-recurring-billing-smoke",
        request_id: requestId,
        plan_key: plan.key,
      },
    });
    if (createUserError || !createdUser.user) {
      throw new Error(createUserError?.message ?? "Failed to create recurring smoke user");
    }
    smokeUserId = createdUser.user.id;

    await admin.from("profiles").upsert({
      user_id: smokeUserId,
      email: smokeEmail,
      plan: "free",
      subscription_status: "inactive",
      credits_balance: 0,
    }, { onConflict: "user_id" });

    await admin.from("user_roles").insert({
      user_id: smokeUserId,
      role: "user",
    });

    const accessToken = await signInSmokeUser({ email: smokeEmail, password: smokePassword });
    const checkSubscriptionHeaders = {
      Authorization: `Bearer ${accessToken}`,
      apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      "Content-Type": "application/json",
      Origin: "https://example.com",
      "x-client-info": "admin-recurring-billing-smoke",
    };

    const customer = await stripe.customers.create({
      email: smokeEmail,
      test_clock: testClock.id,
      metadata: {
        user_id: smokeUserId,
        request_id: requestId,
        source: "admin-recurring-billing-smoke",
      },
    });
    stripeCustomerId = customer.id;

    await admin
      .from("profiles")
      .update({ stripe_customer_id: customer.id })
      .eq("user_id", smokeUserId);

    const successPaymentMethod = await stripe.paymentMethods.attach("pm_card_visa", {
      customer: customer.id,
    });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: successPaymentMethod.id },
    });

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: plan.priceId }],
      metadata: {
        user_id: smokeUserId,
        request_id: requestId,
        plan_key: plan.key,
        price_id: plan.priceId,
        monthly_credits: String(plan.monthlyCredits),
        source: "admin-recurring-billing-smoke",
      },
    });
    stripeSubscriptionId = subscription.id;

    const initial = await waitForCondition("initial invoice.paid + credit grant", async () => {
      if (!smokeUserId || !stripeSubscriptionId) return null;
      const snapshot = await getSubscriptionSnapshot({
        admin,
        userId: smokeUserId,
        stripeSubscriptionId,
        checkSubscriptionHeaders,
      });
      const invoicePaid = pickLatestEvent(snapshot.billingEvents, "invoice.paid");
      if (!invoicePaid) return null;
      if (snapshot.grants.length < 1) return null;
      if (snapshot.profile?.subscription_status !== "active") return null;
      return {
        ...snapshot,
        invoicePaid,
      };
    });

    const activeSubscription = await stripe.subscriptions.retrieve(subscription.id);
    await stripe.testHelpers.testClocks.advance(testClock.id, {
      frozen_time: getSubscriptionPeriodEnd(activeSubscription) + ADVANCE_PADDING_SECONDS,
    });
    await waitForClockReady(stripe, testClock.id);

    const renewal = await waitForCondition("renewal invoice.paid + second credit grant", async () => {
      if (!smokeUserId || !stripeSubscriptionId) return null;
      const snapshot = await getSubscriptionSnapshot({
        admin,
        userId: smokeUserId,
        stripeSubscriptionId,
        checkSubscriptionHeaders,
      });
      const invoicePaidEvents = snapshot.billingEvents.filter((event) => event.event_type === "invoice.paid");
      if (invoicePaidEvents.length < 2) return null;
      if (snapshot.grants.length < 2) return null;
      if ((snapshot.profile?.credits_balance ?? 0) < plan.monthlyCredits * 2) return null;
      return {
        ...snapshot,
        invoicePaid: invoicePaidEvents.at(-1) ?? null,
      };
    });

    const readyClock = await stripe.testHelpers.testClocks.retrieve(testClock.id);
    await stripe.testHelpers.testClocks.advance(testClock.id, {
      frozen_time: readyClock.frozen_time + RATE_LIMIT_PADDING_SECONDS,
    });
    await waitForClockReady(stripe, testClock.id);

    const failingPaymentMethod = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", {
      customer: customer.id,
    });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: failingPaymentMethod.id },
    });

    const renewedSubscription = await stripe.subscriptions.retrieve(subscription.id);
    await stripe.testHelpers.testClocks.advance(testClock.id, {
      frozen_time: getSubscriptionPeriodEnd(renewedSubscription) + ADVANCE_PADDING_SECONDS,
    });
    await waitForClockReady(stripe, testClock.id);

    const failure = await waitForCondition("invoice.payment_failed + past_due profile", async () => {
      if (!smokeUserId || !stripeSubscriptionId) return null;
      const snapshot = await getSubscriptionSnapshot({
        admin,
        userId: smokeUserId,
        stripeSubscriptionId,
        checkSubscriptionHeaders,
      });
      const paymentFailed = pickLatestEvent(snapshot.billingEvents, "invoice.payment_failed");
      if (!paymentFailed) return null;
      if (snapshot.profile?.subscription_status !== "past_due") return null;
      return {
        ...snapshot,
        paymentFailed,
      };
    }, 180_000);

    let cancellation: Record<string, unknown> | null = null;
    if (includeCancellation) {
      await stripe.subscriptions.cancel(subscription.id);

      cancellation = await waitForCondition("customer.subscription.deleted + inactive profile", async () => {
        if (!smokeUserId || !stripeSubscriptionId) return null;
        const snapshot = await getSubscriptionSnapshot({
          admin,
          userId: smokeUserId,
          stripeSubscriptionId,
          checkSubscriptionHeaders,
        });
        const deletedEvent = pickLatestEvent(snapshot.billingEvents, "customer.subscription.deleted");
        if (!deletedEvent) return null;
        if (snapshot.profile?.subscription_status !== "inactive") return null;
        if (snapshot.profile?.plan !== "free") return null;
        return {
          ...snapshot,
          deletedEvent,
        };
      });
    }

    await logAuditEvent({
      eventType: "billing.recurring_smoke.completed",
      message: "Recurring billing smoke test completed.",
      source: "admin-recurring-billing-smoke",
      requestId,
      metadata: {
        billing_mode: "test",
        smoke_user_id: smokeUserId,
        smoke_email: smokeEmail,
        plan_key: plan.key,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        test_clock_id: testClockId,
      },
    }, admin);

    const responseBody = {
      ok: true,
      request_id: requestId,
      billing_mode: "test",
      preserved: !cleanup,
      cleanup_supported: true,
      plan: {
        key: plan.key,
        price_id: plan.priceId,
        product_id: plan.productId,
        monthly_credits: plan.monthlyCredits,
      },
      smoke_user: {
        id: smokeUserId,
        email: smokeEmail,
      },
      stripe: {
        test_clock_id: testClockId,
        customer_id: stripeCustomerId,
        subscription_id: stripeSubscriptionId,
      },
      initial,
      renewal,
      failure,
      cancellation,
    };

    if (cleanup) {
      if (stripeSubscriptionId) {
        await admin.from("billing_events").delete().eq("stripe_subscription_id", stripeSubscriptionId);
      }
      if (stripeCustomerId) {
        await admin.from("billing_events").delete().eq("stripe_customer_id", stripeCustomerId);
      }
      if (smokeUserId) {
        await admin.from("subscription_period_grants").delete().eq("user_id", smokeUserId);
        await admin.from("credit_ledger").delete().eq("user_id", smokeUserId);
        await admin.from("user_roles").delete().eq("user_id", smokeUserId);
        await admin.from("profiles").delete().eq("user_id", smokeUserId);
        await admin.auth.admin.deleteUser(smokeUserId);
      }
    }

    return json(responseBody, 200);
  } catch (error) {
    await logAuditEvent({
      eventType: "billing.recurring_smoke.failed",
      message: errorMessage(error),
      severity: "error",
      source: "admin-recurring-billing-smoke",
      requestId,
      errorCode: "billing_recurring_smoke_failed",
      metadata: {
        smoke_user_id: smokeUserId,
        smoke_email: smokeEmail,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        test_clock_id: testClockId,
      },
    }, admin);

    return json({
      ok: false,
      error: errorMessage(error),
      request_id: requestId,
      smoke_user_id: smokeUserId,
      smoke_email: smokeEmail,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
      test_clock_id: testClockId,
    }, 500);
  }
});
