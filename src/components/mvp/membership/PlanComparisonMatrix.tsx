import { STRIPE_TIERS } from "@/lib/stripe-config";

type Props = {
  plan: string | null | undefined;
  subscriptionStatus: string | null | undefined;
};

const tierKeys = Object.keys(STRIPE_TIERS) as Array<keyof typeof STRIPE_TIERS>;

export default function PlanComparisonMatrix({ plan, subscriptionStatus }: Props) {
  const isActive = subscriptionStatus === "active" || subscriptionStatus === "trialing";

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full min-w-[600px] text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.04]">
            <th className="px-4 py-4 text-left font-display text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Feature
            </th>
            {tierKeys.map((tierKey) => {
              const tier = STRIPE_TIERS[tierKey];
              const isCurrentActive = plan === tierKey && isActive;
              const isPro = tierKey === "pro";
              return (
                <th
                  key={tierKey}
                  className={`px-4 py-4 text-center font-display text-sm font-semibold uppercase tracking-wider ${
                    isPro ? "text-cyan-300" : "text-white"
                  } ${isCurrentActive ? "bg-cyan-300/10" : ""}`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <span>{tier.name}</span>
                    {isCurrentActive ? (
                      <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-medium normal-case text-cyan-50">
                        Current
                      </span>
                    ) : null}
                    {isPro && !isCurrentActive ? (
                      <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-medium normal-case text-cyan-50">
                        Recommended
                      </span>
                    ) : null}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          <tr>
            <td className="px-4 py-4 text-slate-300">Monthly price</td>
            {tierKeys.map((tierKey) => {
              const isPro = tierKey === "pro";
              return (
                <td
                  key={tierKey}
                  className={`px-4 py-4 text-center ${isPro ? "bg-cyan-300/[0.04] font-semibold text-white" : "text-slate-200"}`}
                >
                  ${STRIPE_TIERS[tierKey].price}
                </td>
              );
            })}
          </tr>
          <tr>
            <td className="px-4 py-4 text-slate-300">Credits per month</td>
            {tierKeys.map((tierKey) => {
              const isPro = tierKey === "pro";
              return (
                <td
                  key={tierKey}
                  className={`px-4 py-4 text-center ${isPro ? "bg-cyan-300/[0.04] font-semibold text-white" : "text-slate-200"}`}
                >
                  {STRIPE_TIERS[tierKey].monthlyCredits.toLocaleString()}
                </td>
              );
            })}
          </tr>
          <tr>
            <td className="px-4 py-4 text-slate-300">Top-ups available</td>
            {tierKeys.map((tierKey) => {
              const isPro = tierKey === "pro";
              return (
                <td
                  key={tierKey}
                  className={`px-4 py-4 text-center ${isPro ? "bg-cyan-300/[0.04] text-white" : "text-slate-200"}`}
                >
                  Boost, Growth, Bulk
                </td>
              );
            })}
          </tr>
          <tr>
            <td className="px-4 py-4 text-slate-300">Access to all FUSE tools &amp; templates</td>
            {tierKeys.map((tierKey) => {
              const isPro = tierKey === "pro";
              return (
                <td
                  key={tierKey}
                  className={`px-4 py-4 text-center ${isPro ? "bg-cyan-300/[0.04] text-white" : "text-slate-200"}`}
                >
                  Included
                </td>
              );
            })}
          </tr>
          <tr>
            <td className="px-4 py-4 text-slate-300">Best for</td>
            {tierKeys.map((tierKey) => {
              const isPro = tierKey === "pro";
              const description =
                tierKey === "starter"
                  ? "First drops and small campaigns"
                  : tierKey === "pro"
                    ? "Regular drops and more campaigns per month"
                    : "High-volume teams and multi-brand work";
              return (
                <td
                  key={tierKey}
                  className={`px-4 py-4 text-center ${isPro ? "bg-cyan-300/[0.04] text-white" : "text-slate-200"}`}
                >
                  {description}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
