import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, Expand, Film, Heart, Image as ImageIcon, RefreshCw, X } from "lucide-react";
import OutputRevisionNav from "@/components/templates/OutputRevisionNav";
import type { OutputRevisionRow } from "@/services/regenerateOutput";

/**
 * TR5 — organized campaign results (COMPLETED state).
 * TR7 — per-output Regenerate action + revision navigation.
 *
 * Presentation only. Reads nothing but the customer outputs array (plus any
 * category/group metadata the payload already carries) — no template internals.
 */

export interface CampaignResultOutput {
  type: string;
  url: string;
  label?: string;
  outputNumber?: number;
  /** Only present if the payload already carries grouping metadata. */
  category?: string;
  group?: string;
}

export interface CampaignResultsProps {
  outputs: CampaignResultOutput[];
  /** Existing page handlers — actions render only when provided. */
  onDownload?: (output: CampaignResultOutput, index: number) => void;
  onFavorite?: (output: CampaignResultOutput, index: number) => void;
  isFavorite?: (output: CampaignResultOutput, index: number) => boolean;
  /** TR7: receives the output NUMBER; server prices and charges the regen. */
  onRegenerate?: (outputNumber: number) => void;
  /** TR7: prior versions per output number (oldest first). */
  revisionsByOutput?: Map<number, OutputRevisionRow[]>;
}


