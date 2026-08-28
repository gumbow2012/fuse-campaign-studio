/**
 * Madden Media Studio — M4 preset picker.
 *
 * Pure data + selection: searchable grid of curated presets, no provider calls.
 * Shared by the Cinematography, Lighting and Environment sections.
 */
import { useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { findPreset, searchPresets, type MaddenPreset } from "@/lib/madden-media/presetTypes";

type Props = {
  title: string;
  description: string;
  presets: MaddenPreset[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

export default function MaddenPresetPicker({
  title,
  description,
  presets,
  selectedId,
  onSelect,
}: Props) {
  const [query, setQuery] = useState("");
  const selected = useMemo(() => findPreset(presets, selectedId), [presets, selectedId]);
  const results = useMemo(() => searchPresets(presets, query), [presets, query]);

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
        />
      </div>

      <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {results.map((preset) => {
          const active = preset.id === selectedId;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelect(active ? null : preset.id)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                active
                  ? "border-primary/60 bg-primary/10"
                  : "border-border/60 bg-background/40 hover:border-border hover:bg-background/70"
              }`}
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
          );
        })}
        {results.length === 0 ? (
          <p className="text-xs text-muted-foreground">No presets match that search.</p>
        ) : null}
      </div>
    </section>
  );
}
