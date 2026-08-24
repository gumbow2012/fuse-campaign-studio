import PresetPreview from "./PresetPreview";
import { resolvePreviewMedia } from "@/lib/cinema/previewTypes";
import { useMemo, useState } from "react";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ConfigSource } from "@/lib/cinema/types";
import type {
  DirectorConfig,
  DirectorConfigField,
  MovementPreset,
} from "@/lib/cinema/types";
import {
  MOVEMENT_PRESETS,
  MOVEMENT_PRESET_CATEGORIES,
  type CinemaMovementPreset,
  type MovementPresetCategory,
} from "@/lib/cinema/presets/movementPresets";
import PresetLibrarySection from "./PresetLibrarySection";
import {
  MOVEMENT_LIBRARY,
  MOVEMENT_LIBRARY_CATEGORIES,
} from "@/lib/cinema/presets/libraryAdapters";
import type { PresetUpdateField } from "@/lib/cinema/presetLibrary";

export interface MovementPanelProps {
  config: DirectorConfig;
  /** Writes config[field] = { value, source: "USER" }. */
  updateField: <F extends DirectorConfigField>(
    field: F,
    value: DirectorConfig[F]["value"],
    source?: ConfigSource,
  ) => void;
  advanced: boolean;
}

const SPEEDS: MovementPreset["speed"][] = ["very-slow", "slow", "medium", "fast"];
const EASINGS: MovementPreset["easing"][] = ["linear", "ease-in", "ease-out", "ease-in-out"];
const TRACKINGS: MovementPreset["tracking"][] = ["none", "subject", "point-of-interest"];
const FOCUS_BEHAVIORS: MovementPreset["focusBehavior"][] = [
  "locked",
  "follow-focus",
  "rack",
  "breathing",
];
const END_BEHAVIORS: MovementPreset["endBehavior"][] = ["settle", "continue", "hard-cut"];

/**
 * Movement chip panel — writes DirectorConfig.movement as a COMPLETE
 * MovementPreset (envelope included) with source "USER".
 */
