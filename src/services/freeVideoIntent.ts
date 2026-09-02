/**
 * F4 — durable free-video acquisition intent (client helper).
 *
 * The chosen campaign is stored SERVER-SIDE against an httpOnly nonce cookie,
 * so it survives signup → email verification → callback. We never pass the
 * template through a redirect URL.
 */

import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import { getStoredUtm } from "@/lib/utmParams";

const ENDPOINT = `${SUPABASE_URL}/functions/v1/free-video-intent`;

const AD_PARAM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "gclid",
  "ttclid",
  "msclkid",
] as const;

/** Latest-touch acquisition params: URL wins, stored capture fills the gaps. */
export function readAcquisitionAttribution(): Record<string, string> {
  const attribution: Record<string, string> = { ...getStoredUtm() };
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    for (const key of AD_PARAM_KEYS) {
      const value = params.get(key);
      if (value) attribution[key] = value;
    }
  }
  return attribution;
}

async function post(body: Record<string, unknown>, accessToken?: string | null) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(data.error ?? "Request failed"));
  return data;
}

const INTENT_STORAGE_KEY = "fuse_fv_intent";

/** Logged-out: persist the intent, then create the account. */
export async function createFreeVideoIntent(templateId: string) {
  const data = await post({
    action: "create",
    templateId,
    attribution: readAcquisitionAttribution(),
  });
  const intentId = data.intentId ? String(data.intentId) : null;
  if (intentId && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(INTENT_STORAGE_KEY, intentId);
    } catch {
      /* storage unavailable — cookie fallback still applies */
    }
  }
  return { intentId };
}

/** "CREATE ACCOUNT & GENERATE FREE" — intent first, then signup. */
export async function startFreeVideoSignup(args: {
  templateId: string;
  email: string;
  password: string;
}) {
  await createFreeVideoIntent(args.templateId);
  const { error } = await supabase.auth.signUp({
    email: args.email,
    password: args.password,
    options: { emailRedirectTo: `${window.location.origin}/free/verify` },
  });
  if (error) throw new Error(error.message);
}

/** Authenticated: resolve the campaign from the durable intent. */
export async function claimFreeVideoIntent(): Promise<{ templateId: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  let storedIntentId: string | null = null;
  if (typeof window !== "undefined") {
    try {
      storedIntentId = window.localStorage.getItem(INTENT_STORAGE_KEY);
    } catch {
      storedIntentId = null;
    }
  }
  const data = await post(
    { action: "claim", ...(storedIntentId ? { intentId: storedIntentId } : {}) },
    session?.access_token ?? null,
  );
  const templateId = data.templateId ? String(data.templateId) : null;
  if (templateId && typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(INTENT_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  return { templateId };
}

