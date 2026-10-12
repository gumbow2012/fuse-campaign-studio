/**
 * Credit pack checkout for MCP clients (ChatGPT included). Calls the existing
 * create-credit-checkout function as the signed-in user with the legacy
 * { packKey } body — prices stay owned by that function. No Stripe code here.
 */
import type { Admin, AuthContext } from "../auth.ts";
import { withUserToken } from "../auth.ts";
import { FuseError } from "../errors.ts";
import { CREDIT_PACKS, creditPackFromKey } from "../../_shared/stripe-credit-packs.ts";

const SITE_ORIGIN = "https://fuse-us.com";

export async function startCreditPackCheckout(admin: Admin, auth: AuthContext, packKey: string) {
  if (!auth.userId) throw new FuseError("AUTH_REQUIRED");
  const pack = creditPackFromKey(packKey);
  if (!pack) {
    throw new FuseError("INVALID_INPUT", `Unknown credit pack. Choose one of: ${Object.keys(CREDIT_PACKS).join(", ")}.`);
  }
  return await withUserToken(admin, auth, async (token) => {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/create-credit-checkout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        // Checkout returns the buyer to fuse-us.com after paying.
        Origin: SITE_ORIGIN,
      },
      body: JSON.stringify({ packKey: pack.key }),
    });
    const body = await res.json().catch(() => ({} as any));
    if (!res.ok || typeof body?.url !== "string") {
      const reason = String(body?.error ?? `Checkout HTTP ${res.status}`);
      if (/membership/i.test(reason)) {
        throw new FuseError("FORBIDDEN", "Credit packs need an active FUSE membership. See https://fuse-us.com/pricing.");
      }
      throw new FuseError("INTERNAL", reason, { retryable: true });
    }
    return {
      checkout_url: body.url as string,
      pack: { key: pack.key, name: pack.name, credits: pack.credits, price_usd: pack.amountCents / 100 },
      account_url: `${SITE_ORIGIN}/account`,
      message: `Open the secure checkout to buy ${pack.credits.toLocaleString("en-US")} credits for $${pack.amountCents / 100}. Credits are added automatically after payment.`,
    };
  });
}
