import { Button } from "@/components/ui/button";
import { campaignCapacityLine } from "@/lib/croOffer";

const STEPS = [
  "Upload your product assets",
  "Generate the campaign",
  "Edit, export, or download everything",
];

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  studio: "Studio",
};

/**
 * Post-purchase first-run guide. All context is passed in from the surface that
 * already knows it — this component fetches nothing and changes no entitlement.
 */
export default function FirstRunGuidePreview({
  campaignName,
  plan,
  onStart,
  className = "",
}: {
  /** Campaign the member bought into, when the checkout intent carried one. */
  campaignName?: string | null;
  /** Plan key from the existing subscription check. */
  plan?: string | null;
  onStart?: () => void;
  className?: string;
}) {
  const planKey = (plan ?? "").trim().toLowerCase();
  const planLabel = PLAN_LABELS[planKey] ?? (planKey ? planKey : null);
  const capacity = campaignCapacityLine(planKey);

  return (
    <div className={`space-y-4 rounded-[18px] border border-border/70 bg-card p-5 text-left ${className}`}>
      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Your first campaign
      </h3>
      <ol className="space-y-2 text-base text-foreground">
        {STEPS.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span className="text-muted-foreground">{index + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div className="rounded-[14px] border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
        <p>{campaignName ? `You're starting: ${campaignName}` : "Pick your first campaign"}</p>
        {planLabel ? <p>Plan: {planLabel}</p> : null}
        {capacity ? <p>{capacity}</p> : null}
      </div>
      <Button size="lg" className="w-full" onClick={onStart}>
        Start Upload
      </Button>
    </div>
  );
}
