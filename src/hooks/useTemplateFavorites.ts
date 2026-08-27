/**
 * RETENTION P1 — template favorites.
 * Owner-only rows in public.template_favorites. Frontend only, no billing impact.
 */
import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { track } from "@/lib/analytics/track";

const KEY = (userId: string | null) => ["template-favorites", userId ?? "anon"] as const;

async function loadFavorites(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("template_favorites")
    .select("template_id")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((row) => String(row.template_id));
}

export function useTemplateFavorites() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const queryKey = KEY(userId);

  const favoritesQuery = useQuery<string[]>({
    queryKey,
    queryFn: () => loadFavorites(userId as string),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const favoriteIds = useMemo(
    () => new Set((favoritesQuery.data ?? []).map(String)),
    [favoritesQuery.data],
  );

  const toggleMutation = useMutation({
    mutationFn: async ({ templateId, next }: { templateId: string; next: boolean }) => {
      if (!userId) throw new Error("Sign in to save favorites.");
      if (next) {
        const { error } = await supabase
          .from("template_favorites")
          .upsert({ user_id: userId, template_id: templateId }, { onConflict: "user_id,template_id" });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("template_favorites")
          .delete()
          .eq("user_id", userId)
          .eq("template_id", templateId);
        if (error) throw error;
      }
    },
    onMutate: async ({ templateId, next }) => {
      const previous = queryClient.getQueryData<string[]>(queryKey) ?? [];
      const optimistic = next
        ? Array.from(new Set([...previous, templateId]))
        : previous.filter((id) => id !== templateId);
      queryClient.setQueryData(queryKey, optimistic);
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      toast({ title: "Could not update favorite", variant: "destructive" });
    },
    onSuccess: (_data, { templateId, next }) => {
      track(next ? "template_favorited" : "template_unfavorited", { template_id: templateId });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const isFavorite = useCallback((templateId: string) => favoriteIds.has(String(templateId)), [favoriteIds]);

  const toggleFavorite = useCallback(
    (templateId: string) => {
      const id = String(templateId);
      if (!id || !userId) return;
      toggleMutation.mutate({ templateId: id, next: !favoriteIds.has(id) });
    },
    [favoriteIds, toggleMutation, userId],
  );

  return {
    canFavorite: !!userId,
    favoriteIds,
    favoriteCount: favoriteIds.size,
    isFavorite,
    toggleFavorite,
    loading: favoritesQuery.isLoading,
  };
}
