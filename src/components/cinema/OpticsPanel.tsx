import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OPTICS_FLARE_OPTIONS } from "@/lib/cinema/presets/opticsPresets";
import type {
  CinemaJewelryOptics,
  ConfigSource,
  DirectorConfig,
  DirectorConfigField,
  OpticsSetup,
} from "@/lib/cinema/types";

export interface OpticsPanelProps {
  config: DirectorConfig;
  updateField: <F extends DirectorConfigField>(
    field: F,
    value: DirectorConfig[F]["value"],
    source?: ConfigSource,
  ) => void;
  advanced: boolean;
}

const FLARE_OPTIONS = OPTICS_FLARE_OPTIONS;

const BOKEH_OPTIONS = [
  "neutral round",
  "creamy round",
  "oval anamorphic",
  "cats-eye edges",
  "swirly vintage",
  "hexagonal blades",
  "soap-bubble",
];

const HIGHLIGHT_OPTIONS: OpticsSetup["highlightBehavior"][] = [
  "neutral",
  "rolled-off",
  "bloomed",
  "clipped",
];

const GENERAL_SLIDERS: {
  key: keyof OpticsSetup;
  label: string;
  fallback: number;
  advancedOnly?: boolean;
}[] = [
  { key: "diffusion", label: "Diffusion", fallback: 0 },
  { key: "halation", label: "Halation", fallback: 0 },
  { key: "bloom", label: "Bloom", fallback: 0 },
  { key: "vignette", label: "Vignette", fallback: 0, advancedOnly: true },
  { key: "chromaticAberration", label: "Chromatic Aberration", fallback: 0, advancedOnly: true },
  { key: "distortion", label: "Distortion", fallback: 0, advancedOnly: true },
];

const JEWELRY_SLIDERS: { key: keyof CinemaJewelryOptics; label: string }[] = [
  { key: "sparkle", label: "Sparkle" },
  { key: "whiteBrilliance", label: "White Brilliance" },
  { key: "rainbowFire", label: "Rainbow Fire" },
  { key: "glintSize", label: "Glint Size" },
  { key: "glintCoverage", label: "Glint Coverage" },
  { key: "bloom", label: "Bloom" },
  { key: "starburst", label: "Starburst" },
  { key: "fireSaturation", label: "Fire Saturation" },
];

const JEWELRY_DEFAULTS: CinemaJewelryOptics = {
  sparkle: 50,
  whiteBrilliance: 50,
  rainbowFire: 40,
  glintSize: 40,
  glintCoverage: 40,
  bloom: 30,
  starburst: 20,
  fireSaturation: 45,
};

/**
 * Optics chip panel — Cinema-LOCAL optics only.
 * Deliberately independent from the Jewelry Swap Diamond Optics profile:
 * no imports from, and no writes to, that system.
 */
export default function OpticsPanel({ config, updateField, advanced }: OpticsPanelProps) {
  const optics = config.optics.value;
  const jewelry = optics.jewelry ?? JEWELRY_DEFAULTS;

  const setOptics = (patch: Partial<OpticsSetup>) =>
    updateField("optics", { ...optics, ...patch }, "USER");
  const setJewelry = (patch: Partial<CinemaJewelryOptics>) =>
    setOptics({ jewelry: { ...jewelry, ...patch } });

  return (
    <ScrollArea className="h-[62vh] pr-3">
      <div className="space-y-5 text-foreground">
        <SectionLabel>General Optics</SectionLabel>

        <div className="grid gap-4 sm:grid-cols-3">
          <SelectRow label="Flare" value={optics.flare || "none"} options={FLARE_OPTIONS} onChange={(v) => setOptics({ flare: v })} />
          <SelectRow label="Bokeh" value={optics.bokeh ?? "neutral round"} options={BOKEH_OPTIONS} onChange={(v) => setOptics({ bokeh: v })} />
          <SelectRow
            label="Highlights"
            value={optics.highlightBehavior ?? "neutral"}
            options={HIGHLIGHT_OPTIONS.filter(Boolean) as string[]}
            onChange={(v) => setOptics({ highlightBehavior: v as OpticsSetup["highlightBehavior"] })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {GENERAL_SLIDERS.filter((s) => advanced || !s.advancedOnly).map((slider) => (
            <SliderRow
              key={String(slider.key)}
              label={slider.label}
              value={(optics[slider.key] as number | undefined) ?? slider.fallback}
              onChange={(v) => setOptics({ [slider.key]: v } as Partial<OpticsSetup>)}
            />
          ))}
        </div>

        <Separator className="bg-border/60" />
        <div>
          <SectionLabel>Jewelry Optics</SectionLabel>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Cinema-local sparkle model for jewelry and reflective product shots.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {JEWELRY_SLIDERS.map((slider) => (
            <SliderRow
              key={slider.key}
              label={slider.label}
              value={jewelry[slider.key]}
              onChange={(v) => setJewelry({ [slider.key]: v } as Partial<CinemaJewelryOptics>)}
            />
          ))}
        </div>
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

function SelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className="block text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SliderRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
        <span className="tabular-nums text-foreground">{value}</span>
      </div>
      <Slider value={[value]} min={0} max={100} step={1} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}
