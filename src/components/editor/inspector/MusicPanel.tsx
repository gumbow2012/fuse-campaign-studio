import { useRef } from "react";
import { Loader2, Music2, Repeat, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdjustSlider, OptionRow, ToggleChip } from "./AdjustControls";
import { formatSeconds } from "@/services/campaignEditor";
import { MUSIC_ACCEPT, type MusicFillMode, type MusicTrack } from "@/services/editorMusic";

/** Background music track — upload, trim, level and fill mode. */
export default function MusicPanel({
  music,
  uploading,
  error,
  onUpload,
  onPatch,
  onRemove,
  durationMs,
}: {
  music: MusicTrack | null;
  uploading: boolean;
  error: string | null;
  onUpload: (file: File) => void;
  onPatch: (patch: Partial<MusicTrack>, options?: { label?: string }) => void;
  onRemove: () => void;
  durationMs: number;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-[11px] uppercase tracking-[0.18em] text-white">Music</h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="h-8 border-white/15 bg-white/[0.03] text-[11px] text-slate-200"
        >
          {uploading ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="mr-1 h-3.5 w-3.5" />
          )}
          {music ? "Replace" : "Add music"}
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={MUSIC_ACCEPT}
        aria-label="Upload music"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onUpload(file);
        }}
      />

      {error ? <p className="text-[11px] text-rose-300">{error}</p> : null}

      {!music ? (
        <p className="text-[11px] leading-relaxed text-slate-500">
          MP3, WAV, M4A or AAC. Only upload music you have the rights to use.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-2">
            <Music2 className="h-4 w-4 shrink-0 text-emerald-200" />
            <span className="truncate text-[11px] text-emerald-50">{music.name}</span>
            <span className="ml-auto shrink-0 font-mono text-[10px] text-emerald-200/80">
              {formatSeconds(music.clipEndMs - music.clipStartMs)}
            </span>
          </div>

          <AdjustSlider
            label="Level"
            value={music.volume}
            min={0}
            max={1.5}
            step={0.05}
            onChange={(value) => onPatch({ volume: value })}
            onCommit={(value) => onPatch({ volume: value }, { label: "music level" })}
          />
          <AdjustSlider
            label="Duck under speech"
            value={music.duck}
            min={0}
            max={100}
            suffix="%"
            onChange={(value) => onPatch({ duck: value })}
            onCommit={(value) => onPatch({ duck: value }, { label: "music ducking" })}
          />
          <AdjustSlider
            label="Fade in"
            value={music.fadeInMs}
            min={0}
            max={10000}
            step={100}
            suffix="ms"
            onChange={(value) => onPatch({ fadeInMs: value })}
            onCommit={(value) => onPatch({ fadeInMs: value }, { label: "music fade in" })}
          />
          <AdjustSlider
            label="Fade out"
            value={music.fadeOutMs}
            min={0}
            max={10000}
            step={100}
            suffix="ms"
            onChange={(value) => onPatch({ fadeOutMs: value })}
            onCommit={(value) => onPatch({ fadeOutMs: value }, { label: "music fade out" })}
          />
          <AdjustSlider
            label="Start on timeline"
            value={music.startMs}
            min={0}
            max={Math.max(1000, durationMs)}
            step={100}
            suffix="ms"
            onChange={(value) => onPatch({ startMs: value })}
            onCommit={(value) => onPatch({ startMs: value }, { label: "music start" })}
          />
          <AdjustSlider
            label="Song start"
            value={music.clipStartMs}
            min={0}
            max={Math.max(500, music.clipEndMs - 500)}
            step={100}
            suffix="ms"
            onChange={(value) => onPatch({ clipStartMs: value })}
            onCommit={(value) => onPatch({ clipStartMs: value }, { label: "music trim" })}
          />
          <AdjustSlider
            label="Song end"
            value={music.clipEndMs}
            min={music.clipStartMs + 500}
            max={Math.max(music.clipStartMs + 1000, music.sourceDurationMs || durationMs)}
            step={100}
            suffix="ms"
            onChange={(value) => onPatch({ clipEndMs: value })}
            onCommit={(value) => onPatch({ clipEndMs: value }, { label: "music trim" })}
          />
          <OptionRow<MusicFillMode>
            label="Fill"
            columns={3}
            value={music.mode}
            onChange={(id) => onPatch({ mode: id }, { label: "music fill" })}
            options={[
              { id: "trim", label: "Trim to video" },
              { id: "loop", label: "Loop to fill" },
              { id: "natural", label: "End naturally" },
            ]}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <ToggleChip
              label={music.muted ? "Muted" : "Mute"}
              active={music.muted}
              onToggle={() => onPatch({ muted: !music.muted }, { label: "music mute" })}
            />
            <ToggleChip
              label="Loop"
              active={music.mode === "loop"}
              onToggle={() => onPatch({ mode: music.mode === "loop" ? "trim" : "loop" }, { label: "music loop" })}
            />
            <button
              type="button"
              onClick={onRemove}
              className="ml-auto flex items-center gap-1 text-[11px] text-slate-400 transition-colors hover:text-rose-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
          </div>
          <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-slate-500">
            <Repeat className="mt-0.5 h-3 w-3 shrink-0" />
            Only upload music you have the rights to use. Music is included in the preview and the export.
          </p>
        </>
      )}
    </div>
  );
}
