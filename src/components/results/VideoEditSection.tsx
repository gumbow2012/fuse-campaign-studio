/**
 * R4 — VIDEO EDIT. Appears as soon as the FIRST customer video output is ready.
 *
 * Clips sit in their intended output-number position (never provider completion
 * order), so a clip that lands late doesn't reshuffle the timeline. A slot with
 * no media yet is a calm outlined placeholder — never red, never "failed". The
 * outlined slot is the seam a real Regenerate action drops into later.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Film, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import TrueRatioMedia from "@/components/results/TrueRatioMedia";
import type { CampaignResultSlot } from "@/components/results/resultSlots";
import { cn } from "@/lib/utils";

export interface VideoEditSectionProps {
  slots: CampaignResultSlot[];
  jobId: string | null;
  /** A real campaign_edit_project for this run, when one exists. */
  editProject: { id: string; segmentCount: number; customized: boolean } | null;
  downloading: boolean;
  executionComplete: boolean;
  onDownloadItem: (slot: CampaignResultSlot) => void;
  onDownloadAll: () => void;
  className?: string;
}

const slotLabel = (slot: CampaignResultSlot) => `Clip ${String(slot.number).padStart(2, "0")}`;

export function VideoEditSection({
  slots,
  jobId,
  editProject,
  downloading,
  executionComplete,
  onDownloadItem,
  onDownloadAll,
  className,
}: VideoEditSectionProps) {
  const readySlots = useMemo(() => slots.filter((slot) => slot.item), [slots]);
  const [activeNumber, setActiveNumber] = useState<number | null>(null);

  /* Stay on the user's chosen clip; only auto-select when nothing is selected. */
  useEffect(() => {
    if (activeNumber != null && readySlots.some((slot) => slot.number === activeNumber)) return;
    setActiveNumber(readySlots[0]?.number ?? null);
  }, [activeNumber, readySlots]);

  if (!readySlots.length) return null;

  const active = readySlots.find((slot) => slot.number === activeNumber) ?? readySlots[0];
  /* New media that the user's saved edit hasn't consumed yet (R4 tray rule). */
  const newClipCount = editProject
    ? Math.max(0, readySlots.length - editProject.segmentCount)
    : 0;

  return (
    <section className={cn("space-y-4", className)} aria-label="Video edit">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-300">
            Video edit
            <span className="text-slate-500">
              {" "}
              — {readySlots.length} / {slots.length} clips ready
            </span>
          </p>
          {editProject && editProject.customized && newClipCount > 0 ? (
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-200/80">
              {newClipCount} new clip{newClipCount === 1 ? "" : "s"} ready · waiting in your unused clips
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {jobId ? (
            <Button
              asChild
              className="rounded-full bg-[hsl(var(--electric-cyan))] text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-[hsl(var(--electric-blue))]"
            >
              <Link to={`/app/campaigns/${encodeURIComponent(jobId)}/edit`}>
                {editProject ? "Continue editing →" : "Open full editor →"}
              </Link>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            disabled={downloading}
            onClick={onDownloadAll}
            className="rounded-full border-white/20 text-[11px] uppercase tracking-[0.16em]"
          >
            {downloading ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            )}
            {executionComplete && readySlots.length === slots.length
              ? "Download all videos"
              : `Download ${readySlots.length} ready video${readySlots.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      </div>

      {active?.item ? (
        <div className="space-y-2">
          <TrueRatioMedia
            url={active.item.url}
            type="video"
            poster={active.item.poster_url}
            fallbackRatio="9 / 16"
            maxHeight="min(62vh, 680px)"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">
              {slotLabel(active)}
            </p>
            <button
              type="button"
              onClick={() => onDownloadItem(active)}
              className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-300 transition-colors hover:text-white"
            >
              <Download className="h-3.5 w-3.5" aria-hidden /> Download clip
            </button>
          </div>
        </div>
      ) : null}

      {/* Thumbnail timeline — intended sequence, ready and pending alike. */}
      <ul className="flex snap-x gap-2 overflow-x-auto pb-1">
        {slots.map((slot) => {
          const isActive = slot.number === active?.number;
          if (!slot.item) {
            return (
              <li key={`pending-${slot.number}`} className="shrink-0 snap-start">
                <div className="flex h-[74px] w-[52px] flex-col items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-1 text-center">
                  <span className="font-mono text-[8px] uppercase leading-tight tracking-[0.14em] text-slate-500">
                    {slotLabel(slot)}
                  </span>
                  <span className="mt-1 font-mono text-[7px] uppercase leading-tight tracking-[0.12em] text-slate-600">
                    Needs another pass
                  </span>
                </div>
              </li>
            );
          }
          return (
            <li key={slot.item.id} className="shrink-0 snap-start">
              <button
                type="button"
                onClick={() => setActiveNumber(slot.number)}
                aria-current={isActive}
                aria-label={`${slotLabel(slot)} — ready`}
                className={cn(
                  "block h-[74px] w-[52px] overflow-hidden rounded-lg border bg-black transition-colors",
                  isActive
                    ? "border-[hsl(186_100%_62%)] shadow-[0_0_0_1px_hsl(186_100%_62%/0.5)]"
                    : "border-white/12 hover:border-white/30",
                )}
              >
                {slot.item.poster_url ? (
                  <img src={slot.item.poster_url} alt="" className="h-full w-full object-contain" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-slate-400">
                    <Film className="h-4 w-4" aria-hidden />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default VideoEditSection;
