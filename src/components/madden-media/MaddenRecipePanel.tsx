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
  onApply,
  onCustomize,
  onDelete,
}: {
  recipe: MaddenRecipe;
  disabled?: boolean;
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
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-semibold leading-tight tracking-tight">{recipe.name}</h4>
          {onDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 text-muted-foreground"
              aria-label={`Delete ${recipe.name}`}
              onClick={onDelete}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          ) : null}
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

  return (
    <section className="rounded-2xl border border-border/60 bg-card/50 p-4">
      <header>
        <h3 className="font-semibold tracking-tight">Recipes</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Prebuilt look bundles. Applying one never overwrites a locked slot you already filled —
          your settings win.
        </p>
      </header>

      <div className="mt-4">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Best-performing
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MADDEN_FEATURED_RECIPES.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              disabled={disabled}
              onApply={() => onApply(recipe)}
              onCustomize={() => onCustomize(recipe)}
            />
          ))}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          All recipes
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MADDEN_BUILTIN_RECIPES.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              disabled={disabled}
              onApply={() => onApply(recipe)}
              onCustomize={() => onCustomize(recipe)}
            />
          ))}
        </div>
      </div>

      <div className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            My recipes
          </p>
          <div className="flex items-center gap-2">
            <Input
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
              placeholder="Name this look"
              className="h-8 w-44 text-xs"
              disabled={disabled || saving}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
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
        ) : userRecipes.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
            No saved recipes yet. Dial in your cinematography, lighting and environment, then save
            the current setup as a recipe.
          </div>
        ) : (
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {userRecipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                disabled={disabled}
                onApply={() => onApply(recipe)}
                onCustomize={() => onCustomize(recipe)}
                onDelete={() => void handleDelete(recipe.id)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
