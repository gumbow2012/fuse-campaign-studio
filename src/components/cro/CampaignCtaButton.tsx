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
 * One CTA with explicit states. It never contains its own commerce logic: the
 * caller passes the handler the surface already used, so checkout, generation
 * and upgrade behaviour are unchanged.
 */
export default function CampaignCtaButton({
  state,
  surface,
  templateSlug,
  logOnly = true,
  compact = false,
  onActivate,
}: {
  state: CroCtaState;
  surface: CroCtaSurface;
  templateSlug: string;
  logOnly?: boolean;
  /** Tighter type scale for dense card grids. */
  compact?: boolean;
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
    <div className={compact ? "space-y-1" : "space-y-2"}>
      <Button
        size={compact ? "sm" : "lg"}
        className={compact ? "h-8 w-full whitespace-normal px-2 text-[10.5px] leading-tight" : "w-full"}
        onClick={handleClick}
      >
        {ctaText}
      </Button>
      {state === "signed_out" ? (
        <p className={compact ? "text-[10px] leading-4 text-muted-foreground" : "text-sm text-muted-foreground"}>
          Included in Starter. Create up to 3 campaigns/month.
        </p>
      ) : null}
    </div>
  );
}
