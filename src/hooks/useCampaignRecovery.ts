import { useCallback, useEffect, useRef, useState } from "react";
import {
  recoverCampaignOutputs,
  recoveredDownloadName,
  type CampaignRecovery,
  type RecoveredOutput,
} from "@/services/campaignRecovery";

/**
 * Result page recovery: whenever a run reaches a terminal state (or a stored run is
 * opened), ask the server for every durable successful output with a signed URL.
 * Never surfaces provider/stack errors — only customer-safe states.
 */
export type DownloadState = "idle" | "preparing" | "ready" | "expired";

export function useCampaignRecovery(jobId: string | null, enabled: boolean) {
  const [recovery, setRecovery] = useState<CampaignRecovery | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloadState, setDownloadState] = useState<DownloadState>("idle");
  const requestedRef = useRef<string | null>(null);

  const load = useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        const next = await recoverCampaignOutputs(id);
        setRecovery(next);
        return next;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!enabled || !jobId) {
      if (!jobId) {
        setRecovery(null);
        requestedRef.current = null;
      }
      return;
    }
    if (requestedRef.current === jobId) return;
    requestedRef.current = jobId;
    void load(jobId);
  }, [enabled, jobId, load]);

  const refresh = useCallback(async () => {
    if (!jobId) return null;
    return load(jobId);
  }, [jobId, load]);

  const saveBlob = (blob: Blob, filename: string) => {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
  };

  /**
   * Fetches the signed URL and saves it as a real file. If the signature has
   * expired, refreshes the recovery payload once and retries with the new URL.
   */
  const download = useCallback(
    async (output: RecoveredOutput, index: number, templateName: string | null) => {
      const filename = recoveredDownloadName(templateName, index, output.type);
      setDownloadState("preparing");

      const attempt = async (url: string) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error("expired");
        return response.blob();
      };

      try {
        const blob = await attempt(output.url);
        saveBlob(blob, filename);
        setDownloadState("ready");
        return;
      } catch {
        // Signature likely expired — refresh from the server and retry once.
      }

      try {
        const next = await refresh();
        const fresh = next?.ready_outputs.find((item) => item.node_id === output.node_id);
        if (!fresh) throw new Error("unavailable");
        const blob = await attempt(fresh.url);
        saveBlob(blob, filename);
        setDownloadState("ready");
      } catch {
        setDownloadState("expired");
      }
    },
    [refresh],
  );

  return { recovery, loading, refresh, download, downloadState };
}
