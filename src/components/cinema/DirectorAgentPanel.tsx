import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { requestAutoDirector, type DirectorProposalResult } from "@/services/cinemaStudio";
import type {
  DirectorConfig,
  DirectorConfigField,
  PartialDirectorConfig,
} from "@/lib/cinema/types";

/**
 * FUSE Director Agent — PROPOSES a config, never silently mutates.
 * Gemini runs ONLY when the user presses Auto Director. Analysis only: no
 * generation, no credit spend.
 */

export const PRODUCTION_TYPES = [
  "Commercial",
  "Fashion Film",
  "Music Video",
  "Product / Jewelry",
  "Narrative",
  "Social / UGC",
  "Documentary",
] as const;

const REVIEW_FIELDS: DirectorConfigField[] = [
  "camera",
  "lens",
  "aperture",
  "movement",
  "lighting",
  "color",
  "optics",
  "composition",
  "focus",
  "atmosphere",
];

const FIELD_LABELS: Partial<Record<DirectorConfigField, string>> = {
  camera: "Camera",
  lens: "Lens",
  aperture: "Aperture",
  movement: "Movement",
  lighting: "Lighting",
  color: "Color",
  optics: "Optics",
  composition: "Composition",
  focus: "Focus",
  atmosphere: "Atmosphere",
};

function describe(field: DirectorConfigField, value: unknown): string {
  const v = (value ?? {}) as Record<string, any>;
  switch (field) {
    case "camera":
      return [v.body, v.sensor, v.angle, v.distance].filter(Boolean).join(" · ");
    case "lens":
      return [v.focalLengthMm ? `${v.focalLengthMm}mm` : null, v.type, v.character]
        .filter(Boolean)
        .join(" · ");
    case "aperture":
      return [v.fStop ? `f/${v.fStop}` : null, v.depthOfField, v.bokeh]
        .filter(Boolean)
        .join(" · ");
    case "movement":
      return [v.motionType, v.direction, v.speed, v.easing].filter(Boolean).join(" · ");
    case "lighting":
      return [
        v.mood,
        v.ratio,
        Array.isArray(v.lights) && v.lights.length ? `${v.lights.length} fixtures` : null,
      ]
        .filter(Boolean)
        .join(" · ");
    case "color":
      return [v.shadowHue, v.midtoneHue, v.highlightHue].filter(Boolean).join(" → ");
    case "optics":
      return [v.flare && v.flare !== "none" ? `flare ${v.flare}` : null, `diffusion ${v.diffusion ?? 0}`, `halation ${v.halation ?? 0}`]
        .filter(Boolean)
        .join(" · ");
    case "composition":
      return [v.framing, v.rule, v.subjectPlacement].filter(Boolean).join(" · ");
    case "focus":
      return [v.focusTarget, v.focusMode, v.rackDirection !== "none" ? v.rackDirection : null]
        .filter(Boolean)
        .join(" · ");
    case "atmosphere":
      return [v.weather, v.timeOfDay, v.particles && v.particles !== "none" ? v.particles : null]
        .filter(Boolean)
        .join(" · ");
    default:
      return "—";
  }
}

function swatches(proposal: PartialDirectorConfig): string[] {
  const list = (proposal.color?.value as any)?.swatches;
  return Array.isArray(list) ? list.map((s: any) => String(s?.hex ?? "")).filter(Boolean) : [];
}

export interface DirectorAgentPanelProps {
  config: DirectorConfig;
  prompt: string;
  model: string;
  /** Merges the proposal, skipping any field whose current source is "USER". */
  onApply: (proposal: PartialDirectorConfig) => void;
}

export default function DirectorAgentPanel({
  config,
  prompt,
  model,
  onApply,
}: DirectorAgentPanelProps) {
  const [productionType, setProductionType] = useState<string>("Commercial");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DirectorProposalResult | null>(null);
  const [openWhy, setOpenWhy] = useState<DirectorConfigField | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await requestAutoDirector({
        prompt,
        productionType,
        model,
        filmSetup: config.filmSetup?.value,
      });
      setResult(res);
      setOpenWhy(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Auto Director failed — please retry.");
    } finally {
      setLoading(false);
    }
  };

  const proposal = result?.proposal ?? null;
  const paletteSwatches = proposal ? swatches(proposal) : [];

  return (
    <div className="fuse-panel space-y-4 rounded-2xl p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="font-display text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
            Production
          </span>
          <Select value={productionType} onValueChange={setProductionType}>
            <SelectTrigger className="w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRODUCTION_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="secondary"
          onClick={run}
          disabled={loading || !prompt.trim()}
          className="font-display tracking-[0.16em]"
        >
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          AUTO DIRECTOR
        </Button>

        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Proposes a setup · no credits
        </span>
      </div>

      {!prompt.trim() ? (
        <p className="text-xs text-muted-foreground">
          Describe your scene first — the Director reads the prompt.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {proposal ? (
        <div className="space-y-3 rounded-xl border border-border/60 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <h3 className="font-display text-sm uppercase tracking-[0.18em]">
                FUSE Director Suggests
              </h3>
              {result?.summary ? (
                <p className="max-w-xl text-xs text-muted-foreground">{result.summary}</p>
              ) : null}
            </div>
            <Button
              size="sm"
              className="font-display tracking-[0.16em]"
              onClick={() => onApply(proposal)}
            >
              APPLY
            </Button>
          </div>

          {paletteSwatches.length ? (
            <div className="flex h-3 overflow-hidden rounded-full">
              {paletteSwatches.map((hex, i) => (
                <div key={`${hex}-${i}`} className="flex-1" style={{ backgroundColor: hex }} />
              ))}
            </div>
          ) : null}

          <ul className="space-y-1.5">
            {REVIEW_FIELDS.map((field) => {
              const entry = proposal[field];
              if (!entry) return null;
              const why = result?.rationale?.[field];
              const locked = config[field]?.source === "USER";
              return (
                <li key={field} className="rounded-lg bg-muted/30 p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display w-[92px] shrink-0 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      {FIELD_LABELS[field] ?? field}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {describe(field, entry.value) || "—"}
                    </span>
                    {locked ? (
                      <Badge variant="outline" className="text-[9px] uppercase tracking-[0.14em]">
                        Your edit kept
                      </Badge>
                    ) : null}
                    {why ? (
                      <button
                        type="button"
                        onClick={() => setOpenWhy(openWhy === field ? null : field)}
                        className="flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
                        aria-expanded={openWhy === field}
                      >
                        Why this?
                        <ChevronDown
                          className={`h-3 w-3 transition-transform ${
                            openWhy === field ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                    ) : null}
                  </div>
                  {openWhy === field && why ? (
                    <p className="mt-2 border-l border-border/70 pl-2.5 text-[11px] leading-relaxed text-muted-foreground">
                      {why}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Apply keeps every field you edited yourself
          </p>
        </div>
      ) : null}
    </div>
  );
}
