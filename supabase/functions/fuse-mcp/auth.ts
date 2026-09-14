/**
 * Auth resolution for the MCP / REST layer.
 *
 *  - Supabase user JWT (OAuth 2.1 access token from a connected app, or a normal
 *    session token): validated with auth.getUser(); the token is later forwarded
 *    as the user to internal functions. OAuth tokens carry a `client_id` claim.
 *    Supabase OAuth has no custom scopes, so an OAuth-connected user gets the
 *    full USER scope set (what the consent screen describes).
 *  - Developer API key (`fuse_live_…`): sha256 lookup in api_keys, per-key scopes,
 *    per-minute rate limit. Acts as the key's owner.
 *  - Nothing: anonymous — public read tools only.
 *
 * LAB_RUNNER_CODE / service-role bypasses are never honoured here.
 */
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { FuseError } from "./errors.ts";
import { sha256Hex } from "./confirm.ts";

export const SCOPES = [
  "fuse.templates.read",
  "fuse.pricing.read",
  "fuse.account.read",
  "fuse.assets.write",
  "fuse.runs.prepare",
  "fuse.runs.create",
  "fuse.runs.read",
  "fuse.outputs.read",
  "fuse.editor.write",
  "fuse.exports.create",
] as const;
export type Scope = typeof SCOPES[number];

export const PUBLIC_SCOPES: Scope[] = ["fuse.templates.read", "fuse.pricing.read"];
export const USER_SCOPES: Scope[] = [...SCOPES];

/** Legacy v1 key scopes → fuse.* */
const LEGACY_SCOPE_MAP: Record<string, Scope[]> = {
  "templates:read": ["fuse.templates.read", "fuse.pricing.read"],
  "runs:read": ["fuse.runs.read", "fuse.outputs.read", "fuse.account.read"],
  "runs:create": ["fuse.assets.write", "fuse.runs.prepare", "fuse.runs.create", "fuse.editor.write", "fuse.exports.create"],
};

export function normalizeScopes(raw: unknown): Scope[] {
  const out = new Set<Scope>(PUBLIC_SCOPES);
  for (const s of Array.isArray(raw) ? raw.map(String) : []) {
    if ((SCOPES as readonly string[]).includes(s)) out.add(s as Scope);
    for (const mapped of LEGACY_SCOPE_MAP[s] ?? []) out.add(mapped);
  }
  return [...out];
}

export type AuthContext = {
  kind: "anonymous" | "oauth" | "session" | "api_key";
  userId: string | null;
  email: string | null;
  scopes: Scope[];
  /** Bearer token usable as the user against internal functions (null for api keys). */
  userToken: string | null;
  apiKeyId: string | null;
  clientId: string | null;
  isPrivileged: boolean;
};

export const ANONYMOUS: AuthContext = {
  kind: "anonymous",
  userId: null,
  email: null,
  scopes: PUBLIC_SCOPES,
  userToken: null,
  apiKeyId: null,
  clientId: null,
  isPrivileged: false,
};

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new FuseError("INTERNAL", `Missing env ${name}`);
  return v;
}

export function adminClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}
export type Admin = ReturnType<typeof adminClient>;

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    const pad = part.length % 4 === 0 ? "" : "=".repeat(4 - (part.length % 4));
    return JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/") + pad));
  } catch {
    return null;
  }
}

export async function resolveAuth(req: Request, admin: Admin): Promise<AuthContext> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!header) return ANONYMOUS;
  if (!token) throw new FuseError("INVALID_TOKEN", "Empty bearer token");

  if (token.startsWith("fuse_")) {
    const hash = await sha256Hex(token);
    const { data: key } = await admin
      .from("api_keys")
      .select("id,user_id,scopes,rate_limit_per_min,revoked_at")
      .eq("key_hash", hash)
      .maybeSingle();
    if (!key || key.revoked_at) throw new FuseError("INVALID_TOKEN", "API key invalid or revoked");
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await admin
      .from("api_key_usage")
      .select("id", { count: "exact", head: true })
      .eq("api_key_id", key.id)
      .gte("created_at", since);
    if ((count ?? 0) >= (key.rate_limit_per_min ?? 60)) throw new FuseError("RATE_LIMITED");
    await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);
    const { data: u } = await admin.auth.admin.getUserById(key.user_id);
    const privileged = await isPrivilegedUser(admin, key.user_id);
    return {
      kind: "api_key",
      userId: key.user_id,
      email: u?.user?.email ?? null,
      scopes: normalizeScopes(key.scopes),
      userToken: null,
      apiKeyId: key.id,
      clientId: null,
      isPrivileged: privileged,
    };
  }

  // Supabase JWT — validated by the auth server (signature, expiry, revocation).
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new FuseError("INVALID_TOKEN", error?.message ?? "Token rejected");
  const claims = decodeJwtPayload(token) ?? {};
  const expectedIss = `${env("SUPABASE_URL")}/auth/v1`;
  if (claims.iss && claims.iss !== expectedIss) throw new FuseError("INVALID_TOKEN", "Token issuer mismatch");
  if (claims.aud && claims.aud !== "authenticated") throw new FuseError("INVALID_TOKEN", "Token audience mismatch");
  const clientId = typeof claims.client_id === "string" ? claims.client_id : null;
  const privileged = await isPrivilegedUser(admin, data.user.id);
  return {
    kind: clientId ? "oauth" : "session",
    userId: data.user.id,
    email: data.user.email ?? null,
    scopes: USER_SCOPES,
    userToken: token,
    apiKeyId: null,
    clientId,
    isPrivileged: privileged,
  };
}

async function isPrivilegedUser(admin: Admin, userId: string): Promise<boolean> {
  const { data } = await admin.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).some((r: { role: string }) => r.role === "admin" || r.role === "dev");
}

export function requireScope(auth: AuthContext, scope: Scope, resourceMetadataUrl: string) {
  if (auth.kind === "anonymous") {
    throw new FuseError("AUTH_REQUIRED", `Scope ${scope} requires a connected FUSE account`, {
      nextAction: "Connect your FUSE account, then retry.",
      details: { resource_metadata: resourceMetadataUrl, scope },
    });
  }
  if (!auth.scopes.includes(scope)) {
    throw new FuseError("FORBIDDEN_SCOPE", `Missing scope ${scope}`, {
      nextAction: `Create an API key that includes ${scope}, or reconnect with full access.`,
      details: { scope },
    });
  }
}

/**
 * A bearer token that internal functions accept as this user.
 * OAuth/session: the caller's own token. API key: a short-lived session minted
 * for the key's owner (magic-link token hash → verifyOtp), revoked right after use.
 */
export async function withUserToken<T>(admin: Admin, auth: AuthContext, fn: (token: string) => Promise<T>): Promise<T> {
  if (auth.userToken) return await fn(auth.userToken);
  if (!auth.userId || !auth.email) throw new FuseError("AUTH_REQUIRED");
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: auth.email });
  if (error || !link?.properties?.hashed_token) throw new FuseError("INTERNAL", "Could not act as the API key owner");
  const anon = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: session, error: otpError } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  const accessToken = session?.session?.access_token;
  if (otpError || !accessToken) throw new FuseError("INTERNAL", "Could not open a session for the API key owner");
  try {
    return await fn(accessToken);
  } finally {
    // Best effort: end the temporary session so it never lingers.
    await admin.auth.admin.signOut(accessToken, "local").catch(() => {});
  }
}
