import PresetPreview from "./PresetPreview";
import { resolvePreviewMedia } from "@/lib/cinema/previewTypes";
import CompareView, { CompareDialog, useCompareSelection } from "./CompareView";
import { useMemo, useState } from "react";
import { ArrowLeftRight, Plus, Star, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  CinemaLight,
  ConfigSource,
  CinemaLightType,
  DirectorConfig,
  DirectorConfigField,
  LightingSetup,
} from "@/lib/cinema/types";
import {
  CINEMA_LIGHT_TYPES,
  LIGHTING_PRESETS,
  LIGHTING_PRESET_CATEGORIES,
  LIGHT_FALLOFFS,
  LIGHT_HEIGHTS,
  makeLight,
  type CinemaLightingPreset,
  type LightingPresetCategory,
} from "@/lib/cinema/presets/lightingPresets";
import PresetLibrarySection from "./PresetLibrarySection";
import {
  LIGHTING_LIBRARY,
  LIGHTING_LIBRARY_CATEGORIES,
} from "@/lib/cinema/presets/libraryAdapters";
import type { PresetUpdateField } from "@/lib/cinema/presetLibrary";

export interface LightingPanelProps {
  config: DirectorConfig;
  /** Writes config[field] = { value, source: "USER" }. */
  updateField: <F extends DirectorConfigField>(
    field: F,
    value: DirectorConfig[F]["value"],
    source?: ConfigSource,
  ) => void;
  advanced: boolean;
}

/**
 * Lighting chip panel — library selection and a manual rig builder.
 * Both paths write DirectorConfig.lighting with source "USER".
 */
