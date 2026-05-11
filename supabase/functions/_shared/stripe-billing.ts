import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  hasValidBillingSmokeSecret,
  json,
  logAuditEvent,
  requireTesterUser,
  requireUser,
} from "./supabase-admin.ts";
import {
  isLegacyStarterFallbackPrice,
  planFromKey,
  planFromPriceId,
  planFromProductId,
} from "./stripe-plans.ts";
import {
  creditPackFromKey,
  type CreditPackDefinition,
} from "./stripe-credit-packs.ts";
import {
  type StripeBillingMode,
  createStripeClient,
  findStripeCustomerId,
  getStripePortalConfigurationId,
  getStripeSecretKey,
  getStripeWebhookSecret,
} from "./stripe.ts";

type StripeObject = Record<string, any>;

function stripeSource(base: string, mode: StripeBillingMode) {
  return mode === "test" ? `${base}-test` : base;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function extractInvoiceSubscriptionId(object: StripeObject) {
  return firstString(
    object.subscription,
    object.parent?.subscription_details?.subscription,
    object.lines?.data?.[0]?.parent?.subscription_item_details?.subscription,
  );
}

function extractInvoicePriceId(object: StripeObject) {
  return firstString(
    object.price,
    object.price?.id,
    object.lines?.data?.[0]?.pricing?.price_details?.price,
    object.lines?.data?.[0]?.price?.id,
    object.parent?.subscription_details?.metadata?.price_id,
  );
}

function extractSubscriptionPeriod(subscription: StripeObject) {
  const primaryItem = Array.isArray(subscription.items?.data)
    ? subscription.items.data[0]
    : null;

  return {
    start: typeof subscription.current_period_start === "number"
      ? subscription.current_period_start
      : typeof primaryItem?.current_period_start === "number"
        ? primaryItem.current_period_start
        : null,
    end: typeof subscription.current_period_end === "number"
      ? subscription.current_period_end
      : typeof primaryItem?.current_period_end === "number"
        ? primaryItem.current_period_end
        : null,
  };
}

function billingReturnUrl(origin: string, mode: StripeBillingMode, outcome: "success" | "canceled") {
  const url = new URL("/billing", origin);
  url.searchParams.set(outcome, "true");
  if (mode === "test") {
    url.searchParams.set("billing_mode", "test");
  }
  return url.toString();
}

async function requireBillingUser(
  req: Request,
  admin: ReturnType<typeof createAdminClient>,
  mode: StripeBillingMode,
) {
  if (mode === "live") {
    return await requireUser(req, admin);
  }

  if (hasValidBillingSmokeSecret(req)) {
    return await requireUser(req, admin);
  }

  return await requireTesterUser(req, admin);
}

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

async function findProfileByUserId(
  admin: ReturnType<typeof createAdminClient>,
  userId?: string | null,
) {
  if (!userId) return null;

  const { data, error } = await admin
    .from("profiles")
    .select("id, user_id, email, plan, subscription_status, stripe_customer_id, stripe_subscription_id, stripe_price_id, subscription_period_start, subscription_period_end, subscription_cycle_credits")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  return data;
}

function extractEventUserId(eventType: string, object: StripeObject) {
  return firstString(
    object.client_reference_id,
    object.metadata?.user_id,
    object.subscription_details?.metadata?.user_id,
    object.parent?.subscription_details?.metadata?.user_id,
    eventType.startsWith("customer.subscription") ? object.metadata?.user_id : null,
  );
}

async function resolveCustomerEmailFromStripe(args: {
  stripe: ReturnType<typeof createStripeClient>;
  stripeCustomerId?: string | null;
  existingEmail?: string | null;
}) {
  if (args.existingEmail) return args.existingEmail;
  if (!args.stripeCustomerId) return null;

  try {
    const customer = await args.stripe.customers.retrieve(args.stripeCustomerId);
    if ("deleted" in customer && customer.deleted) return null;
    return customer.email ?? null;
  } catch {
    return null;
  }
}

async function resolveProfileForBillingEvent(args: {
  admin: ReturnType<typeof createAdminClient>;
  stripe: ReturnType<typeof createStripeClient>;
  eventType: string;
  object: StripeObject;
  stripeCustomerId?: string | null;
  customerEmail?: string | null;
}) {
  const userId = extractEventUserId(args.eventType, args.object);

  const byUserId = await findProfileByUserId(args.admin, userId);
  if (byUserId) return byUserId;

  const directMatch = await findProfileByStripeContext(
    args.admin,
    args.stripeCustomerId,
    args.customerEmail,
  );
  if (directMatch) return directMatch;

  const resolvedEmail = await resolveCustomerEmailFromStripe({
    stripe: args.stripe,
    stripeCustomerId: args.stripeCustomerId,
    existingEmail: args.customerEmail,
  });

  if (!resolvedEmail || resolvedEmail === args.customerEmail) {
    return null;
  }

  return await findProfileByStripeContext(
    args.admin,
    args.stripeCustomerId,
    resolvedEmail,
  );
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

async function applyCreditPackTopup(args: {
  admin: ReturnType<typeof createAdminClient>;
  stripeEventId: string;
  stripeCustomerId: string | null;
  stripeCheckoutSessionId: string;
  stripePaymentIntentId: string | null;
  billingMode: StripeBillingMode;
  pack: CreditPackDefinition;
  profile: { user_id: string; email: string };
}) {
  const { admin, pack } = args;

  const { data: existing, error: existingError } = await admin
    .from("credit_pack_purchases")
    .select("id, ledger_id, status")
    .eq("stripe_checkout_session_id", args.stripeCheckoutSessionId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing?.ledger_id) {
    return { granted: false, purchaseId: existing.id, ledgerId: existing.ledger_id };
  }

  const { data: purchase, error: purchaseError } = existing
    ? await admin
        .from("credit_pack_purchases")
        .update({
          stripe_event_id: args.stripeEventId,
          stripe_payment_intent_id: args.stripePaymentIntentId,
          stripe_customer_id: args.stripeCustomerId,
          status: "pending",
        })
        .eq("id", existing.id)
        .select("id, ledger_id")
        .single()
    : await admin
        .from("credit_pack_purchases")
        .insert({
          user_id: args.profile.user_id,
          pack_key: pack.key,
          credits: pack.credits,
          amount_cents: pack.amountCents,
          currency: pack.currency,
          billing_mode: args.billingMode,
          stripe_checkout_session_id: args.stripeCheckoutSessionId,
          stripe_payment_intent_id: args.stripePaymentIntentId,
          stripe_customer_id: args.stripeCustomerId,
          stripe_event_id: args.stripeEventId,
          status: "pending",
        })
        .select("id, ledger_id")
        .single();
  if (purchaseError || !purchase) {
    throw new Error(purchaseError?.message ?? "Credit pack purchase record failed");
  }
  if (purchase.ledger_id) {
    return { granted: false, purchaseId: purchase.id, ledgerId: purchase.ledger_id };
  }

  const { data: txnRows, error: creditError } = await admin.rpc("apply_credit_transaction", {
    p_user_id: args.profile.user_id,
    p_amount: pack.credits,
    p_type: "topup",
    p_description: `Stripe credit pack: ${pack.name}`,
    p_template_id: null,
    p_project_id: null,
    p_step_id: null,
  });
  if (creditError) throw new Error(creditError.message);
  const txn = Array.isArray(txnRows) ? txnRows[0] : txnRows;
  if (!txn?.ledger_id) throw new Error("Credit top-up did not return a ledger id");

  const { error: updateError } = await admin
    .from("credit_pack_purchases")
    .update({
      status: "fulfilled",
      ledger_id: txn.ledger_id,
      fulfilled_at: new Date().toISOString(),
      failure_reason: null,
    })
    .eq("id", purchase.id);
  if (updateError) throw new Error(updateError.message);

  return {
    granted: true,
    purchaseId: purchase.id,
    ledgerId: txn.ledger_id,
    newBalance: txn.new_balance,
  };
}

export function createCheckoutHandler(mode: StripeBillingMode) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const admin = createAdminClient();
    const requestId = crypto.randomUUID();
    let userId: string | null = null;
    let userEmail: string | null = null;

    try {
      const user = await requireBillingUser(req, admin, mode);
      userId = user.id;
      userEmail = user.email ?? null;
      if (!user.email) throw new Error("User not authenticated");

      const body = await req.json().catch(() => ({})) as {
        planKey?: string;
        priceId?: string;
      };

      const requestedPlanKey = typeof body.planKey === "string" ? body.planKey : null;
      const requestedPriceId = typeof body.priceId === "string" ? body.priceId : null;
      const plan = planFromKey(requestedPlanKey, mode) ?? planFromPriceId(requestedPriceId, mode);
      if (!plan) throw new Error("Unsupported subscription tier");
      if (isLegacyStarterFallbackPrice(plan, mode)) {
        throw new Error("Starter checkout is blocked because the live Stripe price still points to the old $49/month price. Create a $25/month Stripe price and set STRIPE_STARTER_PRICE_ID_LIVE before taking payment.");
      }

      await logAuditEvent({
        eventType: "stripe.checkout.requested",
        message: `Checkout requested for ${plan.key}.`,
        source: stripeSource("stripe-checkout", mode),
        requestId,
        metadata: {
          billing_mode: mode,
          user_id: user.id,
          email: user.email,
          requested_plan_key: requestedPlanKey,
          requested_price_id: requestedPriceId,
          price_id: plan.priceId,
          plan_key: plan.key,
          origin: req.headers.get("origin"),
        },
      }, admin);

      const stripe = createStripeClient(getStripeSecretKey(mode));
      const { data: profile } = await admin
        .from("profiles")
        .select("stripe_customer_id")
        .eq("user_id", user.id)
        .maybeSingle();

      const customerId = await findStripeCustomerId({
        stripe,
        storedCustomerId: profile?.stripe_customer_id ?? null,
        email: user.email,
      });

      if (customerId && customerId !== profile?.stripe_customer_id) {
        await admin
          .from("profiles")
          .update({ stripe_customer_id: customerId })
          .eq("user_id", user.id);
      }

      const origin = req.headers.get("origin") || "https://example.com";
      const session = await stripe.checkout.sessions.create({
        customer: customerId ?? undefined,
        customer_email: customerId ? undefined : user.email,
        client_reference_id: user.id,
        line_items: [{ price: plan.priceId, quantity: 1 }],
        mode: "subscription",
        allow_promotion_codes: true,
        metadata: {
          user_id: user.id,
          plan_key: plan.key,
          price_id: plan.priceId,
          billing_mode: mode,
        },
        subscription_data: {
          metadata: {
            user_id: user.id,
            plan_key: plan.key,
            price_id: plan.priceId,
            monthly_credits: String(plan.monthlyCredits),
            billing_mode: mode,
          },
        },
        success_url: billingReturnUrl(origin, mode, "success"),
        cancel_url: billingReturnUrl(origin, mode, "canceled"),
      });

      await logAuditEvent({
        eventType: "stripe.checkout.created",
        message: `Checkout session created for ${plan.key}.`,
        source: stripeSource("stripe-checkout", mode),
        requestId,
        metadata: {
          billing_mode: mode,
          user_id: user.id,
          email: user.email,
          plan_key: plan.key,
          price_id: plan.priceId,
          stripe_customer_id: customerId ?? null,
          stripe_checkout_session_id: session.id,
        },
      }, admin);

      return json({ url: session.url });
    } catch (error) {
      await logAuditEvent({
        eventType: "stripe.checkout.failed",
        message: errorMessage(error),
        severity: "error",
        source: stripeSource("stripe-checkout", mode),
        requestId,
        errorCode: "checkout_failed",
        metadata: {
          billing_mode: mode,
          user_id: userId,
          email: userEmail,
          origin: req.headers.get("origin"),
        },
      }, admin);

      return json({ error: errorMessage(error) }, 500);
    }
  };
}

