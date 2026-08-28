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
  MADDEN_VARIATIONS,
  buildDirectorContext,
  findVariation,
  normalizeDirectorProposals,
  type MaddenDirectorProposal,
  type MaddenVariationId,
} from "@/lib/madden-media/director";
import {
  createEmptyProjectState,
  normalizeProjectState,
  type MaddenMediaProject,
  type MaddenProjectState,
  type MaddenProjectSummary,
} from "@/lib/madden-media/types";
import {
  normalizeSubjectAttributes,
  normalizeSubjectData,
  type MaddenSubjectAttributes,
  type MaddenSubjectProfile,
  type MaddenSubjectProfileData,
} from "@/lib/madden-media/subject";
import {
  normalizeJewelryAttributes,
  normalizeJewelryData,
  normalizeOutfitAttributes,
  normalizeOutfitData,
  type MaddenJewelryProfileData,
  type MaddenOutfitProfileData,
  type MaddenProfileOf,
} from "@/lib/madden-media/wardrobe";

import {
  normalizeRecipeConfig,
  type MaddenRecipe,
  type MaddenRecipeConfig,
} from "@/lib/madden-media/recipes";

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

/* ------------------------------------------------------------------ *
 * M2 — reusable profiles (madden_profiles) + subject vision analysis
 * ------------------------------------------------------------------ *
 * Own-row CRUD via RLS. The analysis is a Gemini VISION call in the
 * madden-media-studio edge function — no image/video generation, no credits.
 */

const PROFILES_TABLE = "madden_profiles";

export async function listSubjectProfiles(): Promise<MaddenSubjectProfile[]> {
  const { data, error } = await looseTable(PROFILES_TABLE)
    .select("id, name, data, thumbnail_url, updated_at")
    .eq("kind", "subject")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) fail(error, "Could not load your saved subjects");
  return ((data as Record<string, unknown>[] | null) ?? []).map(toSubjectProfile);
}

export async function saveSubjectProfile(input: {
  id?: string | null;
  name: string;
  data: MaddenSubjectProfileData;
  thumbnailUrl?: string | null;
}): Promise<MaddenSubjectProfile> {
  const userId = await requireUserId();
  const name = input.name.trim() || "Untitled subject";
  const payload = {
    name,
    kind: "subject",
    data: input.data as unknown as Record<string, unknown>,
    thumbnail_url: input.thumbnailUrl ?? input.data.referenceUrls[0] ?? null,
  };

  const query = input.id
    ? looseTable(PROFILES_TABLE).update(payload).eq("id", input.id)
    : looseTable(PROFILES_TABLE).insert({ ...payload, user_id: userId });

  const { data, error } = await query
    .select("id, name, data, thumbnail_url, updated_at")
    .maybeSingle();
  if (error) fail(error, "Could not save that subject");
  if (!data) throw new Error("Could not save that subject");
  return toSubjectProfile(data);
}

export async function deleteSubjectProfile(id: string): Promise<void> {
  const { error } = await looseTable(PROFILES_TABLE).delete().eq("id", id);
  if (error) fail(error, "Could not delete that subject");
}

export type AnalyzeSubjectResult =
  | {
      ok: true;
      attributes: MaddenSubjectAttributes;
      analysis: { version: string; model: string; analyzedAt: string };
      analyzedUrls: string[];
    }
  | { ok: false; reason: string };

/** Structured VISUAL-CONSISTENCY extraction. Never identifies a person. */
export async function analyzeSubject(referenceUrls: string[]): Promise<AnalyzeSubjectResult> {
  if (referenceUrls.length === 0) {
    return { ok: false, reason: "Add at least one reference image first." };
  }
  const { data, error } = await supabase.functions.invoke("madden-media-studio", {
    body: { action: "analyze_subject", referenceUrls },
  });
  if (error) {
    return { ok: false, reason: error.message || "Subject analysis failed." };
  }
  const result = data as Record<string, unknown> | null;
  if (!result || result.ok !== true) {
    return {
      ok: false,
      reason: String(result?.reason ?? "Subject analysis could not read those images."),
    };
  }
  return {
    ok: true,
    attributes: normalizeSubjectAttributes(result.attributes),
    analysis: {
      version: String(result.version ?? ""),
      model: String(result.model ?? ""),
      analyzedAt: new Date().toISOString(),
    },
    analyzedUrls: Array.isArray(result.analyzedUrls)
      ? (result.analyzedUrls as unknown[]).map((url) => String(url))
      : referenceUrls,
  };
}

