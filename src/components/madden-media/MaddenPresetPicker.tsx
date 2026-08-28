/**
 * Madden Media Studio — M4 preset picker (M9: search + favorites).
 *
 * Pure data + selection: searchable grid of curated presets, no provider calls.
 * Shared by the Cinematography, Lighting and Environment sections.
 */
import { useMemo, useState } from "react";
import { Check, Search, Star, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { findPreset, searchPresets, type MaddenPreset } from "@/lib/madden-media/presetTypes";
import {
  partitionFavorites,
  useMaddenFavorites,
  type MaddenFavoriteScope,
} from "@/lib/madden-media/favorites";

type Props = {
  title: string;
  description: string;
  presets: MaddenPreset[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Favorites bucket this picker writes to. */
  favoriteScope: MaddenFavoriteScope;
};

export default function MaddenPresetPicker({
  title,
  description,
  presets,
  selectedId,
  onSelect,
  favoriteScope,
}: Props) {
  const [query, setQuery] = useState("");
  const { isFavorite, toggle } = useMaddenFavorites(favoriteScope);
  const selected = useMemo(() => findPreset(presets, selectedId), [presets, selectedId]);
  const results = useMemo(() => searchPresets(presets, query), [presets, query]);
  const { favorites, rest } = useMemo(
    () => partitionFavorites(results, (preset) => isFavorite(preset.id)),
    [results, isFavorite],
  );

  const renderCard = (preset: MaddenPreset) => {
    const active = preset.id === selectedId;
    const starred = isFavorite(preset.id);
    return (
      <div
        key={preset.id}
        className={`relative rounded-xl border transition-colors ${
          active
            ? "border-primary/60 bg-primary/10"
            : "border-border/60 bg-background/40 hover:border-border hover:bg-background/70"
        }`}
      >
        <button
          type="button"
          onClick={() => onSelect(active ? null : preset.id)}
          className="w-full p-3 pr-10 text-left"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{preset.name}</span>
            {active ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{preset.description}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {preset.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1 h-8 w-8 text-muted-foreground"
          aria-label={starred ? `Unfavorite ${preset.name}` : `Favorite ${preset.name}`}
          aria-pressed={starred}
          onClick={() => toggle(preset.id)}
        >
          <Star className={`h-3.5 w-3.5 ${starred ? "fill-primary text-primary" : ""}`} />
        </Button>
      </div>
    );
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-card/50 p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold tracking-tight">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        {selected ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 text-xs"
            onClick={() => onSelect(null)}
          >
            <X className="mr-1 h-3 w-3" />
            Clear
          </Button>
        ) : null}
      </header>

      {selected ? (
        <div className="mt-3 rounded-xl border border-primary/40 bg-primary/5 p-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Selected</p>
          <p className="mt-0.5 text-sm font-semibold">{selected.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">{selected.description}</p>
        </div>
      ) : null}

      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${title.toLowerCase()}…`}
          className="pl-8"
          aria-label={`Search ${title}`}
        />
      </div>

      <div className="mt-3 max-h-72 space-y-3 overflow-y-auto pr-1">
        {favorites.length > 0 ? (
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Favorites
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">{favorites.map(renderCard)}</div>
          </div>
        ) : null}

        {rest.length > 0 ? (
          <div>
            {favorites.length > 0 ? (
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                All {title.toLowerCase()}
              </p>
            ) : null}
            <div className="mt-2 grid gap-2 sm:grid-cols-2">{rest.map(renderCard)}</div>
          </div>
        ) : null}

        {results.length === 0 ? (
          <p className="text-xs text-muted-foreground">No presets match that search.</p>
        ) : null}
      </div>
    </section>
  );
}