export function createCreditCheckoutHandler(mode: StripeBillingMode) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const admin = createAdminClient();
    const requestId = crypto.randomUUID();
    let userId: string | null = null;
    let userEmail: string | null = null;

    try {
      const user = await requireBillingUser(req, admin, mode);
      userId = user.id;
      userEmail = user.email ?? null;
      if (!user.email) throw new Error("User not authenticated");

      const body = await req.json().catch(() => ({})) as { packKey?: string };
      const pack = creditPackFromKey(typeof body.packKey === "string" ? body.packKey : null);
      if (!pack) throw new Error("Unsupported credit pack");

      const stripe = createStripeClient(getStripeSecretKey(mode));
      const { data: profile } = await admin
        .from("profiles")
        .select("stripe_customer_id")
        .eq("user_id", user.id)
        .maybeSingle();

      const customerId = await findStripeCustomerId({
        stripe,
        storedCustomerId: profile?.stripe_customer_id ?? null,
        email: user.email,
      });

      if (customerId && customerId !== profile?.stripe_customer_id) {
        await admin
          .from("profiles")
          .update({ stripe_customer_id: customerId })
          .eq("user_id", user.id);
      }

      const origin = req.headers.get("origin") || "https://example.com";
      const session = await stripe.checkout.sessions.create({
        customer: customerId ?? undefined,
        customer_email: customerId ? undefined : user.email,
        client_reference_id: user.id,
        mode: "payment",
        allow_promotion_codes: true,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: pack.currency,
            unit_amount: pack.amountCents,
            product_data: {
              name: `${pack.name} Credit Pack`,
              description: `${pack.credits} Fuse credits`,
            },
          },
        }],
        metadata: {
          checkout_type: "credit_pack",
          user_id: user.id,
          pack_key: pack.key,
          credits: String(pack.credits),
          amount_cents: String(pack.amountCents),
          billing_mode: mode,
        },
        payment_intent_data: {
          metadata: {
            checkout_type: "credit_pack",
            user_id: user.id,
            pack_key: pack.key,
            credits: String(pack.credits),
            billing_mode: mode,
          },
        },
        success_url: billingReturnUrl(origin, mode, "success"),
        cancel_url: billingReturnUrl(origin, mode, "canceled"),
      });

      await logAuditEvent({
        eventType: "stripe.credit_pack.checkout.created",
        message: `Credit pack checkout created for ${pack.key}.`,
        source: stripeSource("stripe-credit-checkout", mode),
        requestId,
        metadata: {
          billing_mode: mode,
          user_id: user.id,
          email: user.email,
          pack_key: pack.key,
          credits: pack.credits,
          amount_cents: pack.amountCents,
          stripe_customer_id: customerId ?? null,
          stripe_checkout_session_id: session.id,
        },
      }, admin);

      return json({ url: session.url });
    } catch (error) {
      await logAuditEvent({
        eventType: "stripe.credit_pack.checkout.failed",
        message: errorMessage(error),
        severity: "error",
        source: stripeSource("stripe-credit-checkout", mode),
        requestId,
        errorCode: "credit_checkout_failed",
        metadata: {
          billing_mode: mode,
          user_id: userId,
          email: userEmail,
          origin: req.headers.get("origin"),
        },
      }, admin);

      return json({ error: errorMessage(error) }, 500);
    }
  };
}

