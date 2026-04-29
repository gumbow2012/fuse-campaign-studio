import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { createAdminClient, errorMessage, logAuditEvent } from "../_shared/supabase-admin.ts";
import { getStripePlans } from "../_shared/stripe-plans.ts";
import { resolveStripeBillingMode } from "../_shared/stripe.ts";

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

async function callJson(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, ok: res.ok, body: json };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const requestId = crypto.randomUUID();
  const admin = createAdminClient();
  const publicClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  let userId: string | null = null;
  let email: string | null = null;
  let createdJobId: string | null = null;

  try {
    ensureSecret(req);

    const body = await req.json().catch(() => ({})) as {
      mode?: string;
    };
    const billingMode = resolveStripeBillingMode(body.mode, "live");
    const plans = getStripePlans(billingMode);

    email = `billing-smoke+${Date.now()}@example.com`;
    const password = `FuseSmoke!${crypto.randomUUID()}!`;

    const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { source: "admin-billing-smoke", request_id: requestId },
    });
    if (createUserError || !createdUser.user) {
      throw new Error(createUserError?.message ?? "Failed to create smoke user");
    }
    userId = createdUser.user.id;

    await admin.from("profiles").upsert({
      user_id: userId,
      email,
      plan: "free",
      subscription_status: "inactive",
      credits_balance: 0,
    }, { onConflict: "user_id" });

    await admin.from("user_roles").insert({
      user_id: userId,
      role: "user",
    });

    const { data: sessionData, error: sessionError } = await publicClient.auth.signInWithPassword({
      email,
      password,
    });
    if (sessionError || !sessionData.session?.access_token) {
      throw new Error(sessionError?.message ?? "Failed to create smoke session");
    }

    const token = sessionData.session.access_token;
    await sleep(2000);
    const headers = {
      "Authorization": `Bearer ${token}`,
      "apikey": Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      "Content-Type": "application/json",
      "Origin": "https://example.com",
      "x-client-info": "admin-billing-smoke",
      "x-billing-smoke-secret": Deno.env.get("BILLING_SMOKE_SECRET") ?? "",
    };

    const portalFunction = billingMode === "test"
      ? "customer-portal-test"
      : "customer-portal";
    const checkoutFunction = billingMode === "test"
      ? "create-checkout-test"
      : "create-checkout";

    const authUser = await callJson(
      `${Deno.env.get("SUPABASE_URL")}/auth/v1/user`,
      { method: "GET", headers },
    );

    const subscriptionCheck = await callJson(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/check-subscription`,
      { method: "POST", headers },
    );

    const customerPortal = await callJson(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/${portalFunction}`,
      { method: "POST", headers },
    );

    const checkout = await callJson(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/${checkoutFunction}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ planKey: plans.starter.key }),
      },
    );

    const nonAdminProject = await callJson(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/start-template-run`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      },
    );

    await admin.from("user_roles").insert({
      user_id: userId,
      role: "admin",
    });

    const adminProject = await callJson(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/start-template-run`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      },
    );

    createdJobId = typeof (adminProject.body as Record<string, unknown> | null)?.jobId === "string"
      ? String((adminProject.body as Record<string, unknown>).jobId)
      : null;

    const { data: profile } = await admin
      .from("profiles")
      .select("user_id, email, plan, subscription_status, credits_balance, stripe_customer_id, stripe_subscription_id, stripe_price_id")
      .eq("user_id", userId)
      .maybeSingle();

    await logAuditEvent({
      eventType: "billing.smoke.completed",
      message: "Billing smoke test completed.",
      source: "admin-billing-smoke",
      requestId,
      metadata: {
        billing_mode: billingMode,
        smoke_user_id: userId,
        smoke_email: email,
        subscription_check_status: subscriptionCheck.status,
        customer_portal_status: customerPortal.status,
        checkout_status: checkout.status,
        non_admin_project_status: nonAdminProject.status,
        admin_project_status: adminProject.status,
      },
    }, admin);

    return new Response(JSON.stringify({
      ok: true,
      request_id: requestId,
      billing_mode: billingMode,
      smoke_user_id: userId,
      smoke_email: email,
      token_shape: token.split('.').length,
      auth_user: authUser,
      subscription_check: subscriptionCheck,
      customer_portal: customerPortal,
      checkout,
      runner_gate_non_admin: nonAdminProject,
      runner_gate_admin: adminProject,
      profile,
    }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    await logAuditEvent({
      eventType: "billing.smoke.failed",
      message: errorMessage(error),
      severity: "error",
      source: "admin-billing-smoke",
      requestId,
      errorCode: "billing_smoke_failed",
      metadata: {
        smoke_user_id: userId,
        smoke_email: email,
      },
    }, admin);

    return new Response(JSON.stringify({ error: errorMessage(error), request_id: requestId }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    if (createdJobId) {
      await admin.from("execution_steps").delete().eq("job_id", createdJobId);
      await admin.from("execution_jobs").delete().eq("id", createdJobId);
    }
    if (userId) {
      await admin.from("user_roles").delete().eq("user_id", userId);
      await admin.from("profiles").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  }
});
