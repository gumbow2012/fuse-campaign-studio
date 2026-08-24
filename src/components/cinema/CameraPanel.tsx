import PresetPreview from "./PresetPreview";
import { resolvePreviewMedia } from "@/lib/cinema/previewTypes";
import { CompareDialog, useCompareSelection } from "./CompareView";
import FocalStrip from "./FocalStrip";
import { ArrowLeftRight } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

import { cn } from "@/lib/utils";
import type {
  ApertureSetup,
  ConfigSource,
  CameraSetup,
  DirectorConfig,
  DirectorConfigField,
  LensSetup,
  OpticsSetup,
  PartialDirectorConfig,
  Sourced,
} from "@/lib/cinema/types";
import {
  CAMERA_PRESETS,
  CAMERA_PRESET_CATEGORIES,
  type CinemaCameraPreset,
} from "@/lib/cinema/presets/cameraPresets";
import {
  APERTURE_OPTIONS,
  FOCAL_LENGTH_MAX,
  FOCAL_LENGTH_MIN,
  FOCAL_LENGTH_PRESETS,
  LENS_PRESETS,
  LENS_PRESET_CATEGORIES,
  type CinemaLensPreset,
} from "@/lib/cinema/presets/lensPresets";

import PresetLibrarySection from "./PresetLibrarySection";
import {
  CAMERA_LIBRARY,
  CAMERA_LIBRARY_CATEGORIES,
} from "@/lib/cinema/presets/libraryAdapters";
import type { PresetUpdateField } from "@/lib/cinema/presetLibrary";

export interface CameraPanelProps {
  config: DirectorConfig;
  /** Writes config[field] = { value, source: "USER" }. */
  updateField: <F extends DirectorConfigField>(
    field: F,
    value: DirectorConfig[F]["value"],
    source?: ConfigSource,
  ) => void;
  advanced: boolean;
}

const SHUTTER_OPTIONS: Array<{ label: string; angle: number }> = [
  { label: "Staccato 45°", angle: 45 },
  { label: "Crisp 90°", angle: 90 },
  { label: "Standard 180°", angle: 180 },
  { label: "Smooth 270°", angle: 270 },
  { label: "Smeared 360°", angle: 360 },
];

const HIGHLIGHT_ROLLOFF: Array<{ label: string; value: DirectorConfig["color"]["value"]["highlightBehavior"] }> = [
  { label: "Neutral", value: "neutral" },
  { label: "Rolled Off", value: "rolled-off" },
  { label: "Bloomed", value: "bloomed" },
  { label: "Clipped", value: "clipped" },
];

/**
 * Camera chip panel — writes DirectorConfig.camera / .lens / .aperture
 * (plus optics/filmSetup/color in ADVANCED) always with source "USER".
 */
