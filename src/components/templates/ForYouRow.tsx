/**
 * RETENTION P3 — "For you" / "Popular on FUSE" horizontal row.
 * Presentation only: ordering comes from `rankForYou` (deterministic, real signals).
 */
import { useEffect, useRef, type ReactNode } from "react";
import type { ApiTemplate } from "@/services/fuseApi";
import type { ForYouEntry, ForYouMode } from "@/lib/forYouRanking";
import FavoriteTemplateButton from "@/components/templates/FavoriteTemplateButton";
import TemplateFitBadge from "@/components/brand/TemplateFitBadge";
import type { TemplateFit } from "@/lib/brandTemplateFit";
import { cn } from "@/lib/utils";

interface ForYouRowProps {
  mode: ForYouMode;
  entries: ForYouEntry[];
  brandName?: string | null;
  className?: string;
  renderMedia: (template: ApiTemplate) => ReactNode;
  fitFor?: (template: ApiTemplate) => TemplateFit | null;
  canFavorite?: boolean;
  isFavorite?: (templateId: string) => boolean;
  onToggleFavorite?: (templateId: string) => void;
  onSelect: (template: ApiTemplate) => void;
  onShown?: (mode: ForYouMode, count: number) => void;
}

export default function ForYouRow({
  mode,
  entries,
  brandName,
  className,
  renderMedia,
  fitFor,
  canFavorite,
  isFavorite,
  onToggleFavorite,
  onSelect,
  onShown,
}: ForYouRowProps) {
  const announced = useRef<string | null>(null);
  const signature = `${mode}:${entries.length}`;

  useEffect(() => {
    if (!entries.length || announced.current === signature) return;
    announced.current = signature;
    onShown?.(mode, entries.length);
  }, [entries.length, mode, onShown, signature]);

  if (!entries.length) return null;

  const heading =
    mode === "personalized" ? (brandName ? `For ${brandName}` : "For you") : "Popular on FUSE";
  const subheading =
    mode === "personalized"
      ? "Ranked from your saved brand assets and favorites."
      : "Ordered by real recent runs across FUSE.";

  return (
    <section className={cn("", className)} aria-label={heading}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-sm font-bold uppercase tracking-[0.2em] text-white">{heading}</h2>
        <p className="text-[11px] text-slate-400">{subheading}</p>
      </div>

      <div className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
        {entries.map(({ template }) => {
          const id = String(template.id);
          const fit = fitFor?.(template) ?? null;
          return (
            <div
              key={id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(template)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(template);
                }
              }}
              className="group w-[168px] shrink-0 snap-start cursor-pointer overflow-hidden rounded-[1.25rem] border border-white/8 bg-black/20 text-left transition-colors hover:border-white/20 hover:bg-white/[0.05]"
            >
              <div className="relative overflow-hidden bg-black/30">
                {renderMedia(template)}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                {canFavorite && isFavorite && onToggleFavorite ? (
                  <FavoriteTemplateButton
                    favorite={isFavorite(id)}
                    onToggle={() => onToggleFavorite(id)}
                    className="absolute bottom-2 right-2"
                  />
                ) : null}
              </div>
              <div className="space-y-2 p-3">
                <p className="truncate text-sm font-semibold text-white">{template.name}</p>
                <p className="truncate text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {template.category || "Campaign template"}
                </p>
                {fit && brandName ? <TemplateFitBadge fit={fit} brandName={brandName} /> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
