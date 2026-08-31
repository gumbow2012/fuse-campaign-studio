/**
 * Shared outbound email transport (Zoho ZeptoMail).
 * NEVER log the token.
 */

const DEFAULT_FROM = "noreply@fuse-us.com";
const DEFAULT_REPLY_TO = "kade@maddenmedia.ai";
const DEFAULT_API_URL = "https://api.zeptomail.com/v1.1/email";

export type SendEmailInput = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  /** Optional sender display name override (address is unchanged). */
  fromName?: string;
};

export type SendEmailResult =
  | { sent: true; id: string | null }
  | { sent: false; reason: "no_provider"; status?: undefined; details?: undefined }
  | { sent: false; reason: "provider_error"; status: number; details: string };

/** Extracts a bare address (and optional display name) from "Name <addr>" or "addr". */
export function parseFromAddress(raw: string): { address: string; name: string } {
  const match = raw.match(/^\s*(.*?)\s*<\s*([^<>]+)\s*>\s*$/);
  if (match) {
    const name = match[1].replace(/^["']|["']$/g, "").trim();
    return { address: match[2].trim(), name: name || "FUSE" };
  }
  return { address: raw.trim(), name: "FUSE" };
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const token = Deno.env.get("ZEPTOMAIL_TOKEN")?.trim();
  if (!token) {
    return { sent: false, reason: "no_provider" };
  }

  const apiUrl = Deno.env.get("ZEPTOMAIL_API_URL") ?? DEFAULT_API_URL;
  const authorization = token.startsWith("Zoho-enczapikey")
    ? token
    : `Zoho-enczapikey ${token}`;

  const from = parseFromAddress(Deno.env.get("EMAIL_FROM") ?? DEFAULT_FROM);

  const body = {
    from: { address: from.address, name: input.fromName?.trim() || from.name || "FUSE" },
    to: [{ email_address: { address: input.to } }],
    reply_to: [{ address: input.replyTo?.trim() || DEFAULT_REPLY_TO }],
    subject: input.subject,
    textbody: input.text ?? "",
    htmlbody: input.html ?? undefined,
  };

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    const raw = await response.text().catch(() => "");

    if (!response.ok) {
      console.error(`sendEmail: provider failed [${response.status}]: ${raw.slice(0, 1000)}`);
      return {
        sent: false,
        reason: "provider_error",
        status: response.status,
        details: raw.slice(0, 1000),
      };
    }

    let id: string | null = null;
    try {
      const parsed = JSON.parse(raw) as { request_id?: string; data?: Array<{ message_id?: string }> };
      id = parsed?.data?.[0]?.message_id ?? parsed?.request_id ?? null;
    } catch {
      id = null;
    }

    return { sent: true, id };
  } catch (error) {
    console.error("sendEmail: transport threw", error instanceof Error ? error.message : String(error));
    return { sent: false, reason: "provider_error", status: 502, details: "email transport failed" };
  }
}
