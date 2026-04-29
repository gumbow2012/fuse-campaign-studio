import { createClient } from "npm:@supabase/supabase-js@2.57.4";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-runner-code, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

export function createAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

type AuditEventInput = {
  eventType: string;
  message: string;
  severity?: "debug" | "info" | "warn" | "error" | "critical";
  source?: string;
  jobId?: string | null;
  stepId?: string | null;
  templateId?: string | null;
  versionId?: string | null;
  errorCode?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function logAuditEvent(
  input: AuditEventInput,
  admin = createAdminClient(),
) {
  const { error } = await admin.rpc("log_audit_event", {
    p_event_type: input.eventType,
    p_message: input.message,
    p_severity: input.severity ?? "info",
    p_source: input.source ?? "system",
    p_job_id: input.jobId ?? null,
    p_step_id: input.stepId ?? null,
    p_template_id: input.templateId ?? null,
    p_version_id: input.versionId ?? null,
    p_error_code: input.errorCode ?? null,
    p_request_id: input.requestId ?? null,
    p_metadata: input.metadata ?? {},
  });

  if (error) {
    console.error("log_audit_event failed:", error.message);
  }
}

export async function requireUser(req: Request, admin = createAdminClient()) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Missing authorization header");

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Missing bearer token");

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error(error?.message ?? "Authentication failed");

  return data.user;
}

export async function getUserRoles(userId: string, admin = createAdminClient()) {
  const { data, error } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => String(row.role));
}

export async function requireTesterUser(req: Request, admin = createAdminClient()) {
  const user = await requireUser(req, admin);
  const roles = await getUserRoles(user.id, admin);
  if (!roles.some((role) => role === "admin" || role === "dev")) {
    throw new Error("Tester access required");
  }
  return user;
}

export async function requireAdminUser(req: Request, admin = createAdminClient()) {
  const user = await requireUser(req, admin);
  const roles = await getUserRoles(user.id, admin);
  if (!roles.includes("admin")) {
    throw new Error("Admin access required");
  }
  return user;
}

export function hasValidRunnerCode(req: Request) {
  const expected = Deno.env.get("LAB_RUNNER_CODE")?.trim();
  if (!expected) return false;

  const actual = req.headers.get("x-runner-code")?.trim();
  return !!actual && actual === expected;
}

export function hasValidBillingSmokeSecret(req: Request) {
  const expected = Deno.env.get("BILLING_SMOKE_SECRET")?.trim();
  if (!expected) return false;

  const actual = req.headers.get("x-billing-smoke-secret")?.trim();
  return !!actual && actual === expected;
}

export async function getOptionalUser(req: Request, admin = createAdminClient()) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;

  return data.user;
}
