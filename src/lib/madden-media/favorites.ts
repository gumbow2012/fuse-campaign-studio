/**
 * Madden Media Studio — M9 favorites store.
 *
 * Reuses existing storage only: favorites live in localStorage keyed by the
 * signed-in user id. No new backend table, no provider calls, no credits.
 * Isolated to Madden Media Studio.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

export type MaddenFavoriteScope =
  | "recipe"
  | "cinematography"
  | "lighting"
  | "environment"
  | "shot-pack";

type FavoriteMap = Partial<Record<MaddenFavoriteScope, string[]>>;

const PREFIX = "madden-media:favorites:v1";

function storageKey(userId: string | null) {
  return `${PREFIX}:${userId ?? "anon"}`;
}

function readMap(userId: string | null): FavoriteMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: FavoriteMap = {};
    for (const [scope, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        out[scope as MaddenFavoriteScope] = value.filter(
          (entry): entry is string => typeof entry === "string",
        );
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeMap(userId: string | null, map: FavoriteMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(map));
  } catch {
    /* storage full / blocked — favorites are a convenience, never fatal */
  }
}

/** Per-user favorites for one picker scope. */
export function useMaddenFavorites(scope: MaddenFavoriteScope) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [ids, setIds] = useState<string[]>(() => readMap(userId)[scope] ?? []);

  useEffect(() => {
    setIds(readMap(userId)[scope] ?? []);
  }, [scope, userId]);

  const set = useMemo(() => new Set(ids), [ids]);

  const toggle = useCallback(
    (id: string) => {
      setIds((prev) => {
        const next = prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id];
        const map = readMap(userId);
        map[scope] = next;
        writeMap(userId, map);
        return next;
      });
    },
    [scope, userId],
  );

  const isFavorite = useCallback((id: string) => set.has(id), [set]);

  return { favoriteIds: ids, isFavorite, toggle };
}

/** Splits a list into favorites-first groups without reordering within groups. */
export function partitionFavorites<T>(list: T[], isFavorite: (item: T) => boolean) {
  const favorites: T[] = [];
  const rest: T[] = [];
  for (const item of list) (isFavorite(item) ? favorites : rest).push(item);
  return { favorites, rest };
}
