/**
 * PRESENTATION-ONLY product-level asset group UI.
 *
 * One card per real-world thing ("TOP GARMENT"), opening a focused modal that
 * lists that group's sub-slots. Every sub-slot row is rendered by the parent
 * with the existing role-aware picker, so each upload still writes to its
 * ORIGINAL backend input key. No execution, ordering or payload change.
 */

import { useEffect, useState, type ReactNode } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { groupActionLabel, type CampaignInputGroup } from "@/lib/campaignInputGroups";

function usePreviewUrl(source: File | string | null) {
  const [url, setUrl] = useState<string | null>(typeof source === "string" ? source : null);

  useEffect(() => {
    if (!source) {
      setUrl(null);
      return;
    }
    if (typeof source === "string") {
      setUrl(source);
      return;
    }
    const objectUrl = URL.createObjectURL(source);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [source]);

  return url;
}

interface GroupCardProps {
  group: CampaignInputGroup;
  /** Filled sub-slots / total sub-slots (real backend inputs). */
  filledCount: number;
  totalCount: number;
  /** True only when EVERY required backend input in the group is satisfied. */
  ready: boolean;
  preview: File | string | null;
  compact?: boolean;
  onOpen: () => void;
}

export function CampaignAssetGroupCard({
  group,
  filledCount,
  totalCount,
  ready,
  preview,
  compact = false,
  onOpen,
}: GroupCardProps) {
  const previewUrl = usePreviewUrl(preview);
  const started = filledCount > 0;
  const requiredGroup = group.requiredKeys.length > 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group flex w-full items-center gap-3 rounded-[1.25rem] border bg-black/25 text-left transition",
        compact ? "p-2.5" : "p-3.5",
        ready ? "border-emerald-300/30 hover:border-emerald-300/50" : "border-white/10 hover:border-cyan-300/45",
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border",
          compact ? "h-14 w-14" : "h-16 w-16",
          ready ? "border-emerald-300/30 bg-emerald-300/5" : "border-white/10 bg-white/[0.03]",
        )}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden className="font-display text-lg text-slate-500">+</span>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate font-display text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
            {group.label}
          </span>
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 font-display text-[9px] uppercase tracking-[0.16em]",
              requiredGroup
                ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
                : "border-white/10 bg-white/[0.04] text-slate-400",
            )}
          >
            {requiredGroup ? "Required" : "Optional"}
          </span>
          {ready ? (
            <span className="font-display text-[10px] uppercase tracking-[0.16em] text-emerald-200">Ready ✓</span>
          ) : null}
        </span>
        <span className="mt-1 block text-[11px] leading-4 text-slate-400">
          {ready
            ? `${filledCount} photo${filledCount === 1 ? "" : "s"} added`
            : started
              ? `${filledCount} / ${totalCount} photos`
              : group.multi
                ? `${totalCount} photos needed`
                : "Not added yet"}
        </span>
      </span>

      <span
        className={cn(
          "shrink-0 rounded-full border px-3 py-1.5 font-display text-[10px] uppercase tracking-[0.14em] transition",
          ready
            ? "border-white/12 bg-white/[0.04] text-slate-200"
            : "border-cyan-300/40 bg-cyan-300/10 text-cyan-100",
        )}
      >
        {ready ? "Edit" : started ? "Continue" : `+ ${groupActionLabel(group)}`}
      </span>
    </button>
  );
}

interface GroupModalProps {
  group: CampaignInputGroup | null;
  open: boolean;
  onClose: () => void;
  filledCount: number;
  totalCount: number;
  /** Renders the sub-slot's existing picker for a backend input key. */
  renderMember: (key: string) => ReactNode;
}

export function CampaignAssetGroupModal({
  group,
  open,
  onClose,
  filledCount,
  totalCount,
  renderMember,
}: GroupModalProps) {
  if (!group) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent
        className={cn(
          "max-h-[88vh] gap-0 overflow-y-auto border-white/12 bg-slate-950/97 p-0 text-white backdrop-blur-xl",
          // Mobile: bottom sheet. Desktop: centered modal.
          "bottom-0 top-auto max-w-[560px] translate-y-0 rounded-t-[1.75rem] rounded-b-none data-[state=open]:slide-in-from-bottom-4",
          "sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-[1.75rem]",
        )}
      >
        <div className="border-b border-white/8 px-5 py-4">
          <p className="font-display text-[13px] font-semibold uppercase tracking-[0.18em] text-white">
            {groupActionLabel(group).replace(/^Add/, "Add your")}
          </p>
          <p className="mt-1 text-[12px] leading-5 text-slate-400">
            {group.multi
              ? "A few angles of the same item give the campaign more to work with."
              : "Add a clean photo of this item."}
          </p>
        </div>

        <div className="space-y-2.5 px-5 py-4">
          {group.members.map((member) => (
            <div
              key={member.input.key}
              className="rounded-[1.1rem] border border-white/10 bg-black/25 p-3"
            >
              {renderMember(member.input.key)}
              <p className="mt-2 flex flex-wrap items-center gap-2 text-[11px] leading-4 text-slate-400">
                {member.helperText ? <span>{member.helperText}</span> : null}
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 font-display text-[9px] uppercase tracking-[0.16em]",
                    member.required
                      ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-100"
                      : "border-white/10 bg-white/[0.04] text-slate-400",
                  )}
                >
                  {member.required ? "Required" : "Optional"}
                </span>
              </p>
            </div>
          ))}
        </div>

        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-white/10 bg-slate-950/97 px-5 py-3.5 backdrop-blur-xl">
          <p className="font-display text-[10px] uppercase tracking-[0.16em] text-slate-400">
            {filledCount} / {totalCount} added
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-cyan-300 px-5 py-2 font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-950 transition hover:bg-cyan-200"
          >
            Done
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
