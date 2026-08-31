/* eslint-disable @typescript-eslint/no-explicit-any */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { corsHeaders, createAdminClient, json } from "../_shared/supabase-admin.ts";

/**
 * PUBLIC resolver for branded creator invite URLs.
 * The raw Supabase action_link is NEVER readable from any public table — only here.
 * The token and the action link are never logged.
 */

const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const body = req.method === "POST"
      ? ((await req.json().catch(() => ({}))) as Record<string, unknown>)
      : {};
    const token = extractToken(req, body);
    if (!TOKEN_RE.test(token)) {
      return json({ error: "Invite link is not valid", code: "not-found" }, 404);
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("creator_invites")
      .select("status, action_link")
      .eq("branded_token", token)
      .maybeSingle();

    if (error) {
      console.error("resolve-creator-invite: lookup failed");
      return json({ error: "Could not resolve invite", code: "error" }, 500);
    }

    const invite = data as any;
    if (!invite) return json({ error: "Invite link is not valid", code: "not-found" }, 404);

    const status = String(invite.status ?? "");
    if (status !== "pending" && status !== "accepted") {
      return json({ error: "This invite is no longer active", code: "used" }, 410);
    }

    const redirect = typeof invite.action_link === "string" ? invite.action_link : "";
    if (!redirect) {
      return json({ error: "This invite link has expired", code: "expired" }, 410);
    }

    return json({ redirect });
  } catch {
    return json({ error: "Could not resolve invite", code: "error" }, 500);
  }
});
