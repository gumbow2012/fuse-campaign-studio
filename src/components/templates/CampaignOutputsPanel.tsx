import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, Film, Image as ImageIcon } from "lucide-react";
import type { PublicGraph } from "@/components/templates/CampaignBuildGraph";

/**
 * TR4 — progressive output reveal.
 *
 * Shows every EXPECTED deliverable during an active run: the slots come from
 * `publicGraph` nodes with type === "OUTPUT" (ordered by outputNumber), and each
 * slot fills in the moment a matching entry appears in the live `outputs` array.
 * No template internals are read — only OUTPUT nodes and returned outputs.
 */

export interface CampaignOutput {
  type: string;
  url: string;
  label?: string;
  outputNumber?: number;
}

export interface CampaignOutputsPanelProps {
  graph?: PublicGraph;
  outputs: CampaignOutput[];
  /** Optional click handler; when omitted the output opens in a new tab. */
  onOpenOutput?: (output: CampaignOutput) => void;
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

/**
 * Slots are keyed by output number: an OUTPUT node's `outputNumber` is matched
 * against `output.outputNumber` when the backend supplies it, otherwise against
 * the output's 1-based position in the numbered array (the backend emits the
 * array in the same numbering order).
 */
export function matchOutputSlots(
  graph: CampaignOutputsPanelProps["graph"],
  outputs: CampaignOutput[],
): Array<{ number: number; output: CampaignOutput | null }> {
  const byNumber = new Map<number, CampaignOutput>();
  outputs.forEach((output, index) => {
    const number =
      typeof output.outputNumber === "number" && Number.isFinite(output.outputNumber)
        ? output.outputNumber
        : index + 1;
    if (!byNumber.has(number)) byNumber.set(number, output);
  });

  const expected = (graph?.nodes ?? [])
    .filter((node) => node.type === "OUTPUT")
    .map((node, index) => node.outputNumber ?? index + 1)
    .sort((a, b) => a - b);

  const numbers = expected.length ? expected : [...byNumber.keys()].sort((a, b) => a - b);

  return numbers.map((number) => ({ number, output: byNumber.get(number) ?? null }));
}

export default function CampaignOutputsPanel({
  graph,
  outputs,
  onOpenOutput,
}: CampaignOutputsPanelProps) {
  const reducedMotion = useReducedMotion();
  const slots = useMemo(() => matchOutputSlots(graph, outputs), [graph, outputs]);

  if (!slots.length) return null;

  const ready = slots.filter((slot) => slot.output?.url).length;
  const total = slots.length;
  const allReady = ready === total;

  return (
    <section
      className="rounded-[1.5rem] border border-white/8 bg-black/25 p-5"
      aria-label="Your campaign outputs"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Your campaign</p>
        <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-100/90" aria-live="polite">
          {allReady ? (
            <span className="inline-flex items-center gap-1 text-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" /> All outputs ready
            </span>
          ) : (
            `${ready} / ${total} ready`
          )}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {slots.map((slot) => {
          const output = slot.output;
          const label = output?.label || `Output ${slot.number}`;

          if (!output?.url) {
            return (
              <div
                key={`pending-${slot.number}`}
                className="overflow-hidden rounded-xl border border-white/8 bg-white/[0.02]"
              >
                <div
                  className={`aspect-[9/16] w-full bg-gradient-to-b from-white/[0.06] to-white/[0.02] ${
                    reducedMotion ? "" : "animate-pulse"
                  }`}
                />
                <p className="px-2 py-2 text-[10px] uppercase tracking-[0.16em] text-slate-400">
                  Rendering…
                </p>
              </div>
            );
          }

          return (
            <button
              key={`ready-${slot.number}`}
              type="button"
              onClick={() =>
                onOpenOutput
                  ? onOpenOutput(output)
                  : window.open(output.url, "_blank", "noopener,noreferrer")
              }
              className="group overflow-hidden rounded-xl border border-cyan-300/25 bg-black/30 text-left transition-colors hover:border-cyan-200/60"
            >
              <div className="relative aspect-[9/16] w-full overflow-hidden bg-black">
                {output.type === "video" ? (
                  <video
                    src={output.url}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <img
                    src={output.url}
                    alt={label}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                )}
                <span className="absolute left-1.5 top-1.5 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-emerald-100">
                  ✓ Ready
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 px-2 py-2 text-[10px] uppercase tracking-[0.16em] text-slate-300">
                <span className="inline-flex items-center gap-1">
                  {output.type === "video" ? (
                    <Film className="h-3 w-3" />
                  ) : (
                    <ImageIcon className="h-3 w-3" />
                  )}
                  {label}
                </span>
                <Download className="h-3 w-3 opacity-60 group-hover:opacity-100" />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