function toSubjectProfile(row: Record<string, unknown>): MaddenSubjectProfile {
  return {
    id: String(row.id),
    name: String(row.name ?? "Untitled subject"),
    thumbnailUrl: row.thumbnail_url ? String(row.thumbnail_url) : null,
    data: normalizeSubjectData(row.data),
    updatedAt: String(row.updated_at ?? ""),
  };
}

/* ------------------------------------------------------------------ *
 * M3 — outfit + jewelry profiles (same madden_profiles table)
 * ------------------------------------------------------------------ *
 * Independent of the subject module: an artist can keep one subject and swap
 * outfit or jewelry freely. Analysis is Gemini VISION only — no generation.
 */

const PROFILE_SELECT = "id, name, data, thumbnail_url, updated_at";

async function listProfilesOfKind<T>(
  kind: "outfit" | "jewelry",
  normalize: (raw: unknown) => T,
  fallbackName: string,
): Promise<MaddenProfileOf<T>[]> {
  const { data, error } = await looseTable(PROFILES_TABLE)
    .select(PROFILE_SELECT)
    .eq("kind", kind)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) fail(error, `Could not load your saved ${kind}s`);
  return ((data as Record<string, unknown>[] | null) ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? fallbackName),
    thumbnailUrl: row.thumbnail_url ? String(row.thumbnail_url) : null,
    data: normalize(row.data),
    updatedAt: String(row.updated_at ?? ""),
  }));
}

async function saveProfileOfKind<T extends { referenceUrls: string[] }>(
  kind: "outfit" | "jewelry",
  input: { id?: string | null; name: string; data: T; thumbnailUrl?: string | null },
  normalize: (raw: unknown) => T,
  fallbackName: string,
): Promise<MaddenProfileOf<T>> {
  const userId = await requireUserId();
  const name = input.name.trim() || fallbackName;
  const payload = {
    name,
    kind,
    data: input.data as unknown as Record<string, unknown>,
    thumbnail_url: input.thumbnailUrl ?? input.data.referenceUrls[0] ?? null,
  };

  const query = input.id
    ? looseTable(PROFILES_TABLE).update(payload).eq("id", input.id)
    : looseTable(PROFILES_TABLE).insert({ ...payload, user_id: userId });

  const { data, error } = await query.select(PROFILE_SELECT).maybeSingle();
  if (error) fail(error, `Could not save that ${kind}`);
  if (!data) throw new Error(`Could not save that ${kind}`);
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    name: String(row.name ?? fallbackName),
    thumbnailUrl: row.thumbnail_url ? String(row.thumbnail_url) : null,
    data: normalize(row.data),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export async function deleteMaddenProfile(id: string): Promise<void> {
  const { error } = await looseTable(PROFILES_TABLE).delete().eq("id", id);
  if (error) fail(error, "Could not delete that profile");
}

export const listOutfitProfiles = () =>
  listProfilesOfKind("outfit", normalizeOutfitData, "Untitled outfit");

export const saveOutfitProfile = (input: {
  id?: string | null;
  name: string;
  data: MaddenOutfitProfileData;
  thumbnailUrl?: string | null;
}) => saveProfileOfKind("outfit", input, normalizeOutfitData, "Untitled outfit");

export const listJewelryProfiles = () =>
  listProfilesOfKind("jewelry", normalizeJewelryData, "Untitled jewelry set");

export const saveJewelryProfile = (input: {
  id?: string | null;
  name: string;
  data: MaddenJewelryProfileData;
  thumbnailUrl?: string | null;
}) => saveProfileOfKind("jewelry", input, normalizeJewelryData, "Untitled jewelry set");

export type AnalyzeAttributesResult<T> =
  | {
      ok: true;
      attributes: T;
      analysis: { version: string; model: string; analyzedAt: string };
      analyzedUrls: string[];
    }
  | { ok: false; reason: string };

async function invokeAnalysis<T>(
  action: "analyze_outfit" | "analyze_jewelry",
  imageUrls: string[],
  normalize: (raw: unknown) => T,
): Promise<AnalyzeAttributesResult<T>> {
  if (imageUrls.length === 0) {
    return { ok: false, reason: "Add at least one reference image first." };
  }
  const { data, error } = await supabase.functions.invoke("madden-media-studio", {
    body: { action, imageUrls },
  });
  if (error) return { ok: false, reason: error.message || "Reference analysis failed." };
  const result = data as Record<string, unknown> | null;
  if (!result || result.ok !== true) {
    return {
      ok: false,
      reason: String(result?.reason ?? "Analysis could not read those images."),
    };
  }
  return {
    ok: true,
    attributes: normalize(result.attributes),
    analysis: {
      version: String(result.version ?? ""),
      model: String(result.model ?? ""),
      analyzedAt: new Date().toISOString(),
    },
    analyzedUrls: Array.isArray(result.analyzedUrls)
      ? (result.analyzedUrls as unknown[]).map((url) => String(url))
      : imageUrls,
  };
}

/** Structured garment-consistency extraction. Never names a brand or person. */
export const analyzeOutfit = (imageUrls: string[]) =>
  invokeAnalysis("analyze_outfit", imageUrls, normalizeOutfitAttributes);

/** Jewelry-only extraction — the reference's scene/hands/box are ignored. */
export const analyzeJewelry = (imageUrls: string[]) =>
  invokeAnalysis("analyze_jewelry", imageUrls, normalizeJewelryAttributes);


/* ------------------------------------------------------------------ *
 * M5 — recipes (public.madden_recipes)
 * ------------------------------------------------------------------ *
 * Builtin recipes live in code (lib/madden-media/recipes.ts). This layer only
 * reads/writes the user's own non-builtin rows. Structured data only.
 */

const RECIPES_TABLE = "madden_recipes";
const RECIPE_SELECT = "id, name, config, tags, builtin, thumbnail, created_at";

function toRecipe(row: Record<string, unknown>): MaddenRecipe {
  return {
    id: String(row.id),
    name: String(row.name ?? "Untitled recipe"),
    tags: Array.isArray(row.tags) ? (row.tags as unknown[]).map((t) => String(t)) : [],
    builtin: row.builtin === true,
    thumbnail: row.thumbnail ? String(row.thumbnail) : null,
    config: normalizeRecipeConfig(row.config),
    createdAt: String(row.created_at ?? ""),
  };
}

/** Rows readable by RLS: builtin rows plus the signed-in user's own. */
export async function listUserRecipes(): Promise<MaddenRecipe[]> {
  const { data, error } = await looseTable(RECIPES_TABLE)
    .select(RECIPE_SELECT)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) fail(error, "Could not load your recipes");
  return ((data as Record<string, unknown>[] | null) ?? []).map(toRecipe);
}