export function createCustomerPortalHandler(mode: StripeBillingMode) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const admin = createAdminClient();
    const requestId = crypto.randomUUID();
    let userId: string | null = null;
    let userEmail: string | null = null;

    try {
      const user = await requireBillingUser(req, admin, mode);
      userId = user.id;
      userEmail = user.email ?? null;
      if (!user.email) throw new Error("User not authenticated");

      await logAuditEvent({
        eventType: "stripe.portal.requested",
        message: "Customer portal session requested.",
        source: stripeSource("stripe-customer-portal", mode),
        requestId,
        metadata: {
          billing_mode: mode,
          user_id: user.id,
          email: user.email,
          origin: req.headers.get("origin"),
        },
      }, admin);

      const stripe = createStripeClient(getStripeSecretKey(mode));
      const { data: profile } = await admin
        .from("profiles")
        .select("stripe_customer_id")
        .eq("user_id", user.id)
        .maybeSingle();

      let customerId = await findStripeCustomerId({
        stripe,
        storedCustomerId: profile?.stripe_customer_id ?? null,
        email: user.email,
      });

      if (!customerId) {
        const createdCustomer = await stripe.customers.create({
          email: user.email,
          metadata: {
            user_id: user.id,
            billing_mode: mode,
          },
        });
        customerId = createdCustomer.id;
      }

      if (customerId !== profile?.stripe_customer_id) {
        await admin
          .from("profiles")
          .update({ stripe_customer_id: customerId })
          .eq("user_id", user.id);
      }

      const origin = req.headers.get("origin") || "https://example.com";
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        configuration: getStripePortalConfigurationId(mode) ?? undefined,
        return_url: new URL("/billing", origin).toString(),
      });

      await logAuditEvent({
        eventType: "stripe.portal.created",
        message: "Customer portal session created.",
        source: stripeSource("stripe-customer-portal", mode),
        requestId,
        metadata: {
          billing_mode: mode,
          user_id: user.id,
          email: user.email,
          stripe_customer_id: customerId,
          portal_configuration: getStripePortalConfigurationId(mode) ?? null,
        },
      }, admin);

      return json({ url: portalSession.url });
    } catch (error) {
      await logAuditEvent({
        eventType: "stripe.portal.failed",
        message: errorMessage(error),
        severity: "error",
        source: stripeSource("stripe-customer-portal", mode),
        requestId,
        errorCode: "portal_failed",
        metadata: {
          billing_mode: mode,
          user_id: userId,
          email: userEmail,
          origin: req.headers.get("origin"),
        },
      }, admin);

      return json({ error: errorMessage(error) }, 500);
    }
  };
}

