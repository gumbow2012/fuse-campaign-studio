import CampaignCtaButton, { type CroCtaState } from "@/components/cro/CampaignCtaButton";

/**
 * Outcome-first footer for a marketplace campaign card: what you get, what plan
 * it's included in, and one CTA. Counts come from the live catalog record.
 *
 * Presentation only — the CTA calls the same navigation the card already used.
 */
export default function CampaignTileFooter({
  imageOutputs,
  videoOutputs,
  state,
  templateSlug,
  onActivate,
}: {
  imageOutputs: number;
  videoOutputs: number;
  state: CroCtaState;
  templateSlug: string;
  onActivate: () => void;
}) {
  const parts: string[] = [];
  if (imageOutputs > 0) parts.push(`${imageOutputs} image${imageOutputs === 1 ? "" : "s"}`);
  if (videoOutputs > 0) parts.push(`${videoOutputs} clip${videoOutputs === 1 ? "" : "s"}`);

  return (
    <div className="mt-2 space-y-1.5">
      {parts.length ? (
        <p className="truncate text-[11px] text-slate-300">{parts.join(" + ")}</p>
      ) : null}
      <p className="text-[11px] text-slate-400">Included in Starter</p>
      <CampaignCtaButton
        state={state}
        surface="template_card"
        templateSlug={templateSlug}
        logOnly={false}
        onActivate={onActivate}
        compact
      />
    </div>
  );
}
