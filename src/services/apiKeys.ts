import { supabase } from "@/integrations/supabase/client";

export type ApiKeyScope = "templates:read" | "runs:read" | "runs:create";

export const API_KEY_SCOPES: ApiKeyScope[] = ["templates:read", "runs:read", "runs:create"];

export type ApiKeyRecord = {
  id: string;
  name: string;
  scopes: string[];
  key_prefix: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type CreatedApiKey = ApiKeyRecord & { key: string; note?: string };

async function callFuseMcp<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("fuse-mcp", { body });
  if (error) throw new Error(error.message || "Request failed.");
  if (data && typeof data === "object" && "error" in (data as Record<string, unknown>)) {
    const message = (data as { error?: unknown }).error;
    if (message) throw new Error(String(message));
  }
  return data as T;
}

export async function listApiKeys() {
  const data = await callFuseMcp<{ keys?: ApiKeyRecord[] }>({ action: "list_keys" });
  return Array.isArray(data?.keys) ? data.keys : [];
}

export async function createApiKey(name: string, scopes: ApiKeyScope[]) {
  return callFuseMcp<CreatedApiKey>({ action: "create_key", name, scopes });
}

export async function revokeApiKey(id: string) {
  return callFuseMcp<{ ok: boolean }>({ action: "revoke_key", id });
}
