/**
 * TR7 — per-output regeneration (frontend client).
 *
 * Cost is ALWAYS server-authoritative: this module only ever sends
 * { jobId, outputNumber } (plus an idempotencyKey for execution) and reads the
 * credit numbers back from the edge functions. It never computes a price.
 */
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export interface RegenerateEstimate {
  jobId: string;
  outputNumber: number;
  targetNodeId: string | null;
  toRunNodeIds: string[];
  reusedNodeIds: string[];
  staleDownstreamOutputNumbers: number[];
  estimatedCredits: number;
}

export interface RegenerateResult {
  jobId: string;
  outputNumber: number;
  revision: number;
  toRunNodeIds: string[];
  estimatedCredits: number;
  ledgerId: string | null;
}

export class RegenerateError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export interface OutputRevisionRow {
  id: string;
  job_id: string;
  output_number: number;
  node_id: string | null;
  step_id: string | null;
  asset_id: string | null;
  output_url: string | null;
  output_type: string | null;
  revision: number;
  parent_revision_id: string | null;
  credits_charged: number | null;
  created_at: string;
}

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new RegenerateError("UNAUTHENTICATED", "Please sign in again.");
  return token;
}

async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json().catch(() => null)) as
    | (Record<string, unknown> & { error?: string; detail?: string })
    | null;

  if (!response.ok || data?.error) {
    const code = String(data?.error ?? `HTTP_${response.status}`);
    throw new RegenerateError(code, String(data?.detail ?? data?.error ?? "Something went wrong."));
  }

  return data as T;
}

/** DRY RUN — never spends credits. */
export async function fetchRegenerateEstimate(
  jobId: string,
  outputNumber: number,
): Promise<RegenerateEstimate> {
  const data = await callFunction<Record<string, unknown>>("regenerate-estimate", {
    action: "regenerate_estimate",
    jobId,
    outputNumber,
  });

  return {
    jobId: String(data.jobId ?? jobId),
    outputNumber: Number(data.outputNumber ?? outputNumber),
    targetNodeId: typeof data.targetNodeId === "string" ? data.targetNodeId : null,
    toRunNodeIds: Array.isArray(data.toRunNodeIds) ? data.toRunNodeIds.map(String) : [],
    reusedNodeIds: Array.isArray(data.reusedNodeIds) ? data.reusedNodeIds.map(String) : [],
    staleDownstreamOutputNumbers: Array.isArray(data.staleDownstreamOutputNumbers)
      ? data.staleDownstreamOutputNumbers.map(Number).filter(Number.isFinite)
      : [],
    estimatedCredits: Number(data.estimatedCredits ?? 0),
  };
}

/** CHARGES + RE-RUNS. Only called after an explicit user confirmation. */
export async function regenerateOutput(
  jobId: string,
  outputNumber: number,
  idempotencyKey: string,
): Promise<RegenerateResult> {
  const data = await callFunction<Record<string, unknown>>("start-template-run", {
    action: "regenerate_output",
    jobId,
    outputNumber,
    idempotencyKey,
  });

  return {
    jobId: String(data.jobId ?? jobId),
    outputNumber: Number(data.outputNumber ?? outputNumber),
    revision: Number(data.revision ?? 0),
    toRunNodeIds: Array.isArray(data.toRunNodeIds) ? data.toRunNodeIds.map(String) : [],
    estimatedCredits: Number(data.estimatedCredits ?? 0),
    ledgerId: typeof data.ledgerId === "string" ? data.ledgerId : null,
  };
}

/** RLS scopes output_revisions to the owning job. */
export async function fetchOutputRevisions(jobId: string): Promise<OutputRevisionRow[]> {
  const { data, error } = await supabase
    .from("output_revisions" as never)
    .select("*")
    .eq("job_id", jobId)
    .order("revision", { ascending: true });

  if (error) return [];
  return (data ?? []) as unknown as OutputRevisionRow[];
}
