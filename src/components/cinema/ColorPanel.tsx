import { useMemo, useRef, useState } from "react";
import { Loader2, Star, Upload } from "lucide-react";
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
import { cn } from "@/lib/utils";
import type { ColorPalette, ConfigSource, DirectorConfig, DirectorConfigField } from "@/lib/cinema/types";
import {
  COLOR_PRESETS,
  COLOR_PRESET_CATEGORIES,
  paletteOf,
  presetSwatches,
  type CinemaColorPreset,
  type ColorPresetCategory,
} from "@/lib/cinema/presets/colorPresets";
import { extractPaletteFromImage } from "@/services/cinemaStudio";

export interface ColorPanelProps {
  config: DirectorConfig;
  /** Writes config[field] = { value, source } (defaults to "USER"). */
  updateField: <F extends DirectorConfigField>(
    field: F,
    value: DirectorConfig[F]["value"],
    source?: ConfigSource,
  ) => void;
  advanced: boolean;
}

type CustomPalette = { id: string; name: string; palette: ColorPalette };

const ADVANCED_SLIDERS: {
  key: keyof ColorPalette;
  label: string;
  min: number;
  max: number;
  fallback: number;
}[] = [
  { key: "temperature", label: "Temperature", min: -100, max: 100, fallback: 0 },
  { key: "tint", label: "Tint", min: -100, max: 100, fallback: 0 },
  { key: "contrast", label: "Contrast", min: 0, max: 100, fallback: 50 },
  { key: "saturation", label: "Saturation", min: 0, max: 100, fallback: 50 },
  { key: "highlights", label: "Highlights", min: 0, max: 100, fallback: 50 },
  { key: "shadows", label: "Shadows", min: 0, max: 100, fallback: 50 },
  { key: "blacks", label: "Blacks", min: 0, max: 100, fallback: 50 },
  { key: "whites", label: "Whites", min: 0, max: 100, fallback: 50 },
  { key: "fade", label: "Fade", min: 0, max: 100, fallback: 0 },
  { key: "grain", label: "Grain", min: 0, max: 100, fallback: 0 },
  { key: "sharpness", label: "Sharpness", min: 0, max: 100, fallback: 60 },
  { key: "halation", label: "Halation", min: 0, max: 100, fallback: 0 },
];

/**
 * Color chip panel — palette library, create-from-reference (Gemini analysis)
 * and advanced grade sliders. Library/slider edits write source "USER";
 * reference analysis writes source "REFERENCE_ANALYSIS".
 */
