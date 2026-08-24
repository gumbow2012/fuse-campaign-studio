import { useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import PresetPreview from "./PresetPreview";
import { buildActiveConfigTiles } from "@/lib/cinema/activeConfigTiles";
import { CONTINUITY_FIELDS, CONTINUITY_LABELS } from "@/lib/cinema/shotBoard";
import type { CinemaShot, DirectorConfig } from "@/lib/cinema/types";

export type ShotThumb = { url: string; type: "image" | "video" } | null;

export interface ShotBoardProps {
  shots: CinemaShot[];
  activeShotId: string;
  sceneName: string;
  continuityLock: boolean;
  /** Resolved config per shot (SHOT ▸ SCENE ▸ PROJECT ▸ SYSTEM). */
  resolveShotConfig: (shotId: string) => DirectorConfig;
  /** Latest generation output for a shot, when it has one. */
  thumbnailFor: (shot: CinemaShot) => ShotThumb;
  onSelectShot: (shotId: string) => void;
  onAddShot: () => void;
  onDuplicateShot: (shotId: string) => void;
  onDeleteShot: (shotId: string) => void;
  onReorder: (from: number, to: number) => void;
  onToggleContinuity: (value: boolean) => void;
}

function label(shot: CinemaShot, index: number): string {
  return shot.name?.trim() || `SHOT ${String(index + 1).padStart(2, "0")}`;
}

/**
 * CV8 — the SHOT BOARD: a horizontal, reorderable board of shot cards.
 *
 * Selecting a card makes that shot ACTIVE, so the composer, Visual Stage and
 * config strip all edit THAT shot (its own prompt, references, config and
 * generation history). Presentation + state callbacks only: no generation,
 * no provider calls, no credit logic.
 */
export default function ShotBoard({
  shots,
  activeShotId,
  sceneName,
  continuityLock,
  resolveShotConfig,
  thumbnailFor,
  onSelectShot,
  onAddShot,
  onDuplicateShot,
  onDeleteShot,
  onReorder,
  onToggleContinuity,
}: ShotBoardProps) {
  const dragIndex = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const lockedLabels = useMemo(
    () => CONTINUITY_FIELDS.map((field) => CONTINUITY_LABELS[field] ?? field),
    [],
  );

  return (
    <section className="fuse-panel rounded-2xl p-3">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <span className="font-display text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
            Shot board
          </span>
          <Badge variant="outline" className="text-[9px] uppercase tracking-[0.14em]">
            {sceneName} · {shots.length} {shots.length === 1 ? "shot" : "shots"}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Label
            htmlFor="cinema-continuity-lock"
            className="font-display text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
          >
            Lock scene continuity
          </Label>
          <Switch
            id="cinema-continuity-lock"
            checked={continuityLock}
            onCheckedChange={onToggleContinuity}
          />
        </div>
      </header>

      <p className="mb-3 px-1 text-[11px] text-muted-foreground">
        {continuityLock ? (
          <>
            Continuity locked at scene level:{" "}
            <span className="text-foreground/85">{lockedLabels.join(" · ")}</span>. Edits to those
            fields apply to every shot in this scene; camera, movement, composition and optics stay
            per shot.
          </>
        ) : (
          <>
            Every field is per shot. Turn on Lock scene continuity to pin{" "}
            {lockedLabels.join(" · ")} across the whole scene.
          </>
        )}
      </p>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {shots.map((shot, index) => {
          const active = shot.id === activeShotId;
          const thumb = thumbnailFor(shot);
          const tiles = buildActiveConfigTiles(resolveShotConfig(shot.id), shot.references);
          const fallback = tiles.find((t) => t.key === "camera") ?? tiles[0];

          return (
            <div
              key={shot.id}
              draggable
              onDragStart={() => {
                dragIndex.current = index;
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setOverIndex(index);
              }}
              onDragEnd={() => {
                dragIndex.current = null;
                setOverIndex(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const from = dragIndex.current;
                dragIndex.current = null;
                setOverIndex(null);
                if (from !== null && from !== index) onReorder(from, index);
              }}
              className={`w-[168px] shrink-0 overflow-hidden rounded-xl border bg-background/60 transition ${
                active ? "border-primary/70 ring-1 ring-primary/40" : "border-border/60"
              } ${overIndex === index ? "translate-y-[-2px] border-primary/50" : ""}`}
            >
              <button
                type="button"
                onClick={() => onSelectShot(shot.id)}
                aria-pressed={active}
                className="block w-full text-left"
              >
                <div className="relative aspect-[9/16] max-h-[190px] w-full overflow-hidden bg-black">
                  {thumb?.type === "video" ? (
                    <video
                      src={thumb.url}
                      muted
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                  ) : thumb ? (
                    <img
                      src={thumb.url}
                      alt={`${label(shot, index)} latest result`}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : fallback ? (
                    <PresetPreview
                      media={fallback.media}
                      alt={`${label(shot, index)} ${fallback.summary}`}
                      className="h-full w-full"
                    />
                  ) : (
                    <div className="h-full w-full bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/0.18),transparent_70%)]" />
                  )}
                </div>

                <div className="space-y-1 px-2 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-[10px] uppercase tracking-[0.18em]">
                      {label(shot, index)}
                    </span>
                    {thumb ? (
                      <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                        Result
                      </span>
                    ) : (
                      <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                        Preview
                      </span>
                    )}
                  </div>
                  <p className="line-clamp-2 text-[10px] text-muted-foreground">
                    {shot.prompt?.trim() || fallback?.summary || "No prompt yet"}
                  </p>
                </div>
              </button>

              <div className="flex items-center justify-between gap-1 border-t border-border/50 px-1.5 py-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[9px] uppercase tracking-[0.14em]"
                  onClick={() => onDuplicateShot(shot.id)}
                >
                  Duplicate
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[9px] uppercase tracking-[0.14em] text-muted-foreground"
                  disabled={shots.length <= 1}
                  onClick={() => onDeleteShot(shot.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={onAddShot}
          className="flex aspect-[9/16] max-h-[190px] w-[168px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border/70 text-muted-foreground transition hover:border-primary/60 hover:text-foreground"
        >
          <span className="text-xl leading-none">+</span>
          <span className="font-display text-[10px] uppercase tracking-[0.2em]">Shot</span>
        </button>
      </div>
    </section>
  );
}