export default function LightingPanel({ config, updateField }: LightingPanelProps) {
  const lighting = config.lighting.value;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<LightingPresetCategory | "All">("All");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);

  const setLighting = (patch: Partial<LightingSetup>) =>
    updateField("lighting", { ...lighting, ...patch });

  const setLights = (lights: CinemaLight[]) => setLighting({ lights });

  const applyPreset = (preset: CinemaLightingPreset) => {
    const value = preset.config.lighting?.value;
    if (!value) return;
    updateField("lighting", {
      ...value,
      lights: value.lights.map((light) => ({ ...light })),
    });
  };

  const toggleFavorite = (id: string) =>
    setFavorites((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));

  const addLight = () => {
    const id = `light-${lighting.lights.length + 1}-${Math.random().toString(36).slice(2, 6)}`;
    setLights([...lighting.lights, makeLight(id, "softbox")]);
  };

  const removeLight = (id: string) =>
    setLights(lighting.lights.filter((light) => light.id !== id));

  const patchLight = (id: string, patch: Partial<CinemaLight>) =>
    setLights(lighting.lights.map((light) => (light.id === id ? { ...light, ...patch } : light)));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LIGHTING_PRESETS.filter((p) => {
      if (category !== "All" && p.category !== category) return false;
      if (favoritesOnly && !favorites.includes(p.id)) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.illuminationStyle.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [query, category, favoritesOnly, favorites]);

  const grouped = useMemo(
    () =>
      LIGHTING_PRESET_CATEGORIES.map((cat) => ({
        category: cat,
        presets: filtered.filter((p) => p.category === cat),
      })).filter((g) => g.presets.length > 0),
    [filtered],
  );

  const isActive = (preset: CinemaLightingPreset) => {
    const value = preset.config.lighting?.value;
    if (!value) return false;
    if (value.lights.length !== lighting.lights.length) return false;
    return value.mood === lighting.mood && value.ratio === lighting.ratio;
  };

  return (
    <ScrollArea className="max-h-[65vh] pr-3">
      <div className="space-y-6">
        <PresetLibrarySection
          type="lighting"
          builtin={LIGHTING_LIBRARY}
          categories={LIGHTING_LIBRARY_CATEGORIES}
          config={config}
          updateField={updateField as unknown as PresetUpdateField}
          saveLabel="Save lighting preset"
        />

        <Separator className="bg-border/60" />

        {/* ------------------------------ LIBRARY ------------------------------ */}
        <div className="space-y-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search lighting…"
          />
          <div className="flex flex-wrap gap-1.5">
            <Pill label="All" active={category === "All"} onClick={() => setCategory("All")} />
            {LIGHTING_PRESET_CATEGORIES.map((cat) => (
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
          <p className="text-sm text-muted-foreground">No lighting presets match that filter.</p>
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
                      media={resolvePreviewMedia({ category: "LIGHTING", preset })}
                      alt={preset.name}
                    />
                    <div className="space-y-1 px-2.5 py-2">
                      <p className="font-display text-[11px] leading-tight text-foreground/90">
                        {preset.name}
                      </p>
                      <p className="text-[10px] leading-snug text-muted-foreground">
                        {preset.illuminationStyle}
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground/70">
                        {preset.config.lighting?.value.lights.length ?? 0} sources ·{" "}
                        {preset.config.lighting?.value.ratio}
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

        {/* --------------------------- CURRENT RIG ---------------------------- */}
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Current Rig
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">{lighting.lights.length} sources</Badge>
            {lighting.ratio ? <Badge variant="outline">{lighting.ratio}</Badge> : null}
            {lighting.mood ? <Badge variant="outline">{lighting.mood}</Badge> : null}
          </div>
        </div>

        {/* ------------------------ MANUAL RIG BUILDER ------------------------ */}
        <section className="space-y-4 rounded-xl border border-border/70 bg-card/40 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-xs uppercase tracking-[0.2em]">
                Create Lighting Preset
              </h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Build a rig source by source. Compiles straight into the shot.
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={addLight}>
              <Plus className="mr-1 h-3 w-3" /> Add light
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <TextRow
              label="Ratio"
              value={lighting.ratio ?? ""}
              placeholder="e.g. 4:1"
              onChange={(v) => setLighting({ ratio: v })}
            />
            <TextRow
              label="Mood"
              value={lighting.mood ?? ""}
              placeholder="e.g. soft, editorial"
              onChange={(v) => setLighting({ mood: v })}
            />
          </div>

          {lighting.lights.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No sources yet — pick a preset above or add a light.
            </p>
          ) : (
            <Accordion type="multiple" className="w-full">
              {lighting.lights.map((light, index) => (
                <AccordionItem key={light.id} value={light.id} className="border-border/60">
                  <AccordionTrigger className="py-2 text-left">
                    <span className="flex items-center gap-2 text-[11px]">
                      <span className="text-muted-foreground">{index + 1}.</span>
                      <span className="font-display uppercase tracking-[0.14em]">{light.type}</span>
                      <span className="text-muted-foreground">{light.position}</span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <SelectRow
                        label="Type"
                        value={light.type}
                        options={CINEMA_LIGHT_TYPES}
                        onChange={(v) => patchLight(light.id, { type: v as CinemaLightType })}
                      />
                      <SelectRow
                        label="Height"
                        value={light.height}
                        options={LIGHT_HEIGHTS}
                        onChange={(v) =>
                          patchLight(light.id, { height: v as CinemaLight["height"] })
                        }
                      />
                      <TextRow
                        label="Position"
                        value={light.position}
                        onChange={(v) => patchLight(light.id, { position: v })}
                      />
                      <TextRow
                        label="Direction"
                        value={light.direction}
                        onChange={(v) => patchLight(light.id, { direction: v })}
                      />
                      <SelectRow
                        label="Falloff"
                        value={light.falloff}
                        options={LIGHT_FALLOFFS}
                        onChange={(v) =>
                          patchLight(light.id, { falloff: v as CinemaLight["falloff"] })
                        }
                      />
                    </div>

                    <NumberSlider
                      label="Size"
                      value={light.size}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={(v) => patchLight(light.id, { size: v })}
                    />
                    <NumberSlider
                      label="Intensity"
                      value={light.intensity}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={(v) => patchLight(light.id, { intensity: v })}
                    />
                    <NumberSlider
                      label="Hardness"
                      value={light.hardness}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={(v) => patchLight(light.id, { hardness: v })}
                    />
                    <NumberSlider
                      label="Temperature (K)"
                      value={light.temperature}
                      min={1500}
                      max={12000}
                      step={50}
                      onChange={(v) => patchLight(light.id, { temperature: v })}
                    />
                    <NumberSlider
                      label="Tint (green ↔ magenta)"
                      value={light.tint}
                      min={-100}
                      max={100}
                      step={1}
                      onChange={(v) => patchLight(light.id, { tint: v })}
                    />

                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removeLight(light.id)}
                    >
                      <Trash2 className="mr-1 h-3 w-3" /> Remove light
                    </Button>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}

          <p className="text-[10px] text-muted-foreground">
            Save this rig as a preset from the Lighting Presets library above.
          </p>
        </section>
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
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] transition-colors",
        active
          ? "border-primary/70 bg-primary/15 text-primary"
          : "border-border/70 text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function TextRow({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-display text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-xs"
      />
    </label>
  );
}

function SelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-display text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option} className="text-xs">
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
        <span className="font-display text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </span>
        <span className="text-[10px] text-foreground/80">{value}</span>
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
