/**
 * Branded FUSE creator invite email (email-client-safe: tables + inline styles only).
 */

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildCreatorInviteEmail(actionLink: string): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = "You're invited to create on FUSE";
  const link = escapeHtml(actionLink);

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background-color:#0a0a0a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0a0a0a;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#0f0f0f;border:1px solid #1f1f1f;border-radius:14px;">
      <tr><td style="padding:32px 32px 8px 32px;">
        <div style="font-family:Helvetica,Arial,sans-serif;font-size:34px;line-height:1;font-weight:bold;letter-spacing:6px;color:#ffffff;text-transform:uppercase;">FUSE</div>
        <div style="height:2px;width:56px;background-color:#67e8f9;margin-top:14px;"></div>
      </td></tr>
      <tr><td style="padding:24px 32px 0 32px;">
        <h1 style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:24px;line-height:1.25;color:#ffffff;font-weight:bold;">${escapeHtml(subject)}</h1>
      </td></tr>
      <tr><td style="padding:16px 32px 0 32px;">
        <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#c7c7c7;">
          FUSE is an AI campaign-template studio for streetwear brands. You've been invited as a Creator to build campaign templates that publish to FUSE customers.
        </p>
      </td></tr>
      <tr><td style="padding:28px 32px 0 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" bgcolor="#67e8f9" style="border-radius:999px;">
            <a href="${link}" style="display:inline-block;padding:14px 28px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold;color:#0a0a0a;text-decoration:none;border-radius:999px;letter-spacing:0.5px;">Accept Your Invite</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:24px 32px 0 32px;">
        <p style="margin:0 0 6px 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#8a8a8a;">Or paste this link into your browser:</p>
        <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${link}" style="color:#67e8f9;text-decoration:underline;">${link}</a></p>
      </td></tr>
      <tr><td style="padding:28px 32px 32px 32px;">
        <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.5;color:#666666;letter-spacing:1px;text-transform:uppercase;">FUSE &middot; fuse-us.com</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  const text = [
    subject,
    "",
    "FUSE is an AI campaign-template studio for streetwear brands. You've been invited as a Creator to build campaign templates that publish to FUSE customers.",
    "",
    `Accept your invite: ${actionLink}`,
    "",
    "FUSE · fuse-us.com",
  ].join("\n");

  return { subject, html, text };
}
