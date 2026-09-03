/**
 * TEMPLATE PRODUCT PAGE — hero media.
 *
 * Autoplays muted + inline + looping (never with sound), and exposes explicit
 * play/pause, mute and replay controls. Poster shows while the video loads.
 * Falls back to a still image when the hero is not a video, and to a designed
 * placeholder when media is missing or fails.
 */

import { useEffect, useRef, useState } from "react";
import { ImageOff, Maximize2, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

type HeroMedia = {
  media_type: "image" | "video";
  url: string;
  poster_url: string | null;
};

function Placeholder({ label }: { label?: string | null }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[linear-gradient(180deg,hsl(var(--navy-mid)/0.9),hsl(var(--navy-deep)))] text-slate-500">
      <ImageOff className="h-7 w-7" aria-hidden />
      <p className="font-mono text-[9px] uppercase tracking-[0.24em]">
        {label || "Preview unavailable"}
      </p>
    </div>
  );
}

function ControlButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-full border border-white/15 bg-black/55 p-2 text-white/85 backdrop-blur transition hover:border-cyan-300/60 hover:text-white"
    >
      {children}
    </button>
  );
}

export default function TemplateHeroVideo({
  media,
  name,
  onExpand,
  className,
}: {
  media: HeroMedia | null;
  name: string;
  onExpand?: () => void;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setFailed(false);
    setReady(false);
    setPaused(false);
  }, [media?.url]);

  const isVideo = media?.media_type === "video" && !failed;

  useEffect(() => {
    const node = videoRef.current;
    if (!node || !isVideo) return;
    node.muted = true;
    void node.play().catch(() => setPaused(true));
  }, [isVideo, media?.url]);

  const toggle = () => {
    const node = videoRef.current;
    if (!node) return;
    if (node.paused) {
      void node.play().catch(() => undefined);
      setPaused(false);
    } else {
      node.pause();
      setPaused(true);
    }
  };

  const replay = () => {
    const node = videoRef.current;
    if (!node) return;
    node.currentTime = 0;
    void node.play().catch(() => undefined);
    setPaused(false);
  };

  const toggleMute = () => {
    const node = videoRef.current;
    if (!node) return;
    const next = !node.muted;
    node.muted = next;
    setMuted(next);
  };

  return (
    <div
      className={cn(
        "relative aspect-[9/16] w-full overflow-hidden rounded-[18px] border bg-black",
        "border-[hsl(var(--electric-blue)/0.3)] shadow-[0_50px_120px_-60px_hsl(var(--electric-blue)/0.7)]",
        className,
      )}
    >
      {!media || (failed && media.media_type === "video" && !media.poster_url) ? (
        <Placeholder />
      ) : isVideo ? (
        <>
          {!ready ? <div className="absolute inset-0 animate-pulse bg-white/[0.05]" /> : null}
          <video
            ref={videoRef}
            src={media.url}
            poster={media.poster_url ?? undefined}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label={`${name} campaign preview`}
            onLoadedData={() => setReady(true)}
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
          />
        </>
      ) : (
        <img
          src={media.poster_url ?? media.url}
          alt={`${name} campaign preview`}
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/80 to-transparent" />

      <div className="absolute bottom-3 left-3 flex items-center gap-2">
        {isVideo ? (
          <>
            <ControlButton onClick={toggle} label={paused ? "Play preview" : "Pause preview"}>
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </ControlButton>
            <ControlButton onClick={toggleMute} label={muted ? "Unmute preview" : "Mute preview"}>
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </ControlButton>
            <ControlButton onClick={replay} label="Replay preview">
              <RotateCcw className="h-4 w-4" />
            </ControlButton>
          </>
        ) : null}
      </div>

      {onExpand ? (
        <div className="absolute right-3 top-3">
          <ControlButton onClick={onExpand} label="Open fullscreen">
            <Maximize2 className="h-4 w-4" />
          </ControlButton>
        </div>
      ) : null}
    </div>
  );
}
