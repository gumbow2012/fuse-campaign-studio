import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RegenerateError,
  fetchOutputRevisions,
  fetchRegenerateEstimate,
  regenerateOutput,
  type OutputRevisionRow,
  type RegenerateEstimate,
} from "@/services/regenerateOutput";

/**
 * TR7 — regenerate-one-output flow state.
 *
 * - Estimate is a server dry-run (no spend).
 * - The idempotencyKey is minted ONCE per output and reused on retry so a
 *   double-click or a failed-then-retried confirm can never double-charge.
 */
export interface UseOutputRegenerationOptions {
  jobId: string | null;
  /** Only allowed when the run is complete. */
  enabled: boolean;
  onStarted?: (outputNumber: number) => void;
  onCharged?: () => void;
}

export function useOutputRegeneration({
  jobId,
  enabled,
  onStarted,
  onCharged,
}: UseOutputRegenerationOptions) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [outputNumber, setOutputNumber] = useState<number | null>(null);
  const [estimate, setEstimate] = useState<RegenerateEstimate | null>(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<OutputRevisionRow[]>([]);

  const idempotencyKeys = useRef(new Map<string, string>());

  const loadRevisions = useCallback(async () => {
    if (!jobId) {
      setRevisions([]);
      return;
    }
    setRevisions(await fetchOutputRevisions(jobId));
  }, [jobId]);

  useEffect(() => {
    void loadRevisions();
  }, [loadRevisions]);

  const revisionsByOutput = useMemo(() => {
    const map = new Map<number, OutputRevisionRow[]>();
    revisions.forEach((row) => {
      const bucket = map.get(row.output_number);
      if (bucket) bucket.push(row);
      else map.set(row.output_number, [row]);
    });
    map.forEach((rows) => rows.sort((a, b) => a.revision - b.revision));
    return map;
  }, [revisions]);

  const idempotencyKeyFor = useCallback(
    (number: number) => {
      const key = `${jobId ?? ""}:${number}`;
      const existing = idempotencyKeys.current.get(key);
      if (existing) return existing;
      const minted =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `regen-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      idempotencyKeys.current.set(key, minted);
      return minted;
    },
    [jobId],
  );

  const requestRegenerate = useCallback(
    async (number: number) => {
      if (!jobId || !enabled) return;
      setOutputNumber(number);
      setEstimate(null);
      setErrorMessage(null);
      setErrorCode(null);
      setDialogOpen(true);
      setLoadingEstimate(true);
      try {
        setEstimate(await fetchRegenerateEstimate(jobId, number));
      } catch (error) {
        const code = error instanceof RegenerateError ? error.code : "ESTIMATE_FAILED";
        setErrorCode(code);
        setErrorMessage(
          code === "Forbidden" || code === "HTTP_403"
            ? "You don't have access to regenerate this output."
            : "We couldn't check the cost for this output. Please try again.",
        );
      } finally {
        setLoadingEstimate(false);
      }
    },
    [enabled, jobId],
  );

  const confirmRegenerate = useCallback(async () => {
    if (!jobId || outputNumber === null || !estimate) return;
    setSubmitting(true);
    setErrorMessage(null);
    setErrorCode(null);
    try {
      await regenerateOutput(jobId, outputNumber, idempotencyKeyFor(outputNumber));
      setDialogOpen(false);
      onCharged?.();
      onStarted?.(outputNumber);
      void loadRevisions();
    } catch (error) {
      const code = error instanceof RegenerateError ? error.code : "REGENERATE_FAILED";
      setErrorCode(code);
      setErrorMessage(
        code === "INSUFFICIENT_CREDITS"
          ? `You need ${estimate.estimatedCredits} credits to regenerate this output.`
          : "We couldn't start the regeneration. No credits were used.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [estimate, idempotencyKeyFor, jobId, loadRevisions, onCharged, onStarted, outputNumber]);

  return {
    dialogOpen,
    setDialogOpen,
    outputNumber,
    estimate,
    loadingEstimate,
    submitting,
    errorMessage,
    insufficientCredits: errorCode === "INSUFFICIENT_CREDITS",
    requestRegenerate,
    confirmRegenerate,
    revisionsByOutput,
    reloadRevisions: loadRevisions,
  };
}
