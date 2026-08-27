import { useRef } from "react";
import { ArrowRight, Film, Image as ImageIcon, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import CreatorVerificationBadge from "@/components/CreatorVerificationBadge";
import { useQuery } from "@tanstack/react-query";
import { useBrand } from "@/contexts/BrandContext";
import { useBrandFitAssets } from "@/hooks/useBrandFitAssets";
import { deriveTemplateFit } from "@/lib/brandTemplateFit";
import TemplateFitBadge from "@/components/brand/TemplateFitBadge";
import TemplateRequirementNudge from "@/components/brand/TemplateRequirementNudge";
import FavoriteTemplateButton from "@/components/templates/FavoriteTemplateButton";
import { useTemplateFavorites } from "@/hooks/useTemplateFavorites";
import { cn } from "@/lib/utils";
import type { ApiTemplate } from "@/services/fuseApi";
import { PerformanceDetailSection } from "@/components/TemplatePerformance";
import {
  loadTemplatePerformanceRows,
  type TemplatePerformanceRow,
} from "@/services/templatePerformance";

export type TemplateQuickFacts = {
  inputCount: number;
  outputCount: number;
  aspectRatio: string | null;
  costLabel: string;
};

function isVideoAsset(template: Pick<ApiTemplate, "preview_url" | "preview_asset_type">) {
  if (template.preview_asset_type === "video") return true;
  return /\.(mp4|mov|webm)(\?|$)/i.test(template.preview_url ?? "");
}

/** Reads an aspect ratio only if the template already declares one — never guessed. */
export function readTemplateAspectRatio(template: ApiTemplate | null | undefined) {
  if (!template) return null;

  const candidates = [...(template.tags ?? []), template.output_type ?? ""];

  for (const candidate of candidates) {
    const match = /(\d{1,2}\s*:\s*\d{1,2})/.exec(String(candidate));
    if (match) return match[1].replace(/\s+/g, "");
  }
  return null;
}

function DetailMedia({ template, className }: { template: ApiTemplate; className: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  if (!template.preview_url) {
    return (
      <div className={cn(className, "flex items-center justify-center bg-white/[0.03]")}>
        <Sparkles className="h-8 w-8 text-cyan-100/60" />
      </div>
    );
  }

  if (isVideoAsset(template)) {
    return (
      <video
        ref={videoRef}
        src={template.preview_url}
        className={className}
        muted
        loop
        playsInline
        preload="metadata"
        onMouseEnter={() => void videoRef.current?.play().catch(() => undefined)}
        onMouseLeave={() => {
          const node = videoRef.current;
          if (!node) return;
          node.pause();
          node.currentTime = 0;
        }}
      />
    );
  }

  return <img src={template.preview_url} alt="" className={className} loading="lazy" />;
}

export default function TemplateDetailDialog({
  template,
  facts,
  open,
  onOpenChange,
  onUseTemplate,
  performance,
}: {
  template: ApiTemplate | null;
  facts: TemplateQuickFacts;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUseTemplate: () => void;
  performance?: TemplatePerformanceRow | null;
}) {
  const templateId = template?.id ? String(template.id) : "";
  const { canFavorite, isFavorite, toggleFavorite } = useTemplateFavorites();
  const { activeBrand } = useBrand();
  const { assets: brandFitAssets } = useBrandFitAssets();
  const { data: performanceRows = [] } = useQuery<TemplatePerformanceRow[]>({
    queryKey: ["template-performance-rows", templateId],
    queryFn: () => loadTemplatePerformanceRows(templateId),
    enabled: open && !!templateId && !!performance,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (!template) return null;

  const brandFit = brandFitAssets ? deriveTemplateFit(template, brandFitAssets) : null;

  const quickFacts = [
    { label: "Inputs", value: `${facts.inputCount}` },
    { label: "Outputs", value: `${facts.outputCount}` },
    ...(facts.aspectRatio ? [{ label: "Aspect ratio", value: facts.aspectRatio }] : []),
    { label: "Estimated cost", value: facts.costLabel },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl border-white/10 bg-slate-950/95 p-0">
        <div className="grid gap-0 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="overflow-hidden bg-black md:rounded-l-lg">
            <DetailMedia template={template} className="aspect-[9/16] h-full w-full object-cover" />
          </div>

          <div className="space-y-5 p-6">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-100">
                {template.category || "Campaign template"}
              </p>
              <DialogTitle className="mt-2 font-display text-2xl font-bold tracking-[-0.02em] text-white">
                {template.name}
              </DialogTitle>
              {template.creator?.handle ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                  <span>by</span>
                  <Link
                    to={`/creator/${template.creator.handle}`}
                    className="text-cyan-100 transition-colors hover:text-white"
                  >
                    @{template.creator.handle}
                  </Link>
                  <CreatorVerificationBadge status={template.creator.verificationStatus} size={11} />
                </p>
              ) : null}
              <DialogDescription className="mt-2 text-sm leading-6 text-slate-300">
                {template.description ||
                  "Campaign drop template for ready-to-use vertical campaign assets."}
              </DialogDescription>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {quickFacts.map((fact) => (
                <div
                  key={fact.label}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3"
                >
                  <p className="text-[9px] uppercase tracking-[0.2em] text-slate-500">{fact.label}</p>
                  <p className="mt-1 text-sm font-semibold text-white">{fact.value}</p>
                </div>
              ))}
            </div>

            {/* Phase 5 — truthful brand compatibility for this template. */}
            {brandFit && activeBrand ? (
              brandFit.status === "ready" ? (
                <TemplateFitBadge fit={brandFit} brandName={activeBrand.name} />
              ) : (
                <TemplateRequirementNudge fit={brandFit} />
              )
            ) : null}

            <PerformanceDetailSection row={performance} rows={performanceRows} />

            {template.preview_url ? (
              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">
                  What you'll get
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-20 w-12 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black">
                    <DetailMedia template={template} className="h-full w-full object-cover" />
                  </div>
                  <p className="flex items-center gap-2 text-xs leading-5 text-slate-300">
                    {isVideoAsset(template) ? (
                      <Film className="h-4 w-4 shrink-0 text-cyan-100" />
                    ) : (
                      <ImageIcon className="h-4 w-4 shrink-0 text-cyan-100" />
                    )}
                    {facts.outputCount > 0
                      ? `${facts.outputCount} campaign asset${facts.outputCount === 1 ? "" : "s"} in this style, built with your uploads.`
                      : "Campaign assets in this style, built with your uploads."}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="flex items-center gap-2">
              <Button
                onClick={() => {
                  onUseTemplate();
                  onOpenChange(false);
                }}
                className="flex-1 rounded-full bg-cyan-300 text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-950 hover:bg-cyan-200"
              >
                Use this template
                <ArrowRight className="h-4 w-4" />
              </Button>
              {canFavorite ? (
                <FavoriteTemplateButton
                  favorite={isFavorite(templateId)}
                  onToggle={() => toggleFavorite(templateId)}
                  label={isFavorite(templateId) ? "Saved" : "Save"}
                  className="px-3 py-2"
                />
              ) : null}
            </div>

          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
