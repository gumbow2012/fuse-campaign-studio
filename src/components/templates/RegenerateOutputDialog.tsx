import { Loader2, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { RegenerateEstimate } from "@/services/regenerateOutput";

/**
 * TR7 — explicit confirmation before ANY regeneration spend.
 *
 * The credit figure shown is the server dry-run estimate; nothing is computed
 * on the client and nothing is charged until Regenerate is pressed.
 */
export interface RegenerateOutputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  outputNumber: number | null;
  estimate: RegenerateEstimate | null;
  loadingEstimate: boolean;
  errorMessage: string | null;
  insufficientCredits: boolean;
  submitting: boolean;
  onConfirm: () => void;
}

export default function RegenerateOutputDialog({
  open,
  onOpenChange,
  outputNumber,
  estimate,
  loadingEstimate,
  errorMessage,
  insufficientCredits,
  submitting,
  onConfirm,
}: RegenerateOutputDialogProps) {
  const credits = estimate?.estimatedCredits ?? 0;
  const stale = estimate?.staleDownstreamOutputNumbers ?? [];
  const canConfirm = Boolean(estimate) && !loadingEstimate && !submitting && !insufficientCredits;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-white/10 bg-[#08090c]">
        <DialogHeader>
          <DialogTitle className="font-display text-[15px] font-semibold uppercase tracking-[0.16em] text-foreground">
            Regenerate Output {outputNumber ?? ""}
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-300">
            {loadingEstimate
              ? "Checking what this will cost…"
              : estimate
                ? `This will use ${credits} credits.`
                : "Estimate unavailable."}
          </DialogDescription>
        </DialogHeader>

        {stale.length ? (
          <p className="rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-[12px] text-amber-100">
            Outputs {stale.join(", ")} will become out of date.
          </p>
        ) : null}

        {errorMessage ? (
          <div className="rounded-lg border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-[12px] text-rose-100">
            <p>{errorMessage}</p>
            {insufficientCredits ? (
              <Link
                to="/membership"
                className="mt-1 inline-block underline underline-offset-2"
                onClick={() => onOpenChange(false)}
              >
                Top up credits
              </Link>
            ) : null}
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="text-[11px] uppercase tracking-[0.18em]"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className="text-[11px] uppercase tracking-[0.18em]"
          >
            {submitting ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            Regenerate · {credits} cr
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
