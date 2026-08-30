import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  logAuditEvent,
} from "../_shared/supabase-admin.ts";

const ALERT_RECIPIENT = "kade@maddenmedia.ai";

/**
 * Best-effort alert email. If no provider key is configured we skip silently —
 * the submission itself must never fail because of alerting.
 */
async function sendContactAlert(payload: {
  name: string;
  email: string;
  company: string | null;
  message: string;
}) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.log("submit-contact-message: no email provider configured, skipping alert");
    return { sent: false, reason: "no_provider" as const };
  }

  const from = Deno.env.get("CONTACT_ALERT_FROM") ?? "FUSE <onboarding@resend.dev>";
  const lines = [
    `Name: ${payload.name}`,
    `Email: ${payload.email}`,
    `Company: ${payload.company ?? "—"}`,
    "",
    payload.message,
  ].join("\n");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [ALERT_RECIPIENT],
        reply_to: payload.email,
        subject: `New FUSE contact: ${payload.name}`,
        text: lines,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("submit-contact-message: alert email failed", response.status, detail.slice(0, 500));
      return { sent: false, reason: "provider_error" as const };
    }

    return { sent: true, reason: null };
  } catch (error) {
    console.error("submit-contact-message: alert email threw", error);
    return { sent: false, reason: "provider_error" as const };
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const admin = createAdminClient();
  const requestId = crypto.randomUUID();

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const payload = await request.json().catch(() => null);
    const name = typeof payload?.name === "string" ? payload.name.trim() : "";
    const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";
    const company = typeof payload?.company === "string" ? payload.company.trim() : null;
    const message = typeof payload?.message === "string" ? payload.message.trim() : "";

    if (name.length < 2 || name.length > 120) {
      return json({ error: "Name must be between 2 and 120 characters." }, 400);
    }
    if (email.length < 5 || email.length > 200 || !email.includes("@")) {
      return json({ error: "A valid email address is required." }, 400);
    }
    if (message.length < 10 || message.length > 4000) {
      return json({ error: "Message must be between 10 and 4000 characters." }, 400);
    }

    const forwardedFor = request.headers.get("x-forwarded-for");
    const userAgent = request.headers.get("user-agent");
    const origin = request.headers.get("origin");

    const { data, error } = await admin
      .from("contact_messages")
      .insert({
        name,
        email,
        company,
        message,
        metadata: {
          forwarded_for: forwardedFor,
          user_agent: userAgent,
          origin,
        },
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const alert = await sendContactAlert({ name, email, company, message });

    await logAuditEvent({
      eventType: "contact.message.submitted",
      message: "Contact message stored successfully.",
      source: "contact-form",
      requestId,
      metadata: {
        contact_message_id: data.id,
        email,
        company,
        origin,
        alert_email_sent: alert.sent,
        alert_email_skip_reason: alert.reason,
      },
    }, admin);

    return json({ ok: true, id: data.id });
  } catch (error) {
    const message = errorMessage(error);
    console.error("submit-contact-message failed", error);

    await logAuditEvent({
      eventType: "contact.message.failed",
      message,
      severity: "error",
      source: "contact-form",
      requestId,
      errorCode: "contact_message_failed",
      metadata: {
        origin: request.headers.get("origin"),
      },
    }, admin);

    return json({ error: message }, 500);
  }
});
