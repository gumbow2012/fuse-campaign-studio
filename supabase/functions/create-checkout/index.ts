import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { planFromPriceId } from "../_shared/stripe-plans.ts";
import { createStripeClient } from "../_shared/stripe.ts";
import { createAdminClient, logAuditEvent, requireUser } from "../_shared/supabase-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createAdminClient();
  const requestId = crypto.randomUUID();
  let userId: string | null = null;
  let userEmail: string | null = null;

  try {
    const user = await requireUser(req, admin);
    userId = user.id;
    userEmail = user.email ?? null;
    if (!user.email) throw new Error("User not authenticated");

    const { priceId } = await req.json();
    if (!priceId) throw new Error("priceId is required");

    const plan = planFromPriceId(priceId);
    if (!plan) throw new Error("Unsupported subscription tier");

    await logAuditEvent({
      eventType: "stripe.checkout.requested",
      message: `Checkout requested for ${plan.key}.`,
      source: "stripe-checkout",
      requestId,
      metadata: {
        user_id: user.id,
        email: user.email,
        price_id: priceId,
        plan_key: plan.key,
        origin: req.headers.get("origin"),
      },
    }, admin);

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

    const stripe = createStripeClient(stripeKey);
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) customerId = customers.data[0].id;

    const origin = req.headers.get("origin") || "https://example.com";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      metadata: {
        user_id: user.id,
        plan_key: plan.key,
        price_id: priceId,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan_key: plan.key,
          price_id: priceId,
          monthly_credits: String(plan.monthlyCredits),
        },
      },
      success_url: `${origin}/billing?success=true`,
      cancel_url: `${origin}/billing?canceled=true`,
    });

    await logAuditEvent({
      eventType: "stripe.checkout.created",
      message: `Checkout session created for ${plan.key}.`,
      source: "stripe-checkout",
      requestId,
      metadata: {
        user_id: user.id,
        email: user.email,
        plan_key: plan.key,
        price_id: priceId,
        stripe_customer_id: customerId ?? null,
        stripe_checkout_session_id: session.id,
      },
    }, admin);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await logAuditEvent({
      eventType: "stripe.checkout.failed",
      message: msg,
      severity: "error",
      source: "stripe-checkout",
      requestId,
      errorCode: "checkout_failed",
      metadata: {
        user_id: userId,
        email: userEmail,
        origin: req.headers.get("origin"),
      },
    }, admin);

    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
