import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Star, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import PresetPreview from "./PresetPreview";
import { resolvePreviewMedia, type CinemaPreviewCategory } from "@/lib/cinema/previewTypes";
import { toast } from "@/hooks/use-toast";
import type {
  CinemaPresetType,
  ConfigSource,
  DirectorConfig,
  DirectorConfigField,
} from "@/lib/cinema/types";
import {
  applyPresetFragment,
  availableScopes,
  capturePresetFragment,
  matchesQuery,
  SCOPE_LABELS,
  type ApplyScope,
  type LibraryPreset,
} from "@/lib/cinema/presetLibrary";
import {
  createPreset,
  deletePreset,
  listFavoritePresetIds,
  listRecentPresetIds,
  listUserPresets,
  recordPresetUse,
  toggleFavorite,
} from "@/services/cinemaStudio";

const PREVIEW_CATEGORY_BY_TYPE: Record<CinemaPresetType, CinemaPreviewCategory> = {
  camera: "CAMERA",
  lighting: "LIGHTING",
  color: "COLOR",
  movement: "MOVEMENT",
  full: "FULL",
};

export interface PresetLibrarySectionProps {
  type: CinemaPresetType;
  /** Builtin CODE presets for this library. */
  builtin: LibraryPreset[];
  categories: string[];
  config: DirectorConfig;
  /** Writes config[field] = { value, source }. */
  updateField: (
    field: DirectorConfigField,
    value: unknown,
    source?: ConfigSource,
  ) => void;
  /** Label for the save row, e.g. "Save Full Director preset". */
  saveLabel?: string;
  className?: string;
}

/**
 * Shared Cinema preset library — search (name + tags), category filter,
 * favorites, recents, user presets alongside builtins, PARTIAL APPLICATION
 * (Apply All / Camera / Lighting / Color / Movement only) and preset saving.
 *
 * Applying writes source "PRESET" and never clobbers a USER-edited field
 * unless the user picks "Overwrite my edits".
 */