export async function saveUserRecipe(input: {
  name: string;
  tags?: string[];
  config: MaddenRecipeConfig;
  thumbnail?: string | null;
}): Promise<MaddenRecipe> {
  const userId = await requireUserId();
  const { data, error } = await looseTable(RECIPES_TABLE)
    .insert({
      user_id: userId,
      name: input.name.trim() || "Untitled recipe",
      tags: input.tags ?? [],
      builtin: false,
      thumbnail: input.thumbnail ?? null,
      config: input.config as unknown as Record<string, unknown>,
    })
    .select(RECIPE_SELECT)
    .maybeSingle();
  if (error) fail(error, "Could not save that recipe");
  if (!data) throw new Error("Could not save that recipe");
  return toRecipe(data as Record<string, unknown>);
}

export async function deleteUserRecipe(id: string): Promise<void> {
  const { error } = await looseTable(RECIPES_TABLE).delete().eq("id", id);
  if (error) fail(error, "Could not delete that recipe");
}


/* ------------------------------------------------------------------ *
 * M7 — shot generation history (public.studio_generations)
 * ------------------------------------------------------------------ *
 * Append-only by construction: a generation is an immutable snapshot row.
 * Nothing here updates or deletes an existing row, and nothing calls a paid
 * provider — the snapshot records what WOULD be sent, pending live
 * generation verification. Rows are tagged through the shared metadata
 * pattern inside input_payload: feature="madden-media" + madden_project_id +
 * shot_id. The studio_generations schema is untouched.
 */

const GENERATIONS_TABLE = "studio_generations";
const GENERATION_SELECT =
  "id, kind, status, prompt, output_url, output_type, input_payload, created_at";
export const MADDEN_GENERATION_FEATURE = "madden-media";
export const MADDEN_GENERATION_KIND = "madden-media";
/** Snapshot persisted, no provider called yet. */
export const MADDEN_GENERATION_PENDING_STATUS = "pending_verification";

