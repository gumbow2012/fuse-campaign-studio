/**
 * SERVER-RENDERED CAMPAIGN EXPORT.
 *
 * Reuses the existing render pipeline exactly as the full editor does:
 *   `export-campaign`      — queues a render of the CURRENT saved edit
 *   `get-export-download`  — polled until the render is ready
 * Nothing is rendered locally and no original output is ever overwritten; the
 * export is a new file, named after the editable campaign name.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { exportCampaign } from "@/services/campaignEditor";
import { fetchExportDownload } from "@/services/videoEditorLibrary";
import { resolveDimensions, type ExportSettings } from "@/services/exportSettings";

export type ServerExportPhase = "idle" | "starting" | "rendering" | "ready" | "error";

const POLL_MS = 4000;
/** Rendering longer than this is reported, never silently spun forever. */
const MAX_POLLS = 150;

export function exportFileName(name: string | null | undefined) {
  const clean = (name ?? "").trim() || "FUSE Campaign";
  return `${clean.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_")}.mp4`;
}

export function useServerExport(projectId: string | null, campaignName: string | null) {
  const [phase, setPhase] = useState<ServerExportPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const timerRef = useRef<number | null>(null);
  const pollsRef = useRef(0);
  const nameRef = useRef(campaignName);
  nameRef.current = campaignName;

  const stop = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  /* Reset whenever the project changes. */
  useEffect(() => {
    stop();
    setPhase("idle");
    setError(null);
    setDownloadUrl(null);
    setElapsedMs(0);
  }, [projectId, stop]);

  const poll = useCallback(
    (exportId: string) => {
      pollsRef.current = 0;
      const startedAt = Date.now();
      stop();
      timerRef.current = window.setInterval(() => {
        pollsRef.current += 1;
        setElapsedMs(Date.now() - startedAt);
        if (pollsRef.current > MAX_POLLS) {
          stop();
          setPhase("error");
          setError("This render is taking longer than usual. You'll find it in your video library when it lands.");
          return;
        }
        void fetchExportDownload(exportId)
          .then((result) => {
            if (result.ready && result.download_url) {
              stop();
              setDownloadUrl(result.download_url);
              setPhase("ready");
            }
          })
          .catch(() => {
            /* A single failed poll is not a failed render — keep waiting. */
          });
      }, POLL_MS);
    },
    [stop],
  );

  const start = useCallback(
    async (settings: ExportSettings) => {
      if (!projectId) return;
      setPhase("starting");
      setError(null);
      setDownloadUrl(null);
      setElapsedMs(0);
      try {
        const { width, height } = resolveDimensions(settings);
        const result = await exportCampaign(projectId, {
          aspect_ratio: settings.aspect_ratio,
          width,
          height,
        });
        const exportId = result.export?.id ?? null;
        if (!exportId) {
          setPhase("error");
          setError("The render didn't start. Please try again in a moment.");
          return;
        }
        setPhase("rendering");
        poll(exportId);
      } catch (cause) {
        setPhase("error");
        setError(cause instanceof Error ? cause.message : "The render didn't start.");
      }
    },
    [projectId, poll],
  );

  const download = useCallback(() => {
    if (!downloadUrl) return;
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.rel = "noopener";
    anchor.download = exportFileName(nameRef.current);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }, [downloadUrl]);

  const reset = useCallback(() => {
    stop();
    setPhase("idle");
    setError(null);
    setDownloadUrl(null);
    setElapsedMs(0);
  }, [stop]);

  return { phase, error, downloadUrl, elapsedMs, start, download, reset };
}

export default useServerExport;
