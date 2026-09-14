/**
 * Confirmation tokens: HMAC-signed, short-lived, bound to the exact run plan.
 * prepare -> token; start requires the token. Any change to user, template
 * version, attached inputs, output mode or credit cost invalidates it.
 */
const TOKEN_TTL_SECONDS = 15 * 60;

export type RunPlan = {
  user_id: string;
  template_id: string;
  version_id: string;
  template_slug: string;
  inputs: Record<string, string>;
  output_mode: "images_only" | "video_only" | "full_campaign";
  estimated_credits: number;
  campaign_name: string | null;
};

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

/** Stable hash of the run plan so a token can be compared without decoding. */
export async function planHash(plan: RunPlan): Promise<string> {
  const inputs = Object.keys(plan.inputs).sort().map((k) => `${k}=${plan.inputs[k]}`).join("&");
  return await sha256Hex([plan.user_id, plan.version_id, plan.output_mode, plan.estimated_credits, inputs].join("|"));
}

export async function issueConfirmationToken(secret: string, plan: RunPlan): Promise<{ token: string; expires_at: string }> {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = { ...plan, h: await planHash(plan), exp };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = b64url(await hmac(secret, body));
  return { token: `${body}.${sig}`, expires_at: new Date(exp * 1000).toISOString() };
}

export type VerifiedConfirmation = RunPlan & { h: string; exp: number };

export async function verifyConfirmationToken(secret: string, token: string): Promise<{ ok: true; plan: VerifiedConfirmation } | { ok: false; reason: "malformed" | "signature" | "expired" }> {
  const [body, sig] = String(token ?? "").split(".");
  if (!body || !sig) return { ok: false, reason: "malformed" };
  const expected = b64url(await hmac(secret, body));
  if (expected.length !== sig.length) return { ok: false, reason: "signature" };
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return { ok: false, reason: "signature" };
  let plan: VerifiedConfirmation;
  try {
    plan = JSON.parse(new TextDecoder().decode(fromB64url(body)));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!plan.exp || plan.exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: "expired" };
  return { ok: true, plan };
}
