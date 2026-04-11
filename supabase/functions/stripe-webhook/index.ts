import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createAdminClient, corsHeaders, json, errorMessage } from "../_shared/supabase-admin.ts";
import { planFromPriceId, planFromProductId } from "../_shared/stripe-plans.ts";
import { createStripeClient } from "../_shared/stripe.ts";

type StripeObject = Record<string, any>;

function asUnixTimestamp(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Date(value * 1000).toISOString();
}

async function findProfileByStripeContext(
  admin: ReturnType<typeof createAdminClient>,
  stripeCustomerId?: string | null,
  email?: string | null,
) {
  if (stripeCustomerId) {
    const byCustomer = await admin
      .from("profiles")
      .select("id, user_id, email, plan, subscription_status, stripe_customer_id, stripe_subscription_id, stripe_price_id, subscription_period_start, subscription_period_end, subscription_cycle_credits")
      .eq("stripe_customer_id", stripeCustomerId)
      .maybeSingle();
    if (byCustomer.data) return byCustomer.data;
  }

  if (email) {
    const byEmail = await admin
      .from("profiles")
      .select("id, user_id, email, plan, subscription_status, stripe_customer_id, stripe_subscription_id, stripe_price_id, subscription_period_start, subscription_period_end, subscription_cycle_credits")
      .eq("email", email.toLowerCase())
      .maybeSingle();
    if (byEmail.data) return byEmail.data;
  }

  return null;
}

async function upsertBillingState(
  admin: ReturnType<typeof createAdminClient>,
  profile: { user_id: string; email: string },
  patch: Record<string, unknown>,
) {
  const { error } = await admin
    .from("profiles")
    .update(patch)
    .eq("user_id", profile.user_id);
  if (error) throw new Error(error.message);
}

