/**
 * FUSE Cinema — CV4 standardized FOCAL LENGTH strip.
 *
 * Shows the SAME canonical PORTRAIT subject at 18 | 24 | 35 | 50 | 85 | 135 mm.
 * Media comes from the CV1 preview contract; while real stills are missing each
 * frame renders the gradient fallback (no generation, no credits).
 */

import { cn } from "@/lib/utils";
import PresetPreview from "./PresetPreview";
import {
  FOCAL_LENGTH_STRIP_MM,
  defaultCanonicalScene,
  type PreviewMedia,
} from "@/lib/cinema/previewTypes";

export interface FocalStripProps {
  /** Currently selected focal length in millimetres. */
  value: number;
  onSelect: (mm: number) => void;
  /** Optional real media per focal length, keyed by mm. */
  media?: Partial<Record<number, PreviewMedia>>;
  className?: string;
}

/** Wider lens = cooler/flatter placeholder, longer lens = warmer/compressed. */
const FALLBACK_GRADIENT: Record<number, string> = {
  18: "linear-gradient(135deg,#0e1418,#2b3a44)",
  24: "linear-gradient(135deg,#111820,#33434f)",
  35: "linear-gradient(135deg,#151b22,#3c4a55)",
  50: "linear-gradient(135deg,#1a1d21,#454d55)",
  85: "linear-gradient(135deg,#221c1a,#54453c)",
  135: "linear-gradient(135deg,#2a1e19,#63483a)",
};

const NOTE: Record<number, string> = {
  18: "wide · strong perspective",
  24: "wide · environmental",
  35: "reportage",
  50: "neutral",
  85: "portrait · compressed",
  135: "long · flattened",
};

export default function FocalStrip({ value, onSelect, media, className }: FocalStripProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Focal Length Strip
        </p>
        <p className="text-[10px] text-muted-foreground/70">
          Same canonical subject · only the lens changes
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {FOCAL_LENGTH_STRIP_MM.map((mm) => {
          const resolved: PreviewMedia =
            media?.[mm] ?? {
              kind: "still",
              canonicalScene: defaultCanonicalScene("FOCAL_LENGTH"),
              fallbackGradient: FALLBACK_GRADIENT[mm],
            };
          const active = value === mm;
          return (
            <button
              key={mm}
              type="button"
              onClick={() => onSelect(mm)}
              aria-pressed={active}
              className={cn(
                "overflow-hidden rounded-xl border text-left transition-all",
                "border-border/70 bg-card/60 hover:border-primary/60",
                active && "border-primary/80 ring-1 ring-primary/50",
              )}
            >
              <PresetPreview
                media={resolved}
                alt={`${mm}mm canonical portrait reference`}
                className="h-16"
              />
              <div className="px-2 py-1.5">
                <p className="font-display text-[11px] leading-tight text-foreground/90">{mm}mm</p>
                <p className="truncate text-[10px] text-muted-foreground">{NOTE[mm]}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
