import BeforeAfterProofPreview from "@/components/cro/BeforeAfterProofPreview";
import RiskReversalCopy from "@/components/cro/RiskReversalCopy";
import { findPlanEntry } from "@/lib/planLadder";

/** Reference campaign cost used only to express plan capacity in campaigns. */
const REFERENCE_CAMPAIGN_CREDITS = 945;

const INCLUDES = [
  "Campaign images",
  "Short video clips",
  "Product-based outputs",
  "Editable, downloadable assets",
];

const FAQ = [
  {
    q: "Will it keep my logo/graphic exact?",
    a: "FUSE builds the campaign around the product photo you upload, so your graphic stays readable. Check the first campaign and regenerate any frame that drifts.",
  },
  {
    q: "What if I don't like it?",
    a: "Not happy with your first campaign? Email us and we'll make it right.",
  },
  {
    q: "Can I cancel?",
    a: "Yes. Cancel any time from your account and your plan stops at the end of the current month.",
  },
];

function planCard(key: string, offerLine?: string) {
  const plan = findPlanEntry(key);
  if (!plan) return null;
  const campaigns = plan.monthlyCredits
    ? Math.round(plan.monthlyCredits / REFERENCE_CAMPAIGN_CREDITS)
    : null;
  return (
    <div key={key} className="space-y-3 rounded-[18px] border border-border/70 bg-card p-5">
      <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
      <p className="text-base text-foreground">
        ${plan.price}/mo
        {offerLine ? ` · ${offerLine}` : ""}
      </p>
      {campaigns ? (
        <p className="text-base text-muted-foreground">About {campaigns} campaigns/month</p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Each campaign uses credits behind the scenes. Regenerations also use credits, so you stay
        in control.
      </p>
      <details className="text-sm text-muted-foreground">
        <summary className="cursor-pointer">Advanced</summary>
        <p className="mt-2">
          {plan.monthlyCredits
            ? `${plan.monthlyCredits.toLocaleString()} credits per month`
            : "Shared team pool"}
        </p>
      </details>
    </div>
  );
}

export default function PricingPreview({
  internalLabels = false,
}: {
  internalLabels?: boolean;
}) {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-foreground">
          Campaign content without the photoshoot.
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Upload your product, choose a campaign, and generate images and clips from proven
          templates.
        </p>
      </header>

      <BeforeAfterProofPreview internalLabels={internalLabels} />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          What one campaign includes
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {INCLUDES.map((item) => (
            <li key={item} className="rounded-[14px] border border-border/70 bg-card p-3 text-base text-foreground">
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-[18px] border border-border/70 bg-card p-5">
        <h2 className="text-lg font-semibold text-foreground">Compared to a traditional shoot</h2>
        <p className="mt-2 text-base text-muted-foreground">
          One professional shoot with a photographer, studio rental, and model costs $2,000–$5,000
          and takes 2–4 weeks to schedule. One FUSE campaign takes about five minutes and is
          included in your plan.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {planCard("starter", "20% off first month")}
        {planCard("pro")}
        {planCard("studio")}
      </section>

      <RiskReversalCopy variant="soft" />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Questions</h2>
        {FAQ.map((entry) => (
          <div key={entry.q} className="rounded-[18px] border border-border/70 bg-card p-4">
            <p className="text-base font-semibold text-foreground">{entry.q}</p>
            <p className="mt-1 text-base text-muted-foreground">{entry.a}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
