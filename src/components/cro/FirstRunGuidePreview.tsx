import { Button } from "@/components/ui/button";

const STEPS = [
  "Upload your product assets",
  "Generate the campaign",
  "Edit, export, or download everything",
];

/** Post-purchase first-run guide. Flagged off — never shown to real users yet. */
export default function FirstRunGuidePreview() {
  return (
    <div className="space-y-4 rounded-[18px] border border-border/70 bg-card p-5">
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
        <p>You're starting: Changing Room</p>
        <p>Plan: Starter</p>
        <p>Credits: 3,000/month</p>
        <p>Estimated: about 1 campaign</p>
      </div>
      <Button size="lg">Start Upload</Button>
    </div>
  );
}
