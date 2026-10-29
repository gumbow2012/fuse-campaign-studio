/**
 * Campaign Director — persistence + backend calls.
 *
 * Projects are one jsonb document per row in public.campaign_director_projects
 * (same pattern as Madden Media Studio). RLS scopes every row to its owner.
 * Provider work goes through the campaign-director edge function, which is
 * builder-only and refuses any paid action that is not explicitly confirmed.
 */
import { supabase } from "@/integrations/supabase/client";
import { looseTable } from "@/services/looseTable";
import { createEmptyProject } from "@/lib/campaign-director/defaults";
import { normalizeProject } from "@/lib/campaign-director/state";
import { compileImageRequest, compileVideoRequest } from "@/lib/campaign-director/promptCompiler";
import type { UnitPrices } from "@/lib/campaign-director/costEstimate";
import type { DirectorProduct, DirectorProject, DirectorProjectSummary, DirectorShot } from "@/lib/campaign-director/types";
import { shotsFromScript } from "@/lib/campaign-director/script";

const TABLE = "campaign_director_projects";

function fail(error: unknown, fallback: string): never {
  const message = (error as { message?: string } | null)?.message;
  throw new Error(message || fallback);
}

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) throw new Error("Please sign in to use Campaign Director");
  return userId;
}

export async function listProjects(): Promise<DirectorProjectSummary[]> {
  const { data, error } = await looseTable(TABLE).select("id, name, updated_at").order("updated_at", { ascending: false }).limit(100);
  if (error) fail(error, "Could not load your campaigns");
  return ((data as Record<string, unknown>[] | null) ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? "Untitled campaign"),
    updatedAt: String(row.updated_at ?? ""),
  }));
}

export async function createProject(name: string, seed?: DirectorProject): Promise<{ id: string; name: string; project: DirectorProject }> {
  const userId = await requireUserId();
  const trimmed = name.trim() || "Untitled campaign";
  const project = seed ?? createEmptyProject();
  const { data, error } = await looseTable(TABLE)
    .insert({ user_id: userId, name: trimmed, project_state: project as unknown as Record<string, unknown> })
    .select("id, name, project_state")
    .maybeSingle();
  if (error) fail(error, "Could not create that campaign");
  if (!data) throw new Error("Could not create that campaign");
  return { id: String(data.id), name: String(data.name ?? trimmed), project: normalizeProject(data.project_state) };
}

export async function loadProject(id: string): Promise<{ id: string; name: string; project: DirectorProject }> {
  const { data, error } = await looseTable(TABLE).select("id, name, project_state").eq("id", id).maybeSingle();
  if (error) fail(error, "Could not open that campaign");
  if (!data) throw new Error("That campaign no longer exists");
  return { id: String(data.id), name: String(data.name ?? "Untitled campaign"), project: normalizeProject(data.project_state) };
}

export async function saveProject(id: string, project: DirectorProject): Promise<void> {
  const { error } = await looseTable(TABLE).update({ project_state: project as unknown as Record<string, unknown> }).eq("id", id);
  if (error) fail(error, "Could not save your changes");
}

export async function renameProject(id: string, name: string): Promise<void> {
  const { error } = await looseTable(TABLE).update({ name: name.trim() || "Untitled campaign" }).eq("id", id);
  if (error) fail(error, "Could not rename that campaign");
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await looseTable(TABLE).delete().eq("id", id);
  if (error) fail(error, "Could not delete that campaign");
}

/* ------------------------------------------------------------------ *
 * Edge function calls
 * ------------------------------------------------------------------ */

async function call<T extends { ok: boolean; reason?: string }>(action: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("campaign-director", { body: { action, ...body } });
  if (error) throw new Error(error.message || "Campaign Director could not reach the server.");
  const result = data as T | null;
  if (!result || result.ok !== true) throw new Error(String(result?.reason ?? "Campaign Director request failed."));
  return result;
}

