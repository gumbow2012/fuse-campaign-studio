// Fire-and-forget dispatcher for server-side Meta CAPI events.
// Purely additive analytics: never throws, never blocks billing logic.

type CapiEvent = {
  eventName: string;
  eventId: string;
  value?: number | null;
  currency?: string | null;
  email?: string | null;
  externalId?: string | null;
  orderId?: string | null;
  contentType?: string | null;
  eventSourceUrl?: string | null;
};

export function sendMetaCapiEvent(event: CapiEvent) {
  try {
    const baseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!baseUrl || !serviceKey) return;

    const body = {
      event_name: event.eventName,
      event_id: event.eventId,
      event_time: Math.floor(Date.now() / 1000),
      action_source: "website",
      event_source_url: event.eventSourceUrl ?? undefined,
      user_data: {
        email: event.email ?? undefined,
        external_id: event.externalId ?? undefined,
      },
      custom_data: {
        currency: event.currency ?? undefined,
        value: typeof event.value === "number" ? event.value : undefined,
        order_id: event.orderId ?? undefined,
        content_type: event.contentType ?? undefined,
      },
    };

    void fetch(`${baseUrl}/functions/v1/meta-capi`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(body),
    })
      .then(() => undefined)
      .catch((error) => {
        console.error("meta-capi dispatch failed:", error instanceof Error ? error.message : error);
      });
  } catch (error) {
    console.error("meta-capi dispatch skipped:", error instanceof Error ? error.message : error);
  }
}

/** Deterministic id shared with the client pixel so Meta dedupes. */
export function metaCheckoutEventId(eventName: string, checkoutSessionId: string) {
  return `fuse_${eventName.toLowerCase()}_${checkoutSessionId}`;
}
