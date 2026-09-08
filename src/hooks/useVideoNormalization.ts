import { useCallback, useEffect, useRef, useState } from "react";
import {
  NORMALIZE_POLL_MS,
  requestNormalization,
  type NormalizationRow,
  type NormalizationStatus,
} from "@/lib/videoNormalization";

/**
 * Drives `normalize-video` for one source clip: kicks the job, then polls every
 * 2.5s while it is still probing/converting. Also runs on mount, so a
 * conversion that was already in flight resumes after a page refresh.
 */
export function useVideoNormalization(sourcePath: string | null) {
  const [row, setRow] = useState<NormalizationRow | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const activePath = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const poll = useCallback(async (path: string, retry: boolean) => {
    try {
      const next = await requestNormalization(path, retry);
      if (activePath.current !== path) return;
      setRow(next);
      setRequestError(next.error ?? null);
      const status = next.status ?? null;
      if (status === "converting" || status === "probing") {
        clearTimer();
        timer.current = setTimeout(() => void poll(path, false), NORMALIZE_POLL_MS);
      }
    } catch (error) {
      if (activePath.current !== path) return;
      setRequestError(error instanceof Error ? error.message : "Could not prepare that video");
      setRow((prev) => ({ ...(prev ?? {}), status: "failed" }));
    }
  }, []);

  useEffect(() => {
    clearTimer();
    activePath.current = sourcePath;
    setRow(null);
    setRequestError(null);
    if (!sourcePath) return;
    void poll(sourcePath, false);
    return clearTimer;
  }, [sourcePath, poll]);

  const retry = useCallback(() => {
    if (!sourcePath) return;
    clearTimer();
    setRequestError(null);
    setRow({ status: "converting" });
    void poll(sourcePath, true);
  }, [sourcePath, poll]);

  const status = (row?.status ?? null) as NormalizationStatus | null;

  return {
    status,
    /** True only while a conversion is genuinely in flight. */
    preparing: status === "converting" || status === "probing",
    ready: status === "ready",
    failed: status === "failed",
    playbackUrl: row?.playback_url ?? null,
    needsNormalization: row?.needs_normalization ?? null,
    width: row?.width ?? null,
    height: row?.height ?? null,
    error: requestError,
    retry,
  };
}