async function grantSubscriptionCredits(args: {
  admin: ReturnType<typeof createAdminClient>;
  stripeEventId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripeInvoiceId: string | null;
  stripePriceId: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  creditsGranted: number;
  description: string;
  profile: { user_id: string; email: string };
}) {
  const { admin } = args;
  const { data, error } = await admin.rpc("grant_subscription_credits", {
    p_user_id: args.profile.user_id,
    p_stripe_event_id: args.stripeEventId,
    p_stripe_customer_id: args.stripeCustomerId,
    p_stripe_subscription_id: args.stripeSubscriptionId,
    p_stripe_invoice_id: args.stripeInvoiceId,
    p_stripe_price_id: args.stripePriceId,
    p_billing_period_start: args.billingPeriodStart,
    p_billing_period_end: args.billingPeriodEnd,
    p_credits_granted: args.creditsGranted,
    p_description: args.description,
  });
  if (error) throw new Error(error.message);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");
    if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET not set");

    const signature = req.headers.get("stripe-signature");
    if (!signature) throw new Error("Missing stripe-signature header");

    const rawBody = await req.text();
    const stripe = createStripeClient(stripeKey);
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    const admin = createAdminClient();

    const object = event.data.object as StripeObject;
    const stripeCustomerId =
      typeof object.customer === "string" ? object.customer : null;
    const stripeSubscriptionId =
      typeof object.subscription === "string"
        ? object.subscription
        : typeof object.id === "string" && event.type.startsWith("customer.subscription")
        ? object.id
        : null;
    const stripeInvoiceId =
      typeof object.id === "string" && event.type.startsWith("invoice.") ? object.id : null;
    const stripePriceId =
      typeof object.price === "string"
        ? object.price
        : typeof object.price?.id === "string"
        ? object.price.id
        : null;
    const customerEmail =
      typeof object.customer_email === "string"
        ? object.customer_email
        : typeof object.customer_details?.email === "string"
        ? object.customer_details.email
        : typeof object.receipt_email === "string"
        ? object.receipt_email
        : null;

    const { error: eventError } = await admin.from("billing_events").insert({
      stripe_event_id: event.id,
      event_type: event.type,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
      stripe_invoice_id: stripeInvoiceId,
      stripe_price_id: stripePriceId,
      payload: event as unknown as Record<string, unknown>,
    });
    if (eventError) {
      if (eventError.code === "23505") {
        return json({ received: true, duplicate: true }, 200);
      }
      throw new Error(eventError.message);
    }

    if (event.type === "checkout.session.completed") {
      const session = object;
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
      const customerId = typeof session.customer === "string" ? session.customer : null;
      const plan = planFromPriceId(typeof session.metadata?.price_id === "string" ? session.metadata.price_id : null);
      const profile = await findProfileByStripeContext(admin, customerId, customerEmail);
      if (profile) {
        await upsertBillingState(admin, profile, {
          stripe_customer_id: customerId ?? profile.stripe_customer_id,
          stripe_subscription_id: subscriptionId ?? profile.stripe_subscription_id,
          stripe_price_id: plan?.priceId ?? profile.stripe_price_id,
          plan: plan?.key ?? profile.plan ?? "free",
          subscription_status: "active",
        });
      }
      return json({ received: true }, 200);
    }

    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      const subscription = object;
      const plan = planFromPriceId(subscription.items?.data?.[0]?.price?.id ?? null)
        ?? planFromProductId(subscription.items?.data?.[0]?.price?.product ?? null);
      const profile = await findProfileByStripeContext(admin, stripeCustomerId, customerEmail);
      if (profile) {
        await upsertBillingState(admin, profile, {
          stripe_customer_id: stripeCustomerId ?? profile.stripe_customer_id,
          stripe_subscription_id: subscription.id ?? profile.stripe_subscription_id,
          stripe_price_id: plan?.priceId ?? profile.stripe_price_id,
          subscription_period_start: asUnixTimestamp(subscription.current_period_start),
          subscription_period_end: asUnixTimestamp(subscription.current_period_end),
          subscription_cycle_credits: plan?.monthlyCredits ?? profile.subscription_cycle_credits ?? 0,
          plan: plan?.key && subscription.status !== "canceled" && subscription.status !== "incomplete_expired"
            ? plan.key
            : "free",
          subscription_status: subscription.status ?? "inactive",
        });
      }
      return json({ received: true }, 200);
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = object;
      const profile = await findProfileByStripeContext(admin, stripeCustomerId, customerEmail);
      if (profile) {
        await upsertBillingState(admin, profile, {
          stripe_customer_id: stripeCustomerId ?? profile.stripe_customer_id,
          stripe_subscription_id: subscription.id ?? profile.stripe_subscription_id,
          stripe_price_id: null,
          subscription_period_start: asUnixTimestamp(subscription.current_period_start),
          subscription_period_end: asUnixTimestamp(subscription.current_period_end),
          subscription_cycle_credits: 0,
          plan: "free",
          subscription_status: "inactive",
        });
      }
      return json({ received: true }, 200);
    }

    if (event.type === "invoice.paid") {
      const invoice = object;
      const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : stripeSubscriptionId;
      if (!subscriptionId) return json({ received: true }, 200);

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const item = subscription.items.data[0];
      const plan = planFromPriceId(item?.price?.id ?? null) ?? planFromProductId(item?.price?.product ?? null);
      if (!plan) return json({ received: true, skipped: "unmapped plan" }, 200);

      const customerId = typeof invoice.customer === "string" ? invoice.customer : stripeCustomerId;
      const profile = await findProfileByStripeContext(admin, customerId, customerEmail);
      if (!profile) throw new Error("Profile not found for subscription invoice");

      await upsertBillingState(admin, profile, {
        stripe_customer_id: customerId ?? profile.stripe_customer_id,
        stripe_subscription_id: subscription.id,
        stripe_price_id: plan.priceId,
        subscription_period_start: asUnixTimestamp(subscription.current_period_start),
        subscription_period_end: asUnixTimestamp(subscription.current_period_end),
        subscription_cycle_credits: plan.monthlyCredits,
        plan: plan.key,
        subscription_status: subscription.status ?? "active",
      });

      const grantResult = await grantSubscriptionCredits({
        admin,
        stripeEventId: event.id,
        stripeCustomerId: customerId ?? profile.stripe_customer_id ?? "",
        stripeSubscriptionId: subscription.id,
        stripeInvoiceId: typeof invoice.id === "string" ? invoice.id : null,
        stripePriceId: plan.priceId,
        billingPeriodStart: new Date(subscription.current_period_start * 1000).toISOString(),
        billingPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
        creditsGranted: plan.monthlyCredits,
        description: `Stripe monthly grant for ${plan.name}`,
        profile,
      });

      return json({ received: true, granted: grantResult?.granted ?? false }, 200);
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = object;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : stripeCustomerId;
      const profile = await findProfileByStripeContext(admin, customerId, customerEmail);
      if (profile) {
        await upsertBillingState(admin, profile, {
          stripe_customer_id: customerId ?? profile.stripe_customer_id,
          subscription_status: "past_due",
        });
      }
      return json({ received: true }, 200);
    }

    return json({ received: true, ignored: event.type }, 200);
  } catch (error) {
    return json({ error: errorMessage(error) }, 400);
  }
});
