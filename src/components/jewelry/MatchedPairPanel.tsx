/**
 * MATCHED-PAIR MANUFACTURING (§29) — UI.
 *
 * From an APPROVED plate, render its counterpart manufacturing state
 * (FINISHED ↔ PRE-SETTING) with camera, crop, composition, lighting,
 * orientation, scale and background held identical, so the two plates overlay.
 *
 * Generating a pair runs the EXISTING Nano path and therefore spends credits,
 * so it sits behind an explicit button and never fires on its own.
 */

import { Button } from "@/components/ui/button";
import {
  type MatchedPair,
  type MatchedPairSource,
  manufacturingStageLabel,
  matchedPairKey,
  matchedPairSummary,
  oppositeManufacturingStage,
} from "@/lib/matchedPairs";

export function MatchedPairPanel({
  sources,
  pairs,
  busyKey,
  disabledReason,
  onGenerate,
}: {
  sources: MatchedPairSource[];
  pairs: Record<string, MatchedPair>;
  /** The pair key currently submitting, if any. */
  busyKey: string | null;
  disabledReason: string | null;
  onGenerate: (sourceId: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-foreground/60">
        Matched manufacturing pairs
      </p>
      <p className="mt-1 text-[10px] leading-relaxed text-foreground/45">
        Same shot, same light, same angle — the only thing that changes is the manufacturing
        stage (stones set ↔ stones removed with the seats exposed). Built for overlaying.
      </p>

      {disabledReason ? (
        <p className="mt-2 text-[10px] text-amber-200/80">{disabledReason}</p>
      ) : (
        <div className="mt-3 space-y-2">
          {sources.map((source) => {
            const targetStage = oppositeManufacturingStage(source.stage);
            const key = matchedPairKey(source.id, targetStage);
            const pair = pairs[key] ?? null;
            const running =
              pair?.status === "queued" || pair?.status === "running" || busyKey === key;

            return (
              <div
                key={key}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] text-foreground/85">{source.label}</p>
                    <p className="mt-0.5 text-[10px] text-foreground/45">
                      {manufacturingStageLabel(source.stage)} → {manufacturingStageLabel(targetStage)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={running}
                    onClick={() => onGenerate(source.id)}
                    className="h-7 shrink-0 rounded-lg px-2 text-[10px]"
                  >
                    {running ? "Generating…" : pair ? "Regenerate pair" : "Generate matched pair"}
                  </Button>
                </div>

                {pair ? (
                  <div className="mt-2 flex items-start gap-2">
                    <img
                      src={pair.sourceUrl}
                      alt={`${source.label} — ${manufacturingStageLabel(pair.sourceStage)}`}
                      className="h-16 w-16 rounded-lg border border-white/10 object-cover"
                    />
                    {pair.outputUrl ? (
                      <img
                        src={pair.outputUrl}
                        alt={`${source.label} — ${manufacturingStageLabel(pair.targetStage)}`}
                        className="h-16 w-16 rounded-lg border border-white/10 object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-white/10 text-[9px] text-foreground/40">
                        {pair.status === "failed" ? "Failed" : "Rendering"}
                      </div>
                    )}
                    <div className="min-w-0 text-[10px] text-foreground/45">
                      <p className="leading-relaxed">{matchedPairSummary(pair)}</p>
                      {pair.error ? (
                        <p className="mt-1 text-amber-200/80">{pair.error}</p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
