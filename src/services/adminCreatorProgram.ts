/**
 * Admin helpers for the FUSE Creator Program (ADDITIVE, read + status updates only).
 *
 * Reads/writes `public.creator_applications` and `public.creator_challenges`.
 * Admin gating is enforced by RLS. The generated preview types don't include
 * these tables, so the client is loosely typed here.
 *
 * No credit_ledger writes, no pricing/Stripe logic, no generation code.
 */

import { supabase } from "@/integrations/supabase/client";

type LooseResult = { data: unknown; error: { message: string } | null };

interface LooseBuilder extends PromiseLike<LooseResult> {
  select: (columns?: string) => LooseBuilder;
  insert: (values: unknown) => LooseBuilder;
  update: (values: unknown) => LooseBuilder;
  eq: (column: string, value: unknown) => LooseBuilder;
  order: (column: string, options?: { ascending: boolean }) => LooseBuilder;
}

const db = supabase as unknown as { from: (table: string) => LooseBuilder };

export type ApplicationStatus = "pending" | "approved" | "rejected";

export type CreatorApplicationRow = {
  id: string;
  email: string | null;
  name: string | null;
  portfolio_url: string | null;
  instagram: string | null;
  tiktok: string | null;
  x_handle: string | null;
  pitch: string | null;
  status: string;
  created_at: string | null;
  reviewed_at: string | null;
};

export type CreatorChallengeRow = {
  id: string;
  title: string | null;
  description: string | null;
  brief: string | null;
  reward_note: string | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string | null;
};

function str(value: unknown): string | null {
  return value === null || value === undefined || value === "" ? null : String(value);
}

export async function loadCreatorApplications(): Promise<CreatorApplicationRow[]> {
  const { data, error } = await db
    .from("creator_applications")
    .select("id,email,name,portfolio_url,instagram,tiktok,x_handle,pitch,status,created_at,reviewed_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) return [];

  return (data as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    email: str(row.email),
    name: str(row.name),
    portfolio_url: str(row.portfolio_url),
    instagram: str(row.instagram),
    tiktok: str(row.tiktok),
    x_handle: str(row.x_handle),
    pitch: str(row.pitch),
    status: str(row.status) ?? "pending",
    created_at: str(row.created_at),
    reviewed_at: str(row.reviewed_at),
  }));
}

export async function setApplicationStatus(
  id: string,
  status: ApplicationStatus,
  reviewerId: string | null,
): Promise<void> {
  const { error } = await db
    .from("creator_applications")
    .update({ status, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function loadAllChallenges(): Promise<CreatorChallengeRow[]> {
  const { data, error } = await db
    .from("creator_challenges")
    .select("id,title,description,brief,reward_note,status,starts_at,ends_at,created_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) return [];

  return (data as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    title: str(row.title),
    description: str(row.description),
    brief: str(row.brief),
    reward_note: str(row.reward_note),
    status: str(row.status) ?? "active",
    starts_at: str(row.starts_at),
    ends_at: str(row.ends_at),
    created_at: str(row.created_at),
  }));
}

export type ChallengeDraft = {
  title: string;
  description?: string | null;
  brief?: string | null;
  reward_note?: string | null;
  status: "active" | "closed";
  starts_at?: string | null;
  ends_at?: string | null;
};

export async function createChallenge(draft: ChallengeDraft, creatorId: string | null): Promise<void> {
  const title = draft.title.trim();
  if (!title) throw new Error("Title is required.");

  const { error } = await db.from("creator_challenges").insert({
    title: title.slice(0, 160),
    description: str(draft.description),
    brief: str(draft.brief),
    reward_note: str(draft.reward_note),
    status: draft.status,
    starts_at: str(draft.starts_at),
    ends_at: str(draft.ends_at),
    created_by: creatorId,
  });
  if (error) throw new Error(error.message);
}

export async function updateChallenge(
  id: string,
  patch: Partial<Pick<CreatorChallengeRow, "title" | "description" | "brief" | "reward_note" | "status">>,
): Promise<void> {
  const { error } = await db.from("creator_challenges").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}