export default function CameraPanel({ config, updateField, advanced }: CameraPanelProps) {
  const camera = config.camera.value;
  const lens = config.lens.value;
  const aperture = config.aperture.value;
  const optics = config.optics.value;
  const film = config.filmSetup.value;

  const applyFragment = (fragment: PartialDirectorConfig) => {
    (Object.keys(fragment) as DirectorConfigField[]).forEach((field) => {
      const entry = fragment[field] as Sourced<unknown> | undefined;
      if (!entry) return;
      // Presets are code-data fragments; the user picking one is a USER choice.
      updateField(field, entry.value as DirectorConfig[typeof field]["value"]);
    });
  };

  const setCamera = (patch: Partial<CameraSetup>) => updateField("camera", { ...camera, ...patch });
  const setLens = (patch: Partial<LensSetup>) => updateField("lens", { ...lens, ...patch });
  const setAperture = (value: ApertureSetup) => updateField("aperture", value);
  const setOptics = (patch: Partial<OpticsSetup>) => updateField("optics", { ...optics, ...patch });

  const camerasByCategory = useMemo(
    () =>
      CAMERA_PRESET_CATEGORIES.map((category) => ({
        category,
        presets: CAMERA_PRESETS.filter((p) => p.category === category),
      })),
    [],
  );

  const lensesByCategory = useMemo(
    () =>
      LENS_PRESET_CATEGORIES.map((category) => ({
        category,
        presets: LENS_PRESETS.filter((p) => p.category === category),
      })),
    [],
  );

  // CV4: optional compare selections (camera bodies and lens looks).
  const cameraCompare = useCompareSelection<CinemaCameraPreset>();
  const lensCompare = useCompareSelection<CinemaLensPreset>();



  return (
    <ScrollArea className="max-h-[65vh] pr-3">
      <div className="space-y-7">
        {/* ---------------------------- PRESET LIBRARY ---------------------------- */}
        <section className="space-y-3">
          <SectionTitle
            title="Camera Presets"
            hint="Builtin looks plus your saved setups — search, favorite, reuse."
          />
          <PresetLibrarySection
            type="camera"
            builtin={CAMERA_LIBRARY}
            categories={CAMERA_LIBRARY_CATEGORIES}
            config={config}
            updateField={updateField as unknown as PresetUpdateField}
            saveLabel="Save camera preset"
          />
        </section>

        {/* ------------------------------ CAMERA BODY ------------------------------ */}
        <section className="space-y-4">
          <SectionTitle
            title="Camera Body"
            hint="Image-character presets — not hardware claims."
          />
          <CompareHint
            label={cameraCompare.a?.name}
            noun="camera"
            onClear={cameraCompare.reset}
          />
          {camerasByCategory.map(({ category, presets }) => (
            <div key={category} className="space-y-2">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {category}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {presets.map((preset) => (
                  <div
                    key={preset.id}
                    className={cn(
                      "relative overflow-hidden rounded-xl border transition-all",
                      "border-border/70 bg-card/60 hover:border-primary/60",
                      camera.body === preset.config.camera?.value.body &&
                        "border-primary/80 ring-1 ring-primary/50",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => applyFragment(preset.config)}
                      className="block w-full text-left"
                    >
                      <PresetPreview
                        media={resolvePreviewMedia({ category: "CAMERA", preset })}
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
                    <CompareTileButton
                      marked={cameraCompare.isA(preset.id)}
                      onClick={() => cameraCompare.pick(preset)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {cameraCompare.a && cameraCompare.b ? (
            <CompareDialog
              open
              onOpenChange={(open) => {
                if (!open) cameraCompare.closeCompare();
              }}
              title="Compare camera look"
              a={{
                media: resolvePreviewMedia({ category: "CAMERA", preset: cameraCompare.a }),
                label: cameraCompare.a.name,
                sublabel: cameraCompare.a.tags.slice(0, 3).join(" · "),
              }}
              b={{
                media: resolvePreviewMedia({ category: "CAMERA", preset: cameraCompare.b }),
                label: cameraCompare.b.name,
                sublabel: cameraCompare.b.tags.slice(0, 3).join(" · "),
              }}
              onApplyA={() => {
                if (cameraCompare.a) applyFragment(cameraCompare.a.config);
                cameraCompare.reset();
              }}
              onApplyB={() => {
                if (cameraCompare.b) applyFragment(cameraCompare.b.config);
                cameraCompare.reset();
              }}
            />
          ) : null}
        </section>


        <Separator className="bg-border/60" />

        {/* --------------------------------- LENS --------------------------------- */}
        <section className="space-y-4">
          <SectionTitle title="Lens" hint="Optical character library." />
          <CompareHint label={lensCompare.a?.name} noun="lens" onClear={lensCompare.reset} />
          {lensesByCategory.map(({ category, presets }) => (
            <div key={category} className="space-y-2">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {category}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {presets.map((preset) => (
                  <div
                    key={preset.id}
                    className={cn(
                      "relative overflow-hidden rounded-xl border transition-all",
                      "border-border/70 bg-card/60 hover:border-primary/60",
                      lens.character === preset.config.lens?.value.character &&
                        "border-primary/80 ring-1 ring-primary/50",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => applyFragment(preset.config)}
                      className="block w-full text-left"
                    >
                      <PresetPreview
                        media={resolvePreviewMedia({ category: "LENS", preset })}
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
                    <CompareTileButton
                      marked={lensCompare.isA(preset.id)}
                      onClick={() => lensCompare.pick(preset)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {lensCompare.a && lensCompare.b ? (
            <CompareDialog
              open
              onOpenChange={(open) => {
                if (!open) lensCompare.closeCompare();
              }}
              title="Compare lens look"
              a={{
                media: resolvePreviewMedia({ category: "LENS", preset: lensCompare.a }),
                label: lensCompare.a.name,
                sublabel: lensCompare.a.tags.slice(0, 3).join(" · "),
              }}
              b={{
                media: resolvePreviewMedia({ category: "LENS", preset: lensCompare.b }),
                label: lensCompare.b.name,
                sublabel: lensCompare.b.tags.slice(0, 3).join(" · "),
              }}
              onApplyA={() => {
                if (lensCompare.a) applyFragment(lensCompare.a.config);
                lensCompare.reset();
              }}
              onApplyB={() => {
                if (lensCompare.b) applyFragment(lensCompare.b.config);
                lensCompare.reset();
              }}
            />
          ) : null}

          <FocalStrip
            value={lens.focalLengthMm}
            onSelect={(mm) => setLens({ focalLengthMm: mm })}
          />

          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Focal Length
            </p>

            <div className="flex flex-wrap gap-1.5">
              {FOCAL_LENGTH_PRESETS.map((mm) => (
                <PillButton
                  key={mm}
                  label={`${mm}mm`}
                  active={lens.focalLengthMm === mm}
                  onClick={() => setLens({ focalLengthMm: mm })}
                />
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Slider
                value={[lens.focalLengthMm]}
                min={FOCAL_LENGTH_MIN}
                max={FOCAL_LENGTH_MAX}
                step={1}
                onValueChange={([v]) => setLens({ focalLengthMm: v })}
                className="flex-1"
              />
              <Input
                type="number"
                min={FOCAL_LENGTH_MIN}
                max={FOCAL_LENGTH_MAX}
                value={lens.focalLengthMm}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  if (!Number.isFinite(next)) return;
                  setLens({
                    focalLengthMm: Math.min(FOCAL_LENGTH_MAX, Math.max(FOCAL_LENGTH_MIN, next)),
                  });
                }}
                className="w-20"
              />
            </div>
          </div>
        </section>

        <Separator className="bg-border/60" />

        {/* ------------------------------- APERTURE ------------------------------- */}
        <section className="space-y-3">
          <SectionTitle title="Aperture" hint="Depth of field and bokeh character." />
          <div className="flex flex-wrap gap-1.5">
            {APERTURE_OPTIONS.map((option) => (
              <PillButton
                key={option.id}
                label={option.label}
                active={
                  aperture.fStop === option.value.fStop && aperture.bokeh === option.value.bokeh
                }
                onClick={() => setAperture(option.value)}
              />
            ))}
          </div>
        </section>

        {/* ------------------------------- ADVANCED ------------------------------- */}
        {advanced ? (
          <>
            <Separator className="bg-border/60" />
            <section className="space-y-5">
              <SectionTitle
                title="Advanced Camera"
                hint="Auto until you move a control."
              />

              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Shutter Character
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <PillButton
                    label="Auto"
                    active={film.shutterAngle === 180}
                    onClick={() => updateField("filmSetup", { ...film, shutterAngle: 180 })}
                  />
                  {SHUTTER_OPTIONS.map((option) => (
                    <PillButton
                      key={option.angle}
                      label={option.label}
                      active={film.shutterAngle === option.angle}
                      onClick={() =>
                        updateField("filmSetup", { ...film, shutterAngle: option.angle })
                      }
                    />
                  ))}
                </div>
              </div>

              <AdvancedSlider
                label="Motion Blur (Shutter Angle)"
                value={film.shutterAngle ?? 180}
                min={45}
                max={360}
                onChange={(v) => updateField("filmSetup", { ...film, shutterAngle: v })}
              />

              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  ISO / Sensor Noise
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {["auto", "low ISO, clean", "medium ISO, light noise", "high ISO, visible noise"].map(
                    (noise) => (
                      <PillButton
                        key={noise}
                        label={noise === "auto" ? "Auto" : noise}
                        active={(camera.sensorNoise ?? "auto") === noise}
                        onClick={() => setCamera({ sensorNoise: noise })}
                      />
                    ),
                  )}
                </div>
              </div>

              <AdvancedSlider
                label="Grain"
                value={film.grain ?? 0}
                onChange={(v) => updateField("filmSetup", { ...film, grain: v })}
              />
              <AdvancedSlider
                label="Lens Distortion"
                value={optics.distortion}
                onChange={(v) => setOptics({ distortion: v })}
              />
              <AdvancedSlider
                label="Vignette"
                value={optics.vignette}
                onChange={(v) => setOptics({ vignette: v })}
              />
              <AdvancedSlider
                label="Chromatic Aberration"
                value={optics.chromaticAberration}
                onChange={(v) => setOptics({ chromaticAberration: v })}
              />
              <AdvancedSlider
                label="Diffusion"
                value={optics.diffusion}
                onChange={(v) => setOptics({ diffusion: v })}
              />
              <AdvancedSlider
                label="Halation"
                value={optics.halation}
                onChange={(v) => setOptics({ halation: v })}
              />

              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Flare Strength
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {["none", "subtle", "moderate", "strong"].map((flare) => (
                    <PillButton
                      key={flare}
                      label={flare === "none" ? "Auto / None" : flare}
                      active={optics.flare === flare}
                      onClick={() => setOptics({ flare })}
                    />
                  ))}
                </div>
              </div>

              <AdvancedSlider
                label="Focus Breathing"
                value={lens.breathing ?? 0}
                onChange={(v) => setLens({ breathing: v })}
              />

              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Highlight Rolloff
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {HIGHLIGHT_ROLLOFF.map((option) => (
                    <PillButton
                      key={option.value}
                      label={option.label}
                      active={config.color.value.highlightBehavior === option.value}
                      onClick={() =>
                        updateField("color", {
                          ...config.color.value,
                          highlightBehavior: option.value,
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </ScrollArea>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h3 className="font-display text-xs uppercase tracking-[0.2em] text-foreground">{title}</h3>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function PillButton({
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

function AdvancedSlider({
  label,
  value,
  min = 0,
  max = 100,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        <span className="text-[11px] text-foreground/70">
          {value === min ? "Auto" : Math.round(value)}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={1}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}