export type MaddenGenerationSnapshot = {
  feature: string;
  maddenProjectId: string;
  shotId: string;
  shotPackId: string | null;
  aspectRatio: "9:16";
  shot: {
    title: string;
    direction: string;
    durationSeconds: number;
    cinematographyId: string | null;
  };
  presets: {
    cinematographyId: string | null;
    lightingId: string | null;
    environmentId: string | null;
  };
  referenceUrls: string[];
  compiledAt: string;
  verification: "live_generation_verification_pending";
};

export type MaddenShotGeneration = {
  id: string;
  projectId: string;
  shotId: string;
  status: string;
  prompt: string;
  outputUrl: string | null;
  outputType: string | null;
  snapshot: MaddenGenerationSnapshot | null;
  createdAt: string;
};

function toShotGeneration(row: Record<string, unknown>): MaddenShotGeneration {
  const payload = (row.input_payload ?? {}) as Record<string, unknown>;
  const snapshot = (payload.snapshot ?? null) as MaddenGenerationSnapshot | null;
  return {
    id: String(row.id),
    projectId: String(payload.madden_project_id ?? snapshot?.maddenProjectId ?? ""),
    shotId: String(payload.shot_id ?? snapshot?.shotId ?? ""),
    status: String(row.status ?? MADDEN_GENERATION_PENDING_STATUS),
    prompt: row.prompt ? String(row.prompt) : "",
    outputUrl: row.output_url ? String(row.output_url) : null,
    outputType: row.output_type ? String(row.output_type) : null,
    snapshot,
    createdAt: String(row.created_at ?? ""),
  };
}

/** Every Madden generation for a project, oldest first (history order). */
export async function listMaddenGenerations(
  projectId: string,
): Promise<MaddenShotGeneration[]> {
  const { data, error } = await looseTable(GENERATIONS_TABLE)
    .select(GENERATION_SELECT)
    .eq("kind", MADDEN_GENERATION_KIND)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) fail(error, "Could not load this project's generation history");
  return ((data as Record<string, unknown>[] | null) ?? [])
    .map(toShotGeneration)
    .filter((row) => row.projectId === projectId);
}

/** Appends an immutable snapshot. Never overwrites a previous generation. */
export async function recordMaddenShotGeneration(input: {
  projectId: string;
  shotId: string;
  prompt: string;
  snapshot: MaddenGenerationSnapshot;
}): Promise<MaddenShotGeneration> {
  const userId = await requireUserId();
  const { data, error } = await looseTable(GENERATIONS_TABLE)
    .insert({
      user_id: userId,
      kind: MADDEN_GENERATION_KIND,
      status: MADDEN_GENERATION_PENDING_STATUS,
      prompt: input.prompt,
      input_payload: {
        feature: MADDEN_GENERATION_FEATURE,
        madden_project_id: input.projectId,
        shot_id: input.shotId,
        snapshot: input.snapshot,
      } as unknown as Record<string, unknown>,
    })
    .select(GENERATION_SELECT)
    .maybeSingle();
  if (error) fail(error, "Could not save that generation snapshot");
  if (!data) throw new Error("Could not save that generation snapshot");
  return toShotGeneration(data as Record<string, unknown>);
}

/* ------------------------------------------------------------------ *
 * M8 — Madden Director (proposals only)
 * ------------------------------------------------------------------ */

export type MaddenDirectorResponse =
  | { ok: true; proposals: MaddenDirectorProposal[]; notes: string[]; model: string }
  | { ok: false; reason: string };

/**
 * Asks the Director for structured creative-direction PROPOSALS.
 * Nothing is applied here — the caller merges a proposal only on user action.
 */
export async function requestMaddenDirection(
  state: MaddenProjectState,
  variationId: MaddenVariationId,
): Promise<MaddenDirectorResponse> {
  const variation = findVariation(variationId) ?? MADDEN_VARIATIONS[0];
  const { data, error } = await supabase.functions.invoke("madden-media-studio", {
    body: {
      action: "director",
      brief: variation.brief,
      variationId: variation.id,
      context: buildDirectorContext(state),
    },
  });
  if (error) {
    return { ok: false, reason: error.message || "The Director could not run." };
  }
  const result = data as Record<string, unknown> | null;
  if (!result || result.ok !== true) {
    return { ok: false, reason: String(result?.reason ?? "The Director could not run.") };
  }
  const proposals = normalizeDirectorProposals(result.proposals);
  if (proposals.length === 0) {
    return { ok: false, reason: "The Director had no usable suggestions — try again." };
  }
  return {
    ok: true,
    proposals,
    notes: Array.isArray(result.notes) ? (result.notes as unknown[]).map(String) : [],
    model: String(result.model ?? ""),
  };
}
