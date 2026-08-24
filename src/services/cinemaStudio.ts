import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type {
  CinemaProjectState,
  CinemaProjectSummary,
  ColorPalette,
  DirectorConfigField,
  PartialDirectorConfig,
  ReferenceRole,
} from "@/lib/cinema/types";

/**
 * FUSE Cinema analysis service — calls the isolated `cinema-studio` edge
 * function. Analysis only: no generations, no credit spend.
 */

export type ExtractedPalette = {
  palette: ColorPalette;
  paletteName: string;
  model?: string;
};

/** Reads a File as a base64 data URL for the analysis request. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read that image file"));
    reader.readAsDataURL(file);
  });
}

async function invokeCinemaStudio<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) throw new Error("Please sign in to run reference analysis");

  const { data, error } = await supabase.functions.invoke("cinema-studio", {
    body: { action, ...payload },
  });

  if (error) {
    const message = (data as any)?.error ?? error.message;
    throw new Error(String(message || "Reference analysis failed — please retry."));
  }
  if ((data as any)?.error) throw new Error(String((data as any).error));
  if (!data) throw new Error("Reference analysis returned no result — please retry.");
  return data as T;
}

/** Extracts a ColorPalette from a reference image (Gemini analysis). */
export async function extractPaletteFromImage(file: File): Promise<ExtractedPalette> {
  const imageDataUrl = await fileToDataUrl(file);
  return invokeCinemaStudio<ExtractedPalette>("extract-palette", { imageDataUrl });
}

/* ------------------------------------------------------------------ */
/* Auto Director (analysis only — proposes, never generates)           */
/* ------------------------------------------------------------------ */

export type DirectorProposalResult = {
  proposal: PartialDirectorConfig;
  rationale: Partial<Record<DirectorConfigField, string>>;
  summary?: string;
  paletteName?: string;
  model?: string;
};

export type AutoDirectorInput = {
  prompt: string;
  productionType?: string;
  model?: string;
  filmSetup?: unknown;
  references?: Array<{ url?: string; roles?: string[] }>;
};

/**
 * Asks the Director Agent for a proposed DirectorConfig. Gemini runs ONLY on
 * this explicit call — panel edits never hit the backend. No credit spend.
 */
export async function requestAutoDirector(
  input: AutoDirectorInput,
): Promise<DirectorProposalResult> {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("Describe your scene before running Auto Director");
  return invokeCinemaStudio<DirectorProposalResult>("auto-director", {
    prompt,
    productionType: input.productionType,
    model: input.model,
    filmSetup: input.filmSetup,
    references: (input.references ?? []).map((r) => ({ url: r.url, roles: r.roles ?? [] })),
  });
}

/* ------------------------------------------------------------------ */
/* Reference role detection (analysis only)                            */
/* ------------------------------------------------------------------ */

export type DetectedRoles = {
  roles: Array<{ role: ReferenceRole; strength: number }>;
  note?: string;
  model?: string;
};

/** Suggests roles for one reference image (Gemini). Explicit action only. */
export async function detectReferenceRoles(imageDataUrl: string): Promise<DetectedRoles> {
  return invokeCinemaStudio<DetectedRoles>("detect-roles", { imageDataUrl });
}

/* ------------------------------------------------------------------ */
/* Project persistence (cinema_projects — RLS own-row)                 */
/* ------------------------------------------------------------------ */

/** Plain-JSON round-trip so the jsonb column receives a serializable value. */
function toJson(state: CinemaProjectState): Json {
  return JSON.parse(JSON.stringify(state)) as Json;
}

export async function listCinemaProjects(): Promise<CinemaProjectSummary[]> {
  const { data, error } = await supabase
    .from("cinema_projects")
    .select("id, name, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: (row.name as string) ?? "Untitled Project",
    updatedAt: (row.updated_at as string) ?? "",
  }));
}

export async function createCinemaProject(
  name: string,
  state: CinemaProjectState,
): Promise<CinemaProjectSummary> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) throw new Error("Please sign in to save a Cinema project");

  const { data, error } = await supabase
    .from("cinema_projects")
    .insert([
      {
        user_id: userId,
        name: name.trim().slice(0, 120) || "Untitled Project",
        project_state: toJson(state),
      },
    ])
    .select("id, name, updated_at")
    .single();
  if (error) throw new Error(error.message);
  return {
    id: data.id as string,
    name: data.name as string,
    updatedAt: (data.updated_at as string) ?? "",
  };
}

export async function saveCinemaProject(
  projectId: string,
  state: CinemaProjectState,
  name?: string,
): Promise<void> {
  const patch: Record<string, unknown> = {
    project_state: toJson(state),
    updated_at: new Date().toISOString(),
  };
  if (name !== undefined) patch.name = name.trim().slice(0, 120) || "Untitled Project";

  const { error } = await supabase.from("cinema_projects").update(patch).eq("id", projectId);
  if (error) throw new Error(error.message);
}

