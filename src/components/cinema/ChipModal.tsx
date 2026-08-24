import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ChipModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
}

/** Reusable modal shell for every Cinema director chip. */
export default function ChipModal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: ChipModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-border/70 bg-card/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-sm uppercase tracking-[0.22em]">
            {title}
          </DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="min-h-[160px] rounded-xl border border-border/60 bg-background/40 p-6 text-sm text-muted-foreground">
          {children ?? "Controls arrive in the next release."}
        </div>
      </DialogContent>
    </Dialog>
  );
}
