/**
 * Madden Media Studio — M5 recipe cards (M9: search + favorites).
 *
 * Pure structured data + UI: builtin recipes come from code, user recipes from
 * public.madden_recipes. Nothing here generates or spends credits.
 */
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Loader2,
  Plus,
  Search,
  Sliders,
  Sparkles,
  Star,
  Trash2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MADDEN_BUILTIN_RECIPES,
  MADDEN_FEATURED_RECIPES,
  describeRecipe,
  type MaddenRecipe,
} from "@/lib/madden-media/recipes";
import { partitionFavorites, useMaddenFavorites } from "@/lib/madden-media/favorites";
import { deleteUserRecipe, listUserRecipes } from "@/services/maddenMediaStudio";

type Props = {
  disabled?: boolean;
  onApply: (recipe: MaddenRecipe) => void;
  onCustomize: (recipe: MaddenRecipe) => void;
  onSaveCurrent: (name: string) => Promise<void>;
  /** Bumped by the parent after a successful save to refresh "My Recipes". */
  refreshKey?: number;
};

function matchesQuery(recipe: MaddenRecipe, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    recipe.name.toLowerCase().includes(q) ||
    recipe.tags.some((tag) => tag.toLowerCase().includes(q))
  );
}


function RecipeCard({
  recipe,
  disabled,
  starred,
  onToggleFavorite,
  onApply,
  onCustomize,
  onDelete,
}: {
  recipe: MaddenRecipe;
  disabled?: boolean;
  starred: boolean;
  onToggleFavorite: () => void;
  onApply: () => void;
  onCustomize: () => void;
  onDelete?: () => void;
}) {
  const parts = useMemo(() => describeRecipe(recipe.config), [recipe.config]);

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card/60">
      <div className="flex h-24 items-center justify-center bg-gradient-to-br from-primary/15 via-transparent to-muted/40">
        {recipe.thumbnail ? (
          <img
            src={recipe.thumbnail}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <Sparkles className="h-5 w-5 text-primary/70" aria-hidden />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-1">
          <h4 className="text-sm font-semibold leading-tight tracking-tight">{recipe.name}</h4>
          <div className="flex shrink-0 items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              aria-label={starred ? `Unfavorite ${recipe.name}` : `Favorite ${recipe.name}`}
              aria-pressed={starred}
              onClick={onToggleFavorite}
            >
              <Star className={`h-3 w-3 ${starred ? "fill-primary text-primary" : ""}`} />
            </Button>
            {onDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                aria-label={`Delete ${recipe.name}`}
                onClick={onDelete}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            ) : null}
          </div>
        </div>


        {parts.length > 0 ? (
          <p className="text-[11px] leading-snug text-muted-foreground">{parts.join(" · ")}</p>
        ) : (
          <p className="text-[11px] text-muted-foreground">No presets set yet.</p>
        )}

        {recipe.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {recipe.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-auto flex gap-1.5 pt-1">
          <Button
            type="button"
            size="sm"
            className="h-7 flex-1 text-xs"
            disabled={disabled}
            onClick={onApply}
          >
            <Wand2 className="mr-1 h-3 w-3" />
            Apply
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={disabled}
            onClick={onCustomize}
          >
            <Sliders className="mr-1 h-3 w-3" />
            Customize
          </Button>
        </div>
      </div>
    </article>
  );
}

export default function MaddenRecipePanel({
  disabled,
  onApply,
  onCustomize,
  onSaveCurrent,
  refreshKey = 0,
}: Props) {
  const [userRecipes, setUserRecipes] = useState<MaddenRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const { isFavorite, toggle } = useMaddenFavorites("recipe");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listUserRecipes();
      setUserRecipes(rows.filter((row) => !row.builtin));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your recipes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveCurrent(saveName);
      setSaveName("");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteUserRecipe(id);
      setUserRecipes((prev) => prev.filter((row) => row.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete that recipe");
    }
  };

  const allRecipes = useMemo(
    () => [...MADDEN_BUILTIN_RECIPES, ...userRecipes],
    [userRecipes],
  );

  const featured = useMemo(
    () => MADDEN_FEATURED_RECIPES.filter((recipe) => matchesQuery(recipe, query)),
    [query],
  );
  const builtins = useMemo(
    () => MADDEN_BUILTIN_RECIPES.filter((recipe) => matchesQuery(recipe, query)),
    [query],
  );
  const mine = useMemo(
    () => userRecipes.filter((recipe) => matchesQuery(recipe, query)),
    [userRecipes, query],
  );
  const favorites = useMemo(
    () =>
      partitionFavorites(allRecipes, (recipe) => isFavorite(recipe.id)).favorites.filter((recipe) =>
        matchesQuery(recipe, query),
      ),
    [allRecipes, isFavorite, query],
  );

  const card = (recipe: MaddenRecipe, deletable = false) => (
    <RecipeCard
      key={recipe.id}
      recipe={recipe}
      disabled={disabled}
      starred={isFavorite(recipe.id)}
      onToggleFavorite={() => toggle(recipe.id)}
      onApply={() => onApply(recipe)}
      onCustomize={() => onCustomize(recipe)}
      onDelete={deletable ? () => void handleDelete(recipe.id) : undefined}
    />
  );

  const groupClass = "mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3";
  const labelClass = "text-[11px] uppercase tracking-[0.16em] text-muted-foreground";

  return (
    <section className="rounded-2xl border border-border/60 bg-card/50 p-4">
      <header>
        <h3 className="font-semibold tracking-tight">Recipes</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Prebuilt look bundles. Applying one never overwrites a locked slot you already filled —
          your settings win.
        </p>
      </header>

      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search recipes by name or tag…"
          className="pl-8"
          aria-label="Search recipes"
        />
      </div>

      {favorites.length > 0 ? (
        <div className="mt-4">
          <p className={labelClass}>Favorites</p>
          <div className={groupClass}>{favorites.map((recipe) => card(recipe, !recipe.builtin))}</div>
        </div>
      ) : null}

      {featured.length > 0 ? (
        <div className="mt-6">
          <p className={labelClass}>Best-performing</p>
          <div className={groupClass}>{featured.map((recipe) => card(recipe))}</div>
        </div>
      ) : null}

      <div className="mt-6">
        <p className={labelClass}>All recipes</p>
        {builtins.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">No recipes match that search.</p>
        ) : (
          <div className={groupClass}>{builtins.map((recipe) => card(recipe))}</div>
        )}
      </div>

      <div className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className={labelClass}>My recipes</p>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Input
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
              placeholder="Name this look"
              className="h-8 flex-1 text-xs sm:w-44 sm:flex-none"
              disabled={disabled || saving}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 shrink-0 text-xs"
              disabled={disabled || saving || !saveName.trim()}
              onClick={() => void handleSave()}
            >
              {saving ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Plus className="mr-1 h-3 w-3" />
              )}
              Save as recipe
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-dashed border-border/60 p-6 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading your recipes…
          </div>
        ) : error ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-xs text-destructive">
            <span className="flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => void load()}
            >
              Retry
            </Button>
          </div>
        ) : mine.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
            {userRecipes.length === 0
              ? "No saved recipes yet. Dial in your cinematography, lighting and environment, then save the current setup as a recipe."
              : "None of your recipes match that search."}
          </div>
        ) : (
          <div className={groupClass}>{mine.map((recipe) => card(recipe, true))}</div>
        )}
      </div>
    </section>
  );
}

