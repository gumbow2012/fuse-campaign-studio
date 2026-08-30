/**
 * ADMIN SEND EMAIL — admin-only outbound email via Zoho ZeptoMail.
 * Never logs the API token. FROM must be on the verified fuse-us.com domain.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  logAuditEvent,
  requireAdminUser,
} from "../_shared/supabase-admin.ts";
import { sendEmail } from "../_shared/sendEmail.ts";

const DEFAULT_FROM = "noreply@fuse-us.com";
const DEFAULT_REPLY_TO = "kade@maddenmedia.ai";


function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const admin = createAdminClient();

  let adminUserId: string | null = null;
  try {
    const user = await requireAdminUser(request, admin);
    adminUserId = user.id;
  } catch (error) {
    return json({ error: errorMessage(error) }, 403);
  }

  try {
    const payload = (await request.json().catch(() => null)) as
      | { to?: unknown; subject?: unknown; body?: unknown; replyTo?: unknown }
      | null;

    const to = typeof payload?.to === "string" ? payload.to.trim() : "";
    const subject = typeof payload?.subject === "string" ? payload.subject.trim() : "";
    const body = typeof payload?.body === "string" ? payload.body : "";
    const replyToRaw = typeof payload?.replyTo === "string" ? payload.replyTo.trim() : "";

    if (!EMAIL_RE.test(to)) return json({ error: "A valid recipient email is required" }, 400);
    if (!subject || subject.length > 255) return json({ error: "A subject (max 255 chars) is required" }, 400);
    if (!body.trim()) return json({ error: "A message body is required" }, 400);
    if (body.length > 20000) return json({ error: "Message body is too long" }, 400);
    if (replyToRaw && !EMAIL_RE.test(replyToRaw)) return json({ error: "Invalid reply-to email" }, 400);

    const replyTo = replyToRaw || DEFAULT_REPLY_TO;
    const html = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5">${
      escapeHtml(body).replace(/\r?\n/g, "<br />")
    }</div>`;

    const result = await sendEmail({ to, subject, text: body, html, replyTo });

    if (!result.sent && result.reason === "no_provider") {
      return json({ error: "email provider not configured" }, 400);
    }

    if (!result.sent) {
      await logAuditEvent(
        {
          eventType: "admin_email_send_failed",
          message: `Email to ${to} failed`,
          severity: "error",
          source: "admin-send-email",
          metadata: { to, subject, sent: false, status: result.status, admin_user_id: adminUserId },
        },
        admin,
      );
      return json(
        { error: "Email provider rejected the request", status: result.status, details: result.details },
        result.status,
      );
    }

    await logAuditEvent(
      {
        eventType: "admin_email_sent",
        message: `Email to ${to} sent`,
        severity: "info",
        source: "admin-send-email",
        metadata: { to, subject, sent: true, provider_id: result.id, admin_user_id: adminUserId },
      },
      admin,
    );

    return json({ sent: true, id: result.id, from: Deno.env.get("EMAIL_FROM") ?? DEFAULT_FROM, replyTo });

  } catch (error) {
    console.error("admin-send-email failed:", errorMessage(error));
    return json({ error: errorMessage(error) }, 500);
  }
});
