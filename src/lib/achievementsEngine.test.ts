/**
 * Achievements engine contract: honest progress, idempotent unlocks,
 * read-only "list", creator audience gating, and zero credit side effects.
 */
import { describe, expect, it } from "vitest";
import {
  collectSignals,
  currentValue,
  EMPTY_SIGNALS,
  planEvaluation,
  summarize,
  visibleDefinitions,
  type AchievementDefinition,
  type Db,
} from "../../supabase/functions/_shared/achievements";

const def = (
  key: string,
  type: string,
  target: number,
  extra: Partial<AchievementDefinition> = {},
): AchievementDefinition => ({
  key,
  title: key,
  description: `${type} x${target}`,
  icon: null,
  category: "campaigns",
  tier: "bronze",
  audience: "customer",
  criteria: { type, target },
  reward_type: null,
  reward_amount: null,
  action_label: null,
  action_url: null,
  active: true,
  sort_order: 1,
  ...extra,
});

const definitions = [
  def("first_drop", "campaigns_completed", 1),
  def("ten_drops", "campaigns_completed", 10),
  def("social_butterfly", "creators_followed", 3),
  def("mystery", "some_future_signal", 1),
  def("creator_approved", "approved_templates", 1, { audience: "creator", key: "creator_approved" }),
];

describe("unlocking", () => {
  it("unlocks first_drop from >=1 complete job and is idempotent", () => {
    const signals = { ...EMPTY_SIGNALS, campaigns_completed: 1 };
    const first = planEvaluation({
      userId: "u1",
      definitions,
      existing: [],
      signals,
      isCreator: false,
      now: "2026-01-01T00:00:00Z",
    });
    expect(first.newlyUnlocked).toEqual(["first_drop"]);

    // Second call with the stored row: no re-unlock, original timestamp kept.
    const stored = first.upserts.map((row) => ({
      achievement_key: row.achievement_key,
      progress: row.progress,
      unlocked_at: row.unlocked_at,
    }));
    const second = planEvaluation({
      userId: "u1",
      definitions,
      existing: stored,
      signals,
      isCreator: false,
      now: "2026-02-02T00:00:00Z",
    });
    expect(second.newlyUnlocked).toEqual([]);
    const row = second.achievements.find((item) => item.key === "first_drop");
    expect(row?.unlocked_at).toBe("2026-01-01T00:00:00Z");
    // one upsert row per definition — never duplicated
    expect(second.upserts.filter((item) => item.achievement_key === "first_drop")).toHaveLength(1);
  });

  it("keeps an unmet achievement locked with current < target", () => {
    const plan = planEvaluation({
      userId: "u1",
      definitions,
      existing: [],
      signals: { ...EMPTY_SIGNALS, campaigns_completed: 1 },
      isCreator: false,
    });
    const ten = plan.achievements.find((item) => item.key === "ten_drops")!;
    expect(ten.unlocked_at).toBeNull();
    expect(ten.current).toBe(1);
    expect(ten.current).toBeLessThan(ten.target);
  });

  it("never fabricates progress for unknown signals", () => {
    expect(currentValue(definitions[3], { ...EMPTY_SIGNALS })).toBe(0);
  });

  it("shows creator achievements only to creators", () => {
    expect(visibleDefinitions(definitions, false).map((d) => d.key)).not.toContain("creator_approved");
    expect(visibleDefinitions(definitions, true).map((d) => d.key)).toContain("creator_approved");
  });

  it("summarizes real unlocked/total", () => {
    const plan = planEvaluation({
      userId: "u1",
      definitions,
      existing: [],
      signals: { ...EMPTY_SIGNALS, campaigns_completed: 1 },
      isCreator: false,
    });
    expect(summarize(plan.achievements)).toEqual({ unlocked: 1, total: 4 });
  });
});

describe("list is read-only", () => {
  it("plans no writes and no unlocks", () => {
    const plan = planEvaluation({
      userId: "u1",
      definitions,
      existing: [],
      signals: { ...EMPTY_SIGNALS, campaigns_completed: 50 },
      isCreator: false,
      unlock: false,
    });
    expect(plan.upserts).toEqual([]);
    expect(plan.newlyUnlocked).toEqual([]);
    expect(plan.achievements.every((item) => item.unlocked_at === null)).toBe(true);
  });
});

describe("signal collection", () => {
  const tablesTouched: string[] = [];

  const fakeDb: Db = {
    from(table: string) {
      tablesTouched.push(table);
      const rows: Record<string, unknown[]> = {
        execution_jobs: [
          { id: "j1", template_id: "t1", input_payload: { __cast: { avatarId: "a1" } }, status: "complete" },
          { id: "j2", template_id: "t1", input_payload: {}, status: "complete" },
        ],
        studio_generations: [{ kind: "cinema_shot", status: "complete" }],
        fuse_templates: [],
      };
      const counts: Record<string, number> = {
        creator_follows: 4,
        brand_profiles: 2,
      };
      const chain = {
        select(_cols: string, options?: { head?: boolean }) {
          const isCount = Boolean(options?.head);
          const result = isCount
            ? { count: counts[table] ?? 0, error: null }
            : { data: rows[table] ?? [], error: null };
          const q = {
            eq: () => q,
            in: () => q,
            then: (resolve: (value: unknown) => void) => {
              resolve(result);
              return Promise.resolve(result);
            },
          };
          return q;
        },
      };
      return chain;
    },
  };

  it("maps creators_followed to the real creator_follows count", async () => {
    const signals = await collectSignals(fakeDb, "u1");
    expect(signals.creators_followed).toBe(4);
    expect(signals.brand_profiles_saved).toBe(2);
    expect(signals.campaigns_completed).toBe(2);
    expect(signals.distinct_templates_used).toBe(1);
    expect(signals.cast_runs).toBe(1);
    expect(signals.distinct_cast_used).toBe(1);
    expect(signals.cinema_completed).toBe(1);
    // No reliable signal → honestly zero.
    expect(signals.new_feature_used).toBe(0);
    expect(signals.meta_verified_templates).toBe(0);
  });

  it("never touches credit or billing tables", async () => {
    tablesTouched.length = 0;
    await collectSignals(fakeDb, "u1");
    expect(tablesTouched.some((table) => /credit|ledger|stripe|billing|invoice/i.test(table))).toBe(false);
  });
});
