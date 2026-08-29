// Meta Conversions API — server-side Purchase event.
// The access token is read ONLY from Deno.env.get("META_CAPI_ACCESS_TOKEN").
// No token is ever hardcoded. If the secret is missing this is a silent no-op.
// This module NEVER throws to the caller.

const DEFAULT_DATASET_ID = "1739016657301589";
const GRAPH_VERSION = "v21.0";
const DEFAULT_EVENT_SOURCE_URL = "https://fuse-us.com";

let warnedMissingToken = false;

export type MetaCapiPurchaseArgs = {
  email?: string | null;
  phone?: string | null;
  value: number;
  currency?: string | null;
  eventId: string;
  externalId?: string | null;
  eventSourceUrl?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
};

export type MetaCapiResult = { ok: boolean; status: number; body: string };

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Sends a Meta CAPI "Purchase" event. Fully guarded: returns a result object for
 * logging and never throws, so callers (e.g. the Stripe webhook) are unaffected.
 */
export async function sendMetaCapiPurchase(args: MetaCapiPurchaseArgs): Promise<MetaCapiResult> {
  try {
    const token = Deno.env.get("META_CAPI_ACCESS_TOKEN")?.trim();
    if (!token) {
      if (!warnedMissingToken) {
        warnedMissingToken = true;
        console.log("meta-capi: META_CAPI_ACCESS_TOKEN not configured — skipping Purchase event");
      }
      return { ok: false, status: 0, body: "missing_access_token" };
    }

    const datasetId = Deno.env.get("META_CAPI_DATASET_ID")?.trim() || DEFAULT_DATASET_ID;
    const testEventCode = Deno.env.get("META_CAPI_TEST_EVENT_CODE")?.trim();

    const userData: Record<string, unknown> = {};
    const email = typeof args.email === "string" ? args.email.trim().toLowerCase() : "";
    if (email) userData.em = [await sha256Hex(email)];
    const phoneDigits = typeof args.phone === "string" ? args.phone.replace(/[^0-9]/g, "") : "";
    if (phoneDigits) userData.ph = [await sha256Hex(phoneDigits)];
    // Not hashed, per Meta spec.
    if (args.externalId) userData.external_id = args.externalId;
    if (args.fbc) userData.fbc = args.fbc;
    if (args.fbp) userData.fbp = args.fbp;
    if (args.clientIp) userData.client_ip_address = args.clientIp;
    if (args.userAgent) userData.client_user_agent = args.userAgent;

    const payload: Record<string, unknown> = {
      data: [
        {
          event_name: "Purchase",
          event_time: Math.floor(Date.now() / 1000),
          action_source: "website",
          event_id: args.eventId,
          event_source_url: args.eventSourceUrl ?? DEFAULT_EVENT_SOURCE_URL,
          user_data: userData,
          custom_data: {
            currency: (args.currency ?? "USD").toUpperCase(),
            value: String(args.value),
          },
        },
      ],
    };
    if (testEventCode) payload.test_event_code = testEventCode;

    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${datasetId}/events?access_token=${
      encodeURIComponent(token)
    }`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.text()).slice(0, 1000);

    if (!response.ok) {
      console.error(`meta-capi: Purchase rejected (${response.status}): ${body}`);
    } else {
      console.log(`meta-capi: Purchase sent (event_id=${args.eventId})`);
    }

    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    console.error("meta-capi: Purchase send failed", error instanceof Error ? error.message : error);
    return { ok: false, status: 0, body: "send_failed" };
  }
}
