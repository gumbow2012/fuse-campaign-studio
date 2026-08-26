import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { creditsForImage, creditsForVideo } from "@/lib/creditCosts";

const LOW_CREDITS = 500;
const CRITICAL_CREDITS = 100;

function useCreditExamples(balance: number) {
  const perImage = creditsForImage();
  const perClip = creditsForVideo({ model: "seedance-2.0", seconds: 5 });
  const images = perImage > 0 ? Math.floor(balance / perImage) : 0;
  const clips = perClip > 0 ? Math.floor(balance / perClip) : 0;
  return { images, clips };
}

export function CreditChip() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const balance = profile?.credits_balance ?? 0;
  const { images, clips } = useCreditExamples(balance);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  const isLow = balance < LOW_CREDITS;
  const isCritical = balance < CRITICAL_CREDITS;

  const chipClass = isCritical
    ? "border-orange-400/40 bg-orange-400/15 text-orange-300"
    : isLow
      ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
      : "border-cyan-400/30 bg-cyan-400/10 text-cyan-300";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label={`Credits: ${balance.toLocaleString()}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={`group flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold backdrop-blur-sm transition-all duration-200 hover:brightness-110 motion-reduce:transition-none sm:min-h-0 sm:px-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${chipClass}`}
        >
          <span aria-hidden="true">✦</span>
          <span>{balance.toLocaleString()}</span>
          {isCritical && (
            <span className="hidden sm:inline text-[10px] font-medium opacity-90">
              Low credits
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-64 rounded-2xl border-white/10 bg-[#0B1120]/95 p-4 backdrop-blur-xl shadow-2xl"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Credits</span>
            <span className="text-lg font-display font-bold text-foreground">
              {balance.toLocaleString()}
            </span>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
              What can I make?
            </p>
            <p className="mt-1.5 text-sm text-foreground">
              ~{images.toLocaleString()} Nano images
            </p>
            <p className="text-sm text-foreground">
              ~{clips.toLocaleString()} Seedance clips
            </p>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Approximate; actual cost depends on settings.
            </p>
          </div>

          <Button
            asChild
            size="sm"
            className="w-full rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
          >
            <Link to="/membership?tab=credits" onClick={() => setOpen(false)}>
              Buy Credits
            </Link>
          </Button>

          <Link
            to="/membership?tab=usage"
            onClick={() => setOpen(false)}
            className="block text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            View Usage →
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