export async function getUnitPrices(project: DirectorProject): Promise<UnitPrices & { live: boolean }> {
  const result = await call<{ ok: true; imageUsd: number; videoUsdPerSecond: number; live: boolean }>("estimate", {
    resolution: project.world.imageResolution,
    videoModel: project.world.videoModel,
  });
  return { imageUsd: result.imageUsd, videoUsdPerSecond: result.videoUsdPerSecond, live: result.live };
}

export async function writeScript(project: DirectorProject): Promise<DirectorShot[]> {
  const { world, products, brief } = project;
  const result = await call<{ ok: true; shots: unknown[] }>("script", {
    world: {
      name: world.name,
      characterName: world.characterName,
      characterLock: world.characterLock,
      scaleRule: world.scaleRule,
      styleLock: world.styleLock,
      avoid: world.avoid,
      characterUrls: world.characters.map((r) => r.url),
      styleUrls: world.styleRefs.map((r) => r.url),
    },
    products: products.map((p) => ({ id: p.id, name: p.name, artist: p.artist, collab: p.collab, flavor: p.flavor })),
    brief,
  });
  return shotsFromScript(result.shots, products);
}

export async function readProductDesign(imageUrl: string): Promise<Pick<DirectorProduct, "name" | "artist" | "collab" | "flavor">> {
  const result = await call<{ ok: true; name: string; artist: string; collab: string; flavor: string }>("read-product", { imageUrl });
  return { name: result.name, artist: result.artist, collab: result.collab, flavor: result.flavor };
}

/** Submits ONE still. `confirmed` must come from a dialog that showed count and cost. */
export async function submitImage(shot: DirectorShot, project: DirectorProject): Promise<string> {
  const compiled = compileImageRequest(shot, project);
  const result = await call<{ ok: true; requestId: string }>("image-submit", {
    confirmed: true,
    prompt: compiled.prompt,
    referenceUrls: compiled.referenceUrls,
    aspectRatio: project.world.aspectRatio,
    resolution: project.world.imageResolution,
  });
  return result.requestId;
}

/** Submits ONE clip from an approved still. */
export async function submitVideo(shot: DirectorShot, project: DirectorProject): Promise<string> {
  const compiled = compileVideoRequest(shot, project.world);
  const result = await call<{ ok: true; requestId: string }>("video-submit", {
    confirmed: true,
    prompt: compiled.prompt,
    imageUrl: compiled.imageUrl,
    seconds: compiled.seconds,
    aspectRatio: project.world.aspectRatio,
    videoModel: project.world.videoModel,
  });
  return result.requestId;
}

export type JobPoll =
  | { state: "queued" | "running" }
  | { state: "done"; url: string }
  | { state: "failed"; error: string };

export async function pollJob(kind: "image" | "video", requestId: string, projectId: string, videoModel: string): Promise<JobPoll> {
  const result = await call<{ ok: true; state: "queued" | "running" | "done" | "failed"; url?: string; error?: string }>("job-status", {
    kind,
    requestId,
    projectId,
    videoModel,
  });
  if (result.state === "done" && result.url) return { state: "done", url: result.url };
  if (result.state === "failed") return { state: "failed", error: result.error || "The provider reported a failure." };
  return { state: result.state === "queued" ? "queued" : "running" };
}

export interface QaResult {
  pass: boolean;
  issues: string[];
}

/** Gemini compares a finished still with the character masters and this shot's own product designs. Text only, no generation spend. */
export async function qaCheckShot(shot: DirectorShot, stillUrl: string, project: DirectorProject): Promise<QaResult> {
  const result = await call<{ ok: true; pass: boolean; issues: string[] }>("qa-check", {
    stillUrl,
    characterUrls: project.world.characters.slice(0, 2).map((r) => r.url),
    products: project.products.filter((p) => shot.productIds.includes(p.id)).map((p) => ({ name: p.name, url: p.imageUrl })),
  });
  return { pass: result.pass, issues: result.issues };
}
