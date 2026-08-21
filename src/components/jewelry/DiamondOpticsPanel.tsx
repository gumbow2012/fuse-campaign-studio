/**
 * DIAMOND OPTICS — customer-facing controls (FUSE-simple).
 *
 * Normal view: two sliders, Sparkle and Rainbow Fire, both AUTO by default with
 * a "Matching source light" label. Advanced adds the six finer controls. Numeric
 * percentages only ever appear inside Engineering details.
 *
 * AUTO reproduces the analysed source optics. A custom value MODIFIES that
 * baseline (analysed × multiplier) — the analysis is never discarded. Moving a
 * slider never re-runs analysis: the cached profile is simply re-synthesised
 * into prompt lines at generation time.
 */

import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import {
  AUTO_OPTICS_CONTROLS,
  opticsControlsAreAuto,
  type DiamondOpticsControls,
  type DiamondOpticsProfile,
  type OpticsControl,
} from "@/services/jewelrySwap";

type ControlKey = keyof DiamondOpticsControls;

const ADVANCED: { key: ControlKey; label: string; hint: string }[] = [
  { key: "whiteBrilliance", label: "White brilliance", hint: "White light return" },
  { key: "glintSize", label: "Glint size", hint: "Highlight size relative to a stone" },
  { key: "glintCoverage", label: "Glint coverage", hint: "How much of the stone field flashes at once" },
  { key: "bloom", label: "Bloom", hint: "Halo around the brightest highlights" },
  { key: "starburst", label: "Starburst", hint: "Diffraction spikes on bright points" },
  { key: "fireSaturation", label: "Fire saturation", hint: "Strength of the spectral hues" },
];

function pct(value: number | undefined, fallback = 0) {
  return `${Math.round((typeof value === "number" ? value : fallback) * 100)}%`;
}

function OpticsSlider({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: OpticsControl;
  onChange: (next: OpticsControl) => void;
}) {
  const isAuto = value === "auto";
  const numeric = isAuto ? 50 : (value as number);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="text-[11px] uppercase tracking-[0.14em] text-cyan-200/70">{label}</label>
        <button
          type="button"
          onClick={() => onChange(isAuto ? numeric : "auto")}
          className={`rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] transition-colors ${
            isAuto
              ? "border-cyan-200/40 bg-cyan-400/15 text-cyan-100"
              : "border-white/12 bg-black/40 text-foreground/60 hover:text-foreground"
          }`}
        >
          {isAuto ? "Auto" : "Custom"}
        </button>
      </div>
      <Slider
        value={[numeric]}
        min={0}
        max={100}
        step={1}
        onValueChange={(next) => onChange(next[0] ?? 50)}
      />
      <p className="mt-1 text-[9px] text-foreground/45">
        {isAuto ? `Matching source light · ${hint}` : hint}
      </p>
    </div>
  );
}

export default function DiamondOpticsPanel({
  controls,
  onChange,
  profile,
  status,
  onAnalyze,
}: {
  controls: DiamondOpticsControls;
  onChange: (next: DiamondOpticsControls) => void;
  profile: DiamondOpticsProfile | null;
  status: "idle" | "analyzing" | "ready" | "error";
  onAnalyze?: () => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const set = (key: ControlKey) => (next: OpticsControl) => onChange({ ...controls, [key]: next });

  const hues = Object.entries(profile?.fire?.hueDistribution ?? {})
    .filter(([, weight]) => typeof weight === "number" && weight > 0.12)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 3)
    .map(([hue]) => hue);

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
          Diamond optics
        </span>
        <span className="text-[9px] uppercase tracking-[0.14em] text-foreground/45">
          {status === "analyzing"
            ? "Reading source light…"
            : status === "ready"
              ? opticsControlsAreAuto(controls)
                ? "Matching source light"
                : "Custom"
              : status === "error"
                ? "Source light unread"
                : "Awaiting source"}
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <OpticsSlider
          label="Sparkle"
          hint="Number and intensity of facet flashes — never extra stones or glitter"
          value={controls.sparkle}
          onChange={set("sparkle")}
        />
        <OpticsSlider
          label="Rainbow fire"
          hint="Spectral dispersion only — stones keep their own body color"
          value={controls.fire}
          onChange={set("fire")}
        />
      </div>

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
          className="text-[10px] uppercase tracking-[0.14em] text-foreground/55 transition-colors hover:text-foreground"
        >
          {advancedOpen ? "Hide advanced" : "Advanced ▾"}
        </button>
        {!opticsControlsAreAuto(controls) ? (
          <button
            type="button"
            onClick={() => onChange({ ...AUTO_OPTICS_CONTROLS })}
            className="text-[10px] uppercase tracking-[0.14em] text-foreground/55 transition-colors hover:text-foreground"
          >
            Reset to auto
          </button>
        ) : null}
        {status === "error" && onAnalyze ? (
          <button
            type="button"
            onClick={onAnalyze}
            className="text-[10px] uppercase tracking-[0.14em] text-amber-200/80 transition-colors hover:text-amber-100"
          >
            Retry
          </button>
        ) : null}
      </div>

      {advancedOpen ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {ADVANCED.map((entry) => (
            <OpticsSlider
              key={entry.key}
              label={entry.label}
              hint={entry.hint}
              value={controls[entry.key]}
              onChange={set(entry.key)}
            />
          ))}
        </div>
      ) : null}

      {profile ? (
        <>
          <button
            type="button"
            onClick={() => setDetailsOpen((open) => !open)}
            className="mt-3 text-[10px] uppercase tracking-[0.14em] text-foreground/55 transition-colors hover:text-foreground"
          >
            {detailsOpen ? "Hide engineering details" : "Engineering details"}
          </button>
          {detailsOpen ? (
            <ul className="mt-2 space-y-0.5 text-[10px] text-foreground/60">
              <li>White brilliance {pct(profile.brilliance?.intensity, 0.6)} · contrast {pct(profile.brilliance?.contrast, 0.6)}</li>
              <li>
                Mixture white {pct(profile.brilliance?.whiteHighlightRatio, 0.75)} / fire{" "}
                {pct(profile.fire?.rainbowRatio, 0.25)}
              </li>
              <li>Fire {pct(profile.fire?.intensity, 0.3)} · saturation {pct(profile.fire?.saturation, 0.4)}{hues.length ? ` · hues ${hues.join(", ")}` : ""}</li>
              <li>
                Glints density {pct(profile.glints?.density, 0.4)} · median size{" "}
                {(profile.glints?.averageSize ?? 0.2).toFixed(2)}× stone · coverage{" "}
                {pct(profile.glints?.spatialCoverage, 0.18)}
              </li>
              <li>Bloom {pct(profile.bloom?.intensity, 0.2)} · starburst {pct(profile.starburst?.frequency, 0.1)}</li>
              <li>
                Lighting {profile.lighting?.dominantDirection ?? "unspecified"} · hardness{" "}
                {pct(profile.lighting?.hardness, 0.5)} · exposure {pct(profile.lighting?.exposure, 0.5)}
                {profile.lighting?.environmentTemperature ? ` · ${profile.lighting.environmentTemperature}` : ""}
              </li>
              <li>Confidence {pct(profile.confidence, 0.5)}{profile.stoneFamily ? ` · ${profile.stoneFamily}` : ""}</li>
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
