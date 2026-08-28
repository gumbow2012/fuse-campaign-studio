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

