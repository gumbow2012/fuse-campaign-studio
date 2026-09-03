/**
 * Partial-run recovery — thin client over the existing `run-results` and
 * `rerun-step` edge functions. Read-only for outputs; retries are free.
 */
import { supabase } from "@/integrations/supabase/client";

export type RunOutput = {
  type: "video" | "image";
  url: string;
  label?: string | null;
  step_id?: string | null;
  node_id?: string | null;
};

export type RunFailedStep = { step_id: string; node_id?: string | null };

export type RunResults = {
  run_id: string;
  status: string;
  derived_status: string;
  counts: { completed: number; failed: number; total: number };
  has_video: boolean;
  editable: boolean;
  edit_project_id: string | null;
  outputs: RunOutput[];
  failed_steps: RunFailedStep[];
};

function normalize(raw: unknown, runId: string): RunResults {
  const body = (raw ?? {}) as Record<string, unknown>;
  const counts = (body.counts ?? {}) as Record<string, unknown>;
  const outputs = Array.isArray(body.outputs) ? (body.outputs as Record<string, unknown>[]) : [];
  const failed = Array.isArray(body.failed_steps) ? (body.failed_steps as Record<string, unknown>[]) : [];
  return {
    run_id: String(body.run_id ?? runId),
    status: String(body.status ?? "unknown"),
    derived_status: String(body.derived_status ?? body.status ?? "unknown"),
    counts: {
      completed: Number(counts.completed ?? 0) || 0,
      failed: Number(counts.failed ?? 0) || 0,
      total: Number(counts.total ?? 0) || 0,
    },
    has_video: Boolean(body.has_video),
    editable: Boolean(body.editable),
    edit_project_id: typeof body.edit_project_id === "string" ? body.edit_project_id : null,
    outputs: outputs
      .filter((output) => typeof output.url === "string" && output.url)
      .map((output) => ({
        type: output.type === "image" ? "image" : "video",
        url: String(output.url),
        label: (output.label as string | null) ?? null,
        step_id: (output.step_id as string | null) ?? null,
        node_id: (output.node_id as string | null) ?? null,
      })),
    failed_steps: failed
      .filter((step) => typeof step.step_id === "string" && step.step_id)
      .map((step) => ({ step_id: String(step.step_id), node_id: (step.node_id as string | null) ?? null })),
  };
}

/** Fetch every durable output for a run (works for partial/failed runs too). */
export async function fetchRunResults(runId: string): Promise<RunResults> {
  const { data, error } = await supabase.functions.invoke("run-results", {
    body: { run_id: runId },
  });
  if (error) throw new Error(error.message || "We couldn't load this campaign's outputs.");
  return normalize(data, runId);
}

/** Free retry of one failed step. Retried clips land in the editor's Available Media. */
export async function rerunFailedStep(stepId: string): Promise<void> {
  const { error } = await supabase.functions.invoke("rerun-step", { body: { step_id: stepId } });
  if (error) throw new Error(error.message || "We couldn't retry that output.");
}
