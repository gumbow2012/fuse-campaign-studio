import Stripe from "https://esm.sh/stripe@18.5.0";

export const STRIPE_API_VERSION = "2026-02-25.clover";

export type StripeBillingMode = "test" | "live";
export type StripeKeyMode = "test" | "live" | "unknown";

export function createStripeClient(apiKey: string) {
  return new Stripe(apiKey, {
    apiVersion: STRIPE_API_VERSION,
  });
}

export function getStripeKeyMode(apiKey: string | null | undefined): StripeKeyMode {
  const normalized = apiKey?.trim() ?? "";

  if (normalized.startsWith("sk_test_") || normalized.startsWith("rk_test_")) {
    return "test";
  }

  if (normalized.startsWith("sk_live_") || normalized.startsWith("rk_live_")) {
    return "live";
  }

  return "unknown";
}

export function requireStripeTestMode(apiKey: string) {
  const mode = getStripeKeyMode(apiKey);

  if (mode === "test") return;
  if (mode === "live") {
    throw new Error("Stripe test clocks require a Stripe test-mode secret key. The current project is using a live-mode key.");
  }

  throw new Error("Stripe test clocks require a Stripe test-mode secret key.");
}

function firstNonEmptyEnv(names: string[]) {
  for (const name of names) {
    const value = Deno.env.get(name)?.trim();
    if (value) return value;
  }

  return null;
}

export function resolveStripeBillingMode(
  value: string | null | undefined,
  fallback: StripeBillingMode = "live",
): StripeBillingMode {
  if (value === "test" || value === "live") return value;
  return fallback;
}

export function getStripeSecretKey(mode: StripeBillingMode) {
  if (mode === "live") {
    const liveKey = firstNonEmptyEnv(["STRIPE_SECRET_KEY_LIVE", "STRIPE_SECRET_KEY"]);
    if (liveKey) return liveKey;
    throw new Error("Stripe live-mode secret key is not configured.");
  }

  const testKey = firstNonEmptyEnv(["STRIPE_SECRET_KEY_TEST"]);
  if (testKey) return testKey;

  const legacyKey = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
  if (legacyKey && getStripeKeyMode(legacyKey) === "test") {
    return legacyKey;
  }

  throw new Error("Stripe test-mode secret key is not configured.");
}

export function getStripeWebhookSecret(mode: StripeBillingMode) {
  if (mode === "live") {
    const webhookSecret = firstNonEmptyEnv([
      "STRIPE_WEBHOOK_SECRET_LIVE",
      "STRIPE_WEBHOOK_SECRET",
    ]);
    if (webhookSecret) return webhookSecret;
    throw new Error("Stripe live-mode webhook secret is not configured.");
  }

  const webhookSecret = firstNonEmptyEnv(["STRIPE_WEBHOOK_SECRET_TEST"]);
  if (webhookSecret) return webhookSecret;

  const legacySecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")?.trim();
  if (legacySecret) {
    const legacyKey = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
    if (legacyKey && getStripeKeyMode(legacyKey) === "test") {
      return legacySecret;
    }
  }

  throw new Error("Stripe test-mode webhook secret is not configured.");
}

export function getStripePortalConfigurationId(mode: StripeBillingMode) {
  if (mode === "live") {
    return firstNonEmptyEnv([
      "STRIPE_PORTAL_CONFIGURATION_ID_LIVE",
      "STRIPE_PORTAL_CONFIGURATION_ID",
    ]);
  }

  return firstNonEmptyEnv(["STRIPE_PORTAL_CONFIGURATION_ID_TEST"]);
}

export async function findStripeCustomerId(args: {
  stripe: ReturnType<typeof createStripeClient>;
  storedCustomerId?: string | null;
  email?: string | null;
}) {
  const { stripe, storedCustomerId, email } = args;

  if (storedCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(storedCustomerId);
      if (!("deleted" in customer) || !customer.deleted) {
        return customer.id;
      }
    } catch {
      // Fall through to email lookup.
    }
  }

  if (!email) return null;

  const customers = await stripe.customers.list({ email, limit: 10 });
  const exactMatch = customers.data.find((customer) => {
    if ("deleted" in customer && customer.deleted) return false;
    return customer.email?.toLowerCase() === email.toLowerCase();
  });

  return exactMatch?.id ?? null;
}
