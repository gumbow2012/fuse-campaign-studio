import { PLAN_LADDER, type PlanLadderEntry } from "@/lib/planLadder";

type Props = {
  plan: string | null | undefined;
  subscriptionStatus: string | null | undefined;
};

/**
 * ADVERTISED ladder — backend entitlement enforcement for Cast / priority / concurrency /
 * team features is NOT yet implemented (follow-up).
 *
 * Every cell reflects the intended, published ladder. Credit numbers come from the plan
 * ladder (which reads STRIPE_TIERS) and are never invented here.
 *
 * Deliberately short: one flat, scannable list of the highest-signal differentiators.
 */
const ORDER = ["free", "starter", "plus", "capsule", "pro", "studio", "team"];
const rank = (entry: PlanLadderEntry) => ORDER.indexOf(entry.key);

const YES = "Included";
const NO = "—";

const from = (minKey: string) => (entry: PlanLadderEntry) =>
  rank(entry) >= ORDER.indexOf(minKey) ? YES : NO;

type Row = { label: string; value: (entry: PlanLadderEntry) => string };

const ROWS: Row[] = [
  { label: "Monthly credits", value: (e) => e.creditsLabel },
  { label: "Run campaign templates", value: from("starter") },
  { label: "Full template library", value: from("starter") },
  { label: "Saved brand assets", value: from("starter") },
  { label: "FUSE Cast + My Avatars", value: from("plus") },
  { label: "Workflow customization", value: from("pro") },
  { label: "Creator Program eligible", value: from("pro") },
  { label: "Full advanced toolset", value: from("studio") },
  { label: "Team workspace + seats", value: (e) => (e.key === "team" ? "3 seats" : NO) },
];

export default function PlanComparisonMatrix({ plan, subscriptionStatus }: Props) {
  const isActive = subscriptionStatus === "active" || subscriptionStatus === "trialing";

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-[#0B1120]/95 backdrop-blur">
          <tr>
            <th className="w-[220px] px-3 py-3 text-left text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Feature
            </th>
            {PLAN_LADDER.map((entry) => {
              const isCurrent = isActive && plan === entry.key;
              return (
                <th
                  key={entry.key}
                  className={`px-3 py-3 text-center font-display text-xs font-bold uppercase tracking-[0.14em] ${
                    isCurrent
                      ? "text-cyan-200"
                      : entry.recommended
                        ? "text-lime-200"
                        : "text-slate-300"
                  }`}
                >
                  {entry.name}
                  {isCurrent ? <span className="block text-[9px] tracking-[0.1em] text-cyan-300/80">Your plan</span> : null}
                  {!isCurrent && entry.recommended ? (
                    <span className="block text-[9px] tracking-[0.1em] text-lime-300/80">Best value</span>
                  ) : null}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.label} className="border-t border-white/5">
              <td className="sticky left-0 bg-[#0B1120]/95 px-3 py-2.5 text-slate-300">{row.label}</td>
              {PLAN_LADDER.map((entry) => {
                const value = row.value(entry);
                return (
                  <td
                    key={entry.key}
                    className={`px-3 py-2.5 text-center ${value === NO ? "text-slate-600" : "text-slate-100"}`}
                  >
                    {value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
