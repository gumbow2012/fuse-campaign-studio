/**
 * Madden Media Studio — project persistence (M1).
 *
 * Own-row CRUD against public.madden_media_projects via the shared supabase
 * client; RLS scopes every read/write to the signed-in owner. No edge
 * function, no generation, no credit spend.
 */
import { supabase } from "@/integrations/supabase/client";
import { looseTable } from "@/services/looseTable";
import {
  createEmptyProjectState,
  normalizeProjectState,
  type MaddenMediaProject,
  type MaddenProjectState,
  type MaddenProjectSummary,
} from "@/lib/madden-media/types";

const TABLE = "madden_media_projects";

function fail(error: unknown, fallback: string): never {
  const message = (error as { message?: string } | null)?.message;
  throw new Error(message || fallback);
}

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) throw new Error("Please sign in to use Madden Media Studio");
  return userId;
}

export async function listProjects(): Promise<MaddenProjectSummary[]> {
  const { data, error } = await looseTable(TABLE)
    .select("id, name, updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) fail(error, "Could not load your projects");
  return ((data as Record<string, unknown>[] | null) ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? "Untitled project"),
    updatedAt: String(row.updated_at ?? ""),
  }));
}

export async function createProject(name: string): Promise<MaddenMediaProject> {
  const userId = await requireUserId();
  const trimmed = name.trim() || "Untitled project";
  const projectState = createEmptyProjectState();

  const { data, error } = await looseTable(TABLE)
    .insert({
      user_id: userId,
      name: trimmed,
      project_state: projectState as unknown as Record<string, unknown>,
    })
    .select("id, user_id, name, project_state, created_at, updated_at")
    .maybeSingle();
  if (error) fail(error, "Could not create that project");
  if (!data) throw new Error("Could not create that project");
  return toProject(data);
}

export async function loadProject(id: string): Promise<MaddenMediaProject> {
  const { data, error } = await looseTable(TABLE)
    .select("id, user_id, name, project_state, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) fail(error, "Could not open that project");
  if (!data) throw new Error("That project no longer exists");
  return toProject(data);
}

export async function saveProjectState(
  id: string,
  projectState: MaddenProjectState,
): Promise<void> {
  const { error } = await looseTable(TABLE)
    .update({ project_state: projectState as unknown as Record<string, unknown> })
    .eq("id", id);
  if (error) fail(error, "Could not save your changes");
}

export async function renameProject(id: string, name: string): Promise<void> {
  const trimmed = name.trim() || "Untitled project";
  const { error } = await looseTable(TABLE).update({ name: trimmed }).eq("id", id);
  if (error) fail(error, "Could not rename that project");
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await looseTable(TABLE).delete().eq("id", id);
  if (error) fail(error, "Could not delete that project");
}

function toProject(row: Record<string, unknown>): MaddenMediaProject {
  return {
    id: String(row.id),
    userId: String(row.user_id ?? ""),
    name: String(row.name ?? "Untitled project"),
    projectState: normalizeProjectState(row.project_state),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}
