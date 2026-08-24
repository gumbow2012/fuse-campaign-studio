/**
 * FUSE Cinema — CV4 interactive COMPARE system.
 *
 * A reusable visual comparison surface for any two CV1 `PreviewMedia` values.
 * Three modes: side-by-side, wipe slider (draggable divider) and
 * press-and-hold before/after. Movement (`loop`) media plays in BOTH panes at
 * once so the difference is visible without hovering.
 *
 * Cinema-only. No media is generated here and no provider job is ever launched;
 * missing assets fall back to the CV1 gradient/swatch rendering.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Columns2, Hand, SplitSquareHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import PresetPreview from "./PresetPreview";
import type { PreviewMedia } from "@/lib/cinema/previewTypes";

export type CompareMode = "side-by-side" | "wipe" | "hold";

export type CompareSide = {
  media: PreviewMedia;
  label: string;
  sublabel?: string;
};

export interface CompareViewProps {
  a: CompareSide;
  b: CompareSide;
  /** Modes offered in this context (first = default). */
  modes?: CompareMode[];
  /** Optional "use this one" actions. */
  onApplyA?: () => void;
  onApplyB?: () => void;
  className?: string;
}

const MODE_META: Record<CompareMode, { label: string; icon: typeof Columns2 }> = {
  "side-by-side": { label: "Side by side", icon: Columns2 },
  wipe: { label: "Wipe", icon: SplitSquareHorizontal },
  hold: { label: "Hold", icon: Hand },
};

const STAGE = "relative h-[220px] w-full overflow-hidden rounded-xl bg-background/60 sm:h-[300px]";

function Pane({ side, autoPlay }: { side: CompareSide; autoPlay: boolean }) {
  return (
    <PresetPreview
      media={side.media}
      alt={side.label}
      autoPlay={autoPlay}
      className="h-full w-full"
    />
  );
}

