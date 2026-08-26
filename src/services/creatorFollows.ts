/**
 * FUSE creator follows (additive, client-side).
 *
 * Writes go straight to `creator_follows` through the browser client — RLS
 * enforces that a user can only insert/delete/select rows where
 * `follower_user_id = auth.uid()`. Follower COUNTS are read server-side via the
 * `creator-portfolio` edge function (client reads are restricted).
 */

import { supabase } from "@/integrations/supabase/client";

const TABLE = "creator_follows";

/** Preview types don't include the social tables yet. */
function followsTable() {
  return (supabase as unknown as {
    from: (table: string) => any;
  }).from(TABLE);
}

async function requireViewerId() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Please sign in to follow creators.");
  return userId;
}

export async function followCreator(creatorUserId: string) {
  const followerUserId = await requireViewerId();
  if (followerUserId === creatorUserId) {
    throw new Error("You cannot follow your own profile.");
  }
  const { error } = await followsTable()
    .insert({ follower_user_id: followerUserId, creator_user_id: creatorUserId });
  // Already following (unique violation) is a no-op success.
  if (error && error.code !== "23505") throw new Error(error.message);
  return true;
}

export async function unfollowCreator(creatorUserId: string) {
  const followerUserId = await requireViewerId();
  const { error } = await followsTable()
    .delete()
    .eq("follower_user_id", followerUserId)
    .eq("creator_user_id", creatorUserId);
  if (error) throw new Error(error.message);
  return true;
}

/** Creator user ids the signed-in viewer follows (own rows only, per RLS). */
export async function listFollowedCreatorIds(): Promise<string[]> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return [];
  const { data, error } = await followsTable()
    .select("creator_user_id")
    .eq("follower_user_id", userId);
  if (error || !Array.isArray(data)) return [];
  return data
    .map((row: { creator_user_id?: unknown }) => String(row.creator_user_id ?? ""))
    .filter(Boolean);
}
