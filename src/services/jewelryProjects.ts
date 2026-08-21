import { supabase } from "@/integrations/supabase/client";

/**
 * Jewelry Swap project persistence (additive). The whole workspace is stored as
 * one jsonb snapshot so a user can reopen a project instead of re-uploading and
 * re-analysing everything. A session with NO project selected never touches
 * this table.
 */

export const JEWELRY_PROJECT_STATE_VERSION = 1;

/** Everything needed to rebuild the Jewelry Swap workspace. */
export type JewelryProjectState = {
  version: number;
  /** Source clip. */
  videoUrl: string | null;
  videoPreview: string | null;
  meta: unknown | null;
  /** Extracted source frames + the user's selection. */
  frames: unknown[];
  selectedFrames: number[];
  /** Product references (images + roles/angles) and replacement product videos. */
  pieces: unknown[];
  /** Analysis state — restored so Gemini does NOT re-run on reopen. */
  knowledgeMap: unknown | null;
  userLocks: unknown[];
  analysis: unknown | null;
  analysisKey: string | null;
  /** Reference-set fingerprint the restored analysis belongs to. */
  referenceSetVersion: string | null;
  intakeFingerprint: string | null;
  intakeReferences: unknown[];
  intakeSummary: unknown | null;
  /** Diamond Optics (profile + per-frame refinements + slider settings). */
  opticsProfile: unknown | null;
  frameOptics: Record<string, unknown>;
  opticsControls: unknown | null;
  /** Nano quality + per-frame generation history and approvals. */
  nanoQuality: string;
  frameQuality: Record<string, unknown>;
  swaps: Record<string, unknown>;
  altSwaps: Record<string, unknown>;
  /** Append-only per-frame revision history (§36) + which revision is shown. */
  frameGenerations: Record<string, unknown[]>;
  frameRevision: Record<string, number>;
  /** Approval binds to a specific generation id per frame (§37). */
  approvedGenerationId: Record<string, string>;
  chosenModel: Record<string, unknown>;
  framePreferredRole: Record<string, unknown>;

  frameReason: Record<string, unknown>;
  frameMode: Record<string, unknown>;
  frameCoverage: Record<string, unknown>;
  approved: number[];
  extraPrompt: string;
  /** Seedance settings (incl. the prompt editor mode/draft). */
  videoModel: string;
  resolution: string;
  preserveAudio: boolean;
  videoDuration: number;
  durationTouched: boolean;
  promptMode: string;
  promptDraft: string;
  /** Kling animate settings. */
  cameraDirection: string;
  customCameraPrompt: string;
  /** Generated videos (re-attached from the server library on load too). */
  videos: unknown[];
};

export type JewelryProjectSummary = {
  id: string;
  name: string;
  sourceVideoUrl: string | null;
  updatedAt: string;
  createdAt: string;
};

export type JewelryProject = JewelryProjectSummary & {
  projectState: JewelryProjectState | null;
};

const TABLE = "jewelry_swap_projects";
/** The table is additive and not in the generated types yet. */
const db = () => (supabase as any).from(TABLE);

function toSummary(row: any): JewelryProjectSummary {
  return {
    id: String(row.id),
    name: String(row.name ?? "Untitled project"),
    sourceVideoUrl: row.source_video_url ?? null,
    updatedAt: String(row.updated_at ?? row.created_at ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

async function requireUserId() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Please sign in again to save projects.");
  return userId;
}

/** The user's projects, newest first. RLS keeps this to their own rows. */
export async function listJewelryProjects(): Promise<JewelryProjectSummary[]> {
  const { data, error } = await db()
    .select("id, name, source_video_url, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toSummary);
}

export async function loadJewelryProject(id: string): Promise<JewelryProject> {
  const { data, error } = await db()
    .select("id, name, source_video_url, project_state, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That project could not be found.");
  return { ...toSummary(data), projectState: (data.project_state ?? null) as JewelryProjectState | null };
}

/** First save of a new project — creates the row. */
export async function createJewelryProject(args: {
  name: string;
  sourceVideoUrl: string | null;
  projectState: JewelryProjectState;
}): Promise<JewelryProjectSummary> {
  const userId = await requireUserId();
  const { data, error } = await db()
    .insert({
      user_id: userId,
      name: args.name,
      source_video_url: args.sourceVideoUrl,
      project_state: args.projectState,
    })
    .select("id, name, source_video_url, created_at, updated_at")
    .single();
  if (error) throw new Error(error.message);
  return toSummary(data);
}

/** Autosave of an existing project. */
export async function saveJewelryProject(args: {
  id: string;
  name?: string;
  sourceVideoUrl: string | null;
  projectState: JewelryProjectState;
}): Promise<JewelryProjectSummary> {
  const patch: Record<string, unknown> = {
    source_video_url: args.sourceVideoUrl,
    project_state: args.projectState,
    updated_at: new Date().toISOString(),
  };
  if (args.name !== undefined) patch.name = args.name;
  const { data, error } = await db()
    .update(patch)
    .eq("id", args.id)
    .select("id, name, source_video_url, created_at, updated_at")
    .single();
  if (error) throw new Error(error.message);
  return toSummary(data);
}

export async function renameJewelryProject(id: string, name: string) {
  const { error } = await db().update({ name, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Duplicate keeps the references / PKM / master specs so the same jewelry setup
 * can be re-used with a different source video.
 */
export async function duplicateJewelryProject(args: {
  name: string;
  sourceVideoUrl: string | null;
  projectState: JewelryProjectState;
}): Promise<JewelryProjectSummary> {
  return createJewelryProject(args);
}

export async function deleteJewelryProject(id: string) {
  const { error } = await db().delete().eq("id", id);
  if (error) throw new Error(error.message);
}
