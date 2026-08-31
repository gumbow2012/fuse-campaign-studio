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

const FONT = "Helvetica,Arial,sans-serif";

const CAN_DO = [
  "Build campaign templates in the FUSE studio",
  "Publish them to brands across the FUSE marketplace",
  "Get your work featured and used by real streetwear labels",
];

const STEPS = [
  "Accept your invite and set up your creator profile",
  "Build your first template and submit it for review",
  "The FUSE team reviews it, then it goes live to all FUSE customers",
];

const INTRO =
  "FUSE is an AI campaign-template studio for streetwear brands. You've been invited as a Creator — build campaign templates that brands run to make viral content in seconds.";

export function buildCreatorInviteEmail(actionLink: string): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = "You're invited to create on FUSE";
  const link = escapeHtml(actionLink);

  const bullets = CAN_DO.map(
    (item) => `<tr>
            <td width="18" valign="top" style="padding:0 0 10px 0;">
              <div style="width:7px;height:7px;border-radius:7px;background-color:#67e8f9;margin-top:7px;"></div>
            </td>
            <td style="padding:0 0 10px 0;font-family:${FONT};font-size:15px;line-height:1.5;color:#e4e4e4;">${escapeHtml(item)}</td>
          </tr>`,
  ).join("");

  const steps = STEPS.map(
    (item, index) => `<tr>
            <td width="30" valign="top" style="padding:0 0 10px 0;font-family:${FONT};font-size:15px;line-height:1.5;color:#67e8f9;font-weight:bold;">${index + 1}.</td>
            <td style="padding:0 0 10px 0;font-family:${FONT};font-size:15px;line-height:1.5;color:#e4e4e4;">${escapeHtml(item)}</td>
          </tr>`,
  ).join("");

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background-color:#0a0a0a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0a0a0a;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#0f0f0f;border:1px solid #1f1f1f;border-radius:14px;">
      <tr><td style="padding:32px 32px 8px 32px;">
        <div style="background-color:#ffffff;padding:14px 20px;border-radius:10px;display:inline-block;">
          <img src="https://fuse-us.com/fuse-wordmark.png" alt="FUSE" width="150" style="display:block;width:150px;height:auto;border:0;">
        </div>
        <div style="height:2px;width:56px;background-color:#67e8f9;margin-top:14px;"></div>
      </td></tr>
      <tr><td style="padding:24px 32px 0 32px;">
        <h1 style="margin:0;font-family:${FONT};font-size:24px;line-height:1.25;color:#ffffff;font-weight:bold;">${escapeHtml(subject)}</h1>
      </td></tr>
      <tr><td style="padding:16px 32px 0 32px;">
        <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.6;color:#c7c7c7;">${escapeHtml(INTRO)}</p>
      </td></tr>
      <tr><td style="padding:28px 32px 0 32px;">
        <p style="margin:0 0 14px 0;font-family:${FONT};font-size:13px;line-height:1;color:#ffffff;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">As a Creator you can:</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${bullets}</table>
      </td></tr>
      <tr><td style="padding:20px 32px 0 32px;">
        <p style="margin:0 0 14px 0;font-family:${FONT};font-size:13px;line-height:1;color:#ffffff;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">How it works:</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${steps}</table>
      </td></tr>
      <tr><td style="padding:28px 32px 0 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" bgcolor="#67e8f9" style="border-radius:999px;">
            <a href="${link}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:15px;font-weight:bold;color:#0a0a0a;text-decoration:none;border-radius:999px;letter-spacing:0.5px;">Accept Your Invite</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:28px 32px 32px 32px;">
        <p style="margin:0 0 8px 0;font-family:${FONT};font-size:13px;line-height:1.5;color:#8a8a8a;">Questions? Just reply to this email.</p>
        <p style="margin:0;font-family:${FONT};font-size:11px;line-height:1.5;color:#666666;letter-spacing:1px;text-transform:uppercase;">FUSE &middot; fuse-us.com</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  const text = [
    subject,
    "",
    INTRO,
    "",
    "As a Creator you can:",
    ...CAN_DO.map((item) => `- ${item}`),
    "",
    "How it works:",
    ...STEPS.map((item, index) => `${index + 1}. ${item}`),
    "",
    `Accept your invite: ${actionLink}`,
    "",
    "Questions? Just reply to this email.",
    "FUSE · fuse-us.com",
  ].join("\n");

  return { subject, html, text };
}
