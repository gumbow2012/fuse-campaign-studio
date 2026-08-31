/**
 * "Preview as customer" — presentation only.
 *
 * Shows the creator exactly what a customer sees before running their template:
 * name, cover, the GROUPED upload cards, how many images/clips are produced and
 * the run cost. Reads existing template data; runs nothing and spends nothing.
 */
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { campaignInputGroups, groupActionLabel } from "@/lib/campaignInputGroups";

export default function CreatorCustomerPreviewModal({
  open,
  onClose,
  templateName,
  coverUrl,
  inputs,
  imageCount,
  videoCount,
  runCredits,
}: {
  open: boolean;
  onClose: () => void;
  templateName: string;
  coverUrl?: string | null;
  inputs: Array<{ key: string; label: string; type: string }>;
  imageCount: number;
  videoCount: number;
  runCredits: number;
}) {
  if (!open) return null;
  const groups = campaignInputGroups(inputs);

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
      <div className="mt-6 w-full max-w-lg rounded-3xl border border-border/60 bg-card p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
              Customer preview
            </p>
            <h2 className="mt-1 font-display text-xl font-black uppercase tracking-tight">
              {templateName}
            </h2>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Close preview" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {coverUrl ? (
          <img
            src={coverUrl}
            alt={`${templateName} preview`}
            loading="lazy"
            className="mt-4 aspect-[9/16] w-32 rounded-2xl border border-border/60 object-cover"
          />
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full border border-border/60 px-2.5 py-1 text-muted-foreground">
            <span className="font-semibold text-foreground">{imageCount}</span> images
          </span>
          <span className="rounded-full border border-border/60 px-2.5 py-1 text-muted-foreground">
            <span className="font-semibold text-foreground">{videoCount}</span> clips
          </span>
          <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-primary">
            ≈ {runCredits} credits per run
          </span>
        </div>

        <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          What the customer uploads
        </p>
        <div className="mt-2 space-y-2">
          {groups.length ? (
            groups.map((group) => (
              <div key={group.id} className="rounded-2xl border border-border/60 bg-background/60 px-3 py-2.5">
                <p className="text-xs font-semibold text-foreground">{group.label}</p>
                <p className="text-[11px] text-muted-foreground">{groupActionLabel(group)}</p>
                {group.multi ? (
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {group.members.map((member) => (
                      <li
                        key={member.input.key}
                        className="rounded-full border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {member.label}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))
          ) : (
            <p className="rounded-2xl border border-amber-300/25 bg-amber-300/[0.08] px-3 py-2 text-xs text-amber-100">
              No customer inputs yet — add a Customer Input step so customers have something to upload.
            </p>
          )}
        </div>

        <Button type="button" className="mt-5 w-full rounded-full" onClick={onClose}>
          Back to builder
        </Button>
      </div>
    </div>
  );
}
