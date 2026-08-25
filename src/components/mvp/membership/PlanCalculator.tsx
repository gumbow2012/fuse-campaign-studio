import { useEffect, useMemo, useRef, useState } from "react";
import { Calculator } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  VIDEO_COST_MODEL_LIST,
  VIDEO_COST_RATES,
  creditsForImage,
  creditsForVideo,
  type VideoCostModelKey,
} from "@/lib/creditCosts";
import { PLAN_LADDER } from "@/lib/planLadder";

/**
 * Plan recommendation calculator — presentation only.
 * Every number derives from src/lib/creditCosts.ts. Nothing here touches pricing,
 * credit values or checkout; all figures are labelled "approx".
 */

const LIVE_TIERS = PLAN_LADDER.filter(
  (entry) => entry.checkout === "live" && entry.monthlyCredits && entry.monthlyCredits > 0,
).sort((a, b) => (a.monthlyCredits as number) - (b.monthlyCredits as number));

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);
  return reduced;
}

/** Tweens toward the target value; snaps instantly when motion is reduced. */
function useAnimatedNumber(target: number, reduced: boolean) {
  const [value, setValue] = useState(target);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) {
      setValue(target);
      return;
    }
    const start = value;
    const startedAt = performance.now();
    const duration = 420;

    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(start + (target - start) * eased));
      if (progress < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, reduced]);

  return value;
}

type Props = {
  /** Reports the recommended live tier key (or null when volume exceeds every plan). */
  onRecommend: (key: string | null) => void;
};

export default function PlanCalculator({ onRecommend }: Props) {
  const reduced = usePrefersReducedMotion();
  const [images, setImages] = useState(200);
  const [videos, setVideos] = useState(20);
  const [seconds, setSeconds] = useState(5);
  const [model, setModel] = useState<VideoCostModelKey>("kling-2.5");
  const [audio, setAudio] = useState(false);

  const rate = VIDEO_COST_RATES[model];
  const creditsPerImage = creditsForImage();
  const creditsPerVideo = useMemo(
    () => creditsForVideo({ model, seconds, audio: audio && rate.supportsAudio }),
    [model, seconds, audio, rate.supportsAudio],
  );

  const needed = images * creditsPerImage + videos * creditsPerVideo;
  const animated = useAnimatedNumber(needed, reduced);

  const recommended = useMemo(
    () => LIVE_TIERS.find((tier) => (tier.monthlyCredits as number) >= needed) ?? null,
    [needed],
  );
  const largest = LIVE_TIERS[LIVE_TIERS.length - 1];

  useEffect(() => {
    onRecommend(recommended?.key ?? null);
  }, [recommended?.key, onRecommend]);

  // Clamp duration into the selected model's real accepted range.
  useEffect(() => {
    if (rate.durations && !rate.durations.includes(seconds)) {
      setSeconds(rate.durations[0]);
    } else if (rate.durationRange) {
      const next = Math.min(rate.durationRange.max, Math.max(rate.durationRange.min, seconds));
      if (next !== seconds) setSeconds(next);
    }
  }, [model, rate, seconds]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex items-center gap-2">
        <Calculator className="h-4 w-4 text-cyan-200" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          How much do you create?
        </p>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-sm text-slate-200">Images / month</Label>
              <span className="font-display text-sm font-bold text-white">{images.toLocaleString()}</span>
            </div>
            <Slider
              className="mt-3"
              value={[images]}
              min={0}
              max={3000}
              step={10}
              onValueChange={([next]) => setImages(next)}
              aria-label="Images per month"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label className="text-sm text-slate-200">Videos / month</Label>
              <span className="font-display text-sm font-bold text-white">{videos.toLocaleString()}</span>
            </div>
            <Slider
              className="mt-3"
              value={[videos]}
              min={0}
              max={600}
              step={5}
              onValueChange={([next]) => setVideos(next)}
              aria-label="Videos per month"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-sm text-slate-200" htmlFor="calc-model">
                Video model
              </Label>
              <select
                id="calc-model"
                value={model}
                onChange={(event) => setModel(event.target.value as VideoCostModelKey)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
              >
                {VIDEO_COST_MODEL_LIST.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-sm text-slate-200" htmlFor="calc-seconds">
                Average video length
              </Label>
              {rate.durations ? (
                <select
                  id="calc-seconds"
                  value={seconds}
                  onChange={(event) => setSeconds(Number(event.target.value))}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                >
                  {rate.durations.map((option) => (
                    <option key={option} value={option}>
                      {option}s
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="calc-seconds"
                  type="number"
                  min={rate.durationRange?.min ?? 3}
                  max={rate.durationRange?.max ?? 15}
                  value={seconds}
                  onChange={(event) => setSeconds(Number(event.target.value))}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                />
              )}
            </div>
          </div>

          {rate.supportsAudio ? (
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={audio}
                onChange={(event) => setAudio(event.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-slate-950/60"
              />
              Generate audio (changes the per-second rate)
            </label>
          ) : null}
        </div>

        <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-100/80">Estimated monthly need</p>
          <p className="mt-2 font-display text-4xl font-black tracking-[-0.04em] text-white">
            {animated.toLocaleString()}
            <span className="ml-2 text-sm font-medium text-slate-300">credits</span>
          </p>
          <p className="mt-2 text-xs text-slate-400">
            approx · {creditsPerImage} credits per image · {creditsPerVideo.toLocaleString()} credits per{" "}
            {seconds}s {rate.label} video
          </p>
          {rate.note ? <p className="mt-1 text-[11px] text-slate-500">{rate.note}</p> : null}

          <div className="mt-4 border-t border-white/10 pt-4">
            {needed === 0 ? (
              <p className="text-sm text-slate-300">Set your volume to see an approx plan match.</p>
            ) : recommended ? (
              <>
                <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-100/80">Recommended</p>
                <p className="mt-1 font-display text-xl font-bold text-white">{recommended.name}</p>
                <p className="mt-1 text-xs text-slate-400">
                  approx {recommended.monthlyCredits?.toLocaleString()} credits/mo — the smallest plan that covers your
                  estimate.
                </p>
              </>
            ) : (
              <>
                <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-100/80">Recommended</p>
                <p className="mt-1 font-display text-xl font-bold text-white">{largest.name} + top-ups</p>
                <p className="mt-1 text-xs text-slate-400">
                  Your estimate is above {largest.monthlyCredits?.toLocaleString()} credits/mo. Add one-time credit packs,
                  or talk to us about Team (custom pricing).
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
