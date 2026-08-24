import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type {
  AtmosphereSetup,
  ConfigSource,
  DirectorConfig,
  DirectorConfigField,
} from "@/lib/cinema/types";
import { ATMOSPHERE_PRESETS } from "@/lib/cinema/presets/atmospherePresets";

export interface AtmospherePanelProps {
  config: DirectorConfig;
  updateField: <F extends DirectorConfigField>(
    field: F,
    value: DirectorConfig[F]["value"],
    source?: ConfigSource,
  ) => void;
  advanced: boolean;
}

/** Atmosphere chip panel — preset cards with per-preset intensity. Writes source "USER". */
export default function AtmospherePanel({
  config,
  updateField,
  advanced,
}: AtmospherePanelProps) {
  const atmosphere = config.atmosphere.value;
  const activeId = atmosphere.presetId ?? null;

  const setAtmosphere = (patch: Partial<AtmosphereSetup>) =>
    updateField("atmosphere", { ...atmosphere, ...patch }, "USER");

  return (
    <ScrollArea className="h-[62vh] pr-3">
      <div className="space-y-4 text-foreground">
        <h3 className="font-display text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Atmosphere
        </h3>

        <div className="space-y-2">
          {ATMOSPHERE_PRESETS.map((preset) => {
            const active = activeId === preset.id;
            const intensity = active
              ? atmosphere.intensity ?? preset.defaultIntensity
              : preset.defaultIntensity;
            return (
              <div
                key={preset.id}
                className={cn(
                  "rounded-xl border p-3 transition-colors",
                  active
                    ? "border-primary/70 bg-primary/10"
                    : "border-border/60 bg-background/40",
                )}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() =>
                    updateField(
                      "atmosphere",
                      {
                        ...preset.value,
                        presetId: preset.id,
                        presetName: preset.name,
                        intensity: preset.defaultIntensity,
                      },
                      "USER",
                    )
                  }
                >
                  <span className="block font-display text-[11px] uppercase tracking-[0.14em]">
                    {preset.name}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {preset.hint}
                  </span>
                </button>

                {active ? (
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="uppercase tracking-[0.12em] text-muted-foreground">
                        Intensity
                      </span>
                      <span className="tabular-nums">{intensity}</span>
                    </div>
                    <Slider
                      value={[intensity]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={([v]) => setAtmosphere({ intensity: v })}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {advanced ? (
          <>
            <Separator className="bg-border/60" />
            <h3 className="font-display text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Advanced
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <SliderRow
                label="Haze"
                value={atmosphere.haze ?? 0}
                onChange={(v) => setAtmosphere({ haze: v })}
              />
              <SliderRow
                label="Smoke"
                value={atmosphere.smoke ?? 0}
                onChange={(v) => setAtmosphere({ smoke: v })}
              />
            </div>
          </>
        ) : null}
      </div>
    </ScrollArea>
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
        <span className="tabular-nums">{value}</span>
      </div>
      <Slider value={[value]} min={0} max={100} step={1} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}