export default function CompareView({
  a,
  b,
  modes = ["side-by-side", "wipe", "hold"],
  onApplyA,
  onApplyB,
  className,
}: CompareViewProps) {
  const available = modes.length > 0 ? modes : (["side-by-side"] as CompareMode[]);
  const [mode, setMode] = useState<CompareMode>(available[0]);
  const [wipe, setWipe] = useState(50);
  const [holding, setHolding] = useState(false);
  const wipeRef = useRef<HTMLDivElement>(null);

  // MOVEMENT/FOCUS loops must run in both panes simultaneously.
  const autoPlay = a.media.kind === "loop" || b.media.kind === "loop";

  const setWipeFromEvent = useCallback((clientX: number) => {
    const node = wipeRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setWipe(Math.min(100, Math.max(0, pct)));
  }, []);

  const stage = useMemo(() => {
    if (mode === "side-by-side") {
      return (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className={STAGE}>
            <Pane side={a} autoPlay={autoPlay} />
            <SideBadge text={`A · ${a.label}`} />
          </div>
          <div className={STAGE}>
            <Pane side={b} autoPlay={autoPlay} />
            <SideBadge text={`B · ${b.label}`} />
          </div>
        </div>
      );
    }

    if (mode === "wipe") {
      return (
        <div
          ref={wipeRef}
          className={cn(STAGE, "cursor-ew-resize touch-none select-none")}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            setWipeFromEvent(event.clientX);
          }}
          onPointerMove={(event) => {
            if (event.buttons === 0) return;
            setWipeFromEvent(event.clientX);
          }}
          role="slider"
          aria-label={`Wipe between ${a.label} and ${b.label}`}
          aria-valuenow={Math.round(wipe)}
          aria-valuemin={0}
          aria-valuemax={100}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") setWipe((v) => Math.max(0, v - 4));
            if (event.key === "ArrowRight") setWipe((v) => Math.min(100, v + 4));
          }}
        >
          <div className="absolute inset-0">
            <Pane side={b} autoPlay={autoPlay} />
          </div>
          <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - wipe}% 0 0)` }}>
            <Pane side={a} autoPlay={autoPlay} />
          </div>
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-primary"
            style={{ left: `${wipe}%` }}
          >
            <span className="absolute left-1/2 top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary/70 bg-background/90">
              <ArrowLeftRight className="h-3.5 w-3.5 text-primary" />
            </span>
          </div>
          <SideBadge text={`A · ${a.label}`} />
          <SideBadge text={`B · ${b.label}`} align="right" />
        </div>
      );
    }

    return (
      <div
        className={cn(STAGE, "touch-none select-none")}
        onPointerDown={() => setHolding(true)}
        onPointerUp={() => setHolding(false)}
        onPointerLeave={() => setHolding(false)}
        onPointerCancel={() => setHolding(false)}
      >
        <div className={cn("absolute inset-0", holding && "opacity-0")}>
          <Pane side={a} autoPlay={autoPlay} />
        </div>
        <div className={cn("absolute inset-0", !holding && "opacity-0")}>
          <Pane side={b} autoPlay={autoPlay} />
        </div>
        <SideBadge text={holding ? `B · ${b.label}` : `A · ${a.label}`} />
        <span className="absolute bottom-2 right-2 rounded-md bg-background/80 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground backdrop-blur">
          Press and hold for B
        </span>
      </div>
    );
  }, [mode, a, b, autoPlay, holding, wipe, setWipeFromEvent]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        {available.map((option) => {
          const Icon = MODE_META[option].icon;
          return (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={mode === option ? "secondary" : "ghost"}
              className="h-7 text-[11px]"
              onClick={() => setMode(option)}
            >
              <Icon className="mr-1 h-3 w-3" />
              {MODE_META[option].label}
            </Button>
          );
        })}
        {autoPlay ? (
          <Badge variant="outline" className="text-[10px]">
            both loops playing
          </Badge>
        ) : null}
      </div>

      {stage}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="text-[11px] text-muted-foreground">
          <p className="text-foreground/90">A · {a.label}</p>
          {a.sublabel ? <p>{a.sublabel}</p> : null}
        </div>
        <div className="text-right text-[11px] text-muted-foreground">
          <p className="text-foreground/90">B · {b.label}</p>
          {b.sublabel ? <p>{b.sublabel}</p> : null}
        </div>
      </div>

      {onApplyA || onApplyB ? (
        <div className="flex flex-wrap gap-2">
          {onApplyA ? (
            <Button type="button" size="sm" variant="outline" onClick={onApplyA}>
              Use A
            </Button>
          ) : null}
          {onApplyB ? (
            <Button type="button" size="sm" variant="outline" onClick={onApplyB}>
              Use B
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SideBadge({ text, align = "left" }: { text: string; align?: "left" | "right" }) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute top-2 rounded-md bg-background/80 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-foreground/80 backdrop-blur",
        align === "left" ? "left-2" : "right-2",
      )}
    >
      {text}
    </span>
  );
}

/** Modal wrapper so panels can open a comparison without changing their layout. */
export function CompareDialog({
  open,
  onOpenChange,
  title,
  description,
  ...compare
}: CompareViewProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-sm uppercase tracking-[0.2em]">
            {title}
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            {description ??
              "Standardized canonical previews — gradient placeholders show where real media is still pending."}
          </DialogDescription>
        </DialogHeader>
        <CompareView {...compare} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Tiny selection state machine shared by the preset browsers:
 * mark A, then "Compare with…" B.
 */
export function useCompareSelection<T extends { id: string }>() {
  const [a, setA] = useState<T | null>(null);
  const [b, setB] = useState<T | null>(null);

  const pick = useCallback(
    (item: T) => {
      setA((current) => {
        if (!current || current.id === item.id) return item;
        setB(item);
        return current;
      });
    },
    [],
  );

  const reset = useCallback(() => {
    setA(null);
    setB(null);
  }, []);

  const closeCompare = useCallback(() => setB(null), []);

  return { a, b, pick, reset, closeCompare, isA: (id: string) => a?.id === id };
}
