import { supabase } from "@/integrations/supabase/client";

/**
 * URGENT recovery path — reads every DURABLE successful output of a run from the
 * server (regardless of the job's status) and returns freshly SIGNED, downloadable
 * URLs. Used by the result page so customers whose job was marked failed can still
 * reach the deliverables that actually succeeded.
 *
 * Read-only. No billing, no generation, no executor involvement.
 */

export type RecoveryStatus = "complete" | "partial" | "failed" | "running";

export interface RecoveredOutput {
  node_id: string;
  type: "video" | "image";
  url: string;
  label?: string;
  outputNumber?: number;
}

export interface RecoveredFailure {
  node_id: string;
  error_category?: string;
}

export interface CampaignRecovery {
  status: RecoveryStatus;
  ready_outputs: RecoveredOutput[];
  failed_outputs: RecoveredFailure[];
  ready_count: number;
  failed_count: number;
}

function normalizeType(value: unknown): "video" | "image" {
  return String(value ?? "").toLowerCase().includes("video") ? "video" : "image";
}

export async function recoverCampaignOutputs(jobId: string): Promise<CampaignRecovery | null> {
  const { data, error } = await supabase.functions.invoke("recover-campaign-outputs", {
    body: { job_id: jobId },
  });

  if (error || !data || typeof data !== "object") return null;

  const payload = data as Record<string, unknown>;
  const ready = Array.isArray(payload.ready_outputs) ? payload.ready_outputs : [];
  const failed = Array.isArray(payload.failed_outputs) ? payload.failed_outputs : [];

  const readyOutputs: RecoveredOutput[] = ready
    .map((item, index) => {
      const row = (item ?? {}) as Record<string, unknown>;
      const url = typeof row.url === "string" ? row.url : "";
      if (!url) return null;
      return {
        node_id: String(row.node_id ?? `output-${index + 1}`),
        type: normalizeType(row.type),
        url,
        label: typeof row.label === "string" ? row.label : undefined,
        outputNumber:
          typeof row.outputNumber === "number" && Number.isFinite(row.outputNumber)
            ? row.outputNumber
            : index + 1,
      } satisfies RecoveredOutput;
    })
    .filter((item): item is RecoveredOutput => item !== null);

  const failedOutputs: RecoveredFailure[] = failed.map((item, index) => {
    const row = (item ?? {}) as Record<string, unknown>;
    return {
      node_id: String(row.node_id ?? `failed-${index + 1}`),
      error_category:
        typeof row.error_category === "string" && row.error_category ? row.error_category : undefined,
    };
  });

  const status: RecoveryStatus = ["complete", "partial", "failed", "running"].includes(
    String(payload.status),
  )
    ? (String(payload.status) as RecoveryStatus)
    : readyOutputs.length > 0 && failedOutputs.length > 0
      ? "partial"
      : readyOutputs.length > 0
        ? "complete"
        : "failed";

  return {
    status,
    ready_outputs: readyOutputs,
    failed_outputs: failedOutputs,
    ready_count:
      typeof payload.ready_count === "number" ? payload.ready_count : readyOutputs.length,
    failed_count:
      typeof payload.failed_count === "number" ? payload.failed_count : failedOutputs.length,
  };
}

/** Human-readable deliverable filename: FUSE_Airport_Tray_1.mp4 */
export function recoveredDownloadName(templateName: string | null, index: number, type: string) {
  const safe = (templateName ?? "Campaign")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/(^_|_$)/g, "") || "Campaign";
  const extension = String(type).toLowerCase().includes("video") ? "mp4" : "jpg";
  return `FUSE_${safe}_${index + 1}.${extension}`;
}
