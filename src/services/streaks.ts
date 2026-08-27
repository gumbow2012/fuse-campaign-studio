import { supabase } from "@/integrations/supabase/client";

export interface UserStreak {
  user_id: string;
  current_streak: number;
  longest_streak: number;
  last_active_on: string | null;
  total_active_days: number;
  updated_at: string;
}

/** Reads the signed-in user's streak row (RLS scopes it). Null when none yet. */
export async function getMyStreak(): Promise<UserStreak | null> {
  const { data, error } = await (supabase as any)
    .from("user_streaks")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return (data as UserStreak | null) ?? null;
}

/** Records today's activity. Idempotent per day; returns the updated row. */
export async function touchStreak(): Promise<UserStreak | null> {
  const { data, error } = await (supabase as any).rpc("touch_user_streak");
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as UserStreak | null) ?? null;
}

export const STREAK_MILESTONES = [3, 7, 14, 30];

/** Days between two YYYY-MM-DD dates (UTC-safe). */
export function daysBetween(fromIso: string, toIso: string) {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
