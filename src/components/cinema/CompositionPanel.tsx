import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type {
  CompositionSetup,
  ConfigSource,
  DirectorConfig,
  DirectorConfigField,
  FocusSetup,
} from "@/lib/cinema/types";
import {
  COMPOSITION_PRESETS,
  FOCUS_PRESETS,
} from "@/lib/cinema/presets/compositionPresets";

export interface CompositionPanelProps {
  config: DirectorConfig;
  updateField: <F extends DirectorConfigField>(
    field: F,
    value: DirectorConfig[F]["value"],
    source?: ConfigSource,
  ) => void;
  advanced: boolean;
}

const ADVANCED_SLIDERS: {
  key: keyof CompositionSetup;
  label: string;
  min: number;
  max: number;
  fallback: number;
}[] = [
  { key: "subjectX", label: "Subject X", min: 0, max: 100, fallback: 50 },
  { key: "subjectY", label: "Subject Y", min: 0, max: 100, fallback: 50 },
  { key: "horizonPosition", label: "Horizon", min: 0, max: 100, fallback: 50 },
  { key: "headroomAmount", label: "Headroom", min: 0, max: 100, fallback: 50 },
  { key: "leadRoomAmount", label: "Lead Room", min: 0, max: 100, fallback: 50 },
  { key: "negativeSpace", label: "Negative Space", min: 0, max: 100, fallback: 50 },
  { key: "framingScale", label: "Framing Scale", min: 0, max: 100, fallback: 50 },
  { key: "cameraHeight", label: "Camera Height", min: 0, max: 100, fallback: 50 },
  { key: "tiltDegrees", label: "Tilt (deg)", min: -30, max: 30, fallback: 0 },
];

const FOCUS_SLIDERS: {
  key: keyof FocusSetup;
  label: string;
  min: number;
  max: number;
  fallback: number;
}[] = [
  { key: "depthOfFieldTightness", label: "Depth Of Field", min: 0, max: 100, fallback: 50 },
  { key: "breathing", label: "Focus Breathing", min: 0, max: 100, fallback: 0 },
];

/**
 * Composition chip panel — framing presets, advanced framing geometry and the
 * focus sub-section (writes config.focus). All edits write source "USER".
 */
export default function CompositionPanel({
  config,
  updateField,
  advanced,
}: CompositionPanelProps) {
  const composition = config.composition.value;
  const focus = config.focus.value;
  const [selected, setSelected] = useState<string | null>(null);

  const setComposition = (patch: Partial<CompositionSetup>) =>
    updateField("composition", { ...composition, ...patch }, "USER");
  const setFocus = (patch: Partial<FocusSetup>) =>
    updateField("focus", { ...focus, ...patch }, "USER");

  return (
    <ScrollArea className="h-[62vh] pr-3">
      <div className="space-y-5 text-foreground">
        <SectionLabel>Composition</SectionLabel>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {COMPOSITION_PRESETS.map((preset) => {
            const active =
              selected === preset.id ||
              (selected === null &&
                composition.rule === preset.value.rule &&
                composition.subjectPlacement === preset.value.subjectPlacement);
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setSelected(preset.id);
                  updateField("composition", { ...preset.value }, "USER");
                }}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors",
                  active
                    ? "border-primary/70 bg-primary/10"
                    : "border-border/60 bg-background/40 hover:border-primary/40",
                )}
              >
                <span className="block font-display text-[11px] uppercase tracking-[0.14em]">
                  {preset.name}
                </span>
                <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">
                  {preset.hint}
                </span>
              </button>
            );
          })}
        </div>

        {advanced ? (
          <>
            <Separator className="bg-border/60" />
            <SectionLabel>Advanced Framing</SectionLabel>
            <div className="grid gap-4 sm:grid-cols-2">
              {ADVANCED_SLIDERS.map((slider) => {
                const current =
                  (composition[slider.key] as number | undefined) ?? slider.fallback;
                return (
                  <SliderRow
                    key={String(slider.key)}
                    label={slider.label}
                    value={current}
                    min={slider.min}
                    max={slider.max}
                    onChange={(v) => setComposition({ [slider.key]: v } as Partial<CompositionSetup>)}
                  />
                );
              })}
            </div>
          </>
        ) : null}

        <Separator className="bg-border/60" />
        <SectionLabel>Focus</SectionLabel>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {FOCUS_PRESETS.map((preset) => {
            const active = (focus.presetId ?? "auto") === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => updateField("focus", { ...preset.value }, "USER")}
                className={cn(
                  "rounded-xl border p-3 text-left transition-colors",
                  active
                    ? "border-primary/70 bg-primary/10"
                    : "border-border/60 bg-background/40 hover:border-primary/40",
                )}
              >
                <span className="block font-display text-[11px] uppercase tracking-[0.14em]">
                  {preset.name}
                </span>
                <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">
                  {preset.hint}
                </span>
              </button>
            );
          })}
        </div>

        {advanced ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {FOCUS_SLIDERS.map((slider) => (
              <SliderRow
                key={String(slider.key)}
                label={slider.label}
                value={(focus[slider.key] as number | undefined) ?? slider.fallback}
                min={slider.min}
                max={slider.max}
                onChange={(v) => setFocus({ [slider.key]: v } as Partial<FocusSetup>)}
              />
            ))}
          </div>
        ) : null}
      </div>
    </ScrollArea>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-display text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
      {children}
    </h3>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
        <span className="tabular-nums text-foreground">{value}</span>
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
