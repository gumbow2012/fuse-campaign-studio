/**
 * Social contract tests: follow/unfollow ownership scoping, self-follow guard,
 * the creator-portfolio public payload (followerCount + isFollowing +
 * verification_status, never verification_reason) and the empty
 * "creators you follow" shelf.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  userId: "viewer-1" as string | null,
  inserted: [] as Array<Record<string, unknown>>,
  deleted: [] as Array<Record<string, unknown>>,
  selectRows: [] as Array<Record<string, unknown>>,
  invokePayload: {} as Record<string, unknown>,
};

vi.mock("@/integrations/supabase/client", () => {
  const eqFilters: Record<string, unknown> = {};
  return {
    supabase: {
      auth: {
        getSession: async () => ({
          data: { session: state.userId ? { user: { id: state.userId } } : null },
        }),
      },
      functions: {
        invoke: async () => ({ data: state.invokePayload, error: null }),
      },
      from: (table: string) => ({
        insert: async (row: Record<string, unknown>) => {
          state.inserted.push({ table, ...row });
          return { error: null };
        },
        delete: () => {
          const filters: Record<string, unknown> = {};
          const chain = {
            eq(column: string, value: unknown) {
              filters[column] = value;
              return chain;
            },
            then(resolve: (value: { error: null }) => void) {
              state.deleted.push({ table, ...filters });
              resolve({ error: null });
              return Promise.resolve({ error: null });
            },
          };
          return chain;
        },
        select: () => {
          const chain = {
            eq(column: string, value: unknown) {
              eqFilters[column] = value;
              return chain;
            },
            then(resolve: (value: { data: unknown; error: null }) => void) {
              resolve({ data: state.selectRows, error: null });
              return Promise.resolve({ data: state.selectRows, error: null });
            },
          };
          return chain;
        },
      }),
    },
  };
});

import {
  followCreator,
  listFollowedCreatorIds,
  unfollowCreator,
} from "@/services/creatorFollows";
import { loadCreatorSocialPublic } from "@/services/creatorDashboard";

beforeEach(() => {
  state.userId = "viewer-1";
  state.inserted = [];
  state.deleted = [];
  state.selectRows = [];
  state.invokePayload = {};
});

describe("follow writes", () => {
  it("inserts a row scoped to the signed-in viewer", async () => {
    await followCreator("creator-9");
    expect(state.inserted).toEqual([
      { table: "creator_follows", follower_user_id: "viewer-1", creator_user_id: "creator-9" },
    ]);
  });

  it("deletes only the viewer's own row on unfollow", async () => {
    await unfollowCreator("creator-9");
    expect(state.deleted).toEqual([
      { table: "creator_follows", follower_user_id: "viewer-1", creator_user_id: "creator-9" },
    ]);
  });

  it("refuses a self-follow", async () => {
    await expect(followCreator("viewer-1")).rejects.toThrow(/own profile/i);
    expect(state.inserted).toHaveLength(0);
  });

  it("requires sign-in", async () => {
    state.userId = null;
    await expect(followCreator("creator-9")).rejects.toThrow(/sign in/i);
  });
});

describe("creator-portfolio public social payload", () => {
  it("returns followerCount, isFollowing and verification_status", async () => {
    state.invokePayload = {
      followerCount: 42,
      isFollowing: true,
      verification_status: "partner",
      verified_at: "2026-01-01T00:00:00Z",
      publishedCount: 3,
    };
    const social = await loadCreatorSocialPublic({ handle: "kade" });
    expect(social.followerCount).toBe(42);
    expect(social.isFollowing).toBe(true);
    expect(social.verificationStatus).toBe("partner");
  });

  it("never surfaces verification_reason even if present upstream", async () => {
    state.invokePayload = {
      followerCount: 1,
      isFollowing: false,
      verification_status: "verified",
      verification_reason: "internal note",
    };
    const social = await loadCreatorSocialPublic({ handle: "kade" });
    expect(Object.keys(social)).not.toContain("verification_reason");
    expect(JSON.stringify(social)).not.toContain("internal note");
  });
});

describe("creators you follow shelf", () => {
  it("is empty when the viewer follows nobody", async () => {
    state.selectRows = [];
    expect(await listFollowedCreatorIds()).toEqual([]);
  });

  it("is empty for signed-out visitors", async () => {
    state.userId = null;
    state.selectRows = [{ creator_user_id: "creator-9" }];
    expect(await listFollowedCreatorIds()).toEqual([]);
  });

  it("returns followed creator ids for the viewer", async () => {
    state.selectRows = [{ creator_user_id: "creator-9" }, { creator_user_id: "creator-4" }];
    expect(await listFollowedCreatorIds()).toEqual(["creator-9", "creator-4"]);
  });
});
