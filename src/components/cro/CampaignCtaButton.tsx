import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics/track";

export type CroCtaState = "signed_out" | "active" | "no_credits";
export type CroCtaSurface = "home" | "pricing" | "campaign_page" | "template_card" | "mobile_bar";

const LABELS: Record<CroCtaState, string> = {
  signed_out: "Get This Campaign — $20 First Month",
  active: "Generate Campaign",
  no_credits: "Upgrade To Generate",
};

/**
 * One CTA with explicit states. On the preview route it logs only and never
 * navigates to checkout.
 */
export default function CampaignCtaButton({
  state,
  surface,
  templateSlug,
  logOnly = true,
  onActivate,
}: {
  state: CroCtaState;
  surface: CroCtaSurface;
  templateSlug: string;
  logOnly?: boolean;
  onActivate?: () => void;
}) {
  const ctaText = LABELS[state];

  const handleClick = () => {
    track("campaign_cta_click", {
      surface,
      signed_in: state !== "signed_out",
      template_slug: templateSlug,
      cta_text: ctaText,
    });
    if (!logOnly) onActivate?.();
  };

  return (
    <div className="space-y-2">
      <Button size="lg" className="w-full" onClick={handleClick}>
        {ctaText}
      </Button>
      {state === "signed_out" ? (
        <p className="text-sm text-muted-foreground">
          Included in Starter. Create up to 3 campaigns/month.
        </p>
      ) : null}
    </div>
  );
}
