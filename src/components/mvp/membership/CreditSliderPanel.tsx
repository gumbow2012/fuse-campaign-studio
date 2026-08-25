import { useMemo, useState } from "react";
import { ArrowRight, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { CREDIT_PACKS } from "@/lib/stripe-config";
import { creditsForImage, creditsForVideo } from "@/lib/creditCosts";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Credit slider — snaps to the THREE packs that have real Stripe prices.
 *
 * Arbitrary credit amounts are NOT purchasable: there is no Stripe price for them.
 * ENABLING ARBITRARY-AMOUNT PURCHASE would require either (a) creating a Stripe price
 * per amount, or (b) using dynamic `price_data` in the checkout session — both are
 * billing changes and out of scope here. Never render a price for a non-pack amount
 * and never call checkout with anything but a real pack key.
 */

type PackKey = keyof typeof CREDIT_PACKS;

const PACK_KEYS = (Object.keys(CREDIT_PACKS) as PackKey[]).sort(
  (a, b) => CREDIT_PACKS[a].credits - CREDIT_PACKS[b].credits,
);

/** Context-only tick marks; only the real pack sizes are purchasable. */
const CONTEXT_TICKS = [100, 1000, 2000, 5000];
const SLIDER_MIN = 100;
const SLIDER_MAX = 5000;
const SLIDER_STEP = 100;

const CREDITS_PER_IMAGE = creditsForImage();
const VIDEO_EXAMPLE_SECONDS = 5;
const CREDITS_PER_VIDEO = creditsForVideo({ model: "kling-2.5", seconds: VIDEO_EXAMPLE_SECONDS });

export function costPer1k(price: number, credits: number) {
  return (price / credits) * 1000;
}

export function packApproxLabel(credits: number) {
  const images = Math.floor(credits / CREDITS_PER_IMAGE);
  const videos = CREDITS_PER_VIDEO > 0 ? Math.floor(credits / CREDITS_PER_VIDEO) : 0;
  return `approx ${images.toLocaleString()} images or ${videos.toLocaleString()} × ${VIDEO_EXAMPLE_SECONDS}s Kling 2.5 videos`;
}

/** Lowest real cost per 1,000 credits — computed, never a marketing label. */
export const BEST_VALUE_PACK: PackKey = PACK_KEYS.reduce((best, key) =>
  costPer1k(CREDIT_PACKS[key].price, CREDIT_PACKS[key].credits) <
  costPer1k(CREDIT_PACKS[best].price, CREDIT_PACKS[best].credits)
    ? key
    : best,
);

type Props = {
  loading: string | null;
  isAdmin: boolean;
  onCheckout: (packKey: PackKey) => void;
};

export default function CreditSliderPanel({ loading, isAdmin, onCheckout }: Props) {
  const { profile } = useAuth();
  const [amount, setAmount] = useState<number>(CREDIT_PACKS.growth.credits);

  const exactPackKey = useMemo(
    () => PACK_KEYS.find((key) => CREDIT_PACKS[key].credits === amount) ?? null,
    [amount],
  );
  const nearestPackKey = useMemo(
    () =>
      PACK_KEYS.reduce((best, key) =>
        Math.abs(CREDIT_PACKS[key].credits - amount) < Math.abs(CREDIT_PACKS[best].credits - amount) ? key : best,
      ),
    [amount],
  );

  const pack = exactPackKey ? CREDIT_PACKS[exactPackKey] : null;
  const balance = Number(profile?.credits_balance ?? 0);

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
          value={[amount]}
          min={SLIDER_MIN}
          max={SLIDER_MAX}
          step={SLIDER_STEP}
          onValueChange={([next]) => setAmount(next)}
          aria-label="Credit amount"
        />

        {/* Visible stops: real pack sizes are purchasable, other ticks are context only. */}
        <div className="relative mt-3 h-10">
          {[...new Set([...CONTEXT_TICKS, ...PACK_KEYS.map((key) => CREDIT_PACKS[key].credits)])]
            .sort((a, b) => a - b)
            .map((tick) => {
              const isPack = PACK_KEYS.some((key) => CREDIT_PACKS[key].credits === tick);
              const left = ((tick - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100;
              return (
                <button
                  key={tick}
                  type="button"
                  onClick={() => setAmount(tick)}
                  style={{ left: `${left}%` }}
                  className="absolute -translate-x-1/2 text-center"
                >
                  <span
                    className={`mx-auto block h-2 w-px ${isPack ? "bg-cyan-300" : "bg-white/20"}`}
                    aria-hidden
                  />
                  <span
                    className={`mt-1 block text-[10px] ${
                      isPack ? "font-semibold text-cyan-100" : "text-slate-500"
                    }`}
                  >
                    {tick >= 1000 ? `${tick / 1000}K` : tick}
                  </span>
                </button>
              );
            })}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4">
        {pack && exactPackKey ? (
          <>
            <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-100/80">{pack.name} pack</p>
            <p className="mt-2 font-display text-3xl font-black tracking-[-0.04em] text-white">
              {pack.credits.toLocaleString()}
              <span className="ml-2 text-sm font-medium text-slate-300">credits</span>
            </p>
            <p className="mt-1 text-sm text-cyan-100/90">
              ${pack.price} one-time · ${costPer1k(pack.price, pack.credits).toFixed(2)} per 1,000 credits
            </p>
            <p className="mt-1 text-xs text-slate-400">{packApproxLabel(pack.credits)}</p>

            <Button
              onClick={() => onCheckout(exactPackKey)}
              disabled={isAdmin || !!loading}
              className={`mt-4 w-full rounded-full font-semibold ${
                isAdmin ? "bg-white/10 text-white hover:bg-white/10" : "bg-cyan-300 text-slate-950 hover:bg-cyan-200"
              }`}
            >
              {isAdmin
                ? "Admin access"
                : loading === exactPackKey
                  ? "Loading..."
                  : `Purchase ${pack.credits.toLocaleString()} credits`}
              {!isAdmin ? <ArrowRight className="h-4 w-4" /> : null}
            </Button>
          </>
        ) : (
          <>
            <p className="text-[10px] uppercase tracking-[0.2em] text-amber-100">Custom amount</p>
            <p className="mt-2 font-display text-3xl font-black tracking-[-0.04em] text-white">
              {amount.toLocaleString()}
              <span className="ml-2 text-sm font-medium text-slate-300">credits</span>
            </p>
            <p className="mt-2 text-sm text-amber-50/90">Custom credit amounts are coming soon — pick a pack.</p>
            <Button
              disabled
              className="mt-4 w-full rounded-full bg-white/10 font-semibold text-white hover:bg-white/10"
            >
              Purchase unavailable
            </Button>
            <Button
              variant="outline"
              onClick={() => setAmount(CREDIT_PACKS[nearestPackKey].credits)}
              className="mt-2 w-full rounded-full border-white/15 bg-white/5 font-semibold text-foreground hover:bg-white/10"
            >
              Snap to {CREDIT_PACKS[nearestPackKey].name} ({CREDIT_PACKS[nearestPackKey].credits.toLocaleString()})
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
