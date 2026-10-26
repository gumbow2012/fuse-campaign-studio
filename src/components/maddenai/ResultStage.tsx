import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Maximize2, Pause, Play, RefreshCw, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";

import { OptionCycler, Ps2Glyph, ps2Button, ps2Ghost, ps2Well } from "@/components/maddenai/ps2";
import {
  COLOR_PRESETS,
  DEFAULT_ADJUSTMENTS,
  GRAIN_PRESETS,
  applyColorPreset,
  applyGrainPreset,
  buildRenderSpec,
  type Adjustments,
  type ColorPresetId,
  type GrainPresetId,
} from "@/services/editorAdjustments";
import { campaignExport, type ExportStatus } from "@/services/videoExport/exportClient";

/**
 * MADDEN AI result screen: a PSP-style handheld player (no CRT over the
 * picture, just glow around it) plus an editor with the clip breakdown
 * (each styled frame, redo + re-render) and trim / look / export using the
 * same in-browser export engine as the campaign editor.
 */

export type BreakdownFrame = {
  index: number;
  time: number;
  source: string | null;
  styled: string | null;
  live: boolean;
  failed: boolean;
};

type Tab = "clips" | "trim" | "look" | "export";
const TABS: { key: Tab; label: string }[] = [
  { key: "clips", label: "Clips" },
  { key: "trim", label: "Trim" },
  { key: "look", label: "Look" },
  { key: "export", label: "Export" },
];

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** The four-button cluster used as the "edit" mark. */
function ButtonCluster({ size = 28 }: { size?: number }) {
  const cell = size / 2.6;
  const dot = (glyph: string, color: string, x: number, y: number) => (
    <span
      className="absolute grid place-items-center rounded-full border border-white/30 bg-[radial-gradient(circle_at_35%_30%,#3a4466,#0b1024)] leading-none"
      style={{ width: cell, height: cell, left: x, top: y, color, fontSize: cell * 0.55 }}
    >
      {glyph}
    </span>
  );
  const mid = (size - cell) / 2;
  return (
    <span aria-hidden className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      {dot("△", "#7FF0C8", mid, 0)}
      {dot("○", "#FF8C9A", size - cell, mid)}
      {dot("✕", "#9FC7FF", mid, size - cell)}
      {dot("□", "#F2A7FF", 0, mid)}
    </span>
  );
}