export default function PresetLibrarySection({
  type,
  builtin,
  categories,
  config,
  updateField,
  saveLabel = "Save preset",
  className,
}: PresetLibrarySectionProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [recentOnly, setRecentOnly] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [userPresets, setUserPresets] = useState<LibraryPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [presetName, setPresetName] = useState("");
  const [presetTags, setPresetTags] = useState("");
  const [saving, setSaving] = useState(false);

  const refreshUserPresets = useCallback(async () => {
    const rows = await listUserPresets(type);
    setUserPresets(
      rows.map((row) => ({
        id: row.id,
        type: row.type,
        name: row.name,
        category: row.category || "My Presets",
        tags: row.tags,
        thumbnail: row.thumbnail || undefined,
        subtitle: "Saved by you",
        config: row.config,
        builtin: false,
        userId: row.userId,
      })),
    );
  }, [type]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [favs, recentIds] = await Promise.all([
          listFavoritePresetIds(type),
          listRecentPresetIds(type),
        ]);
        if (cancelled) return;
        setFavorites(favs);
        setRecents(recentIds);
        await refreshUserPresets();
      } catch {
        /* signed-out or offline — builtin library still works */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [type, refreshUserPresets]);

  const all = useMemo(() => [...userPresets, ...builtin], [userPresets, builtin]);

  const allCategories = useMemo(() => {
    const set = new Set<string>(categories);
    userPresets.forEach((p) => set.add(p.category));
    return Array.from(set);
  }, [categories, userPresets]);

  const visible = useMemo(() => {
    const list = all.filter((preset) => {
      if (category !== "All" && preset.category !== category) return false;
      if (favoritesOnly && !favorites.includes(preset.id)) return false;
      if (recentOnly && !recents.includes(preset.id)) return false;
      return matchesQuery(preset, query);
    });
    if (recentOnly) {
      return list
        .slice()
        .sort((a, b) => recents.indexOf(a.id) - recents.indexOf(b.id));
    }
    return list;
  }, [all, category, favoritesOnly, recentOnly, favorites, recents, query]);

  const apply = async (
    preset: LibraryPreset,
    scope: ApplyScope,
    overwriteUser: boolean,
  ) => {
    const result = applyPresetFragment({
      fragment: preset.config,
      scope,
      config,
      overwriteUser,
      updateField,
    });
    try {
      setRecents(await recordPresetUse(type, preset.id));
    } catch {
      /* recents are best-effort */
    }
    if (result.applied.length === 0) {
      toast({
        title: "Nothing applied",
        description: "Every field in that scope is a manual edit — use “Overwrite my edits”.",
      });
      return;
    }
    toast({
      title: `${preset.name} applied`,
      description:
        result.skipped.length > 0
          ? `${result.applied.length} field(s) set · ${result.skipped.length} of your edits kept`
          : `${result.applied.length} field(s) set`,
    });
  };

  const onToggleFavorite = async (presetId: string) => {
    try {
      setFavorites(await toggleFavorite(type, presetId));
    } catch (error) {
      toast({
        title: "Could not update favorites",
        description: error instanceof Error ? error.message : "Please retry.",
        variant: "destructive",
      });
    }
  };

  const onDelete = async (presetId: string) => {
    try {
      await deletePreset(presetId);
      await refreshUserPresets();
      toast({ title: "Preset deleted" });
    } catch (error) {
      toast({
        title: "Could not delete preset",
        description: error instanceof Error ? error.message : "Please retry.",
        variant: "destructive",
      });
    }
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await createPreset({
        type,
        name: presetName,
        category: "My Presets",
        tags: presetTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        config: capturePresetFragment(config, type),
      });
      setPresetName("");
      setPresetTags("");
      await refreshUserPresets();
      toast({ title: "Preset saved" });
    } catch (error) {
      toast({
        title: "Could not save preset",
        description: error instanceof Error ? error.message : "Please retry.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search presets — name or tags…"
      />

      <div className="flex flex-wrap gap-1.5">
        <Pill label="All" active={category === "All"} onClick={() => setCategory("All")} />
        {allCategories.map((cat) => (
          <Pill
            key={cat}
            label={cat}
            active={category === cat}
            onClick={() => setCategory(cat)}
          />
        ))}
        <Pill
          label={favoritesOnly ? "★ Favorites" : "☆ Favorites"}
          active={favoritesOnly}
          onClick={() => setFavoritesOnly((v) => !v)}
        />
        <Pill label="Recent" active={recentOnly} onClick={() => setRecentOnly((v) => !v)} />
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading your presets…
        </p>
      ) : null}

      {visible.length === 0 && !loading ? (
        <p className="text-sm text-muted-foreground">No presets match that filter.</p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {visible.map((preset) => {
          const scopes = availableScopes(preset.config);
          const isFavorite = favorites.includes(preset.id);
          return (
            <div
              key={preset.id}
              className="relative overflow-hidden rounded-xl border border-border/70 bg-card/60 transition-colors hover:border-primary/60"
            >
              <PresetPreview
                media={resolvePreviewMedia({
                  category: PREVIEW_CATEGORY_BY_TYPE[type],
                  preset,
                  swatches: (preset.config.color?.value.swatches ?? []).map((s) => s.hex),
                })}
                alt={preset.name}
              />
              <div className="space-y-1.5 px-2.5 py-2">
                <p className="font-display text-[11px] leading-tight text-foreground/90">
                  {preset.name}
                </p>
                {preset.subtitle ? (
                  <p className="text-[10px] leading-snug text-muted-foreground">
                    {preset.subtitle}
                  </p>
                ) : null}
                <p className="truncate text-[10px] text-muted-foreground/70">
                  {preset.tags.slice(0, 3).join(" · ")}
                </p>

                {scopes.length > 1 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" size="sm" variant="outline" className="h-7 w-full text-[10px]">
                        Apply ▾
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      {scopes.map((scope) => (
                        <DropdownMenuItem
                          key={scope}
                          onSelect={() => void apply(preset, scope, false)}
                        >
                          {SCOPE_LABELS[scope]}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => void apply(preset, "all", true)}>
                        Apply All · Overwrite my edits
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 w-full text-[10px]"
                    onClick={() => void apply(preset, "all", false)}
                  >
                    Apply
                  </Button>
                )}
              </div>

              <div className="absolute right-1.5 top-1.5 flex gap-1">
                {!preset.builtin ? (
                  <button
                    type="button"
                    aria-label="Delete preset"
                    onClick={() => void onDelete(preset.id)}
                    className="rounded-md bg-background/70 p-1 backdrop-blur"
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </button>
                ) : null}
                <button
                  type="button"
                  aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                  onClick={() => void onToggleFavorite(preset.id)}
                  className="rounded-md bg-background/70 p-1 backdrop-blur"
                >
                  <Star
                    className={cn(
                      "h-3 w-3",
                      isFavorite ? "fill-primary text-primary" : "text-muted-foreground",
                    )}
                  />
                </button>
              </div>

              {!preset.builtin ? (
                <Badge
                  variant="outline"
                  className="absolute left-1.5 top-1.5 h-4 px-1 text-[9px] uppercase tracking-[0.14em]"
                >
                  Mine
                </Badge>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="space-y-2 rounded-xl border border-border/70 bg-card/40 p-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {saveLabel}
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Preset name"
            className="h-8 flex-1 min-w-[140px] text-xs"
          />
          <Input
            value={presetTags}
            onChange={(e) => setPresetTags(e.target.value)}
            placeholder="tags, comma separated"
            className="h-8 flex-1 min-w-[140px] text-xs"
          />
          <Button
            type="button"
            size="sm"
            className="h-8"
            disabled={saving || !presetName.trim()}
            onClick={() => void onSave()}
          >
            {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Save
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Captures your current {type === "full" ? "full director setup" : `${type} settings`}.
        </p>
      </div>
    </div>
  );
}

function Pill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] transition-colors",
        active
          ? "border-primary/70 bg-primary/15 text-primary"
          : "border-border/70 text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
