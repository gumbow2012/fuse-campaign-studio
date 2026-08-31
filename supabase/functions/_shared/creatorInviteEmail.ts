/**
 * Branded FUSE VIP creator invite email (email-client-safe: tables + inline styles only).
 * NEVER renders blank variables — every personalization block is conditional.
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
  "Build your own one-click campaign templates",
  "Decide which customer uploads each template requires",
  "Preview and test the customer experience",
  "Set the price for eligible creator templates",
  "Publish templates to your Creator profile",
  "Share your personal FUSE Creator link",
  "Track template runs and earnings from your dashboard",
];

const PREHEADER =
  "Turn your AI campaigns into templates your audience can run — and earn when they do.";

const BODY_COPY =
  "We wanted to personally invite you to the FUSE Creator Program. You've been given VIP Creator Access — a private side of FUSE where creators turn the campaigns and AI workflows they already make into one-click templates other brands can run with their own products. Instead of giving your audience prompts or complicated workflows, you package the whole process once. They choose your template. They upload their products. FUSE handles the workflow. And when someone runs one of your paid templates, you earn from it.";

const CLAIM_LINE =
  "Your Creator account has already been invited. Claim your access below and we'll walk you through building your first template step by step.";

const EXISTING_USER_CLAIM_LINE =
  "Your FUSE account now has VIP Creator Access. Set up your creator profile below and start building.";

const CTA_LABEL = "ACCEPT VIP CREATOR ACCESS &rarr;";
const EXISTING_USER_CTA_LABEL = "SET UP YOUR CREATOR PROFILE &rarr;";

const SETUP_LINE =
  "No complicated setup. Once you're in, FUSE will show you exactly how to turn your first campaign into a reusable template.";

export type CreatorInviteEmailOptions = {
  firstName?: string;
  instagramHandle?: string;
  personalNote?: string;
  existingUser?: boolean;
};

function clean(value: string | undefined, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

export function buildCreatorInviteEmail(
  brandedUrl: string,
  opts?: CreatorInviteEmailOptions,
): { subject: string; html: string; text: string } {
  const firstName = clean(opts?.firstName, 80);
  const handle = clean(opts?.instagramHandle, 64).replace(/^@+/, "");
  const note = clean(opts?.personalNote, 500);
  const existingUser = opts?.existingUser === true;
  const claimLine = existingUser ? EXISTING_USER_CLAIM_LINE : CLAIM_LINE;
  const ctaLabel = existingUser ? EXISTING_USER_CTA_LABEL : CTA_LABEL;

  const subject = firstName
    ? `${firstName}, you're invited to FUSE Creator Access`
    : "You're invited to FUSE Creator Access";
  const greeting = firstName ? `Hey ${firstName},` : "Hey,";
  const link = escapeHtml(brandedUrl);

  const bullets = CAN_DO.map(
    (item) => `<tr>
            <td width="22" valign="top" style="padding:0 0 10px 0;font-family:${FONT};font-size:15px;line-height:1.5;color:#67e8f9;font-weight:bold;">&#10003;</td>
            <td style="padding:0 0 10px 0;font-family:${FONT};font-size:15px;line-height:1.5;color:#e4e4e4;">${escapeHtml(item)}</td>
          </tr>`,
  ).join("");

  const handleBlock = handle
    ? `<tr><td style="padding:24px 32px 0 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="background-color:#111111;border:1px solid #1f1f1f;border-radius:10px;padding:10px 14px;">
            <div style="font-family:${FONT};font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:#8a8a8a;">Invited creator</div>
            <div style="font-family:${FONT};font-size:15px;color:#67e8f9;font-weight:bold;padding-top:3px;">@${escapeHtml(handle)}</div>
          </td>
        </tr></table>
      </td></tr>`
    : "";

  const noteBlock = note
    ? `<tr><td style="padding:24px 32px 0 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="background-color:#0c1416;border-left:3px solid #67e8f9;border-radius:0 10px 10px 0;padding:14px 18px;">
            <div style="font-family:${FONT};font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:#67e8f9;font-weight:bold;">A note from FUSE</div>
            <div style="font-family:${FONT};font-size:15px;line-height:1.6;color:#e4e4e4;padding-top:8px;">&ldquo;${escapeHtml(note)}&rdquo;</div>
          </td>
        </tr></table>
      </td></tr>`
    : "";

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background-color:#0a0a0a;">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${escapeHtml(PREHEADER)}</span>
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
        <div style="font-family:${FONT};font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#67e8f9;font-weight:bold;">VIP Creator Access</div>
        <h1 style="margin:10px 0 0 0;font-family:${FONT};font-size:24px;line-height:1.25;color:#ffffff;font-weight:bold;">You're invited to the FUSE Creator Program</h1>
      </td></tr>
      <tr><td style="padding:18px 32px 0 32px;">
        <p style="margin:0 0 14px 0;font-family:${FONT};font-size:15px;line-height:1.6;color:#ffffff;font-weight:bold;">${escapeHtml(greeting)}</p>
        <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.7;color:#c7c7c7;">${escapeHtml(BODY_COPY)}</p>
      </td></tr>
      ${handleBlock}
      ${noteBlock}
      <tr><td style="padding:26px 32px 0 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="background-color:#111111;border:1px solid #1f1f1f;border-radius:12px;padding:18px 20px;">
            <p style="margin:0 0 14px 0;font-family:${FONT};font-size:12px;line-height:1;color:#ffffff;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;">With Creator Access you can:</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${bullets}</table>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:24px 32px 0 32px;">
        <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.7;color:#c7c7c7;">${escapeHtml(claimLine)}</p>
      </td></tr>
      <tr><td style="padding:26px 32px 0 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" bgcolor="#67e8f9" style="border-radius:999px;">
            <a href="${link}" style="display:inline-block;padding:15px 30px;font-family:${FONT};font-size:15px;font-weight:bold;color:#0a0a0a;text-decoration:none;border-radius:999px;letter-spacing:0.5px;">${ctaLabel}</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:18px 32px 0 32px;">
        <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.6;color:#8a8a8a;">${escapeHtml(SETUP_LINE)}</p>
      </td></tr>
      <tr><td style="padding:28px 32px 32px 32px;">
        <p style="margin:0 0 8px 0;font-family:${FONT};font-size:13px;line-height:1.5;color:#8a8a8a;">Questions? Just reply to this email.</p>
        <p style="margin:0;font-family:${FONT};font-size:11px;line-height:1.7;color:#666666;">FUSE Creator Program<br>fuse-us.com<br>You received this because you were personally invited to the FUSE Creator Program.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  const text = [
    subject,
    "",
    greeting,
    "",
    BODY_COPY,
    "",
    ...(handle ? [`Invited creator: @${handle}`, ""] : []),
    ...(note ? ["A note from FUSE:", `"${note}"`, ""] : []),
    "WITH CREATOR ACCESS YOU CAN:",
    ...CAN_DO.map((item) => `- ${item}`),
    "",
    claimLine,
    "",
    `${existingUser ? "Set up your creator profile" : "Accept VIP Creator Access"}: ${brandedUrl}`,
    "",
    SETUP_LINE,
    "",
    "Questions? Just reply to this email.",
    "FUSE Creator Program · fuse-us.com",
    "You received this because you were personally invited to the FUSE Creator Program.",
  ].join("\n");

  return { subject, html, text };
}