export default function ColorPanel({ config, updateField, advanced }: ColorPanelProps) {
  const color = config.color.value;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ColorPresetCategory | "All">("All");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [customs, setCustoms] = useState<CustomPalette[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastReference, setLastReference] = useState<{ name: string; palette: ColorPalette } | null>(
    null,
  );
  const fileRef = useRef<HTMLInputElement | null>(null);

  const setColor = (patch: Partial<ColorPalette>, source: ConfigSource = "USER") =>
    updateField("color", { ...color, ...patch }, source);

  const applyPreset = (preset: CinemaColorPreset) => {
    const value = paletteOf(preset);
    if (!value) return;
    updateField("color", { ...value, swatches: value.swatches.map((s) => ({ ...s })) }, "USER");
  };

  const toggleFavorite = (id: string) =>
    setFavorites((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return COLOR_PRESETS.filter((p) => {
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
      COLOR_PRESET_CATEGORIES.map((cat) => ({
        category: cat,
        presets: filtered.filter((p) => p.category === cat),
      })).filter((g) => g.presets.length > 0),
    [filtered],
  );

  const isActive = (preset: CinemaColorPreset) => {
    const value = paletteOf(preset);
    if (!value) return false;
    return (
      value.swatches[0]?.hex === color.swatches[0]?.hex &&
      value.contrast === color.contrast &&
      value.saturation === color.saturation
    );
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setAnalyzing(true);
    try {
      const result = await extractPaletteFromImage(file);
      setLastReference({ name: result.paletteName, palette: result.palette });
      updateField("color", result.palette, "REFERENCE_ANALYSIS");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Palette analysis failed — please retry.");
    } finally {
      setAnalyzing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const saveCustom = () => {
    if (!lastReference) return;
    setCustoms((prev) => [
      { id: `custom-${Date.now()}`, name: lastReference.name, palette: lastReference.palette },
      ...prev,
    ]);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Current palette ------------------------------------------------ */}
      <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-card/40 p-3">
        <div className="flex items-center justify-between">
          <span className="font-display text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Current palette
          </span>
          <Badge variant="outline" className="text-[9px] uppercase tracking-[0.16em]">
            {config.color.source.replace(/_/g, " ")}
          </Badge>
        </div>
        <SwatchBar hexes={color.swatches.map((s) => s.hex)} className="h-6" />
        <p className="text-[11px] text-muted-foreground">
          {color.shadowHue} shadows · {color.midtoneHue} midtones · {color.highlightHue} highlights ·{" "}
          {color.blackBehavior} blacks · {color.highlightBehavior} highlights
        </p>
      </div>

      {/* Library ------------------------------------------------------- */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search palettes"
            className="h-9 w-[200px]"
          />
          <Button
            variant={favoritesOnly ? "secondary" : "outline"}
            size="sm"
            onClick={() => setFavoritesOnly((v) => !v)}
          >
            <Star className="mr-1.5 h-3.5 w-3.5" />
            Favorites
          </Button>
          <span className="text-[11px] text-muted-foreground">{filtered.length} palettes</span>
        </div>

        <ScrollArea className="max-w-full">
          <div className="flex gap-1.5 pb-2">
            {(["All", ...COLOR_PRESET_CATEGORIES] as const).map((cat) => (
              <Button
                key={cat}
                size="sm"
                variant={category === cat ? "secondary" : "ghost"}
                className="h-7 shrink-0 text-[11px]"
                onClick={() => setCategory(cat as ColorPresetCategory | "All")}
              >
                {cat}
              </Button>
            ))}
          </div>
        </ScrollArea>

        <ScrollArea className="h-[320px] pr-3">
          <div className="flex flex-col gap-5">
            {customs.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h4 className="font-display text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  My palettes
                </h4>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {customs.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => updateField("color", c.palette, "REFERENCE_ANALYSIS")}
                      className="flex flex-col gap-2 rounded-md border border-border/60 bg-card/40 p-2 text-left transition-colors hover:border-primary/60"
                    >
                      <SwatchBar hexes={c.palette.swatches.map((s) => s.hex)} />
                      <span className="text-xs">{c.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {grouped.map((group) => (
              <div key={group.category} className="flex flex-col gap-2">
                <h4 className="font-display text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {group.category}
                </h4>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {group.presets.map((preset) => (
                    <div
                      key={preset.id}
                      className={cn(
                        "group flex flex-col gap-2 rounded-md border bg-card/40 p-2 transition-colors",
                        isActive(preset)
                          ? "border-primary"
                          : "border-border/60 hover:border-primary/60",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => applyPreset(preset)}
                        className="flex flex-col gap-2 text-left"
                      >
                        <SwatchBar hexes={presetSwatches(preset)} />
                        <span className="text-xs leading-tight">{preset.name}</span>
                      </button>
                      <div className="flex items-center justify-between">
                        <span className="truncate text-[10px] text-muted-foreground">
                          {preset.tags.slice(0, 2).join(" · ")}
                        </span>
                        <button
                          type="button"
                          aria-label="Favorite palette"
                          onClick={() => toggleFavorite(preset.id)}
                        >
                          <Star
                            className={cn(
                              "h-3.5 w-3.5",
                              favorites.includes(preset.id)
                                ? "fill-primary text-primary"
                                : "text-muted-foreground",
                            )}
                          />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {grouped.length === 0 ? (
              <p className="text-xs text-muted-foreground">No palettes match that search.</p>
            ) : null}
          </div>
        </ScrollArea>
      </div>

      <Separator />

      {/* Create from reference ------------------------------------------ */}
      <div className="flex flex-col gap-2">
        <h4 className="font-display text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Create from reference
        </h4>
        <p className="text-[11px] text-muted-foreground">
          Upload a still — the grade is analysed and mapped onto a palette. Analysis only, no
          credits.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={analyzing}
            onClick={() => fileRef.current?.click()}
          >
            {analyzing ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="mr-1.5 h-3.5 w-3.5" />
            )}
            {analyzing ? "Analysing reference…" : "Upload reference"}
          </Button>
          <Button variant="ghost" size="sm" disabled={!lastReference} onClick={saveCustom}>
            Save as my palette
          </Button>
        </div>
        {lastReference ? (
          <div className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-card/40 p-2">
            <span className="text-xs">{lastReference.name}</span>
            <SwatchBar hexes={lastReference.palette.swatches.map((s) => s.hex)} />
          </div>
        ) : null}
        {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
      </div>

      {/* Advanced ------------------------------------------------------- */}
      {advanced ? (
        <Accordion type="single" collapsible defaultValue="grade">
          <AccordionItem value="grade">
            <AccordionTrigger className="font-display text-[10px] uppercase tracking-[0.2em]">
              Advanced grade
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 gap-4 pt-2 md:grid-cols-2">
                {ADVANCED_SLIDERS.map((control) => {
                  const raw = color[control.key];
                  const value = typeof raw === "number" ? raw : control.fallback;
                  return (
                    <div key={String(control.key)} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                          {control.label}
                        </span>
                        <span className="text-[11px] tabular-nums">{value}</span>
                      </div>
                      <Slider
                        value={[value]}
                        min={control.min}
                        max={control.max}
                        step={1}
                        onValueChange={([next]) =>
                          setColor({ [control.key]: next } as Partial<ColorPalette>)
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      ) : null}
    </div>
  );
}

function SwatchBar({ hexes, className }: { hexes: string[]; className?: string }) {
  return (
    <div className={cn("flex h-5 w-full overflow-hidden rounded-sm", className)}>
      {(hexes.length ? hexes : ["#222", "#555", "#999", "#ddd"]).map((hex, i) => (
        <span key={`${hex}-${i}`} className="flex-1" style={{ backgroundColor: hex }} />
      ))}
    </div>
  );
}
