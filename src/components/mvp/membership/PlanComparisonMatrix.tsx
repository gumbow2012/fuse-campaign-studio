import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { PLAN_LADDER } from "@/lib/planLadder";
import { creditsForImage, creditsForVideo } from "@/lib/creditCosts";

type Props = {
  plan: string | null | undefined;
  subscriptionStatus: string | null | undefined;
};

/**
 * HONESTY RULES for this matrix:
 * - Only real, verifiable values. Credits come from the plan ladder (which reads STRIPE_TIERS).
 * - Gated positions (Free / Plus / Team) show honest placeholders, never invented numbers.
 * - Concurrency, speed, team features, commercial rights and support are NOT tier-differentiated
 *   in the product today, so those rows read the same for every plan ("Same across plans").
 *   Never fabricate a per-tier ladder for them.
 */

type CellValue = (entry: (typeof PLAN_LADDER)[number]) => string;

type Row = { label: string; note?: string; value: CellValue };
type Group = { id: string; title: string; rows: Row[] };

const fmt = (n: number) => n.toLocaleString();

const GATED_PLACEHOLDER = "Not available yet";

const creditsCell: CellValue = (entry) => {
  if (entry.monthlyCredits) return fmt(entry.monthlyCredits);
  if (entry.isFreeState) return "No monthly credits";
  return GATED_PLACEHOLDER;
};

const paidIncluded: CellValue = (entry) =>
  entry.checkout === "live" ? "Included" : entry.isFreeState ? "Membership required" : GATED_PLACEHOLDER;

const SAME_FOR_ALL: CellValue = () => "Same across plans";

