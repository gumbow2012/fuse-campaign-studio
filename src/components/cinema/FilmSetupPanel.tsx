import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type {
  ConfigSource,
  DirectorConfig,
  DirectorConfigField,
  FilmSetup,
} from "@/lib/cinema/types";

/**
 * Film Setup chip — structured production selectors. Writes config.filmSetup
 * with source "USER". Cinema-local; no shared code modified.
 */

export const PRODUCTION_TYPES = [
  "Narrative Film",
  "Music Video",
  "Fashion Film",
  "Streetwear Campaign",
  "Jewelry Commercial",
  "Beauty Commercial",
  "Automotive",
  "Sports",
  "Documentary",
  "UGC",
  "Infomercial",
  "Editorial",
  "Product Macro",
  "Luxury Campaign",
  "Experimental",
];

const GENRES = [
  "Drama",
  "Thriller",
  "Noir",
  "Romance",
  "Action",
  "Sci-Fi",
  "Horror",
  "Fantasy",
  "Comedy",
  "Street / Urban",
  "Luxury",
  "Minimal",
  "Surreal",
  "Documentary Realism",
];

const ERAS = [
  "Contemporary",
  "Near Future",
  "1950s",
  "1960s",
  "1970s",
  "1980s",
  "1990s",
  "Y2K",
  "2010s",
  "Retro-Futurist",
  "Timeless",
];

const TEMPOS = [
  "Still",
  "Very Slow",
  "Slow Burn",
  "Steady",
  "Rhythmic",
  "Energetic",
  "Frantic",
  "Staccato Cuts",
];

const PRODUCTION_VALUES = [
  "Guerrilla",
  "Indie",
  "Elevated Indie",
  "Commercial",
  "High-End Commercial",
  "Blockbuster",
  "Luxury Flagship",
];

const FORMATS = [
  "digital",
  "35mm film",
  "16mm film",
  "65mm film",
  "Super 8",
  "digital + film emulation",
];

export interface FilmSetupPanelProps {
  config: DirectorConfig;
  updateField: <F extends DirectorConfigField>(
    field: F,
    value: DirectorConfig[F]["value"],
    source?: ConfigSource,
  ) => void;
  advanced: boolean;
}

export default function FilmSetupPanel({ config, updateField, advanced }: FilmSetupPanelProps) {
  const filmSetup = config.filmSetup.value;

  const setFilmSetup = (patch: Partial<FilmSetup>) =>
    updateField("filmSetup", { ...filmSetup, ...patch }, "USER");

  return (
    <ScrollArea className="h-[62vh] pr-3">
      <div className="space-y-5 text-foreground">
        <ChoiceGroup
          label="Production Type"
          options={PRODUCTION_TYPES}
          value={filmSetup.productionType}
          onSelect={(productionType) => setFilmSetup({ productionType })}
        />
        <Separator className="bg-border/60" />
        <ChoiceGroup
          label="Genre"
          options={GENRES}
          value={filmSetup.genre}
          onSelect={(genre) => setFilmSetup({ genre })}
        />
        <Separator className="bg-border/60" />
        <ChoiceGroup
          label="Era"
          options={ERAS}
          value={filmSetup.era}
          onSelect={(era) => setFilmSetup({ era })}
        />
        <Separator className="bg-border/60" />
        <ChoiceGroup
          label="Tempo"
          options={TEMPOS}
          value={filmSetup.tempo}
          onSelect={(tempo) => setFilmSetup({ tempo })}
        />
        <Separator className="bg-border/60" />
        <ChoiceGroup
          label="Production Value"
          options={PRODUCTION_VALUES}
          value={filmSetup.productionValue}
          onSelect={(productionValue) => setFilmSetup({ productionValue })}
        />

        {advanced ? (
          <>
            <Separator className="bg-border/60" />
            <ChoiceGroup
              label="Capture Format"
              options={FORMATS}
              value={filmSetup.format}
              onSelect={(format) => setFilmSetup({ format })}
            />
            <ChoiceGroup
              label="Frame Rate"
              options={["24", "25", "30", "48", "60", "120"]}
              value={filmSetup.frameRate ? String(filmSetup.frameRate) : undefined}
              onSelect={(value) => setFilmSetup({ frameRate: Number(value) })}
            />
            <ChoiceGroup
              label="Shutter Angle"
              options={["45", "90", "180", "270", "360"]}
              value={filmSetup.shutterAngle ? String(filmSetup.shutterAngle) : undefined}
              onSelect={(value) => setFilmSetup({ shutterAngle: Number(value) })}
            />
          </>
        ) : null}
      </div>
    </ScrollArea>
  );
}

function ChoiceGroup({
  label,
  options,
  value,
  onSelect,
}: {
  label: string;
  options: string[];
  value?: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <h3 className="font-display text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </h3>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = value === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onSelect(option)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition-colors",
                active
                  ? "border-primary/70 bg-primary/15 text-foreground"
                  : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground",
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}
