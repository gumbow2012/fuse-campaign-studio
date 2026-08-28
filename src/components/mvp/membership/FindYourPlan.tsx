import { useMemo, useState } from "react";
import { ChevronDown, Compass } from "lucide-react";
import { PLAN_LADDER } from "@/lib/planLadder";
import PlanCalculator from "@/components/mvp/membership/PlanCalculator";

/**
 * Template-first plan finder. Presentation only — it recommends a position on the
 * advertised ladder and never changes prices, credits or checkout.
 */
const CADENCE = [
  { id: "occasional", label: "Occasionally", plan: "starter" },
  { id: "monthly", label: "1-2 a month", plan: "starter" },
  { id: "weekly", label: "Weekly", plan: "capsule" },
  { id: "often", label: "Multiple per week", plan: "pro" },
] as const;

const WORKING = [
  { id: "solo", label: "Just me", plan: null },
  { id: "team", label: "A team / agency", plan: "team" },
] as const;

const CAST = [
  { id: "yes", label: "Yes, I want FUSE Cast", plan: "capsule" },
  { id: "no", label: "Not right now", plan: null },
] as const;

const ORDER = ["free", "starter", "capsule", "pro", "studio", "team"];

export default function FindYourPlan() {
  const [cadence, setCadence] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [cast, setCast] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const recommendedKey = useMemo(() => {
    if (!cadence && !working && !cast) return null;
    const candidates = [
      CADENCE.find((o) => o.id === cadence)?.plan ?? null,
      WORKING.find((o) => o.id === working)?.plan ?? null,
      CAST.find((o) => o.id === cast)?.plan ?? null,
    ].filter(Boolean) as string[];
    if (!candidates.length) return "starter";
    // Highest position on the advertised ladder wins.
    return candidates.reduce((best, key) => (ORDER.indexOf(key) > ORDER.indexOf(best) ? key : best), candidates[0]);
  }, [cadence, working, cast]);

  const recommended = PLAN_LADDER.find((entry) => entry.key === recommendedKey) ?? null;

  const chip = (active: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors motion-reduce:transition-none ${
      active
        ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-50"
        : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.06] hover:text-white"
    }`;

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5 md:p-7">
      <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
        <Compass className="h-3.5 w-3.5 text-cyan-200" /> Find your plan
      </p>

      <div className="mt-5 space-y-5">
        <div>
          <p className="text-sm font-medium text-white">How often do you drop?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {CADENCE.map((option) => (
              <button
                key={option.id}
                type="button"
                className={chip(cadence === option.id)}
                onClick={() => setCadence(cadence === option.id ? null : option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-white">Working alone or with a team?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {WORKING.map((option) => (
              <button
                key={option.id}
                type="button"
                className={chip(working === option.id)}
                onClick={() => setWorking(working === option.id ? null : option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-white">Want FUSE Cast?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {CAST.map((option) => (
              <button
                key={option.id}
                type="button"
                className={chip(cast === option.id)}
                onClick={() => setCast(cast === option.id ? null : option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {recommended ? (
        <div className="mt-6 rounded-2xl border border-cyan-300/30 bg-cyan-300/[0.07] p-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-100">Recommended</p>
          <p className="mt-1 font-display text-2xl font-semibold tracking-[-0.03em] text-white">{recommended.name}</p>
          <p className="mt-1 text-sm text-slate-200">
            {recommended.tagline} — {recommended.goodFor}.
          </p>
        </div>
      ) : (
        <p className="mt-6 text-xs text-slate-500">Answer any question to see a suggested plan.</p>
      )}

      <button
        type="button"
        onClick={() => setAdvancedOpen((open) => !open)}
        className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.16em] text-slate-400 hover:text-white"
      >
        Advanced: credit-based estimate
        <ChevronDown className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${advancedOpen ? "rotate-180" : ""}`} />
      </button>

      {advancedOpen ? (
        <div className="mt-4">
          <PlanCalculator />
        </div>
      ) : null}
    </section>
  );
}
