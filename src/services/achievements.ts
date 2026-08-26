/**
 * Achievements client (additive, read + evaluate only).
 * Never grants or displays a credit reward — reward config is ignored here.
 */
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type Achievement = {
  key: string;
  title: string;
  description: string | null;
  icon: string | null;
  category: string | null;
  tier: string | null;
  audience: string | null;
  action_label: string | null;
  action_url: string | null;
  current: number;
  target: number;
  unlocked_at: string | null;
};

export type AchievementsResult = {
  achievements: Achievement[];
  newlyUnlocked: string[];
  summary: { unlocked: number; total: number };
  isCreator: boolean;
};

const EMPTY: AchievementsResult = {
  achievements: [],
  newlyUnlocked: [],
  summary: { unlocked: 0, total: 0 },
  isCreator: false,
};

async function call(action: "list" | "evaluate"): Promise<AchievementsResult> {
  const { data, error } = await supabase.functions.invoke("achievements", { body: { action } });
  if (error) throw new Error(error.message);
  const payload = (data ?? {}) as Partial<AchievementsResult> & { error?: string };
  if (payload.error) throw new Error(payload.error);
  return {
    achievements: Array.isArray(payload.achievements) ? payload.achievements : [],
    newlyUnlocked: Array.isArray(payload.newlyUnlocked) ? payload.newlyUnlocked : [],
    summary: payload.summary ?? { unlocked: 0, total: 0 },
    isCreator: Boolean(payload.isCreator),
  };
}

export async function listAchievements() {
  return call("list");
}

export async function evaluateAchievements() {
  return call("evaluate");
}

/* ----------------------------- unlock announcing ---------------------------- */

const TOAST_STORAGE_KEY = "fuse.achievements.toasted";

function announcedKeys(): string[] {
  try {
    const raw = localStorage.getItem(TOAST_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function remember(keys: string[]) {
  try {
    const merged = Array.from(new Set([...announcedKeys(), ...keys])).slice(-200);
    localStorage.setItem(TOAST_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    /* storage unavailable — worst case the toast repeats once */
  }
}

/** One tasteful toast per newly unlocked achievement, debounced across reloads. */
export function announceUnlocks(result: AchievementsResult) {
  const seen = new Set(announcedKeys());
  const fresh = result.newlyUnlocked.filter((key) => !seen.has(key));
  if (!fresh.length) return [];

  for (const key of fresh) {
    const achievement = result.achievements.find((item) => item.key === key);
    toast({
      title: `ACHIEVEMENT UNLOCKED — ${achievement?.title ?? key}`,
      description: achievement?.description ?? undefined,
    });
  }
  remember(fresh);
  return fresh;
}

/** Fire-and-forget evaluation after a real action (run finished, follow, etc.). */
export async function evaluateAndAnnounce() {
  try {
    const result = await evaluateAchievements();
    announceUnlocks(result);
    return result;
  } catch {
    return EMPTY;
  }
}
