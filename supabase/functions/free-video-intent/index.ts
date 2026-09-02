import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  createAdminClient,
  errorMessage,
  requireUser,
} from "../_shared/supabase-admin.ts";
import { FREE_VIDEO_ENTITLEMENT_TYPE } from "../_shared/free-video.ts";

/**
 * F4 — durable free-video acquisition intent.
 *
 * The selected campaign survives signup → email verification → callback by
 * living SERVER-SIDE in free_video_intents, keyed by an httpOnly nonce cookie.
 * A client-supplied redirect/return URL is NEVER trusted or read here.
 */

const NONCE_COOKIE = "fuse_fv_nonce";
const COOKIE_MAX_AGE = 60 * 60 * 24; // 24h
const INTENT_TTL_MS = COOKIE_MAX_AGE * 1000;

function corsFor(req: Request) {
  const origin = req.headers.get("origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Credentials": "true",
    "Vary": "Origin",
  };
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readCookie(req: Request, name: string) {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function asAttribution(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

Deno.serve(async (req) => {
  const corsHeaders = corsFor(req);
  const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
    });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const admin = createAdminClient();

  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      templateId?: string;
      attribution?: Record<string, unknown>;
    };
    const action = String(body.action ?? "");

    if (action === "create") {
      const templateId = typeof body.templateId === "string" ? body.templateId.trim() : "";
      if (!templateId) return json({ error: "templateId is required" }, 400);

      const { data: template, error: templateError } = await admin
        .from("fuse_templates")
        .select("id, free_preview_enabled")
        .eq("id", templateId)
        .maybeSingle();
      if (templateError) throw new Error(templateError.message);
      if (!template || (template as any).free_preview_enabled !== true) {
        return json({ error: "Free video not available for this template" }, 400);
      }

      const nonce = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      const claimNonceHash = await sha256Hex(nonce);

      const { data: intent, error: insertError } = await admin
        .from("free_video_intents")
        .insert({
          template_id: templateId,
          attribution: asAttribution(body.attribution),
          claim_nonce_hash: claimNonceHash,
          status: "pending",
          expires_at: new Date(Date.now() + INTENT_TTL_MS).toISOString(),
        })
        .select("id")
        .single();
      if (insertError) throw new Error(insertError.message);

      const cookie = `${NONCE_COOKIE}=${encodeURIComponent(nonce)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
      return json({ intentId: String(intent.id) }, 200, { "Set-Cookie": cookie });
    }

    if (action === "claim") {
      const user = await requireUser(req, admin);

      const nonce = readCookie(req, NONCE_COOKIE);
      if (!nonce) return json({ templateId: null });

      const claimNonceHash = await sha256Hex(nonce);
      const { data: intent, error: intentError } = await admin
        .from("free_video_intents")
        .select("id, template_id, attribution, status, expires_at")
        .eq("claim_nonce_hash", claimNonceHash)
        .eq("status", "pending")
        .maybeSingle();
      if (intentError) throw new Error(intentError.message);
      if (!intent) return json({ templateId: null });

      const expiresAt = (intent as any).expires_at ? new Date((intent as any).expires_at).getTime() : null;
      if (expiresAt && expiresAt < Date.now()) {
        await admin.from("free_video_intents").update({ status: "expired" }).eq("id", (intent as any).id);
        return json({ templateId: null });
      }

      const { data: claimed, error: claimError } = await admin
        .from("free_video_intents")
        .update({
          status: "claimed",
          claimed_user_id: user.id,
          claimed_at: new Date().toISOString(),
        })
        .eq("id", (intent as any).id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (claimError) throw new Error(claimError.message);
      if (!claimed?.id) return json({ templateId: null });

      const templateId = String((intent as any).template_id);
      const attribution = asAttribution((intent as any).attribution);

      // Bind the grant to this template. A CONSUMED grant is never revived.
      const { data: existing, error: existingError } = await admin
        .from("free_video_entitlements")
        .select("id, status")
        .eq("user_id", user.id)
        .eq("entitlement_type", FREE_VIDEO_ENTITLEMENT_TYPE)
        .maybeSingle();
      if (existingError) throw new Error(existingError.message);

      if (!existing) {
        const { error: grantError } = await admin
          .from("free_video_entitlements")
          .insert({
            user_id: user.id,
            entitlement_type: FREE_VIDEO_ENTITLEMENT_TYPE,
            selected_template_id: templateId,
            status: "available",
            attribution,
          });
        if (grantError && !/duplicate key|unique/i.test(grantError.message)) {
          throw new Error(grantError.message);
        }
      } else if (existing.status === "available") {
        await admin
          .from("free_video_entitlements")
          .update({ selected_template_id: templateId, attribution })
          .eq("id", existing.id)
          .eq("status", "available");
      }

      return json({ templateId });
    }

    return json({ error: "Unsupported action" }, 400);
  } catch (error) {
    const message = errorMessage(error);
    const status = /authorization|authentication|bearer/i.test(message) ? 401 : 400;
    return json({ error: message }, status);
  }
});
