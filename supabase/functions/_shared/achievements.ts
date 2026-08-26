/**
 * Achievements engine (pure logic + real-signal collection).
 *
 * HARD RULES
 *  - Never fabricate progress: any signal that is not reliably available
 *    resolves to 0 (achievement stays locked).
 *  - Never grants credits. This module contains no billing/credit code at all;
 *    reward_type/reward_amount are passed through to the client as config only.
 *  - Unlocking is idempotent: an already-unlocked row keeps its original
 *    unlocked_at forever and never appears in `newlyUnlocked` again.
 *
 * No npm/deno imports here on purpose so the logic is unit-testable from the
 * frontend vitest suite with a mocked database.
 */

/** Minimal structural type so tests can inject a fake postgrest client. */
// deno-lint-ignore no-explicit-any
export type Db = { from: (table: string) => any };

export type AchievementAudience = "customer" | "creator";

export type AchievementDefinition = {
  key: string;
  title: string;
  description: string | null;
  icon: string | null;
  category: string | null;
  tier: string | null;
  audience: string | null;
  criteria: Record<string, unknown> | null;
  reward_type: string | null;
  reward_amount: number | null;
  action_label: string | null;
  action_url: string | null;
  active: boolean | null;
  sort_order: number | null;
};

export type AchievementProgress = { current: number; target: number };

export type UserAchievementRow = {
  achievement_key: string;
  progress: Record<string, unknown> | null;
  unlocked_at: string | null;
};

export type ResolvedAchievement = AchievementDefinition &
  AchievementProgress & { unlocked_at: string | null };

/** Every signal the seeded criteria can reference. Unknown types resolve to 0. */
export type Signals = {
  campaigns_completed: number;
  distinct_templates_used: number;
  cast_runs: number;
  distinct_cast_used: number;
  cinema_completed: number;
  outfit_swap_completed: number;
  jewelry_swap_completed: number;
  distinct_tools_used: number;
  brand_profiles_saved: number;
  creators_followed: number;
  new_feature_used: number;
  approved_templates: number;
  template_uses: number;
  followers: number;
  meta_verified_templates: number;
};

export const EMPTY_SIGNALS: Signals = {
  campaigns_completed: 0,
  distinct_templates_used: 0,
  cast_runs: 0,
  distinct_cast_used: 0,
  cinema_completed: 0,
  outfit_swap_completed: 0,
  jewelry_swap_completed: 0,
  distinct_tools_used: 0,
  brand_profiles_saved: 0,
  creators_followed: 0,
  new_feature_used: 0,
  approved_templates: 0,
  template_uses: 0,
  followers: 0,
  meta_verified_templates: 0,
};

/* --------------------------------- helpers -------------------------------- */

function criteriaType(definition: AchievementDefinition): string {
  const raw = (definition.criteria ?? {}) as Record<string, unknown>;
  return typeof raw.type === "string" ? raw.type.trim() : "";
}

export function criteriaTarget(definition: AchievementDefinition): number {
  const raw = (definition.criteria ?? {}) as Record<string, unknown>;
  const candidates = [raw.target, raw.count, raw.threshold, raw.value];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric);
  }
  return 1;
}

/** Honest current value for a definition — unknown criteria types yield 0. */
export function currentValue(definition: AchievementDefinition, signals: Signals): number {
  const type = criteriaType(definition) as keyof Signals;
  const value = (signals as Record<string, number>)[type];
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Customers see 'customer' achievements; creators additionally see 'creator'. */
export function visibleDefinitions(
  definitions: AchievementDefinition[],
  isCreator: boolean,
): AchievementDefinition[] {
  return definitions
    .filter((definition) => definition.active !== false)
    .filter((definition) => {
      const audience = (definition.audience ?? "customer").trim().toLowerCase();
      if (audience === "creator") return isCreator;
      return true;
    })
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.key.localeCompare(b.key));
}

export type EvaluationPlan = {
  achievements: ResolvedAchievement[];
  /** Rows to upsert into user_achievements (service role only). */
  upserts: Array<{
    user_id: string;
    achievement_key: string;
    progress: AchievementProgress;
    unlocked_at: string | null;
  }>;
  newlyUnlocked: string[];
};

/**
 * Computes progress and decides unlocks. `unlock=false` produces a read-only
 * view (the "list" action) with zero side effects planned.
 */
export function planEvaluation(input: {
  userId: string;
  definitions: AchievementDefinition[];
  existing: UserAchievementRow[];
  signals: Signals;
  isCreator: boolean;
  now?: string;
  unlock?: boolean;
}): EvaluationPlan {
  const now = input.now ?? new Date().toISOString();
  const unlock = input.unlock !== false;
  const existingByKey = new Map(input.existing.map((row) => [row.achievement_key, row]));
  const defs = visibleDefinitions(input.definitions, input.isCreator);

  const achievements: ResolvedAchievement[] = [];
  const upserts: EvaluationPlan["upserts"] = [];
  const newlyUnlocked: string[] = [];

  for (const definition of defs) {
    const target = criteriaTarget(definition);
    const stored = existingByKey.get(definition.key);
    const computed = currentValue(definition, input.signals);
    // Read-only mode reports the stored progress when we have it.
    const storedCurrent = Number((stored?.progress as { current?: unknown } | null)?.current ?? 0);
    const current = unlock ? computed : Math.max(computed, Number.isFinite(storedCurrent) ? storedCurrent : 0);

    let unlockedAt = stored?.unlocked_at ?? null;
    if (unlock) {
      const shouldUnlock = !unlockedAt && current >= target;
      if (shouldUnlock) {
        unlockedAt = now;
        newlyUnlocked.push(definition.key);
      }
      upserts.push({
        user_id: input.userId,
        achievement_key: definition.key,
        progress: { current, target },
        unlocked_at: unlockedAt,
      });
    }

    achievements.push({ ...definition, current, target, unlocked_at: unlockedAt });
  }

  return { achievements, upserts, newlyUnlocked };
}