function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function outputNumberOf(output: CampaignResultOutput, index: number) {
  return typeof output.outputNumber === "number" && Number.isFinite(output.outputNumber)
    ? output.outputNumber
    : index + 1;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** Groups only when real metadata exists; otherwise a single unnamed group. */
export function groupCampaignOutputs(outputs: CampaignResultOutput[]) {
  const hasGroups = outputs.some((output) => Boolean(output.category || output.group));
  if (!hasGroups) {
    return [{ name: null as string | null, items: outputs.map((output, index) => ({ output, index })) }];
  }

  const groups = new Map<string, Array<{ output: CampaignResultOutput; index: number }>>();
  outputs.forEach((output, index) => {
    const name = output.category || output.group || "Other";
    const bucket = groups.get(name);
    if (bucket) bucket.push({ output, index });
    else groups.set(name, [{ output, index }]);
  });

  return [...groups.entries()].map(([name, items]) => ({ name, items }));
}

/** Videos preview their first frame instead of a black rectangle (GS-PERF7). */
function videoPosterSrc(url: string) {
  return url.includes("#") ? url : `${url}#t=0.1`;
}

export default function CampaignResults({
  outputs,
  onDownload,
  onFavorite,
  isFavorite,
  onRegenerate,
  revisionsByOutput,
}: CampaignResultsProps) {
  const reducedMotion = useReducedMotion();
  const [lightbox, setLightbox] = useState<{ output: CampaignResultOutput; index: number } | null>(null);
  const groups = useMemo(() => groupCampaignOutputs(outputs), [outputs]);
  /** Selected version index per output number; defaults to the latest. */
  const [versionIndex, setVersionIndex] = useState<Record<number, number>>({});


  if (!outputs.length) return null;

  const total = outputs.length;

  return (
    <section className="rounded-[1.5rem] border border-white/8 bg-black/25 p-5" aria-label="Your campaign results">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-[15px] font-semibold uppercase tracking-[0.16em] text-foreground">
          Your Campaign
        </h3>
        <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] text-emerald-200">
          <CheckCircle2 className="h-3.5 w-3.5" />
          All ready · {total} / {total} ready
        </p>
      </div>

      <div className="mt-4 space-y-6">
        {groups.map((group) => (
          <div key={group.name ?? "all"}>
            {group.name ? (
              <p className="mb-3 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">{group.name}</p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {group.items.map(({ output, index }) => {
                const number = outputNumberOf(output, index);
                const label = output.label || `Output ${number}`;
                const favorite = isFavorite?.(output, index) ?? false;

                // TR7: revisions (oldest first) + the current output as the latest version.
                const revisions = revisionsByOutput?.get(number) ?? [];
                const versionCount = revisions.length + 1;
                const selected = Math.min(versionIndex[number] ?? versionCount - 1, versionCount - 1);
                const isLatest = selected === versionCount - 1;
                const revision = isLatest ? null : revisions[selected] ?? null;
                const shown: CampaignResultOutput = revision?.output_url
                  ? { ...output, url: revision.output_url, type: revision.output_type || output.type }
                  : output;

                return (
                  <article
                    key={`${output.url}-${index}`}
                    className="overflow-hidden rounded-[1.25rem] border border-white/10 bg-black/30"
                  >
                    <button
                      type="button"
                      onClick={() => setLightbox({ output: shown, index })}
                      aria-label={`Expand ${label}`}
                      className="relative block aspect-[9/16] w-full overflow-hidden bg-black"
                    >
                      {shown.type === "video" ? (
                        <video
                          src={videoPosterSrc(shown.url)}
                          muted
                          playsInline
                          preload="metadata"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <img
                          src={shown.url}
                          alt={label}
                          loading="lazy"
                          decoding="async"
                          className={`h-full w-full object-cover ${
                            reducedMotion ? "" : "transition-transform duration-500 hover:scale-[1.03]"
                          }`}
                        />
                      )}
                      <span className="absolute left-2 top-2 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-emerald-100">
                        {isLatest ? "✓ Ready" : `Version ${selected + 1}`}
                      </span>
                    </button>

                    <div className="flex items-center justify-between gap-2 px-3 py-3">
                      <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-slate-300">
                        {output.type === "video" ? <Film className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
                        {pad(number)} · {label}
                      </span>
                      <div className="flex items-center gap-1">
                        <OutputRevisionNav
                          index={selected}
                          total={versionCount}
                          label={label}
                          onChange={(next) => setVersionIndex((prev) => ({ ...prev, [number]: next }))}
                        />
                        <button
                          type="button"
                          onClick={() => setLightbox({ output: shown, index })}
                          aria-label={`Expand ${label}`}
                          className="rounded-full p-1.5 text-slate-300 hover:bg-white/[0.08]"
                        >

                          <Expand className="h-3.5 w-3.5" />
                        </button>
                        {onDownload ? (
                          <button
                            type="button"
                            onClick={() => onDownload(output, index)}
                            aria-label={`Download ${label}`}
                            className="rounded-full p-1.5 text-slate-300 hover:bg-white/[0.08]"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <a
                            href={output.url}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Open ${label}`}
                            className="rounded-full p-1.5 text-slate-300 hover:bg-white/[0.08]"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {onFavorite ? (
                          <button
                            type="button"
                            onClick={() => onFavorite(output, index)}
                            aria-label={`Favorite ${label}`}
                            aria-pressed={favorite}
                            className="rounded-full p-1.5 text-slate-300 hover:bg-white/[0.08]"
                          >
                            <Heart className={`h-3.5 w-3.5 ${favorite ? "fill-rose-300 text-rose-300" : ""}`} />
                          </button>
                        ) : null}
                        {onRegenerate ? (
                          <button
                            type="button"
                            onClick={() => onRegenerate(number)}
                            aria-label={`Regenerate ${label}`}
                            title="Regenerate this output"
                            className="rounded-full p-1.5 text-slate-300 hover:bg-white/[0.08]"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                        ) : null}

                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {lightbox ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Output preview"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            aria-label="Close preview"
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 rounded-full border border-white/15 p-2 text-slate-200 hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="max-h-full max-w-3xl" onClick={(event) => event.stopPropagation()}>
            {lightbox.output.type === "video" ? (
              <video
                src={lightbox.output.url}
                controls
                autoPlay={!reducedMotion}
                playsInline
                className="max-h-[85vh] w-full rounded-xl bg-black"
              />
            ) : (
              <img
                src={lightbox.output.url}
                alt={lightbox.output.label || `Output ${outputNumberOf(lightbox.output, lightbox.index)}`}
                className="max-h-[85vh] w-full rounded-xl object-contain"
              />
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
