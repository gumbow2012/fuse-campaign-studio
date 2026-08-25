import { Fragment, useState } from "react";
import { ChevronDown } from "lucide-react";
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
 */
const ORDER = ["free", "starter", "plus", "pro", "studio", "team"];
const rank = (entry: PlanLadderEntry) => ORDER.indexOf(entry.key);

const YES = "Included";
const NO = "—";

const from = (minKey: string) => (entry: PlanLadderEntry) =>
  rank(entry) >= ORDER.indexOf(minKey) ? YES : NO;

type Row = { label: string; value: (entry: PlanLadderEntry) => string };
type Group = { id: string; title: string; rows: Row[] };

const GROUPS: Group[] = [
  {
    id: "campaigns",
    title: "Campaigns",
    rows: [
      { label: "Browse the marketplace", value: () => YES },
      { label: "Preview campaigns", value: () => YES },
      { label: "Run campaign templates", value: from("starter") },
      { label: "Campaign history + versions", value: from("starter") },
    ],
  },
  {
    id: "templates",
    title: "Templates",
    rows: [
      { label: "Full template library", value: from("starter") },
      { label: "New drops added daily", value: from("starter") },
      { label: "Trending + early access", value: from("pro") },
    ],
  },
  {
    id: "cast",
    title: "Cast + Avatars",
    rows: [
      { label: "FUSE Cast", value: from("plus") },
      { label: "My Avatars", value: from("plus") },
    ],
  },
  {
    id: "brand",
    title: "Brand Assets",
    rows: [
      { label: "Saved brand assets", value: from("starter") },
      { label: "Product + garment profiles", value: from("starter") },
      { label: "Larger asset library", value: from("plus") },
    ],
  },
  {
    id: "speed",
    title: "Speed",
    rows: [
      { label: "Standard processing", value: from("starter") },
      { label: "Priority generation", value: from("pro") },
      { label: "Higher concurrency", value: from("plus") },
    ],
  },
  {
    id: "advanced",
    title: "Advanced Tools",
    rows: [
      { label: "Advanced campaign controls", value: from("starter") },
      { label: "Full advanced toolset", value: from("studio") },
    ],
  },
  {
    id: "creator",
    title: "Creator",
    rows: [
      { label: "Follow creators", value: () => YES },
      { label: "Creator Program eligible", value: from("pro") },
    ],
  },
  {
    id: "team",
    title: "Team",
    rows: [
      { label: "Shared workspace", value: (e) => (e.key === "team" ? YES : NO) },
      { label: "Seats included", value: (e) => (e.key === "team" ? "3" : "1") },
      { label: "Roles + team analytics", value: (e) => (e.key === "team" ? YES : NO) },
    ],
  },
  {
    id: "credits",
    title: "Credits",
    rows: [
      { label: "Monthly credits", value: (e) => e.creditsLabel },
      { label: "One-time top-ups", value: from("starter") },
    ],
  },
];

export default function PlanComparisonMatrix({ plan, subscriptionStatus }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({ campaigns: true });
  const isActive = subscriptionStatus === "active" || subscriptionStatus === "trialing";

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-sm">
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
                    <span className="block text-[9px] tracking-[0.1em] text-lime-300/80">Most popular</span>
                  ) : null}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {GROUPS.map((group) => {
            const isOpen = open[group.id] ?? false;
            return (
              <Fragment key={group.id}>
                <tr className="border-t border-white/10">
                  <td colSpan={PLAN_LADDER.length + 1} className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setOpen((prev) => ({ ...prev, [group.id]: !isOpen }))}
                      className="flex w-full items-center gap-2 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-white"
                    >
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${isOpen ? "rotate-180" : ""}`}
                      />
                      {group.title}
                    </button>
                  </td>
                </tr>
                {isOpen
                  ? group.rows.map((row) => (
                      <tr key={`${group.id}-${row.label}`} className="border-t border-white/5">
                        <td className="sticky left-0 bg-[#0B1120]/95 px-3 py-2 text-slate-300">{row.label}</td>
                        {PLAN_LADDER.map((entry) => (
                          <td
                            key={entry.key}
                            className={`px-3 py-2 text-center ${
                              row.value(entry) === NO ? "text-slate-600" : "text-slate-100"
                            }`}
                          >
                            {row.value(entry)}
                          </td>
                        ))}
                      </tr>
                    ))
                  : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
