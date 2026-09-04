/**
 * Live generation polling — truthful state only.
 *
 * Polls `campaign-live-status` every 2.5s while the server says the job is
 * queued/running and stops on a terminal status. Progress is clamped to the
 * max value ever seen so the bar can never travel backwards, but it is never
 * advanced by a timer: every value comes from the server.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchCampaignLiveStatus,
  isLiveJobActive,
  resolveMostRecentRunningJobId,
  type CampaignLiveStatus,
} from "@/services/campaignLiveStatus";

const POLL_MS = 2500;
const RETRY_MS = 5000;

interface Options {
  /** When true and no jobId is given, reconnect to the newest running job. */
  resolveLatest?: boolean;
  enabled?: boolean;
  onTerminal?: (status: CampaignLiveStatus) => void;
}

export function useCampaignLiveStatus(jobId: string | null, options: Options = {}) {
  const { resolveLatest = false, enabled = true, onTerminal } = options;
  const [resolvedJobId, setResolvedJobId] = useState<string | null>(jobId);
  const [status, setStatus] = useState<CampaignLiveStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const maxProgressRef = useRef(0);
  const [maxProgress, setMaxProgress] = useState(0);
  const terminalNotified = useRef<string | null>(null);
  const onTerminalRef = useRef(onTerminal);
  onTerminalRef.current = onTerminal;

  useEffect(() => {
    setResolvedJobId(jobId);
    if (jobId) return;
    if (!resolveLatest || !enabled) return;
    let cancelled = false;
    void resolveMostRecentRunningJobId().then((found) => {
      if (!cancelled && found) setResolvedJobId(found);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, jobId, resolveLatest]);

  /* A different job starts from a clean slate. */
  useEffect(() => {
    maxProgressRef.current = 0;
    setMaxProgress(0);
    setStatus(null);
    setError(null);
    terminalNotified.current = null;
  }, [resolvedJobId]);

  const load = useCallback(async (id: string) => {
    const next = await fetchCampaignLiveStatus(id);
    if (next.job.progress_pct > maxProgressRef.current) {
      maxProgressRef.current = next.job.progress_pct;
      setMaxProgress(next.job.progress_pct);
    }
    if (next.job.execution_complete || next.job.status === "complete") {
      maxProgressRef.current = 100;
      setMaxProgress(100);
    }
    return next;
  }, []);

  useEffect(() => {
    const id = resolvedJobId;
    if (!id || !enabled) return;

    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      try {
        setLoading(true);
        const next = await load(id);
        if (cancelled) return;
        setStatus(next);
        setError(null);
        /* Stop the moment the server says execution is over. */
        if (!next.job.execution_complete && isLiveJobActive(next.job.status)) {
          timer = window.setTimeout(tick, POLL_MS);
        } else if (terminalNotified.current !== id) {
          terminalNotified.current = id;
          onTerminalRef.current?.(next);
        }
      } catch (pollError) {
        if (cancelled) return;
        setError(pollError instanceof Error ? pollError.message : "Lost the live connection.");
        timer = window.setTimeout(tick, RETRY_MS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [enabled, load, resolvedJobId]);

  const refresh = useCallback(async () => {
    if (!resolvedJobId) return;
    try {
      const next = await load(resolvedJobId);
      setStatus(next);
      setError(null);
    } catch {
      /* the poll loop keeps retrying */
    }
  }, [load, resolvedJobId]);

  return { jobId: resolvedJobId, status, maxProgress, error, loading, refresh };
}

export default useCampaignLiveStatus;
