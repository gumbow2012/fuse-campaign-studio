/**
 * Curated streetwear trend reference library (admin only).
 * RLS on public.streetwear_references restricts every operation to admins.
 */
import { supabase } from "@/integrations/supabase/client";

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
};

export type StreetwearReferenceInput = {
  title: string;
  category?: string | null;
  tags?: string[];
  image_url?: string | null;
  source_url?: string | null;
  notes?: string | null;
};

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
