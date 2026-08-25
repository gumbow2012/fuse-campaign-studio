/**
 * FT3 — Reusable upload guide dialog. Generic per assetType, driven by
 * src/lib/uploadGuides.ts. Optional example images come from FT2 metadata.
 */

import { useState, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getUploadGuide } from "@/lib/uploadGuides";
import {
  formatAssetTypeLabel,
  type TemplateAssetRequirement,
} from "@/lib/templateAssetRequirements";

interface UploadGuideProps {
  slotLabel: string;
  requirement?: TemplateAssetRequirement;
  trigger?: ReactNode;
}

function ExampleStrip({ urls, tone }: { urls: string[]; tone: "good" | "avoid" }) {
  if (!urls.length) return null;
  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      {urls.slice(0, 3).map((url) => (
        <img
          key={url}
          src={url}
          alt={tone === "good" ? "Good example" : "Example to avoid"}
          loading="lazy"
          className={
            tone === "good"
              ? "aspect-square w-full rounded-xl border border-emerald-300/30 object-cover"
              : "aspect-square w-full rounded-xl border border-rose-300/30 object-cover opacity-80"
          }
        />
      ))}
    </div>
  );
}

export default function UploadGuide({ slotLabel, requirement, trigger }: UploadGuideProps) {
  const [open, setOpen] = useState(false);
  const guide = getUploadGuide(requirement?.assetType);
  const tips = requirement?.detailedInstructions?.length
    ? [...requirement.detailedInstructions, ...guide.good]
    : guide.good;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            className="text-[11px] font-medium uppercase tracking-[0.16em] text-cyan-200 hover:text-cyan-100"
          >
            Upload Guide →
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl border-white/10 bg-slate-950/95 text-white">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-[-0.02em]">
            {guide.title}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {slotLabel}
            {requirement?.assetType ? ` · ${formatAssetTypeLabel(requirement.assetType)}` : ""} — {guide.summary}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.05] p-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-200">Good</p>
            <ul className="mt-3 space-y-2">
              {tips.map((tip) => (
                <li key={tip} className="flex gap-2 text-sm leading-relaxed text-slate-200">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
            <ExampleStrip urls={requirement?.goodExamples ?? []} tone="good" />
          </section>

          <section className="rounded-2xl border border-rose-300/20 bg-rose-300/[0.05] p-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-rose-200">Avoid</p>
            <ul className="mt-3 space-y-2">
              {guide.avoid.map((tip) => (
                <li key={tip} className="flex gap-2 text-sm leading-relaxed text-slate-200">
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
            <ExampleStrip urls={requirement?.badExamples ?? []} tone="avoid" />
          </section>
        </div>

        {requirement?.recommendedAspect || requirement?.recommendedResolution || requirement?.transparencyRecommended ? (
          <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
            {[
              requirement.recommendedAspect,
              requirement.recommendedResolution,
              requirement.transparencyRecommended ? "transparent PNG preferred" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