function FaceButton({ glyph, label, onClick, color }: { glyph: string; label: string; onClick: () => void; color: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-11 w-11 place-items-center rounded-full border border-white/25 bg-[radial-gradient(circle_at_35%_30%,#2b3354,#070b1a)] text-lg leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_6px_14px_-6px_rgba(0,0,0,0.9)] transition hover:brightness-125 active:translate-y-px"
      style={{ color }}
    >
      {glyph}
    </button>
  );
}

function Slider({ label, value, min, max, step = 1, onChange, suffix = "" }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <label className="block">
      <span className="flex justify-between font-display text-[10px] font-bold uppercase tracking-[0.18em] text-sky-100/70">
        <span>{label}</span>
        <span className="tabular-nums text-white">{value}{suffix}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1.5 w-full accent-sky-400" />
    </label>
  );
}

export default function ResultStage({
  videoUrl,
  breakdown,
  onRedoFrame,
  onRerender,
  rerenderCredits,
  frameCredits,
  rerenderDisabled,
}: {
  videoUrl: string;
  breakdown: BreakdownFrame[];
  onRedoFrame: (index: number) => void;
  onRerender: () => void;
  rerenderCredits: number;
  frameCredits: number;
  rerenderDisabled: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<Tab>("clips");
  const [adjust, setAdjust] = useState<Adjustments>(DEFAULT_ADJUSTMENTS);
  const [trim, setTrim] = useState<[number, number]>([0, 0]);
  const [exportStatus, setExportStatus] = useState<ExportStatus | null>(null);

  const spec = useMemo(() => buildRenderSpec(adjust), [adjust]);
  const [inPoint, outPoint] = [trim[0], trim[1] || duration];

  useEffect(() => {
    const unsubscribe = campaignExport.subscribe(setExportStatus);
    return () => void unsubscribe();
  }, []);
  useEffect(() => {
    setAdjust(DEFAULT_ADJUSTMENTS);
    setTrim([0, 0]);
  }, [videoUrl]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  };
  const seek = (t: number) => {
    if (video.current) video.current.currentTime = Math.min(Math.max(t, inPoint), outPoint || t);
  };
  const download = () => window.open(videoUrl, "_blank", "noopener");

  const exportEdit = () => {
    if (!duration) return;
    campaignExport.start(
      [
        {
          id: `maddenai-${Date.now()}`,
          url: videoUrl,
          trim_start_ms: Math.round(inPoint * 1000),
          trim_end_ms: Math.round(outPoint * 1000),
          muted: false,
          volume: 1,
          render: spec,
          timelineOffsetMs: 0,
        },
      ],
      {
        width: even(video.current?.videoWidth || 1080),
        height: even(video.current?.videoHeight || 1920),
        fps: 30,
        aspectRatio: "9:16",
        videoBitrate: 10_000_000,
        audioBitrate: 192_000,
        codec: "h264",
        removeAudio: false,
        loop: false,
        textLayers: [],
        textSignature: "",
        imageLayers: [],
      },
      "madden-ai-edit",
    );
  };
  const exporting = exportStatus?.phase === "preparing" || exportStatus?.phase === "rendering";
  useEffect(() => {
    if (exportStatus?.phase === "error" || exportStatus?.phase === "unsupported") toast.error(exportStatus.error ?? "Couldn't export the edit");
  }, [exportStatus?.phase, exportStatus?.error]);

  return (
    <div className="flex h-full flex-col items-center gap-5 p-4 sm:p-6">
      <p className="crt-text font-display text-xl font-black uppercase tracking-[0.12em] text-white sm:text-2xl">Outfit unlocked</p>

      {/* PSP-style handheld */}
      <div className="relative flex w-full max-w-[760px] items-center justify-center gap-4 rounded-[44px] border border-white/10 bg-[linear-gradient(180deg,#1a1f2e_0%,#0a0d17_45%,#05070d_100%)] px-4 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(0,0,0,0.6),0_30px_80px_-30px_rgba(77,168,255,0.7)] sm:gap-6 sm:px-8">
        {/* D-pad: seek */}
        <div className="hidden flex-col items-center gap-3 sm:flex">
          <div className="relative h-24 w-24">
            {[
              { k: "up", cls: "left-1/2 top-0 -translate-x-1/2", label: "▲", act: () => seek(inPoint) },
              { k: "down", cls: "left-1/2 bottom-0 -translate-x-1/2", label: "▼", act: () => seek(outPoint - 0.05) },
              { k: "left", cls: "left-0 top-1/2 -translate-y-1/2", label: "◀", act: () => seek((video.current?.currentTime ?? 0) - 1) },
              { k: "right", cls: "right-0 top-1/2 -translate-y-1/2", label: "▶", act: () => seek((video.current?.currentTime ?? 0) + 1) },
            ].map((b) => (
              <button key={b.k} type="button" onClick={b.act} aria-label={`D-pad ${b.k}`} className={`absolute grid h-8 w-8 place-items-center rounded-md border border-white/15 bg-[linear-gradient(180deg,#2a3042,#10131e)] text-[10px] text-sky-100/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] hover:text-white ${b.cls}`}>
                {b.label}
              </button>
            ))}
          </div>
          <span className="font-display text-[8px] font-bold uppercase tracking-[0.25em] text-white/30">Seek</span>
        </div>

        {/* screen — no CRT here, glow around it only */}
        <div className="flex min-w-0 flex-col items-center gap-2">
          <div
            ref={screen}
            className="relative overflow-hidden rounded-xl border-[3px] border-[#0f1424] bg-black shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_0_42px_-6px_rgba(77,168,255,0.85)]"
          >
            <video
              ref={video}
              src={videoUrl}
              autoPlay
              loop
              muted={muted}
              playsInline
              onClick={toggle}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
              onTimeUpdate={(e) => {
                const t = e.currentTarget.currentTime;
                if (outPoint && t >= outPoint) e.currentTarget.currentTime = inPoint;
                else if (t < inPoint) e.currentTarget.currentTime = inPoint;
                setTime(e.currentTarget.currentTime);
              }}
              className="block max-h-[min(56vh,520px)] w-auto cursor-pointer"
              style={{ filter: spec.filter }}
            />
          </div>
          {/* transport */}
          <div className="flex w-full items-center gap-2 px-1">
            <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="text-sky-100 hover:text-white">
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.01}
              value={time}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label="Seek"
              className="min-w-0 flex-1 accent-sky-400"
            />
            <span className="font-display text-[10px] tabular-nums text-sky-100/70">{fmt(time)} / {fmt(duration)}</span>
            <button type="button" onClick={() => setMuted((m) => !m)} aria-label={muted ? "Unmute" : "Mute"} className="text-sky-100 hover:text-white">
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <button type="button" onClick={() => void screen.current?.requestFullscreen?.()} aria-label="Fullscreen" className="text-sky-100 hover:text-white">
              <Maximize2 size={15} />
            </button>
          </div>
          <span className="font-display text-[9px] font-black uppercase tracking-[0.5em] text-white/25">Madden · AI</span>
        </div>

        {/* face buttons */}
        <div className="hidden flex-col items-center gap-3 sm:flex">
          <div className="grid grid-cols-3 grid-rows-3 place-items-center">
            <span />
            <FaceButton glyph="△" label="Edit" color="#7FF0C8" onClick={() => setEditing((e) => !e)} />
            <span />
            <FaceButton glyph="□" label="Download" color="#F2A7FF" onClick={download} />
            <span />
            <FaceButton glyph="○" label={muted ? "Unmute" : "Mute"} color="#FF8C9A" onClick={() => setMuted((m) => !m)} />
            <span />
            <FaceButton glyph="✕" label={playing ? "Pause" : "Play"} color="#9FC7FF" onClick={toggle} />
            <span />
          </div>
          <span className="font-display text-[8px] font-bold uppercase tracking-[0.25em] text-white/30">△ Edit · □ Save</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={() => setEditing((e) => !e)} className={`${editing ? ps2Button : ps2Ghost} px-5`}>
          <ButtonCluster size={22} /> {editing ? "Close editor" : "Edit"}
        </button>
        <button type="button" onClick={download} className={`${ps2Ghost} px-5`}>
          <Ps2Glyph glyph="□" className="h-5 w-5 text-[10px]" /> Download
        </button>
      </div>

      {editing ? (
        <div className={`${ps2Well} w-full max-w-[760px] p-4`}>
          <div className="flex items-center gap-1 overflow-x-auto">
            <span className="mr-1 font-display text-[9px] font-bold uppercase tracking-[0.2em] text-sky-100/40">L1</span>
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`rounded-lg border px-3 py-1.5 font-display text-[11px] font-bold uppercase tracking-[0.16em] ${
                  tab === t.key ? "border-sky-200/60 bg-sky-400/20 text-white shadow-[0_0_14px_rgba(77,168,255,0.5)]" : "border-transparent text-sky-100/60 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
            <span className="ml-1 font-display text-[9px] font-bold uppercase tracking-[0.2em] text-sky-100/40">R1</span>
          </div>

          <div className="mt-4">
            {tab === "clips" ? (
              breakdown.length ? (
                <>
                  <p className="text-xs text-sky-100/60">The styled moments this video was built from. Redo any that look off (≈{frameCredits} cr), then re-render.</p>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {breakdown.map((f) => (
                      <div key={f.index} className="rounded-xl border border-sky-300/20 bg-[#030c2c]/80 p-2">
                        <div className="flex items-center justify-between font-display text-[10px] font-bold uppercase tracking-[0.16em] text-sky-100/70">
                          <span>Clip {f.index + 1}</span>
                          <span className="tabular-nums">{fmt(f.time)}</span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-1">
                          <div className="aspect-[9/16] overflow-hidden rounded-md bg-black/40">
                            {f.source ? <img src={f.source} alt="Original frame" className="h-full w-full object-cover opacity-70" /> : null}
                          </div>
                          <div className="grid aspect-[9/16] place-items-center overflow-hidden rounded-md bg-black/40">
                            {f.live ? <Loader2 size={14} className="animate-spin text-sky-200" /> : f.styled ? <img src={f.styled} alt="Styled frame" className="h-full w-full object-cover" /> : <span className="text-[10px] text-sky-100/50">{f.failed ? "Failed" : "—"}</span>}
                          </div>
                        </div>
                        <button type="button" disabled={f.live} onClick={() => onRedoFrame(f.index)} className={`${ps2Ghost} mt-2 w-full px-2 py-1.5 text-[10px]`}>
                          <RefreshCw size={12} /> Redo
                        </button>
                      </div>
                    ))}
                  </div>
                  <button type="button" disabled={rerenderDisabled} onClick={onRerender} className={`${ps2Button} mt-4 w-full`}>
                    <Ps2Glyph /> Re-render video · ≈ {rerenderCredits} credits
                  </button>
                </>
              ) : (
                <p className="text-sm text-sky-100/60">The clip breakdown is available for videos you make in this session. Trim, look and export work on any video.</p>
              )
            ) : tab === "trim" ? (
              <div className="space-y-4">
                <Slider label="Start" value={Number(inPoint.toFixed(1))} min={0} max={Math.max(0.1, (outPoint || duration) - 0.5)} step={0.1} suffix="s" onChange={(v) => setTrim([v, trim[1] || duration])} />
                <Slider label="End" value={Number((outPoint || duration).toFixed(1))} min={Math.min(duration, inPoint + 0.5)} max={duration || 1} step={0.1} suffix="s" onChange={(v) => setTrim([trim[0], v])} />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setTrim([video.current?.currentTime ?? 0, trim[1] || duration])} className={`${ps2Ghost} flex-1 px-2 py-2 text-[10px]`}>Set start here</button>
                  <button type="button" onClick={() => setTrim([trim[0], video.current?.currentTime ?? duration])} className={`${ps2Ghost} flex-1 px-2 py-2 text-[10px]`}>Set end here</button>
                  <button type="button" onClick={() => setTrim([0, 0])} className={`${ps2Ghost} px-3 py-2 text-[10px]`}>Reset</button>
                </div>
                <p className="text-xs text-sky-100/50">Length {fmt(Math.max(0, (outPoint || duration) - inPoint))}</p>
              </div>
            ) : tab === "look" ? (
              <div className="space-y-4">
                <div>
                  <p className="mb-1.5 font-display text-[10px] font-bold uppercase tracking-[0.18em] text-sky-100/70">Color</p>
                  <OptionCycler
                    label="Color preset"
                    options={COLOR_PRESETS.filter((p) => p.id !== "match").map((p) => ({ label: p.label, value: p.id }))}
                    value={adjust.color.preset ?? "original"}
                    onChange={(id) => setAdjust((a) => ({ ...a, color: applyColorPreset(a.color, id as ColorPresetId) }))}
                  />
                </div>
                <div>
                  <p className="mb-1.5 font-display text-[10px] font-bold uppercase tracking-[0.18em] text-sky-100/70">Grain <span className="normal-case tracking-normal text-sky-100/40">(shows in the export)</span></p>
                  <OptionCycler
                    label="Grain preset"
                    options={GRAIN_PRESETS.map((p) => ({ label: p.label, value: p.id }))}
                    value={adjust.grain.preset ?? "none"}
                    onChange={(id) => setAdjust((a) => ({ ...a, grain: applyGrainPreset(a.grain, id as GrainPresetId) }))}
                  />
                </div>
                <Slider label="Exposure" value={adjust.color.exposure} min={-100} max={100} onChange={(v) => setAdjust((a) => ({ ...a, color: { ...a.color, exposure: v } }))} />
                <Slider label="Contrast" value={adjust.color.contrast} min={-100} max={100} onChange={(v) => setAdjust((a) => ({ ...a, color: { ...a.color, contrast: v } }))} />
                <Slider label="Saturation" value={adjust.color.saturation} min={-100} max={100} onChange={(v) => setAdjust((a) => ({ ...a, color: { ...a.color, saturation: v } }))} />
                <button type="button" onClick={() => setAdjust(DEFAULT_ADJUSTMENTS)} className={`${ps2Ghost} w-full px-2 py-2 text-[10px]`}>Reset look</button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-sky-100/70">
                  Renders your trim and look into a new MP4 right in your browser. No credits used.
                </p>
                {exporting ? (
                  <div>
                    <div className="h-2 overflow-hidden rounded-full border border-sky-300/30 bg-[#020a24]">
                      <div className="h-full bg-[linear-gradient(90deg,#3C8CFF,#7CE3FF)] transition-all" style={{ width: `${Math.round(exportStatus?.progress ?? 0)}%` }} />
                    </div>
                    <p className="mt-2 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-sky-100/55">{exportStatus?.stage || "Rendering"}…</p>
                  </div>
                ) : (
                  <button type="button" onClick={exportEdit} disabled={!duration} className={`${ps2Button} w-full`}>
                    <Ps2Glyph /> Export edit
                  </button>
                )}
                {exportStatus?.phase === "done" ? <p className="text-xs text-sky-200">Saved to your downloads.</p> : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
