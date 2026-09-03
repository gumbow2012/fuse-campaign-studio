import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

/** Confirmation before switching from Basic to Advanced. Edits are preserved. */
export default function AdvancedModeDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (dontShowAgain: boolean) => void;
}) {
  const [dontShow, setDontShow] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-slate-950 text-slate-200 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-base uppercase tracking-[0.12em] text-white">
            Open Advanced Editor?
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-400">
            Fine-tune color, framing, texture, motion, audio and individual layers. Your current edits
            will be preserved.
          </DialogDescription>
        </DialogHeader>

        <label className="flex items-center gap-2 text-[12px] text-slate-400">
          <Checkbox
            checked={dontShow}
            onCheckedChange={(value) => setDontShow(value === true)}
            aria-label="Don't show this again"
          />
          Don&apos;t show this again
        </label>

        <DialogFooter className="gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-white/10 bg-white/[0.03] text-slate-300"
          >
            Stay in Basic Editor
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(dontShow)}
            className="bg-cyan-400 font-display uppercase tracking-[0.08em] text-slate-950 hover:bg-cyan-300"
          >
            Continue to Advanced Editor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
