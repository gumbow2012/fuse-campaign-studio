import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Graceful action for plans/intervals that have NO Stripe price yet
 * (Plus monthly, Team monthly, and ALL annual intervals).
 * It never maps to another Stripe price and never starts a checkout.
 */
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planName: string | null;
  interval?: "monthly" | "annual";
};

export default function GatedPlanDialog({ open, onOpenChange, planName, interval = "monthly" }: Props) {
  const navigate = useNavigate();
  const label = planName ?? "this plan";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl border-white/10 bg-[#0B1120]/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-[-0.03em] text-white">
            Get early access to {label}
          </DialogTitle>
          <DialogDescription className="text-sm leading-6 text-slate-300">
            {interval === "annual"
              ? `Annual billing for ${label} is opening shortly. Tell us you want it and we'll set you up first.`
              : `${label} is rolling out to brands one group at a time. Tell us about your drops and we'll open it for you.`}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 flex flex-col gap-2">
          <Button
            className="w-full rounded-full bg-cyan-300 font-semibold text-slate-950 hover:bg-cyan-200"
            onClick={() => {
              onOpenChange(false);
              navigate("/contact");
            }}
          >
            Request early access
          </Button>
          <Button
            variant="outline"
            className="w-full rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10"
            onClick={() => onOpenChange(false)}
          >
            Keep browsing plans
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
