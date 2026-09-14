import { supabase } from "@/integrations/supabase/client";

export type ApiKeyScope =
  | "fuse.templates.read"
  | "fuse.pricing.read"
  | "fuse.account.read"
  | "fuse.runs.read"
  | "fuse.outputs.read"
  | "fuse.assets.write"
  | "fuse.runs.prepare"
  | "fuse.runs.create"
  | "fuse.editor.write"
  | "fuse.exports.create";

export type ApiKeyScopeOption = { scope: ApiKeyScope; label: string };

export const API_KEY_READ_SCOPES: ApiKeyScopeOption[] = [
  { scope: "fuse.templates.read", label: "Search and read campaign templates" },
  { scope: "fuse.pricing.read", label: "Read pricing" },
  { scope: "fuse.account.read", label: "Read plan and credit balance" },
  { scope: "fuse.runs.read", label: "Read my runs" },
  { scope: "fuse.outputs.read", label: "View and download my outputs" },
];

export const API_KEY_CREATE_SCOPES: ApiKeyScopeOption[] = [
  { scope: "fuse.assets.write", label: "Upload product assets" },
  { scope: "fuse.runs.prepare", label: "Prepare campaign runs (no credits)" },
  { scope: "fuse.runs.create", label: "Start campaign runs (uses credits)" },
  { scope: "fuse.editor.write", label: "Edit my campaigns" },
  { scope: "fuse.exports.create", label: "Export my campaigns" },
];

export const API_KEY_SCOPE_GROUPS: { title: string; scopes: ApiKeyScopeOption[] }[] = [
  { title: "Read", scopes: API_KEY_READ_SCOPES },
  { title: "Create", scopes: API_KEY_CREATE_SCOPES },
];

export const API_KEY_SCOPES: ApiKeyScope[] = [
  ...API_KEY_READ_SCOPES.map((item) => item.scope),
  ...API_KEY_CREATE_SCOPES.map((item) => item.scope),
];

export const DEFAULT_API_KEY_SCOPES: ApiKeyScope[] = API_KEY_READ_SCOPES.map((item) => item.scope);

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
