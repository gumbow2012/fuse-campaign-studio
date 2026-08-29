import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { CREDIT_PACKS } from "@/lib/stripe-config";
import { creditsForImage, creditsForVideo } from "@/lib/creditCosts";
import {
  BEST_PLAN_COST_PER_1K,
  BEST_VALUE_STOP,
  TOP_UP_LADDER,
  costPer1kCredits,
} from "@/lib/topUpLadder";
import GatedPlanDialog from "@/components/mvp/membership/GatedPlanDialog";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Credit slider — snaps to the top-up ladder stops.
 *
 * Only ladder stops flagged `live` have a real Stripe price and can check out (through the
 * existing credit-pack handler). Gated stops (1K / 2K / 10K) have no Stripe product yet and
 * only offer the early-access action — never call checkout for them and never map them to a
 * different pack.
 */

type PackKey = keyof typeof CREDIT_PACKS;

const CREDITS_PER_IMAGE = creditsForImage();
const VIDEO_EXAMPLE_SECONDS = 5;
const CREDITS_PER_VIDEO = creditsForVideo({ model: "kling-2.5", seconds: VIDEO_EXAMPLE_SECONDS });

export function costPer1k(price: number, credits: number) {
  return costPer1kCredits(price, credits);
}

export function packApproxLabel(credits: number) {
  const images = Math.floor(credits / CREDITS_PER_IMAGE);
  const videos = CREDITS_PER_VIDEO > 0 ? Math.floor(credits / CREDITS_PER_VIDEO) : 0;
  return `approx ${images.toLocaleString()} images or ${videos.toLocaleString()} × ${VIDEO_EXAMPLE_SECONDS}s Kling 2.5 videos`;
}

type Props = {
  loading: string | null;
  isAdmin: boolean;
  onCheckout: (packKey: PackKey) => void;
  /** Reports the currently selected credit amount (used by the mix calculator). */
  onAmountChange?: (amount: number) => void;
};

export default function CreditSliderPanel({ loading, isAdmin, onCheckout, onAmountChange }: Props) {
  const { profile } = useAuth();
  const defaultIndex = Math.max(
    0,
    TOP_UP_LADDER.findIndex((stop) => stop.credits === CREDIT_PACKS.growth.credits),
  );
  const [index, setIndex] = useState<number>(defaultIndex);
  const [gatedSize, setGatedSize] = useState<number | null>(null);

  const stop = TOP_UP_LADDER[index];

  useEffect(() => {
    onAmountChange?.(stop.credits);
  }, [stop.credits, onAmountChange]);

  const per1k = useMemo(() => costPer1kCredits(stop.price, stop.credits), [stop]);
  const balance = Number(profile?.credits_balance ?? 0);
  const isLive = stop.checkout === "live";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center gap-2">
        <Coins className="h-4 w-4 text-cyan-200" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Buy extra credits
        </p>
      </div>
      <p className="mt-2 text-sm text-slate-300">
        You currently have <span className="font-semibold text-white">{balance.toLocaleString()}</span> credits.
      </p>

      <div className="mt-6">
        <Slider
          value={[index]}
          min={0}
          max={TOP_UP_LADDER.length - 1}
          step={1}
          onValueChange={([next]) => setIndex(next)}
          aria-label="Credit amount"
        />

        <div className="relative mt-3 h-10">
          {TOP_UP_LADDER.map((ladderStop, i) => {
            const left = (i / (TOP_UP_LADDER.length - 1)) * 100;
            const active = i === index;
            return (
              <button
                key={ladderStop.credits}
                type="button"
                onClick={() => setIndex(i)}
                style={{ left: `${left}%` }}
                className="absolute -translate-x-1/2 text-center"
              >
                <span
                  className={`mx-auto block h-2 w-px ${
                    ladderStop.checkout === "live" ? "bg-cyan-300" : "bg-white/25"
                  }`}
                  aria-hidden
                />
                <span
                  className={`mt-1 block text-[10px] ${
                    active ? "font-semibold text-white" : "text-slate-500"
                  }`}
                >
                  {ladderStop.credits >= 1000 ? `${ladderStop.credits / 1000}K` : ladderStop.credits}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-100/80">
          {isLive ? "Available now" : "Coming soon"}
          {stop.credits === BEST_VALUE_STOP.credits ? " · best value" : ""}
        </p>
        <p className="mt-2 font-display text-3xl font-black tracking-[-0.04em] text-white">
          {stop.credits.toLocaleString()}
          <span className="ml-2 text-sm font-medium text-slate-300">credits</span>
        </p>
        <p className="mt-1 text-sm text-cyan-100/90">
          ${stop.price} one-time · ${per1k.toFixed(2)} per 1,000 credits
        </p>
        <p className="mt-1 text-xs text-slate-400">{packApproxLabel(stop.credits)}</p>

        {isLive ? (
          <Button
            onClick={() => stop.checkout === "live" && onCheckout(stop.packKey)}
            disabled={isAdmin || !!loading}
            className={`mt-4 w-full rounded-full font-semibold ${
              isAdmin ? "bg-white/10 text-white hover:bg-white/10" : "bg-cyan-300 text-slate-950 hover:bg-cyan-200"
            }`}
          >
            {isAdmin
              ? "Admin access"
              : loading === stop.packKey
                ? "Loading..."
                : `Purchase ${stop.credits.toLocaleString()} credits`}
            {!isAdmin ? <ArrowRight className="h-4 w-4" /> : null}
          </Button>
        ) : (
          <>
            <p className="mt-2 text-sm text-amber-50/90">
              This top-up size isn&apos;t live yet — request early access and we&apos;ll set it up with you.
            </p>
            <Button
              onClick={() => setGatedSize(stop.credits)}
              disabled={isAdmin}
              className="mt-4 w-full rounded-full bg-white/10 font-semibold text-white hover:bg-white/15"
            >
              Request early access
            </Button>
          </>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-400">
        Bigger top-ups cost less per credit. Monthly plans go lower still — from $
        {BEST_PLAN_COST_PER_1K.toFixed(2)} per 1,000 credits.
      </p>

      <GatedPlanDialog
        open={gatedSize !== null}
        onOpenChange={(open) => !open && setGatedSize(null)}
        planName={gatedSize ? `${gatedSize.toLocaleString()} credit top-up` : null}
        interval="monthly"
      />
    </div>
  );
}
