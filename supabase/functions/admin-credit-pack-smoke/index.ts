import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { CREDIT_PACKS, type CreditPackKey } from "../_shared/stripe-credit-packs.ts";
import { getStripeSecretKey, getStripeWebhookSecret, requireStripeTestMode } from "../_shared/stripe.ts";
import { createAdminClient, errorMessage, logAuditEvent, requireAdminUser } from "../_shared/supabase-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-billing-smoke-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function authorizeSmokeRequest(req: Request, admin: ReturnType<typeof createAdminClient>) {
  const expected = Deno.env.get("BILLING_SMOKE_SECRET")?.trim();
  const actual = req.headers.get("x-billing-smoke-secret")?.trim();
  if (expected && actual && actual === expected) {
    return { source: "smoke_secret", userId: null as string | null };
  }

  const user = await requireAdminUser(req, admin);
  return { source: "admin_session", userId: user.id };
}

async function signInSmokeUser(email: string, password: string) {
  const publicClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const { data, error } = await publicClient.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token) {
    throw new Error(error?.message ?? "Failed to create smoke session");
  }

  return data.session.access_token;
}

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function createStripeTestSignature(payload: string, secret: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${payload}`));
  return `t=${timestamp},v1=${toHex(signature)}`;
}

async function postSignedStripeEvent(event: Record<string, unknown>) {
  const stripeKey = getStripeSecretKey("test");
  requireStripeTestMode(stripeKey);
  const payload = JSON.stringify(event);
  const signature = await createStripeTestSignature(payload, getStripeWebhookSecret("test"));

  const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/stripe-webhook-test`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": signature,
    },
    body: payload,
  });
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createAdminClient();
  const requestId = crypto.randomUUID();
  let smokeUserId: string | null = null;
  let smokeEmail: string | null = null;
  let checkoutSessionId: string | null = null;
  let stripeEventId: string | null = null;
  let shouldCleanup = false;

  try {
    const authorized = await authorizeSmokeRequest(req, admin);
    const body = await req.json().catch(() => ({})) as {
      packKey?: CreditPackKey;
      cleanup?: boolean;
    };
    const packKey = body.packKey && body.packKey in CREDIT_PACKS ? body.packKey : "boost";
    const pack = CREDIT_PACKS[packKey];
    const cleanup = body.cleanup === true;
    shouldCleanup = cleanup;

    smokeEmail = `credit-pack-smoke+${Date.now()}@example.com`;
    const smokePassword = `FuseCreditPack!${crypto.randomUUID()}!`;

    const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
      email: smokeEmail,
      password: smokePassword,
      email_confirm: true,
      user_metadata: {
        source: "admin-credit-pack-smoke",
        request_id: requestId,
        pack_key: pack.key,
      },
    });
    if (createUserError || !createdUser.user) {
      throw new Error(createUserError?.message ?? "Failed to create credit-pack smoke user");
    }
    smokeUserId = createdUser.user.id;

    await admin.from("profiles").upsert({
      user_id: smokeUserId,
      email: smokeEmail,
      plan: "free",
      subscription_status: "inactive",
      credits_balance: 0,
    }, { onConflict: "user_id" });
    await admin.from("user_roles").insert({ user_id: smokeUserId, role: "user" });

    const accessToken = await signInSmokeUser(smokeEmail, smokePassword);
    checkoutSessionId = `cs_test_credit_pack_${requestId.replaceAll("-", "")}`;
    stripeEventId = `evt_credit_pack_${requestId.replaceAll("-", "")}`;
    const stripeCustomerId = `cus_credit_pack_${requestId.slice(0, 12).replaceAll("-", "")}`;
    const paymentIntentId = `pi_credit_pack_${requestId.slice(0, 12).replaceAll("-", "")}`;

    const event = {
      id: stripeEventId,
      object: "event",
      api_version: "2026-02-25.clover",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: checkoutSessionId,
          object: "checkout.session",
          mode: "payment",
          payment_status: "paid",
          customer: stripeCustomerId,
          customer_email: smokeEmail,
          client_reference_id: smokeUserId,
          payment_intent: paymentIntentId,
          metadata: {
            checkout_type: "credit_pack",
            user_id: smokeUserId,
            pack_key: pack.key,
            credits: String(pack.credits),
            amount_cents: String(pack.amountCents),
            billing_mode: "test",
          },
        },
      },
      livemode: false,
      pending_webhooks: 1,
      request: { id: requestId, idempotency_key: null },
      type: "checkout.session.completed",
    };

    const firstWebhook = await postSignedStripeEvent(event);
    if (!firstWebhook.ok) {
      throw new Error(`Credit-pack webhook failed with ${firstWebhook.status}: ${JSON.stringify(firstWebhook.body)}`);
    }

    const { data: profileAfterFirst, error: profileError } = await admin
      .from("profiles")
      .select("user_id, email, credits_balance, stripe_customer_id")
      .eq("user_id", smokeUserId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if ((profileAfterFirst?.credits_balance ?? 0) !== pack.credits) {
      throw new Error(`Expected ${pack.credits} credits after webhook, got ${profileAfterFirst?.credits_balance ?? "missing"}`);
    }

    const duplicateWebhook = await postSignedStripeEvent(event);
    if (!duplicateWebhook.ok) {
      throw new Error(`Duplicate webhook check failed with ${duplicateWebhook.status}: ${JSON.stringify(duplicateWebhook.body)}`);
    }

    const { data: profileAfterDuplicate, error: duplicateProfileError } = await admin
      .from("profiles")
      .select("user_id, email, credits_balance, stripe_customer_id")
      .eq("user_id", smokeUserId)
      .maybeSingle();
    if (duplicateProfileError) throw new Error(duplicateProfileError.message);
    if ((profileAfterDuplicate?.credits_balance ?? 0) !== pack.credits) {
      throw new Error("Duplicate webhook was not idempotent for credit balance");
    }

    const { data: purchase, error: purchaseError } = await admin
      .from("credit_pack_purchases")
      .select("id, pack_key, credits, amount_cents, status, ledger_id, fulfilled_at")
      .eq("stripe_checkout_session_id", checkoutSessionId)
      .maybeSingle();
    if (purchaseError) throw new Error(purchaseError.message);
    if (!purchase?.ledger_id || purchase.status !== "fulfilled") {
      throw new Error("Credit-pack purchase was not fulfilled with a ledger id");
    }

    const { data: ledgerRows, error: ledgerError } = await admin
      .from("credit_ledger")
      .select("id, type, amount, description, created_at")
      .eq("user_id", smokeUserId)
      .eq("type", "topup")
      .order("created_at", { ascending: false });
    if (ledgerError) throw new Error(ledgerError.message);

    await logAuditEvent({
      eventType: "billing.credit_pack_smoke.completed",
      message: "Credit-pack billing smoke test completed.",
      source: "admin-credit-pack-smoke",
      requestId,
      metadata: {
        smoke_user_id: smokeUserId,
        smoke_email: smokeEmail,
        pack_key: pack.key,
        checkout_session_id: checkoutSessionId,
        stripe_event_id: stripeEventId,
        authorized_by: authorized.source,
        admin_user_id: authorized.userId,
      },
    }, admin);

    const responseBody = {
      ok: true,
      request_id: requestId,
      billing_mode: "test",
      preserved: !cleanup,
      smoke_user: {
        id: smokeUserId,
        email: smokeEmail,
        token_shape: accessToken.split(".").length,
      },
      pack,
      checkout_session_id: checkoutSessionId,
      stripe_event_id: stripeEventId,
      authorized_by: authorized.source,
      first_webhook: firstWebhook,
      duplicate_webhook: duplicateWebhook,
      profile: profileAfterDuplicate,
      purchase,
      ledger: ledgerRows ?? [],
    };

    if (cleanup) {
      if (checkoutSessionId) {
        await admin.from("credit_pack_purchases").delete().eq("stripe_checkout_session_id", checkoutSessionId);
      }
      if (stripeEventId) {
        await admin.from("billing_events").delete().eq("stripe_event_id", stripeEventId);
      }
      if (smokeUserId) {
        await admin.from("credit_ledger").delete().eq("user_id", smokeUserId);
        await admin.from("user_roles").delete().eq("user_id", smokeUserId);
        await admin.from("profiles").delete().eq("user_id", smokeUserId);
        await admin.auth.admin.deleteUser(smokeUserId);
      }
    }

    return json(responseBody, 200);
  } catch (error) {
    if (shouldCleanup) {
      if (checkoutSessionId) {
        await admin.from("credit_pack_purchases").delete().eq("stripe_checkout_session_id", checkoutSessionId);
      }
      if (stripeEventId) {
        await admin.from("billing_events").delete().eq("stripe_event_id", stripeEventId);
      }
      if (smokeUserId) {
        await admin.from("credit_ledger").delete().eq("user_id", smokeUserId);
        await admin.from("user_roles").delete().eq("user_id", smokeUserId);
        await admin.from("profiles").delete().eq("user_id", smokeUserId);
        await admin.auth.admin.deleteUser(smokeUserId);
      }
    }

    await logAuditEvent({
      eventType: "billing.credit_pack_smoke.failed",
      message: errorMessage(error),
      severity: "error",
      source: "admin-credit-pack-smoke",
      requestId,
      errorCode: "credit_pack_smoke_failed",
      metadata: {
        smoke_user_id: smokeUserId,
        smoke_email: smokeEmail,
        checkout_session_id: checkoutSessionId,
        stripe_event_id: stripeEventId,
      },
    }, admin);

    return json({
      ok: false,
      error: errorMessage(error),
      request_id: requestId,
      smoke_user_id: smokeUserId,
      smoke_email: smokeEmail,
      checkout_session_id: checkoutSessionId,
      stripe_event_id: stripeEventId,
    }, 500);
  }
});