export function summarize(achievements: ResolvedAchievement[]) {
  return {
    unlocked: achievements.filter((achievement) => Boolean(achievement.unlocked_at)).length,
    total: achievements.length,
  };
}

/* ---------------------------- real data signals ---------------------------- */

/** Key inside execution_jobs.input_payload holding the resolved cast runtime. */
const CAST_KEYS = ["__cast", "cast_a"];

function castAvatarId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  for (const key of CAST_KEYS) {
    const value = record[key];
    if (!value) continue;
    if (typeof value === "string") return value;
    if (typeof value === "object") {
      const avatar = (value as Record<string, unknown>).avatarId ??
        (value as Record<string, unknown>).avatar_id;
      if (typeof avatar === "string" && avatar.trim()) return avatar.trim();
      return "cast";
    }
  }
  return null;
}

async function safe<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (_error) {
    return fallback;
  }
}

async function countRows(db: Db, table: string, filters: Array<[string, unknown]>) {
  return await safe(async () => {
    let query = db.from(table).select("*", { count: "exact", head: true });
    for (const [column, value] of filters) query = query.eq(column, value);
    const { count, error } = await query;
    if (error) throw new Error(error.message);
    return Number(count ?? 0);
  }, 0);
}

/**
 * Collects the REAL current values. Every lookup is individually fault
 * tolerant: a missing table or column leaves that signal at 0 (locked) rather
 * than guessing.
 */
export async function collectSignals(db: Db, userId: string): Promise<Signals> {
  const signals: Signals = { ...EMPTY_SIGNALS };

  // Completed template campaigns (execution_jobs status='complete').
  const jobs = await safe(async () => {
    const { data, error } = await db
      .from("execution_jobs")
      .select("id, template_id, version_id, input_payload, status")
      .eq("user_id", userId)
      .eq("status", "complete");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<Record<string, unknown>>;
  }, [] as Array<Record<string, unknown>>);

  signals.campaigns_completed = jobs.length;
  const templateIds = new Set<string>();
  const castAvatars = new Set<string>();
  let castRuns = 0;
  for (const job of jobs) {
    const templateId = job.template_id ?? job.version_id;
    if (templateId) templateIds.add(String(templateId));
    const avatar = castAvatarId(job.input_payload);
    if (avatar) {
      castRuns += 1;
      castAvatars.add(avatar);
    }
  }
  signals.distinct_templates_used = templateIds.size;
  signals.cast_runs = castRuns;
  signals.distinct_cast_used = castAvatars.size;

  // Tool surfaces: studio_generations carries a `kind` per surface.
  const generations = await safe(async () => {
    const { data, error } = await db
      .from("studio_generations")
      .select("kind, status")
      .eq("user_id", userId)
      .eq("status", "complete");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<Record<string, unknown>>;
  }, [] as Array<Record<string, unknown>>);

  for (const generation of generations) {
    const kind = String(generation.kind ?? "").toLowerCase();
    if (kind.includes("cinema")) signals.cinema_completed += 1;
    if (kind.includes("outfit")) signals.outfit_swap_completed += 1;
    if (kind.includes("jewel")) signals.jewelry_swap_completed += 1;
  }

  signals.brand_profiles_saved = await countRows(db, "brand_profiles", [["user_id", userId]]);
  signals.creators_followed = await countRows(db, "creator_follows", [["follower_user_id", userId]]);
  signals.followers = await countRows(db, "creator_follows", [["creator_user_id", userId]]);

  signals.distinct_tools_used = [
    signals.campaigns_completed,
    signals.cast_runs,
    signals.cinema_completed,
    signals.outfit_swap_completed,
    signals.jewelry_swap_completed,
  ].filter((value) => value > 0).length;

  // Creator authorship: approved active versions of templates they authored.
  const ownedTemplates = await safe(async () => {
    const { data, error } = await db
      .from("fuse_templates")
      .select("id")
      .eq("created_by", userId);
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => String(row.id));
  }, [] as string[]);

  if (ownedTemplates.length) {
    signals.approved_templates = await safe(async () => {
      const { data, error } = await db
        .from("template_versions")
        .select("template_id, review_status, is_active")
        .in("template_id", ownedTemplates);
      if (error) throw new Error(error.message);
      const approved = new Set<string>();
      for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        const status = String(row.review_status ?? "").toLowerCase();
        if (row.is_active === true && (status.includes("approve") || status === "published")) {
          approved.add(String(row.template_id));
        }
      }
      return approved.size;
    }, 0);

    signals.template_uses = await safe(async () => {
      const { count, error } = await db
        .from("execution_jobs")
        .select("*", { count: "exact", head: true })
        .eq("status", "complete")
        .in("template_id", ownedTemplates);
      if (error) throw new Error(error.message);
      return Number(count ?? 0);
    }, 0);
  }

  // No reliable signal yet — deliberately left at 0 (locked, never faked):
  //   new_feature_used, meta_verified_templates
  return signals;
}