export function createStripeWebhookHandler(mode: StripeBillingMode) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const requestId = crypto.randomUUID();
    const admin = createAdminClient();

    try {
      const signature = req.headers.get("stripe-signature");
      if (!signature) throw new Error("Missing stripe-signature header");

      const rawBody = await req.text();
      const stripe = createStripeClient(getStripeSecretKey(mode));
      const event = await stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        getStripeWebhookSecret(mode),
      );

      await logAuditEvent({
        eventType: "stripe.webhook.received",
        message: `Webhook received: ${event.type}`,
        source: stripeSource("stripe-webhook", mode),
        requestId,
        metadata: {
          billing_mode: mode,
          stripe_event_id: event.id,
          stripe_event_type: event.type,
        },
      }, admin);

      const object = event.data.object as StripeObject;
      const stripeCustomerId = typeof object.customer === "string" ? object.customer : null;
      const stripeSubscriptionId =
        typeof object.subscription === "string"
          ? object.subscription
          : event.type.startsWith("invoice.")
            ? extractInvoiceSubscriptionId(object)
        : typeof object.id === "string" && event.type.startsWith("customer.subscription")
          ? object.id
          : null;
      const stripeInvoiceId =
        typeof object.id === "string" && event.type.startsWith("invoice.") ? object.id : null;
      const stripePriceId =
        event.type.startsWith("invoice.")
          ? extractInvoicePriceId(object)
          : typeof object.price === "string"
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
        billing_mode: mode,
        stripe_livemode: event.livemode ?? mode === "live",
        event_type: event.type,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        stripe_invoice_id: stripeInvoiceId,
        stripe_price_id: stripePriceId,
        payload: event as unknown as Record<string, unknown>,
      });
      if (eventError) {
        if (eventError.code === "23505") {
          await logAuditEvent({
            eventType: "stripe.webhook.duplicate",
            message: `Duplicate webhook ignored: ${event.type}`,
            source: stripeSource("stripe-webhook", mode),
            requestId,
            metadata: {
              billing_mode: mode,
              stripe_event_id: event.id,
              stripe_event_type: event.type,
            },
          }, admin);
          return json({ received: true, duplicate: true }, 200);
        }
        throw new Error(eventError.message);
      }

      if (event.type === "checkout.session.completed") {
        const session = object;
        if (session.metadata?.checkout_type === "credit_pack") {
          const pack = creditPackFromKey(
            typeof session.metadata?.pack_key === "string" ? session.metadata.pack_key : null,
          );
          if (!pack) throw new Error("Unknown credit pack in checkout session");

          const customerId = typeof session.customer === "string" ? session.customer : null;
          const profile = await resolveProfileForBillingEvent({
            admin,
            stripe,
            eventType: event.type,
            object: session,
            stripeCustomerId: customerId,
            customerEmail,
          });
          if (!profile) throw new Error("Profile not found for credit pack purchase");

          await upsertBillingState(admin, profile, {
            stripe_customer_id: customerId ?? profile.stripe_customer_id,
          });

          const grantResult = await applyCreditPackTopup({
            admin,
            stripeEventId: event.id,
            stripeCustomerId: customerId,
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
            billingMode: mode,
            pack,
            profile,
          });

          return json({ received: true, granted: grantResult.granted }, 200);
        }

        const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
        const customerId = typeof session.customer === "string" ? session.customer : null;
        const plan = planFromPriceId(
          typeof session.metadata?.price_id === "string" ? session.metadata.price_id : null,
          mode,
        );
        const profile = await resolveProfileForBillingEvent({
          admin,
          stripe,
          eventType: event.type,
          object: session,
          stripeCustomerId: customerId,
          customerEmail,
        });
        if (profile) {
          await upsertBillingState(admin, profile, {
            stripe_customer_id: customerId ?? profile.stripe_customer_id,
            stripe_subscription_id: subscriptionId ?? profile.stripe_subscription_id,
            stripe_price_id: plan?.priceId ?? profile.stripe_price_id,
          });
        }
        return json({ received: true }, 200);
      }

      if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
        const subscription = object;
        const billingPeriod = extractSubscriptionPeriod(subscription);
        const plan = planFromPriceId(subscription.items?.data?.[0]?.price?.id ?? null, mode)
          ?? planFromProductId(subscription.items?.data?.[0]?.price?.product ?? null, mode);
        const profile = await resolveProfileForBillingEvent({
          admin,
          stripe,
          eventType: event.type,
          object: subscription,
          stripeCustomerId,
          customerEmail,
        });
        if (profile) {
          await upsertBillingState(admin, profile, {
            stripe_customer_id: stripeCustomerId ?? profile.stripe_customer_id,
            stripe_subscription_id: subscription.id ?? profile.stripe_subscription_id,
            stripe_price_id: plan?.priceId ?? profile.stripe_price_id,
            subscription_period_start: asUnixTimestamp(billingPeriod.start),
            subscription_period_end: asUnixTimestamp(billingPeriod.end),
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
        const billingPeriod = extractSubscriptionPeriod(subscription);
        const profile = await resolveProfileForBillingEvent({
          admin,
          stripe,
          eventType: event.type,
          object: subscription,
          stripeCustomerId,
          customerEmail,
        });
        if (profile) {
          await upsertBillingState(admin, profile, {
            stripe_customer_id: stripeCustomerId ?? profile.stripe_customer_id,
            stripe_subscription_id: subscription.id ?? profile.stripe_subscription_id,
            stripe_price_id: null,
            subscription_period_start: asUnixTimestamp(billingPeriod.start),
            subscription_period_end: asUnixTimestamp(billingPeriod.end),
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
        const billingPeriod = extractSubscriptionPeriod(subscription);
        const plan = planFromPriceId(item?.price?.id ?? null, mode)
          ?? planFromProductId(item?.price?.product ?? null, mode);
        if (!plan) return json({ received: true, skipped: "unmapped plan" }, 200);

        const customerId = typeof invoice.customer === "string" ? invoice.customer : stripeCustomerId;
        const profile = await resolveProfileForBillingEvent({
          admin,
          stripe,
          eventType: event.type,
          object: invoice,
          stripeCustomerId: customerId,
          customerEmail,
        });
        if (!profile) throw new Error("Profile not found for subscription invoice");

        await upsertBillingState(admin, profile, {
          stripe_customer_id: customerId ?? profile.stripe_customer_id,
          stripe_subscription_id: subscription.id,
          stripe_price_id: plan.priceId,
          subscription_period_start: asUnixTimestamp(billingPeriod.start),
          subscription_period_end: asUnixTimestamp(billingPeriod.end),
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
          billingPeriodStart: new Date((billingPeriod.start ?? 0) * 1000).toISOString(),
          billingPeriodEnd: new Date((billingPeriod.end ?? 0) * 1000).toISOString(),
          creditsGranted: plan.monthlyCredits,
          description: `Stripe monthly grant for ${plan.name}`,
          profile,
        });

        return json({ received: true, granted: grantResult?.granted ?? false }, 200);
      }

      if (event.type === "invoice.payment_failed") {
        const invoice = object;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : stripeCustomerId;
        const profile = await resolveProfileForBillingEvent({
          admin,
          stripe,
          eventType: event.type,
          object: invoice,
          stripeCustomerId: customerId,
          customerEmail,
        });
        if (profile) {
          await upsertBillingState(admin, profile, {
            stripe_customer_id: customerId ?? profile.stripe_customer_id,
            subscription_status: "past_due",
          });
        }
        return json({ received: true }, 200);
      }

      await logAuditEvent({
        eventType: "stripe.webhook.ignored",
        message: `Webhook ignored: ${event.type}`,
        source: stripeSource("stripe-webhook", mode),
        requestId,
        metadata: {
          billing_mode: mode,
          stripe_event_id: event.id,
          stripe_event_type: event.type,
        },
      }, admin);
      return json({ received: true, ignored: event.type }, 200);
    } catch (error) {
      await logAuditEvent({
        eventType: "stripe.webhook.failed",
        message: errorMessage(error),
        severity: "error",
        source: stripeSource("stripe-webhook", mode),
        requestId,
        errorCode: "webhook_failed",
        metadata: {
          billing_mode: mode,
          method: req.method,
        },
      }, admin);
      return json({ error: errorMessage(error) }, 400);
    }
  };
}
