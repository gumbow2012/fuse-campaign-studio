import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { SeedanceDirectorPreview } from "@/services/jewelrySwap";

type Props = {
  preview: SeedanceDirectorPreview | null;
  status: "idle" | "loading" | "ready" | "error";
  /** The text that will actually be sent (auto prompt or the manual draft). */
  value: string;
  mode: "auto" | "manual";
  stale: boolean;
  maxCharacters: number;
  onChange: (text: string) => void;
  onReset: () => void;
  onKeepManual: () => void;
  onRebuild: () => void;
  onRefresh: () => void;
};

/**
 * SEEDANCE DIRECTION — read-only by default, double-click to edit. The text
 * shown here is exactly what the reconstruction submits.
 */
export function SeedanceDirectionPanel({
  preview,
  status,
  value,
  mode,
  stale,
  maxCharacters,
  onChange,
  onReset,
  onKeepManual,
  onRebuild,
  onRefresh,
}: Props) {
  const [editing, setEditing] = useState(false);
  const count = value.length;
  const overLimit = count > maxCharacters;
  const shotPlan = Array.isArray(preview?.shotPlan) ? (preview?.shotPlan as unknown[]) : [];

  return (
    <div className="mt-5 rounded-2xl border border-cyan-400/25 bg-black/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-orbitron text-[11px] uppercase tracking-[0.18em] text-cyan-200/90">
            Seedance direction
          </span>
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]",
              mode === "manual"
                ? "border-amber-400/40 text-amber-200"
                : "border-white/15 text-white/55",
            )}
          >
            {mode === "manual" ? "Manual edit" : "Auto"}
          </span>
        </div>
        <span className={cn("text-[11px]", overLimit ? "text-red-300" : "text-white/45")}>
          {count.toLocaleString()} / {maxCharacters.toLocaleString()}
        </span>
      </div>

      {status === "loading" && (
        <p className="mt-3 text-xs text-white/50">Building the FUSE director prompt…</p>
      )}
      {status === "error" && (
        <div className="mt-3 flex items-center gap-3">
          <p className="text-xs text-red-300">Could not build the prompt preview.</p>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onRefresh}>
            Retry
          </Button>
        </div>
      )}

      {shotPlan.length > 0 && (
        <p className="mt-3 text-[11px] uppercase tracking-[0.12em] text-white/40">
          {mode === "manual" ? "Original FUSE plan" : "Shot plan"} · {shotPlan.length} beats
        </p>
      )}

      {editing ? (
        <Textarea
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "mt-3 min-h-[220px] rounded-xl border-cyan-400/30 bg-black/60 text-sm leading-relaxed text-white/85",
            overLimit && "border-red-400/50",
          )}
        />
      ) : (
        <p
          onDoubleClick={() => setEditing(true)}
          title="Double-click to edit"
          className="mt-3 max-h-[220px] cursor-text overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/40 p-3 text-sm leading-relaxed text-white/75"
        >
          {value || "No prompt yet — approve at least one swapped frame."}
        </p>
      )}

      {overLimit && (
        <p className="mt-2 text-xs text-red-300">
          Too long for Seedance — remove {(count - maxCharacters).toLocaleString()} characters to
          generate.
        </p>
      )}

      {stale && mode === "manual" && (
        <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/5 p-3">
          <p className="text-xs text-amber-200">
            Inputs changed — your manual prompt has not been updated.
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onKeepManual}>
              Keep my prompt
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onRebuild}>
              Rebuild from FUSE
            </Button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {editing ? (
          <Button size="sm" className="h-7 text-xs" onClick={() => setEditing(false)}>
            Done editing
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => setEditing(true)}
          >
            Edit prompt
          </Button>
        )}
        {mode === "manual" && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-white/60"
            onClick={() => {
              onReset();
              setEditing(false);
            }}
          >
            Reset to FUSE prompt
          </Button>
        )}
      </div>

      <p className="mt-3 font-orbitron text-[10px] uppercase tracking-[0.18em] text-cyan-200/70">
        Seedance will use: {mode === "manual" ? "Manual prompt" : "FUSE auto director"}
      </p>
    </div>
  );
}
