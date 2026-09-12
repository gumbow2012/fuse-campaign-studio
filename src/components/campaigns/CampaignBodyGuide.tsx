/**
 * OPTIONAL reference guide — a body diagram whose hotspots map only to the
 * template's CONFIGURED body references. It is never a generated result and
 * never a substitute for a campaign's real preview media.
 */

import { useState } from "react";

import { BODY_GUIDE_ART, type CampaignField } from "@/lib/campaignFields";

import { cn } from "@/lib/utils";

/** Only these categories have a meaningful place on the body. */
const HOTSPOTS: Partial<Record<CampaignField["category"], { top: string; left: string }>> = {
  face: { top: "9%", left: "50%" },
  chain: { top: "22%", left: "50%" },
  grill: { top: "13%", left: "50%" },
  top: { top: "33%", left: "50%" },
  bottom: { top: "58%", left: "50%" },
  accessory: { top: "45%", left: "76%" },
};

interface Props {
  fields: CampaignField[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function bodyGuideFields(fields: CampaignField[]) {
  return fields.filter((field) => field.kind !== "text" && HOTSPOTS[field.category]);
}

export default function CampaignBodyGuide({ fields, selectedId, onSelect }: Props) {
  const usable = bodyGuideFields(fields);
  const selected = usable.find((field) => field.id === selectedId) ?? usable[0] ?? null;
  const [artOk, setArtOk] = useState(true);

  if (!artOk) {
    return (
      <div className="overflow-hidden rounded-[20px] border border-border/70 bg-muted/25">
        <div className="flex flex-wrap gap-2 p-5">
          {usable.map((field) => (
            <button
              key={field.id}
              type="button"
              onClick={() => onSelect(field.id)}
              aria-pressed={selected?.id === field.id}
              className={cn(
                "rounded-full border px-3 py-2 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected?.id === field.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background/85 text-foreground hover:border-primary/60",
              )}
            >
              {field.label}
            </button>
          ))}
        </div>
        {selected ? (
          <p className="border-t border-border/60 px-5 py-4 text-[14px] leading-6 text-muted-foreground">
            <span className="font-medium text-foreground">{selected.label}:</span> {selected.helper}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[20px] border border-border/70 bg-muted/25">
      <div className="relative mx-auto aspect-[3/4] w-full max-w-[420px]">
        <img
          src={BODY_GUIDE_ART}
          alt="Body reference guide showing where each reference is used"
          className="h-full w-full object-contain"
          onError={() => setArtOk(false)}
        />
        {usable.map((field) => {
          const spot = HOTSPOTS[field.category]!;
          const active = selected?.id === field.id;
          return (
            <button
              key={field.id}
              type="button"
              onClick={() => onSelect(field.id)}
              aria-pressed={active}
              style={{ top: spot.top, left: spot.left }}
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-3 py-2 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background/85 text-foreground hover:border-primary/60",
              )}
            >
              {field.label}
            </button>
          );
        })}
      </div>
      {selected ? (
        <p className="border-t border-border/60 px-5 py-4 text-[14px] leading-6 text-muted-foreground">
          <span className="font-medium text-foreground">{selected.label}:</span> {selected.helper}
        </p>
      ) : null}
    </div>
  );
}
