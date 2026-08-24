import { memo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { TEMPO_PROFILES, type TempoProfile } from "@/lib/cinema/tempoProfiles";

/**
 * Tempo / pacing as a VISUAL system. Pure CSS/SVG schematics — segments are
 * visual beats (cuts), the travelling bar is camera energy. No generated media,
 * no provider calls, no credits.
 *
 * Selecting a card writes config.filmSetup.tempo with source "USER".
 */

export interface TempoPanelProps {
  value?: string;
  onSelect: (tempo: string) => void;
  /** Compact grid for embedding inside the Film Setup panel. */
  embedded?: boolean;
}

export default function TempoPanel({ value, onSelect, embedded }: TempoPanelProps) {
  const grid = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {TEMPO_PROFILES.map((profile) => (
        <TempoCard
          key={profile.value}
          profile={profile}
          active={value === profile.value}
          onSelect={onSelect}
        />
      ))}
    </div>
  );

  const note = (
    <p className="text-[10px] leading-relaxed text-muted-foreground">
      Timing strips are schematic guides for a 10-second clip. Exact cut behavior is
      provider/model dependent — tempo compiles into prompt language, not a native
      edit list.
    </p>
  );

  if (embedded) {
    return (
      <div className="space-y-3">
        {grid}
        {note}
      </div>
    );
  }

  return (
    <ScrollArea className="h-[62vh] pr-3">
      <div className="space-y-4 text-foreground">
        {grid}
        {note}
      </div>
    </ScrollArea>
  );
}

const TempoCard = memo(function TempoCard({
  profile,
  active,
  onSelect,
}: {
  profile: TempoProfile;
  active: boolean;
  onSelect: (tempo: string) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onSelect(profile.value)}
      className={cn(
        "group flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
        active
          ? "border-primary/70 bg-primary/10"
          : "border-border/60 bg-background/40 hover:border-border",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-xs uppercase tracking-[0.18em] text-foreground">
          {profile.value}
        </span>
        <span className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
          {profile.band}
        </span>
      </div>

      <TempoStrip profile={profile} active={active} />

      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
        <span>
          {profile.beatsPer10s === 1 ? "no cuts" : `${profile.beatsPer10s} beats / 10s`}
        </span>
        <span>~{profile.avgShotSeconds}s shots</span>
        <span>energy {profile.cameraEnergy}</span>
        <span>motion {profile.motionIntensity}</span>
      </div>

      <p className="text-[10px] leading-relaxed text-muted-foreground">{profile.summary}</p>
    </button>
  );
});

/** Segments = visual beats/cuts. Travelling bar speed = camera energy. */
function TempoStrip({ profile, active }: { profile: TempoProfile; active: boolean }) {
  const segments = Math.max(1, profile.beatsPer10s);
  // Faster energy => shorter sweep duration.
  const sweepSeconds = Math.max(1.2, 8 - (profile.cameraEnergy / 100) * 6.4);

  return (
    <div className="space-y-1.5" aria-hidden="true">
      <div className="flex gap-[2px]">
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-2 flex-1 rounded-sm",
              active ? "bg-primary/70" : "bg-foreground/25 group-hover:bg-foreground/40",
            )}
          />
        ))}
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-foreground/10">
        <div
          className={cn(
            "absolute inset-y-0 w-1/3 rounded-full",
            active ? "bg-primary" : "bg-foreground/40",
          )}
          style={{
            animation: `cinema-tempo-sweep ${sweepSeconds}s ease-in-out infinite alternate`,
          }}
        />
      </div>
      <div className="flex justify-between text-[8px] uppercase tracking-[0.18em] text-muted-foreground">
        <span>0s</span>
        <span>10s</span>
      </div>
      <style>{`@keyframes cinema-tempo-sweep { from { transform: translateX(0%); } to { transform: translateX(200%); } }`}</style>
    </div>
  );
}
