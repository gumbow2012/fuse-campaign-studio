/**
 * TR9 — Pro private template forks (frontend client).
 *
 * The server is authoritative for IP gating: hidden creator prompts are never
 * present in these payloads for prompt-hidden forks.
 */
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";

export interface ForkNodeMediaItem {
  url: string;
  type: "image" | "video";
  sourceNodeId?: string;
  role?: "start" | "end";
  label?: string;
}

export interface ForkNodeMedia {
  output: { url: string; type: "image" | "video" } | null;
  references: ForkNodeMediaItem[];
  unavailable?: boolean;
}

export interface PersonalGraphNode {
  id: string;
  name: string;
  node_type: string;
  default_asset_id: string | null;
  settings: Record<string, unknown>;
  prompt?: string;
  directionOverride?: string;
  /** Presentation-only: persisted artifacts from the source run. */
  media?: ForkNodeMedia;
}


export interface PersonalGraph {
  version: 1;
  promptVisibility: boolean;
  nodes: PersonalGraphNode[];
  edges: Array<{ source_node_id: string; target_node_id: string; mapping_logic: unknown }>;
}

export interface TemplateFork {
  id: string;
  name: string;
  sourceTemplateId: string;
  sourceTemplateName: string | null;
  sourceVersionId: string;
  promptVisibility: boolean;
  basedOn: string;
  personalGraph: PersonalGraph | null;
  createdAt: string;
  updatedAt: string;
}

export class TemplateForkError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function callForkFunction<T>(body: Record<string, unknown>): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new TemplateForkError("UNAUTHENTICATED", "Please sign in again.");

  const response = await fetch(`${SUPABASE_URL}/functions/v1/template-fork`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json().catch(() => null)) as
    | (Record<string, unknown> & { error?: string; code?: string })
    | null;

  if (!response.ok || data?.error) {
    const code = String(data?.code ?? (response.status === 403 ? "FORBIDDEN" : `HTTP_${response.status}`));
    throw new TemplateForkError(code, String(data?.error ?? "Something went wrong."));
  }

  return data as T;
}

export async function createFork(
  templateId: string,
  options?: { sourceJobId?: string | null },
): Promise<{ forkId: string; promptVisibility: boolean }> {
  const data = await callForkFunction<Record<string, unknown>>({
    action: "create_fork",
    templateId,
    ...(options?.sourceJobId ? { sourceJobId: options.sourceJobId } : {}),
  });
  return {
    forkId: String(data.forkId ?? ""),
    promptVisibility: data.promptVisibility === true,
  };
}

export async function getFork(forkId: string): Promise<TemplateFork> {
  const data = await callForkFunction<{ fork: TemplateFork }>({ action: "get_fork", forkId });
  return data.fork;
}

export async function updateFork(forkId: string, personalGraph: PersonalGraph): Promise<void> {
  await callForkFunction({ action: "update_fork", forkId, personalGraph });
}

export async function resetFork(forkId: string): Promise<void> {
  await callForkFunction({ action: "reset_fork", forkId });
}

/** TR10b — dry-run cost estimate for running a private fork. Server-authoritative. */
export async function estimateForkRun(forkId: string): Promise<{ estimatedCredits: number }> {
  const data = await callForkFunction<Record<string, unknown>>({ action: "estimate_fork_run", forkId });
  return { estimatedCredits: Number(data.estimatedCredits ?? 0) };
}

/** TR10b — run the private fork. Inputs are omitted: the server reuses the source run's assets. */
export async function runFork(
  forkId: string,
  idempotencyKey: string,
): Promise<{ jobId: string; credits: number }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new TemplateForkError("UNAUTHENTICATED", "Please sign in again.");

  const response = await fetch(`${SUPABASE_URL}/functions/v1/start-template-run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ action: "run_fork", forkId, idempotencyKey }),
  });

  const data = (await response.json().catch(() => null)) as
    | (Record<string, unknown> & { error?: string; code?: string })
    | null;

  if (!response.ok || data?.error || !data?.jobId) {
    const code = String(
      data?.code ?? (response.status === 402 ? "INSUFFICIENT_CREDITS" : `HTTP_${response.status}`),
    );
    throw new TemplateForkError(code, String(data?.error ?? "Couldn't start your run."));
  }

  return { jobId: String(data.jobId), credits: Number(data.credits ?? 0) };
}
