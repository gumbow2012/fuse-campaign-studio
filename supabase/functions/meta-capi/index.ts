// Meta Conversions API relay.
// Token is read ONLY from Deno.env.get("META_CAPI_ACCESS_TOKEN"). Never hardcoded.
// Fully non-blocking / resilient: always answers 200 with { ok }.

const DATASET_ID = "1739016657301589";
const GRAPH_VERSION = "v21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: true, ...body }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Meta requires normalized (trim + lowercase) SHA-256 hashes for PII fields. */
async function hashPii(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return await sha256(normalized);
}

async function hashPhone(value: unknown) {
  if (typeof value !== "string") return null;
  const digits = value.replace(/[^0-9]/g, "");
  if (!digits) return null;
  return await sha256(digits);
}

type IncomingUserData = Record<string, unknown> | null | undefined;

async function buildUserData(input: IncomingUserData) {
  const source = input ?? {};
  const userData: Record<string, unknown> = {};

  const em = await hashPii(source.email);
  if (em) userData.em = [em];
  const ph = await hashPhone(source.phone);
  if (ph) userData.ph = [ph];
  const fn = await hashPii(source.first_name ?? source.firstName);
  if (fn) userData.fn = [fn];
  const ln = await hashPii(source.last_name ?? source.lastName);
  if (ln) userData.ln = [ln];
  const ct = await hashPii(source.city);
  if (ct) userData.ct = [ct];
  const st = await hashPii(source.state);
  if (st) userData.st = [st];
  const zp = await hashPii(source.zip);
  if (zp) userData.zp = [zp];
  const country = await hashPii(source.country);
  if (country) userData.country = [country];
  const externalId = await hashPii(source.external_id ?? source.externalId);
  if (externalId) userData.external_id = [externalId];

  // NOT hashed per Meta spec.
  if (typeof source.fbp === "string" && source.fbp) userData.fbp = source.fbp;
  if (typeof source.fbc === "string" && source.fbc) userData.fbc = source.fbc;
  if (typeof source.client_ip === "string" && source.client_ip) {
    userData.client_ip_address = source.client_ip;
  }
  if (typeof source.client_user_agent === "string" && source.client_user_agent) {
    userData.client_user_agent = source.client_user_agent;
  }

  return userData;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const accessToken = Deno.env.get("META_CAPI_ACCESS_TOKEN")?.trim();
  if (!accessToken) {
    console.log("meta-capi: META_CAPI_ACCESS_TOKEN not configured — no-op");
    return ok({ skipped: "missing_access_token" });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    console.log("meta-capi: invalid JSON body — no-op");
    return ok({ skipped: "invalid_body" });
  }

  const eventName = typeof body.event_name === "string" ? body.event_name.trim() : "";
  if (!eventName) return ok({ skipped: "missing_event_name" });

  try {
    const customDataInput = (body.custom_data ?? {}) as Record<string, unknown>;
    const customData: Record<string, unknown> = {};
    if (typeof customDataInput.currency === "string") customData.currency = customDataInput.currency;
    if (typeof customDataInput.value === "number" && Number.isFinite(customDataInput.value)) {
      customData.value = customDataInput.value;
    }
    if (typeof customDataInput.order_id === "string") customData.order_id = customDataInput.order_id;
    if (typeof customDataInput.content_type === "string") {
      customData.content_type = customDataInput.content_type;
    }

    const event: Record<string, unknown> = {
      event_name: eventName,
      event_time: typeof body.event_time === "number"
        ? Math.floor(body.event_time)
        : Math.floor(Date.now() / 1000),
      action_source: typeof body.action_source === "string" ? body.action_source : "website",
      user_data: await buildUserData(body.user_data as IncomingUserData),
    };
    if (typeof body.event_id === "string" && body.event_id) event.event_id = body.event_id;
    if (typeof body.event_source_url === "string" && body.event_source_url) {
      event.event_source_url = body.event_source_url;
    }
    if (Object.keys(customData).length > 0) event.custom_data = customData;

    const payload: Record<string, unknown> = { data: [event] };
    if (typeof body.test_event_code === "string" && body.test_event_code) {
      payload.test_event_code = body.test_event_code;
    }

    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${DATASET_ID}/events?access_token=${
      encodeURIComponent(accessToken)
    }`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await response.text();

    if (!response.ok) {
      console.error(`meta-capi: Meta returned ${response.status}: ${text.slice(0, 1000)}`);
      return ok({ forwarded: false, status: response.status });
    }

    console.log(`meta-capi: sent ${eventName} (${String(event.event_id ?? "no-event-id")})`);
    return ok({ forwarded: true, response: text.slice(0, 1000) });
  } catch (error) {
    console.error("meta-capi: unexpected failure", error instanceof Error ? error.message : error);
    return ok({ forwarded: false, error: "relay_failed" });
  }
});
