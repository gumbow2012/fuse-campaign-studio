import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  FINISH_CONTROLS,
  NEUTRAL_FINISH,
  finishGrainOpacity,
  finishToCssFilter,
  isNeutralFinish,
  type CinemaFinish,
  type FinishControlKey,
} from "@/lib/cinema/finish";
import type { CinemaGeneration } from "@/services/cinemaStudio";

/**
 * CV7 — FINISH workspace (GENERATE → SELECT → FINISH).
 *
 * Two clearly separated things:
 *  1. FINISH — a non-destructive grade: an on-screen CSS preview plus saved
 *     metadata on the generation. It never re-renders the file.
 *  2. GENERATIVE CONTINUATION — a NEW render seeded from this shot's end or
 *     start frame. Our video providers expose no verified native frame
 *     extension, so this is never presented as "native extend".
 */

export type ContinuationDirection = "forward" | "backward";

export interface FinishWorkspaceProps {
  generation: CinemaGeneration;
  finish: CinemaFinish;
  onFinishChange: (next: CinemaFinish) => void;
  /** Continuation seed (end/start frame) prepared for a new generation. */
  seed: { url: string; direction: ContinuationDirection } | null;
  seedBusy: boolean;
  onPrepareSeed: (direction: ContinuationDirection) => void;
  onClearSeed: () => void;
  /** Launches a NEW generation using the seed. Never called automatically. */
  onGenerateContinuation: () => void;
  continuationBusy: boolean;
}

export default function FinishWorkspace({
  generation,
  finish,
  onFinishChange,
  seed,
  seedBusy,
  onPrepareSeed,
  onClearSeed,
  onGenerateContinuation,
  continuationBusy,
}: FinishWorkspaceProps) {
  const ready = generation.status === "complete" && Boolean(generation.outputUrl);
  const isVideo = generation.outputType === "video";
  const filter = finishToCssFilter(finish);
  const grain = finishGrainOpacity(finish);

  const setValue = (key: FinishControlKey, value: number) =>
    onFinishChange({ ...finish, [key]: value, updatedAt: new Date().toISOString() });

  if (!ready) return null;

  return (
    <section className="fuse-panel space-y-5 rounded-2xl p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <span className="font-display text-[11px] uppercase tracking-[0.22em]">Finish</span>
          <p className="max-w-xl text-[11px] leading-relaxed text-muted-foreground">
            Non-destructive grade: this is an on-screen preview plus saved settings on this
            version. Your rendered file is not changed, nothing is re-generated, and export /
            processing comes later.
          </p>
        </div>
        <Badge variant="outline" className="text-[9px] uppercase tracking-[0.14em]">
          {isNeutralFinish(finish) ? "No grade" : "Grade saved"}
        </Badge>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Preview — CSS only, applied to the on-screen element */}
        <div className="relative overflow-hidden rounded-xl bg-black">
          {isVideo ? (
            <video
              key={`finish-${generation.id}`}
              src={generation.outputUrl ?? undefined}
              controls
              playsInline
              muted
              className="w-full"
              style={{ filter }}
            />
          ) : (
            <img
              src={generation.outputUrl ?? undefined}
              alt="Finish preview"
              loading="lazy"
              className="w-full"
              style={{ filter }}
            />
          )}
          {grain > 0 ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 mix-blend-overlay"
              style={{
                opacity: grain,
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence baseFrequency='0.9' numOctaves='2'/></filter><rect width='120' height='120' filter='url(%23n)' opacity='0.6'/></svg>\")",
                backgroundSize: "180px 180px",
              }}
            />
          ) : null}
        </div>

        {/* Grade controls */}
        <div className="space-y-3">
          {FINISH_CONTROLS.map((control) => (
            <div key={control.key} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  {control.label}
                  {control.previewable ? null : (
                    <span className="ml-2 normal-case tracking-normal text-[9px] text-muted-foreground/70">
                      saved only, no preview
                    </span>
                  )}
                </Label>
                <span className="text-[11px] tabular-nums text-foreground/80">
                  {finish[control.key]}
                </span>
              </div>
              <Slider
                value={[finish[control.key]]}
                min={control.min}
                max={control.max}
                step={1}
                onValueChange={([value]) => setValue(control.key, value ?? 0)}
                aria-label={control.label}
              />
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled={isNeutralFinish(finish)}
            onClick={() => onFinishChange({ ...NEUTRAL_FINISH, updatedAt: new Date().toISOString() })}
          >
            Reset grade
          </Button>
        </div>
      </div>

      {/* Generative continuation — explicitly NOT native frame extension */}
      <div className="space-y-3 rounded-xl border border-border/60 bg-background/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-display text-[11px] uppercase tracking-[0.2em]">
            Generative continuation
          </span>
          <Badge variant="outline" className="text-[9px] uppercase tracking-[0.14em]">
            New render
          </Badge>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Our video models do not expose a verified native frame-extension API, so this is not
          native extend. It takes this shot's{" "}
          {isVideo ? "end frame (forward) or start frame (backward)" : "frame"} as the seed image
          for a brand-new generation of the same shot and settings. It is a fresh render and can
          drift from this version. Nothing runs until you click Generate.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={seedBusy || continuationBusy}
            onClick={() => onPrepareSeed("forward")}
          >
            Seed from end frame
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={seedBusy || continuationBusy}
            onClick={() => onPrepareSeed("backward")}
          >
            Seed from start frame
          </Button>
          {seedBusy ? (
            <span className="text-[11px] text-muted-foreground">Reading frame…</span>
          ) : null}
        </div>

        {seed ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-background/60 p-3">
            <img
              src={seed.url}
              alt={`Continuation seed (${seed.direction})`}
              className="h-16 w-16 rounded object-cover"
              loading="lazy"
            />
            <div className="min-w-0 flex-1 text-[11px] text-muted-foreground">
              Seed ready — {seed.direction === "forward" ? "end frame (continue forward)" : "start frame (continue backward)"}.
              Generating creates a new version in your history and costs credits like any
              generation.
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={onClearSeed} disabled={continuationBusy}>
                Discard
              </Button>
              <Button size="sm" onClick={onGenerateContinuation} disabled={continuationBusy}>
                {continuationBusy ? "Starting…" : "Generate continuation"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
