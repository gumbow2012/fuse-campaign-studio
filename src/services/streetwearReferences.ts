/**
 * Curated streetwear trend reference library (admin only).
 * RLS on public.streetwear_references restricts every operation to admins.
 */
import { supabase } from "@/integrations/supabase/client";

export type ReferenceBlueprintShot = {
  name?: string;
  framing?: string;
  subject?: string;
  action?: string;
};

export type ReferenceBlueprint = {
  shot_list?: ReferenceBlueprintShot[];
  subject_treatment?: string;
  garment_focus?: string;
  composition?: string;
  camera?: string;
  lighting?: string;
  color_grade?: string;
  mood?: string;
  setting?: string;
  motion?: string;
  suggested_output_count?: number;
  uncertain?: string[];
  version?: string;
  model?: string;
  analyzed_image_url?: string;
};

export type StreetwearReference = {
  id: string;
  title: string;
  category: string | null;
  tags: string[];
  image_url: string | null;
  source_url: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  blueprint: ReferenceBlueprint | null;
  blueprint_generated_at: string | null;
  viral_score: number | null;
  viral_factors: unknown | null;
  compiled_template_id: string | null;
};

export type StreetwearReferenceInput = {
  title: string;
  category?: string | null;
  tags?: string[];
  image_url?: string | null;
  source_url?: string | null;
  notes?: string | null;
};

/** TF1 — Gemini vision analysis of a reference into a reusable creative blueprint. */
export async function analyzeStreetwearReference(referenceId: string): Promise<{
  blueprint: ReferenceBlueprint;
  blueprintGeneratedAt: string | null;
}> {
  const { data, error } = await supabase.functions.invoke("template-factory", {
    body: { action: "analyze_reference", referenceId },
  });
  if (error) throw error;
  const payload = data as
    | { ok?: boolean; reason?: string; blueprint?: ReferenceBlueprint; blueprintGeneratedAt?: string }
    | null;
  if (!payload?.ok || !payload.blueprint) {
    throw new Error(payload?.reason ?? "Analysis failed");
  }
  return {
    blueprint: payload.blueprint,
    blueprintGeneratedAt: payload.blueprintGeneratedAt ?? null,
  };
}

/** TF2 — compile a stored blueprint into a DRAFT template graph (no generation runs). */
export async function compileStreetwearReference(referenceId: string): Promise<{
  templateId: string;
  versionId: string;
  templateName: string;
  shotCount: number;
}> {
  const { data, error } = await supabase.functions.invoke("template-factory", {
    body: { action: "compile_blueprint", referenceId },
  });
  if (error) throw error;
  const payload = data as
    | {
        ok?: boolean;
        reason?: string;
        templateId?: string;
        versionId?: string;
        templateName?: string;
        shotCount?: number;
      }
    | null;
  if (!payload?.ok || !payload.templateId || !payload.versionId) {
    throw new Error(payload?.reason ?? "Compile failed");
  }
  return {
    templateId: payload.templateId,
    versionId: payload.versionId,
    templateName: payload.templateName ?? "Draft template",
    shotCount: payload.shotCount ?? 0,
  };
}

/**
 * TF3 — persist the deterministic virality heuristic on a reference.
 * Admin RLS on streetwear_references governs this write.
 */
export async function saveReferenceViralScore(
  referenceId: string,
  score: number,
  factors: unknown,
): Promise<void> {
  const { error } = await supabase
    .from("streetwear_references")
    // Cast: viral_score/viral_factors exist in the DB but not yet in generated types.
    .update({ viral_score: score, viral_factors: factors } as never)
    .eq("id", referenceId);
  if (error) throw error;
}




export async function listStreetwearReferences(): Promise<StreetwearReference[]> {
  const { data, error } = await supabase
    .from("streetwear_references")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as StreetwearReference[];
}

export async function createStreetwearReference(
  input: StreetwearReferenceInput,
): Promise<StreetwearReference> {
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("streetwear_references")
    .insert({
      title: input.title,
      category: input.category ?? null,
      tags: input.tags ?? [],
      image_url: input.image_url ?? null,
      source_url: input.source_url ?? null,
      notes: input.notes ?? null,
      created_by: auth.user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as StreetwearReference;
}

export async function updateStreetwearReference(
  id: string,
  patch: Partial<StreetwearReferenceInput>,
): Promise<StreetwearReference> {
  const { data, error } = await supabase
    .from("streetwear_references")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as StreetwearReference;
}

export async function deleteStreetwearReference(id: string): Promise<void> {
  const { error } = await supabase.from("streetwear_references").delete().eq("id", id);
  if (error) throw error;
}

export function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}
