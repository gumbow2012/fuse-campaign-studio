/**
 * Short human-copyable confirmation codes that map server-side to the exact
 * signed confirmation token. Resolution only returns the token; the caller
 * still runs it through the unchanged verifyConfirmationToken checks.
 */
import type { Admin } from "../auth.ts";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export type CodeKind = "campaign" | "generation";

export function newConfirmationCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return `FUSE-${s}`;
}

export function normalizeCode(code: string): string {
  const c = String(code ?? "").trim().toUpperCase();
  return c.startsWith("FUSE-") ? c : `FUSE-${c}`;
}

export async function saveCode(admin: Admin, a: { userId: string; kind: CodeKind; code: string; token: string; expiresAt: string }) {
  const { error } = await (admin as any).from("mcp_prepared_plans").insert({
    user_id: a.userId,
    kind: a.kind,
    match_key: a.code,
    token: a.token,
    expires_at: a.expiresAt,
  });
  if (error) throw error;
}

export async function resolveCode(admin: Admin, a: { userId: string; kind: CodeKind; code: string }): Promise<string | null> {
  const { data, error } = await (admin as any)
    .from("mcp_prepared_plans")
    .select("token")
    .eq("user_id", a.userId)
    .eq("kind", a.kind)
    .eq("match_key", normalizeCode(a.code))
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data.token ?? null;
}
