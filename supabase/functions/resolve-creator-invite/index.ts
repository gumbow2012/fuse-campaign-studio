/* eslint-disable @typescript-eslint/no-explicit-any */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { corsHeaders, createAdminClient, json } from "../_shared/supabase-admin.ts";

/**
 * PUBLIC resolver for branded creator invite URLs.
 * The raw Supabase action_link is NEVER readable from any public table — only here,
 * and only while the invite is still valid. The token and the action link are never logged.
 * Email is never returned.
 */

const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function extractToken(req: Request, body: Record<string, unknown>): string {
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("token") ?? "";
  if (fromQuery) return fromQuery.trim();
  const fromBody = typeof body.token === "string" ? body.token.trim() : "";
  if (fromBody) return fromBody;
  const segments = url.pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "";
  return last === "resolve-creator-invite" ? "" : last.trim();
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length ? trimmed : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const body = req.method === "POST"
      ? ((await req.json().catch(() => ({}))) as Record<string, unknown>)
      : {};
    const token = extractToken(req, body);
    if (!TOKEN_RE.test(token)) {
      return json({ status: "expired", invite: null, error: "Invite link is not valid", code: "not-found" }, 404);
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("creator_invites")
      .select(
        "status, action_link, created_at, last_sent_at, first_name, instagram_handle, display_name, personal_note",
      )
      .eq("branded_token", token)
      .maybeSingle();

    if (error) {
      console.error("resolve-creator-invite: lookup failed");
      return json({ status: "expired", invite: null, error: "Could not resolve invite", code: "error" }, 500);
    }

    const invite = data as any;
    if (!invite) {
      return json({ status: "expired", invite: null, error: "Invite link is not valid", code: "not-found" }, 404);
    }

    const context = {
      firstName: text(invite.first_name, 80),
      instagramHandle: text(invite.instagram_handle, 64)?.replace(/^@+/, "") ?? null,
      displayName: text(invite.display_name, 80),
      personalNote: text(invite.personal_note, 500),
    };

    const status = String(invite.status ?? "");
    if (status === "revoked") return json({ status: "revoked", invite: context });
    if (status === "accepted") return json({ status: "accepted", invite: context });

    const actionLink = typeof invite.action_link === "string" ? invite.action_link : "";
    const stamp = Date.parse(invite.last_sent_at ?? invite.created_at ?? "") || 0;
    const stale = !stamp || Date.now() - stamp > MAX_AGE_MS;
    if (!actionLink || stale) return json({ status: "expired", invite: context });

    // `redirect` kept for backward compatibility with earlier clients.
    return json({ status: "valid", invite: context, actionLink, redirect: actionLink });
  } catch {
    return json({ status: "expired", invite: null, error: "Could not resolve invite", code: "error" }, 500);
  }
});