export async function loadCinemaProject(
  projectId: string,
): Promise<{ summary: CinemaProjectSummary; state: CinemaProjectState | null }> {
  const { data, error } = await supabase
    .from("cinema_projects")
    .select("id, name, updated_at, project_state")
    .eq("id", projectId)
    .single();
  if (error) throw new Error(error.message);

  const raw = data.project_state as unknown;
  const state =
    raw && typeof raw === "object" && (raw as any).config ? (raw as CinemaProjectState) : null;

  return {
    summary: {
      id: data.id as string,
      name: (data.name as string) ?? "Untitled Project",
      updatedAt: (data.updated_at as string) ?? "",
    },
    state,
  };
}

/* ------------------------------------------------------------------ */
/* Custom presets (cinema_presets — RLS: builtin or own row)           */
/* ------------------------------------------------------------------ */

import type { CinemaPreset, CinemaPresetType } from "@/lib/cinema/types";
import {
  readFavorites,
  writeFavorites,
  readRecents,
  pushRecent,
} from "@/lib/cinema/presetLibrary";

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) throw new Error("Please sign in to manage Cinema presets");
  return userId;
}

/** Lists the signed-in user's saved presets (optionally one type). */
export async function listUserPresets(type?: CinemaPresetType): Promise<CinemaPreset[]> {
  let query = supabase
    .from("cinema_presets")
    .select("id, user_id, type, name, category, tags, config, thumbnail, builtin")
    .eq("builtin", false)
    .order("created_at", { ascending: false })
    .limit(200);
  if (type) query = query.eq("type", type);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    userId: (row.user_id as string) ?? undefined,
    type: (row.type as CinemaPresetType) ?? "full",
    name: (row.name as string) ?? "Untitled preset",
    category: (row.category as string) ?? "My Presets",
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    thumbnail: (row.thumbnail as string) ?? "",
    config: (row.config as unknown as CinemaPreset["config"]) ?? {},
    builtin: false,
  }));
}

/** Saves the captured config fragment as a user preset (builtin = false). */
export async function createPreset(input: {
  type: CinemaPresetType;
  name: string;
  category?: string;
  tags?: string[];
  thumbnail?: string;
  config: unknown;
}): Promise<CinemaPreset> {
  const userId = await requireUserId();
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error("Give the preset a name first");

  const { data, error } = await supabase
    .from("cinema_presets")
    .insert([
      {
        user_id: userId,
        builtin: false,
        type: input.type,
        name,
        category: (input.category ?? "My Presets").slice(0, 60),
        tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 12),
        thumbnail: input.thumbnail ?? null,
        config: JSON.parse(JSON.stringify(input.config)) as Json,
      },
    ])
    .select("id, user_id, type, name, category, tags, config, thumbnail, builtin")
    .single();
  if (error) throw new Error(error.message);

  return {
    id: data.id as string,
    userId: (data.user_id as string) ?? undefined,
    type: (data.type as CinemaPresetType) ?? input.type,
    name: (data.name as string) ?? name,
    category: (data.category as string) ?? "My Presets",
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : [],
    thumbnail: (data.thumbnail as string) ?? "",
    config: (data.config as unknown as CinemaPreset["config"]) ?? {},
    builtin: false,
  };
}

/** Deletes one of the user's own presets (RLS blocks builtin + others). */
export async function deletePreset(presetId: string): Promise<void> {
  const { error } = await supabase.from("cinema_presets").delete().eq("id", presetId);
  if (error) throw new Error(error.message);
}

/**
 * Favorites are a lightweight per-user set kept in local user state — the
 * simplest option that works with existing RLS (builtin presets are CODE data
 * and have no row to flag).
 */
export async function listFavoritePresetIds(type: CinemaPresetType): Promise<string[]> {
  const userId = await requireUserId();
  return readFavorites(userId, type);
}

export async function toggleFavorite(
  type: CinemaPresetType,
  presetId: string,
): Promise<string[]> {
  const userId = await requireUserId();
  const current = readFavorites(userId, type);
  const next = current.includes(presetId)
    ? current.filter((id) => id !== presetId)
    : [...current, presetId];
  writeFavorites(userId, type, next);
  return next;
}

export async function listRecentPresetIds(type: CinemaPresetType): Promise<string[]> {
  const userId = await requireUserId();
  return readRecents(userId, type);
}

export async function recordPresetUse(
  type: CinemaPresetType,
  presetId: string,
): Promise<string[]> {
  const userId = await requireUserId();
  return pushRecent(userId, type, presetId);
}
