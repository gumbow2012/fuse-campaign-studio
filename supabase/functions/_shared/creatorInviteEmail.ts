/**
 * Branded FUSE VIP creator invite email (email-client-safe: tables + inline styles only).
 * Fully legible with images disabled — every visual is real text; the logo has an alt.
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
const CYAN = "#67e8f9";

const PREHEADER =
  "Build templates, share your Creator page and earn when brands run your work.";

const BODY_PARAGRAPHS = [
  "We wanted to personally invite you into FUSE VIP Creator Access — a private part of FUSE for creators who turn the campaigns and AI workflows they already make into reusable one-click templates.",
  "Build the workflow once. Brands add their products. FUSE handles everything underneath.",
  "And when customers run eligible paid templates you publish, you can earn from your work.",
];

const FLYWHEEL: Array<[string, string]> = [
  ["CREATE", "Build reusable templates"],
  ["PUBLISH", "Put them on your profile"],
  ["SHARE", "Send people your links"],
  ["EARN", "Earn from eligible runs"],
];

const TAGLINE = "BUILD ONCE. LET BRANDS RUN IT.";

const CAN_DO = [
  "Build templates",
  "Control what customers upload",
  "Preview the customer experience",
  "Publish to your Creator profile",
  "Personal Creator profile + share links",
  "Track runs and future earnings",
];

const CTA_LABEL = "CLAIM VIP CREATOR ACCESS &rarr;";
const EXISTING_USER_CTA_LABEL = "SET UP YOUR CREATOR PROFILE &rarr;";
const CTA_TEXT = "Claim VIP Creator Access";
const EXISTING_USER_CTA_TEXT = "Set up your creator profile";

const PRIVACY_LINE = "Your invitation is private and linked to this email.";
const EXISTING_USER_WELCOME_BACK =
  "Welcome back — your FUSE account now has VIP Creator Access. Pick up where you left off and set up your creator profile.";

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
  const ctaLabel = existingUser ? EXISTING_USER_CTA_LABEL : CTA_LABEL;
  const ctaText = existingUser ? EXISTING_USER_CTA_TEXT : CTA_TEXT;

  const subject = firstName
    ? `${firstName}, you're invited to FUSE Creator Access`
    : "You're invited to FUSE Creator Access";
  const headline = firstName
    ? `${firstName.toUpperCase()}, YOU'RE INVITED TO FUSE.`
    : "YOU'RE INVITED TO FUSE.";
  const link = escapeHtml(brandedUrl);

  const paragraphs = BODY_PARAGRAPHS.map(
    (p) =>
      `<p style="margin:0 0 12px 0;font-family:${FONT};font-size:15px;line-height:1.65;color:#c7c7c7;">${escapeHtml(p)}</p>`,
  ).join("");

  const flywheelCells = FLYWHEEL.map(([label, line], index) => {
    const arrow = index < FLYWHEEL.length - 1
      ? `<td valign="middle" align="center" style="font-family:${FONT};font-size:16px;color:${CYAN};font-weight:bold;padding:0 4px;">&rarr;</td>`
      : "";
    return `<td valign="top" align="center" style="padding:0 2px;">
              <div style="font-family:${FONT};font-size:11px;font-weight:bold;letter-spacing:1.2px;color:#ffffff;">${label}</div>
              <div style="font-family:${FONT};font-size:11px;line-height:1.45;color:#8a8a8a;padding-top:5px;">${escapeHtml(line)}</div>
            </td>${arrow}`;
  }).join("");

  const bullets = CAN_DO.map(
    (item) => `<tr>
            <td width="22" valign="top" style="padding:0 0 10px 0;font-family:${FONT};font-size:15px;line-height:1.5;color:${CYAN};font-weight:bold;">&#10003;</td>
            <td style="padding:0 0 10px 0;font-family:${FONT};font-size:15px;line-height:1.5;color:#e4e4e4;">${escapeHtml(item)}</td>
          </tr>`,
  ).join("");

  const handleBlock = handle
    ? `<tr><td style="padding:22px 32px 0 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="background-color:#111111;border:1px solid #1f1f1f;border-radius:10px;padding:10px 14px;">
            <div style="font-family:${FONT};font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:#8a8a8a;">Invited creator</div>
            <div style="font-family:${FONT};font-size:15px;color:${CYAN};font-weight:bold;padding-top:3px;">@${escapeHtml(handle)}</div>
          </td>
        </tr></table>
      </td></tr>`
    : "";

  const noteBlock = note
    ? `<tr><td style="padding:22px 32px 0 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="background-color:#0c1416;border-left:3px solid ${CYAN};border-radius:0 10px 10px 0;padding:14px 18px;">
            <div style="font-family:${FONT};font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:${CYAN};font-weight:bold;">A note from FUSE</div>
            <div style="font-family:${FONT};font-size:15px;line-height:1.6;color:#e4e4e4;padding-top:8px;">&ldquo;${escapeHtml(note)}&rdquo;</div>
          </td>
        </tr></table>
      </td></tr>`
    : "";

  const welcomeBackBlock = existingUser
    ? `<tr><td style="padding:20px 32px 0 32px;">
        <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.65;color:#ffffff;">${escapeHtml(EXISTING_USER_WELCOME_BACK)}</p>
      </td></tr>`
    : "";

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @media only screen and (max-width:600px) {
    .fuse-pad { padding-left:22px !important; padding-right:22px !important; }
    .fuse-h1 { font-size:26px !important; }
    .fuse-cta, .fuse-cta a { display:block !important; width:100% !important; text-align:center !important; }
  }
</style></head>
<body style="margin:0;padding:0;background-color:#0a0a0a;">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${escapeHtml(PREHEADER)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0a0a0a;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#0f0f0f;border:1px solid #1f1f1f;border-radius:14px;">
      <tr><td class="fuse-pad" style="padding:32px 32px 0 32px;">
        <img src="https://fuse-us.com/fuse-wordmark.png" alt="FUSE" width="150" style="display:block;width:150px;height:auto;border:0;">
        <div style="height:2px;width:56px;background-color:${CYAN};margin-top:16px;"></div>
      </td></tr>
      <tr><td class="fuse-pad" style="padding:26px 32px 0 32px;">
        <div style="font-family:${FONT};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${CYAN};font-weight:bold;">VIP Creator Access</div>
        <h1 class="fuse-h1" style="margin:12px 0 0 0;font-family:${FONT};font-size:28px;line-height:1.18;letter-spacing:1.2px;color:#ffffff;font-weight:bold;">${escapeHtml(headline)}</h1>
      </td></tr>
      ${welcomeBackBlock}
      <tr><td class="fuse-pad" style="padding:18px 32px 0 32px;">${paragraphs}</td></tr>
      ${handleBlock}
      ${noteBlock}
      <tr><td class="fuse-pad" style="padding:26px 32px 0 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="background-color:#111111;border:1px solid #1f1f1f;border-radius:12px;padding:18px 14px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${flywheelCells}</tr></table>
            <div style="font-family:${FONT};font-size:11px;letter-spacing:1.6px;font-weight:bold;color:${CYAN};text-align:center;padding-top:16px;">${TAGLINE}</div>
          </td>
        </tr></table>
      </td></tr>
      <tr><td class="fuse-pad" style="padding:20px 32px 0 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td align="center" style="background-color:#0c1416;border:1px solid #164e56;border-radius:12px;padding:20px;">
            <div style="font-family:${FONT};font-size:11px;letter-spacing:1.8px;text-transform:uppercase;color:#8a8a8a;font-weight:bold;">VIP access includes</div>
            <div style="font-family:${FONT};font-size:40px;line-height:1.1;font-weight:bold;color:${CYAN};padding-top:8px;">+4,000</div>
            <div style="font-family:${FONT};font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#ffffff;font-weight:bold;padding-top:4px;">Creator credits</div>
            <div style="font-family:${FONT};font-size:13px;line-height:1.6;color:#c7c7c7;padding-top:10px;">Start building and testing your first templates immediately.</div>
          </td>
        </tr></table>
      </td></tr>
      <tr><td class="fuse-pad" style="padding:20px 32px 0 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="background-color:#111111;border:1px solid #1f1f1f;border-radius:12px;padding:18px 20px;">
            <p style="margin:0 0 14px 0;font-family:${FONT};font-size:12px;line-height:1;color:#ffffff;font-weight:bold;letter-spacing:1.2px;text-transform:uppercase;">Inside Creator Access</p>
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${bullets}</table>
          </td>
        </tr></table>
      </td></tr>
      <tr><td class="fuse-pad" style="padding:26px 32px 0 32px;">
        <table role="presentation" class="fuse-cta" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" bgcolor="${CYAN}" style="border-radius:999px;">
            <a href="${link}" style="display:inline-block;padding:16px 32px;font-family:${FONT};font-size:15px;font-weight:bold;color:#0a0a0a;text-decoration:none;border-radius:999px;letter-spacing:0.6px;">${ctaLabel}</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td class="fuse-pad" style="padding:16px 32px 0 32px;">
        <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.6;color:#8a8a8a;">${escapeHtml(PRIVACY_LINE)}</p>
      </td></tr>
      <tr><td class="fuse-pad" style="padding:28px 32px 32px 32px;">
        <p style="margin:0 0 8px 0;font-family:${FONT};font-size:13px;line-height:1.5;color:#8a8a8a;">Questions? Just reply to this email.</p>
        <p style="margin:0;font-family:${FONT};font-size:11px;line-height:1.7;color:#666666;">FUSE Creator Program &middot; fuse-us.com<br>You received this because you were personally invited to the FUSE Creator Program.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  const text = [
    "VIP CREATOR ACCESS",
    headline,
    "",
    ...(existingUser ? [EXISTING_USER_WELCOME_BACK, ""] : []),
    ...BODY_PARAGRAPHS.flatMap((p) => [p, ""]),
    ...(handle ? [`Invited creator: @${handle}`, ""] : []),
    ...(note ? ["A note from FUSE:", `"${note}"`, ""] : []),
    ...FLYWHEEL.map(([label, line]) => `${label} -> ${line}`),
    "",
    TAGLINE,
    "",
    "VIP ACCESS INCLUDES: +4,000 CREATOR CREDITS",
    "Start building and testing your first templates immediately.",
    "",
    "INSIDE CREATOR ACCESS:",
    ...CAN_DO.map((item) => `- ${item}`),
    "",
    `${ctaText}: ${brandedUrl}`,
    "",
    PRIVACY_LINE,
    "",
    "Questions? Just reply to this email.",
    "FUSE Creator Program · fuse-us.com",
    "You received this because you were personally invited to the FUSE Creator Program.",
  ].join("\n");

  return { subject, html, text };
}