export default function PlanComparisonMatrix({ plan, subscriptionStatus }: Props) {
  const isActive = subscriptionStatus === "active" || subscriptionStatus === "trialing";
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const groups = useMemo<Group[]>(() => {
    const perImage = creditsForImage();
    const perVideo5s = creditsForVideo({ model: "kling-2.5", seconds: 5 });

    const approxImages: CellValue = (entry) =>
      entry.monthlyCredits ? `~${fmt(Math.floor(entry.monthlyCredits / perImage))} / mo (approx)` : creditsCell(entry);
    const approxVideos: CellValue = (entry) =>
      entry.monthlyCredits ? `~${fmt(Math.floor(entry.monthlyCredits / perVideo5s))} / mo (approx)` : creditsCell(entry);

    return [
      {
        id: "credits",
        title: "Credits",
        rows: [
          { label: "Monthly price", value: (e) => (e.price === null ? GATED_PLACEHOLDER : `$${e.price}`) },
          { label: "Credits per month", value: creditsCell },
          {
            label: "One-time top-ups",
            note: "Boost, Growth and Bulk packs — same packs for every paid plan.",
            value: paidIncluded,
          },
        ],
      },
      {
        id: "images",
        title: "Images",
        rows: [
          {
            label: "Image generations",
            note: `Capacity only — every plan uses the same models. About ${perImage} credits per image.`,
            value: approxImages,
          },
          { label: "Image models", value: paidIncluded },
        ],
      },
      {
        id: "videos",
        title: "Videos",
        rows: [
          {
            label: "5s video clips",
            note: `Capacity only — about ${perVideo5s} credits per 5s clip (Kling 2.5).`,
            value: approxVideos,
          },
          { label: "Video models", value: paidIncluded },
        ],
      },
      {
        id: "models",
        title: "Models",
        rows: [
          {
            label: "All available models",
            note: "No model is gated by plan. Higher plans simply include more credits.",
            value: paidIncluded,
          },
        ],
      },
      {
        id: "cinema",
        title: "Cinema",
        rows: [{ label: "FUSE Cinema composer", value: paidIncluded }],
      },
      {
        id: "templates",
        title: "Templates",
        rows: [{ label: "Full template library", value: paidIncluded }],
      },
      {
        id: "creator",
        title: "Creator Program",
        rows: [
          {
            label: "Creator Program access",
            note: "Invite-based, not tied to your plan.",
            value: () => "By invite",
          },
        ],
      },
      {
        id: "throughput",
        title: "Concurrency & speed",
        rows: [
          {
            label: "Concurrent jobs",
            note: "FUSE does not tier concurrency or queue priority today.",
            value: SAME_FOR_ALL,
          },
          { label: "Processing speed", value: SAME_FOR_ALL },
        ],
      },
      {
        id: "team",
        title: "Team features",
        rows: [
          {
            label: "Seats & shared workspaces",
            note: "Multi-seat workflows are not shipped yet on any plan.",
            value: () => "Not available yet",
          },
        ],
      },
      {
        id: "rights",
        title: "Commercial rights & support",
        rows: [
          { label: "Commercial use of your outputs", value: SAME_FOR_ALL },
          { label: "Support", note: "Standard support for all members.", value: SAME_FOR_ALL },
        ],
      },
    ];
  }, []);

  const columnClass = (entry: (typeof PLAN_LADDER)[number]) => {
    const isCurrent = entry.checkout === "live" && plan === entry.key && isActive;
    const isFreeCurrent = Boolean(entry.isFreeState) && !isActive;
    if (isCurrent || isFreeCurrent) return "bg-cyan-300/10";
    if (entry.recommended) return "bg-cyan-300/[0.04]";
    return "";
  };

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead className="sticky top-0 z-20">
          <tr className="border-b border-white/10 bg-slate-950/95 backdrop-blur">
            <th className="sticky left-0 z-10 bg-slate-950/95 px-4 py-4 text-left font-display text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Feature
            </th>
            {PLAN_LADDER.map((entry) => {
              const isCurrent = entry.checkout === "live" && plan === entry.key && isActive;
              const isFreeCurrent = Boolean(entry.isFreeState) && !isActive;
              return (
                <th
                  key={entry.key}
                  className={`px-4 py-4 text-center font-display text-sm font-semibold uppercase tracking-[0.12em] ${
                    entry.recommended ? "text-cyan-300" : "text-white"
                  } ${columnClass(entry)}`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <span>{entry.name}</span>
                    {isCurrent || isFreeCurrent ? (
                      <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-medium normal-case text-cyan-50">
                        Current
                      </span>
                    ) : entry.recommended ? (
                      <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-medium normal-case text-cyan-50">
                        Recommended
                      </span>
                    ) : entry.checkout === "gated" && !entry.isFreeState ? (
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium normal-case text-slate-300">
                        {entry.badge}
                      </span>
                    ) : null}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>

        {groups.map((group) => {
          const isCollapsed = collapsed[group.id];
          return (
            <tbody key={group.id} className="divide-y divide-white/10 border-b border-white/10">
              <tr>
                <td colSpan={PLAN_LADDER.length + 1} className="bg-white/[0.04] p-0">
                  <button
                    type="button"
                    onClick={() => setCollapsed((prev) => ({ ...prev, [group.id]: !prev[group.id] }))}
                    aria-expanded={!isCollapsed}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left font-display text-[11px] font-bold uppercase tracking-[0.2em] text-slate-200 transition-colors hover:text-white"
                  >
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none ${
                        isCollapsed ? "-rotate-90" : ""
                      }`}
                    />
                    {group.title}
                  </button>
                </td>
              </tr>
              {isCollapsed
                ? null
                : group.rows.map((row) => (
                    <tr key={row.label}>
                      <td className="sticky left-0 z-10 bg-slate-950/80 px-4 py-4 text-slate-300">
                        <span className="block">{row.label}</span>
                        {row.note ? <span className="mt-1 block text-xs text-slate-500">{row.note}</span> : null}
                      </td>
                      {PLAN_LADDER.map((entry) => (
                        <td
                          key={entry.key}
                          className={`px-4 py-4 text-center ${columnClass(entry)} ${
                            entry.recommended ? "font-medium text-white" : "text-slate-200"
                          }`}
                        >
                          {row.value(entry)}
                        </td>
                      ))}
                    </tr>
                  ))}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
