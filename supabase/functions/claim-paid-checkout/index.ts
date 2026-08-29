// Claims a PAID guest Stripe Checkout Session and attaches the entitlement to the
// caller's ANONYMOUS Supabase user. It never grants credits itself — the Stripe
// webhook remains the sole credit/subscription authority.
import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  getOptionalUser,
  json,
  logAuditEvent,
} from "../_shared/supabase-admin.ts";
import { sanitizeReturnPath, sha256Hex } from "../_shared/stripe-billing.ts";
import { createStripeClient, getStripeSecretKey } from "../_shared/stripe.ts";

function readClaimCookie(req: Request) {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === "fuse_claim") return rest.join("=").trim() || null;
  }
  return null;
}

function isEntitlementPosted(profile: { subscription_status?: string | null; credits_balance?: number | null } | null) {
  if (!profile) return false;
  const active = profile.subscription_status === "active" || profile.subscription_status === "trialing";
  return active && Number(profile.credits_balance ?? 0) > 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const admin = createAdminClient();
  const requestId = crypto.randomUUID();

  try {
    const body = await req.json().catch(() => ({})) as { sessionId?: string; claimToken?: string };
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    if (!sessionId.startsWith("cs_")) return json({ error: "Invalid session" }, 400);

    const nonce = readClaimCookie(req) ??
      (typeof body.claimToken === "string" && body.claimToken.trim() ? body.claimToken.trim() : null);
    if (!nonce) return json({ error: "Missing claim credential" }, 403);

    const stripe = createStripeClient(getStripeSecretKey("live"));
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "customer_details"],
    }) as Record<string, any>;

    const subscription = typeof session.subscription === "object" ? session.subscription : null;
    const subscriptionActive = subscription?.status === "active" || subscription?.status === "trialing";
    if (session.payment_status !== "paid" && !subscriptionActive) {
      return json({ error: "Payment not completed" }, 402);
    }

    const intentId = session.metadata?.fuse_checkout_intent_id;
    if (!intentId) return json({ error: "Not a guest checkout session" }, 403);

    const { data: intent, error: intentError } = await admin
      .from("checkout_intents")
      .select("id, template_id, template_name, return_to, claim_nonce_hash, status, expires_at, claimed_user_id")
      .eq("id", intentId)
      .maybeSingle();
    if (intentError) throw new Error(intentError.message);
    if (!intent) return json({ error: "Checkout intent not found" }, 403);

    const expired = intent.expires_at ? new Date(intent.expires_at).getTime() < Date.now() : false;
    const nonceMatches = (await sha256Hex(nonce)) === intent.claim_nonce_hash;
    if (expired || intent.status === "claimed" || !nonceMatches) {
      return json({ error: "Claim not permitted" }, 403);
    }

    const email = typeof session.customer_details?.email === "string"
      ? session.customer_details.email.trim().toLowerCase()
      : null;
    if (!email) return json({ error: "Stripe did not return a billing email" }, 403);

    const returnTo = sanitizeReturnPath(intent.return_to) ??
      (intent.template_name ? `/app/templates?template=${encodeURIComponent(intent.template_name)}` : "/app/templates");

    const caller = await getOptionalUser(req, admin);

    // Existing-account guard: never log a guest into an established account.
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("user_id, email, subscription_status, credits_balance")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile?.user_id && existingProfile.user_id !== caller?.id) {
      return json({
        requiresSignIn: true,
        email,
        template: intent.template_name ?? intent.template_id ?? null,
        return_to: returnTo,
      });
    }

    if (!caller?.id) {
      return json({ error: "Anonymous session required to claim this checkout." }, 401);
    }

    const stripeCustomerId = typeof session.customer === "string"
      ? session.customer
      : (session.customer?.id ?? subscription?.customer ?? null);

    // Attach billing/contact details to the caller's (anonymous) user. Email is
    // stored for billing only — it is never confirmed as an auth identity here.
    const { error: upsertError } = await admin
      .from("profiles")
      .upsert({
        user_id: caller.id,
        email,
        stripe_customer_id: typeof stripeCustomerId === "string" ? stripeCustomerId : null,
      }, { onConflict: "user_id" });
    if (upsertError) throw new Error(upsertError.message);

    await admin
      .from("user_roles")
      .upsert({ user_id: caller.id, role: "user" }, { onConflict: "user_id,role" });

    await admin
      .from("checkout_intents")
      .update({ status: "claimed", claimed_user_id: caller.id, claimed_at: new Date().toISOString() })
      .eq("id", intent.id);

    // Reconcile only by READING authoritative billing state. The webhook grants.
    const { data: profileAfter } = await admin
      .from("profiles")
      .select("subscription_status, credits_balance")
      .eq("user_id", caller.id)
      .maybeSingle();

    await logAuditEvent({
      eventType: "stripe.checkout.claimed",
      message: "Guest checkout claimed by anonymous user.",
      source: "claim-paid-checkout",
      requestId,
      metadata: {
        user_id: caller.id,
        stripe_checkout_session_id: sessionId,
        stripe_customer_id: stripeCustomerId ?? null,
        checkout_intent_id: intent.id,
      },
    }, admin);

    return json({
      ok: true,
      return_to: returnTo,
      activating: !isEntitlementPosted(profileAfter),
    });
  } catch (error) {
    await logAuditEvent({
      eventType: "stripe.checkout.claim_failed",
      message: errorMessage(error),
      severity: "error",
      source: "claim-paid-checkout",
      requestId,
      errorCode: "claim_failed",
    }, admin);
    return json({ error: errorMessage(error) }, 500);
  }
});