export default function MovementPanel({ config, updateField, advanced }: MovementPanelProps) {
  const movement = config.movement.value;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<MovementPresetCategory | "All">("All");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);

  const setMovement = (patch: Partial<MovementPreset>) =>
    updateField("movement", { ...movement, ...patch });

  const setEnvelope = (patch: Partial<MovementPreset["envelope"]>) =>
    updateField("movement", { ...movement, envelope: { ...movement.envelope, ...patch } });

  const applyPreset = (preset: CinemaMovementPreset) => {
    const value = preset.config.movement?.value;
    if (!value) return;
    // Full MovementPreset (envelope included) becomes a USER-sourced choice.
    updateField("movement", { ...value, envelope: { ...value.envelope } });
  };

  const toggleFavorite = (id: string) =>
    setFavorites((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MOVEMENT_PRESETS.filter((p) => {
      if (category !== "All" && p.category !== category) return false;
      if (favoritesOnly && !favorites.includes(p.id)) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [query, category, favoritesOnly, favorites]);

  const grouped = useMemo(
    () =>
      MOVEMENT_PRESET_CATEGORIES.map((cat) => ({
        category: cat,
        presets: filtered.filter((p) => p.category === cat),
      })).filter((g) => g.presets.length > 0),
    [filtered],
  );

  const isActive = (preset: CinemaMovementPreset) => {
    const value = preset.config.movement?.value;
    if (!value) return false;
    return (
      value.motionType === movement.motionType &&
      value.direction === movement.direction &&
      value.maxDegrees === movement.maxDegrees &&
      value.range === movement.range
    );
  };

  return (
    <ScrollArea className="max-h-[65vh] pr-3">
      <div className="space-y-6">
        <PresetLibrarySection
          type="movement"
          builtin={MOVEMENT_LIBRARY}
          categories={MOVEMENT_LIBRARY_CATEGORIES}
          config={config}
          updateField={updateField as unknown as PresetUpdateField}
          saveLabel="Save movement preset"
        />

        <div className="space-y-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search movements…"
          />
          <div className="flex flex-wrap gap-1.5">
            <Pill label="All" active={category === "All"} onClick={() => setCategory("All")} />
            {MOVEMENT_PRESET_CATEGORIES.map((cat) => (
              <Pill
                key={cat}
                label={cat}
                active={category === cat}
                onClick={() => setCategory(cat)}
              />
            ))}
            <Pill
              label={favoritesOnly ? "★ Favorites" : "☆ Favorites"}
              active={favoritesOnly}
              onClick={() => setFavoritesOnly((v) => !v)}
            />
          </div>
        </div>

        {grouped.length === 0 ? (
          <p className="text-sm text-muted-foreground">No movements match that filter.</p>
        ) : null}

        {grouped.map(({ category: cat, presets }) => (
          <div key={cat} className="space-y-2">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{cat}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {presets.map((preset) => (
                <div
                  key={preset.id}
                  className={cn(
                    "relative overflow-hidden rounded-xl border transition-all",
                    "border-border/70 bg-card/60 hover:border-primary/60",
                    isActive(preset) && "border-primary/80 ring-1 ring-primary/50",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="block w-full text-left"
                  >
                    <PresetPreview
                      media={resolvePreviewMedia({ category: "MOVEMENT", preset })}
                      alt={preset.name}
                    />
                    <div className="px-2.5 py-2">
                      <p className="font-display text-[11px] leading-tight text-foreground/90">
                        {preset.name}
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {preset.tags.slice(0, 2).join(" · ")}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label={
                      favorites.includes(preset.id) ? "Remove from favorites" : "Add to favorites"
                    }
                    onClick={() => toggleFavorite(preset.id)}
                    className="absolute right-1.5 top-1.5 rounded-md bg-background/70 p-1 backdrop-blur"
                  >
                    <Star
                      className={cn(
                        "h-3 w-3",
                        favorites.includes(preset.id)
                          ? "fill-primary text-primary"
                          : "text-muted-foreground",
                      )}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}

        <Separator className="bg-border/60" />

        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Current Movement
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">{movement.motionType}</Badge>
            <Badge variant="outline">{movement.speed}</Badge>
            <Badge variant="outline">{movement.maxDegrees}°</Badge>
            <Badge variant="outline">envelope ≤ {movement.envelope.maxOrbit}°</Badge>
          </div>
          {movement.envelope.geometryRequirements.length > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Requires: {movement.envelope.geometryRequirements.join(", ")}
            </p>
          ) : null}
        </div>

        {advanced ? (
          <>
            <Separator className="bg-border/60" />
            <section className="space-y-5">
              <div>
                <h3 className="font-display text-xs uppercase tracking-[0.2em]">
                  Advanced Movement
                </h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Raw controls for the selected movement.
                </p>
              </div>

              <OptionRow
                label="Speed"
                options={SPEEDS}
                value={movement.speed}
                onChange={(v) => setMovement({ speed: v })}
              />
              <NumberSlider
                label="Range"
                value={movement.range}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => setMovement({ range: v })}
              />
              <NumberSlider
                label="Max Degrees"
                value={movement.maxDegrees}
                min={0}
                max={360}
                step={1}
                onChange={(v) =>
                  // Never allowed to exceed the movement's own envelope ceiling.
                  setMovement({ maxDegrees: Math.min(v, movement.envelope.maxOrbit || v) })
                }
              />
              <OptionRow
                label="Easing"
                options={EASINGS}
                value={movement.easing}
                onChange={(v) => setMovement({ easing: v })}
              />
              <OptionRow
                label="Tracking"
                options={TRACKINGS}
                value={movement.tracking}
                onChange={(v) => setMovement({ tracking: v })}
              />
              <NumberSlider
                label="Parallax"
                value={movement.parallax}
                min={0}
                max={100}
                step={1}
                onChange={(v) => setMovement({ parallax: v })}
              />
              <NumberSlider
                label="Roll"
                value={movement.roll}
                min={-180}
                max={180}
                step={1}
                onChange={(v) => setMovement({ roll: v })}
              />
              <NumberSlider
                label="Height Change"
                value={movement.heightChange}
                min={-100}
                max={100}
                step={1}
                onChange={(v) => setMovement({ heightChange: v })}
              />
              <OptionRow
                label="Focus Behavior"
                options={FOCUS_BEHAVIORS}
                value={movement.focusBehavior}
                onChange={(v) => setMovement({ focusBehavior: v })}
              />
              <OptionRow
                label="End Behavior"
                options={END_BEHAVIORS}
                value={movement.endBehavior}
                onChange={(v) => setMovement({ endBehavior: v })}
              />

              <div className="space-y-3 rounded-xl border border-border/60 bg-background/40 p-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Envelope
                </p>
                <NumberSlider
                  label="Max Orbit (hard ceiling)"
                  value={movement.envelope.maxOrbit}
                  min={0}
                  max={360}
                  step={1}
                  onChange={(v) =>
                    updateField("movement", {
                      ...movement,
                      maxDegrees: Math.min(movement.maxDegrees, v),
                      envelope: { ...movement.envelope, maxOrbit: v },
                    })
                  }
                />
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    Geometry Requirements
                  </p>
                  <Input
                    value={movement.envelope.geometryRequirements.join(", ")}
                    onChange={(e) =>
                      setEnvelope({
                        geometryRequirements: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="comma separated"
                  />
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </ScrollArea>
  );
}

function Pill({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-2.5 py-1 text-[11px] transition-colors",
        "border-border/70 bg-card/60 text-foreground/80 hover:border-primary/60",
        active && "border-primary/80 bg-primary/10 text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function OptionRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <Pill
            key={option}
            label={option}
            active={value === option}
            onClick={() => onChange(option)}
          />
        ))}
      </div>
    </div>
  );
}

function NumberSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        <span className="text-[11px] text-foreground/70">
          {step < 1 ? value.toFixed(2) : Math.round(value)}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}
