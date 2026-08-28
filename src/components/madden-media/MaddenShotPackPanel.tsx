/**
 * Madden Media Studio — M7 shot packs + generation history.
 *
 * Mechanism only: each shot compiles its own prompt from the project's locked
 * consistency plus its own composition, and "generate" persists an IMMUTABLE
 * snapshot. No paid provider is ever called — every generation action is
 * explicitly marked LIVE GENERATION VERIFICATION PENDING.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Copy,
  Layers,
  Loader2,
  PlayCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MADDEN_CINEMATOGRAPHY_PRESETS } from "@/lib/madden-media/cinematographyPresets";
import { findPreset } from "@/lib/madden-media/presetTypes";
import { maddenShotPromptCompiler } from "@/lib/madden-media/promptCompiler";
import {
  MADDEN_SHOT_PACKS,
  findShotPack,
  type MaddenShotPack,
} from "@/lib/madden-media/shotPacks";
import type { MaddenProjectState, MaddenShot } from "@/lib/madden-media/types";
import {
  listMaddenGenerations,
  recordMaddenShotGeneration,
  type MaddenGenerationSnapshot,
  type MaddenShotGeneration,
} from "@/services/maddenMediaStudio";

type Props = {
  projectId: string;
  state: MaddenProjectState;
  onApplyPack: (pack: MaddenShotPack) => void;
};

export default function MaddenShotPackPanel({ projectId, state, onApplyPack }: Props) {
  const [history, setHistory] = useState<MaddenShotGeneration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [openShotId, setOpenShotId] = useState<string | null>(null);
  /** Per-shot history cursor, so browsing never mutates a snapshot. */
  const [cursor, setCursor] = useState<Record<string, number>>({});

  const activePack = findShotPack(state.settings.shotPackId ?? null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHistory(await listMaddenGenerations(projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load generation history");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const byShot = useMemo(() => {
    const map = new Map<string, MaddenShotGeneration[]>();
    for (const row of history) {
      const list = map.get(row.shotId) ?? [];
      list.push(row);
      map.set(row.shotId, list);
    }
    return map;
  }, [history]);

  const handleGenerate = async (shot: MaddenShot) => {
    setGeneratingId(shot.id);
    try {
      const compiled = maddenShotPromptCompiler(state, shot);
      const snapshot: MaddenGenerationSnapshot = {
        feature: "madden-media",
        maddenProjectId: projectId,
        shotId: shot.id,
        shotPackId: state.settings.shotPackId ?? null,
        aspectRatio: "9:16",
        shot: {
          title: shot.title,
          direction: shot.direction,
          durationSeconds: shot.durationSeconds,
          cinematographyId: shot.cinematographyId ?? null,
        },
        presets: {
          cinematographyId: shot.cinematographyId ?? state.settings.cinematographyId,
          lightingId: state.settings.lightingId,
          environmentId: state.settings.environmentId,
        },
        referenceUrls: compiled.referenceUrls,
        compiledAt: new Date().toISOString(),
        verification: "live_generation_verification_pending",
      };
      const row = await recordMaddenShotGeneration({
        projectId,
        shotId: shot.id,
        prompt: compiled.prompt,
        snapshot,
      });
      setHistory((prev) => [...prev, row]);
      setCursor((prev) => ({ ...prev, [shot.id]: (byShot.get(shot.id)?.length ?? 0) }));
      setOpenShotId(shot.id);
      toast.success("Snapshot saved — live generation verification pending");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that snapshot");
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-card/50 p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold tracking-tight">
            <Layers className="h-4 w-4 text-muted-foreground" aria-hidden />
            Shot packs
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            An ordered coverage set. Every shot inherits your locked subject, outfit and jewelry and
            adds only its own composition.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-[11px]"
          onClick={() => void refresh()}
          disabled={loading}
        >
          <RefreshCw className="mr-1 h-3 w-3" />
          Refresh history
        </Button>
      </header>

      {/* Pack picker ------------------------------------------------ */}
      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={packQuery}
          onChange={(event) => setPackQuery(event.target.value)}
          placeholder="Search shot packs by name or tag…"
          className="pl-8"
          aria-label="Search shot packs"
        />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {visiblePacks.map((pack) => {
          const selected = pack.id === state.settings.shotPackId;
          const starred = isFavorite(pack.id);
          return (
            <div
              key={pack.id}
              className={`relative rounded-xl border transition-colors ${
                selected
                  ? "border-primary/60 bg-primary/5"
                  : "border-border/60 bg-background/40 hover:border-border"
              }`}
            >
              <button
                type="button"
                onClick={() => onApplyPack(pack)}
                className="w-full p-3 pr-10 text-left"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{pack.name}</p>
                  <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {pack.shots.length} shots
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  {pack.description}
                </p>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1 h-8 w-8 text-muted-foreground"
                aria-label={starred ? `Unfavorite ${pack.name}` : `Favorite ${pack.name}`}
                aria-pressed={starred}
                onClick={() => toggle(pack.id)}
              >
                <Star className={`h-3.5 w-3.5 ${starred ? "fill-primary text-primary" : ""}`} />
              </Button>
            </div>
          );
        })}
        {visiblePacks.length === 0 ? (
          <p className="text-xs text-muted-foreground">No shot packs match that search.</p>
        ) : null}
      </div>


      {activePack ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Applying a pack replaces the ordered shot list. Your consistency locks and prompt edits are
          never touched.
        </p>
      ) : null}

      {/* Errors ---------------------------------------------------- */}
      {error ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-border/60 bg-muted/30 p-3 text-[11px] text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Ordered shots -------------------------------------------- */}
      <div className="mt-4 space-y-3">
        {state.shots.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
            Pick a shot pack above to lay out your coverage.
          </p>
        ) : (
          state.shots.map((shot, index) => (
            <ShotRow
              key={shot.id}
              index={index}
              shot={shot}
              state={state}
              generations={byShot.get(shot.id) ?? []}
              historyLoading={loading}
              cursorIndex={cursor[shot.id]}
              onCursor={(next) => setCursor((prev) => ({ ...prev, [shot.id]: next }))}
              open={openShotId === shot.id}
              onToggle={() => setOpenShotId((prev) => (prev === shot.id ? null : shot.id))}
              generating={generatingId === shot.id}
              onGenerate={() => void handleGenerate(shot)}
            />
          ))
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

type RowProps = {
  index: number;
  shot: MaddenShot;
  state: MaddenProjectState;
  generations: MaddenShotGeneration[];
  historyLoading: boolean;
  cursorIndex: number | undefined;
  onCursor: (next: number) => void;
  open: boolean;
  onToggle: () => void;
  generating: boolean;
  onGenerate: () => void;
};

function ShotRow({
  index,
  shot,
  state,
  generations,
  historyLoading,
  cursorIndex,
  onCursor,
  open,
  onToggle,
  generating,
  onGenerate,
}: RowProps) {
  const compiled = useMemo(() => maddenShotPromptCompiler(state, shot), [shot, state]);
  const preset = findPreset(
    MADDEN_CINEMATOGRAPHY_PRESETS,
    shot.cinematographyId ?? state.settings.cinematographyId,
  );

  const total = generations.length;
  const position = total === 0 ? 0 : Math.min(Math.max(cursorIndex ?? total - 1, 0), total - 1);
  const viewing = total > 0 ? generations[position] : null;

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  return (
    <div className="rounded-xl border border-border/50 bg-background/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {String(index + 1).padStart(2, "0")}
        </span>
        <p className="text-sm font-medium">{shot.title || `Shot ${index + 1}`}</p>
        <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
          {shot.durationSeconds || 0}s
        </span>
        {preset ? (
          <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
            {preset.name}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-[11px]"
            onClick={onToggle}
          >
            {open ? "Hide prompt" : "Prompt"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            onClick={onGenerate}
            disabled={generating}
          >
            {generating ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <PlayCircle className="mr-1 h-3 w-3" />
            )}
            Generate
          </Button>
        </div>
      </div>

      {shot.direction ? (
        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{shot.direction}</p>
      ) : null}

      <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        Live generation verification pending
      </p>

      {/* History navigation -------------------------------------- */}
      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border/60 px-2.5 py-1.5">
        {historyLoading ? (
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading history…
          </span>
        ) : total === 0 ? (
          <span className="text-[11px] text-muted-foreground">
            No generations yet — each one is kept as its own snapshot.
          </span>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              aria-label="Previous generation"
              onClick={() => onCursor(Math.max(position - 1, 0))}
              disabled={position === 0}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {position + 1} / {total}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              aria-label="Next generation"
              onClick={() => onCursor(Math.min(position + 1, total - 1))}
              disabled={position >= total - 1}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            {viewing ? (
              <span className="text-[11px] text-muted-foreground">
                {viewing.createdAt ? new Date(viewing.createdAt).toLocaleString() : "—"} ·{" "}
                {viewing.status.replace(/_/g, " ")}
              </span>
            ) : null}
          </>
        )}
      </div>

      {viewing?.outputUrl ? (
        <a
          href={viewing.outputUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-[11px] text-primary underline-offset-2 hover:underline"
        >
          Open this generation's media
        </a>
      ) : null}

      {open ? (
        <div className="mt-3 space-y-3">
          {compiled.warnings.length > 0 ? (
            <ul className="space-y-1.5 rounded-lg border border-border/60 bg-muted/30 p-2.5">
              {compiled.warnings.map((warning) => (
                <li
                  key={warning.code}
                  className="flex items-start gap-2 text-[11px] leading-snug text-muted-foreground"
                >
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                  <span>{warning.message}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Compiled shot prompt
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-[11px]"
                onClick={() => void copy(compiled.prompt)}
              >
                <Copy className="mr-1 h-3 w-3" />
                Copy
              </Button>
            </div>
            <pre className="mt-1.5 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/20 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
              {compiled.prompt || "Bind a subject and pick presets to compile this shot."}
            </pre>
          </div>

          {viewing ? (
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Snapshot {position + 1} of {total}
              </p>
              <pre className="mt-1.5 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/20 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                {JSON.stringify(
                  { prompt: viewing.prompt, snapshot: viewing.snapshot },
                  null,
                  2,
                )}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
