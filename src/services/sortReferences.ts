import { supabase } from "@/integrations/supabase/client";
import { compressImageFile } from "@/lib/imageCompress";

export interface SortSlot {
  id: string;
  label: string;
  hint?: string;
}

export interface SortedPhoto {
  file: File;
  /** Slot the photo belongs in, or null when it fits none of the empty slots. */
  slotId: string | null;
  /** A few words on what the photo shows, for the "couldn't place" note. */
  seen: string;
}

const toDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read a photo."));
    reader.readAsDataURL(file);
  });

/** Gemini looks at small copies of the photos and names the slot each one belongs in. Nothing is generated. */
export async function sortReferencePhotos(files: File[], slots: SortSlot[]): Promise<SortedPhoto[]> {
  const images = await Promise.all(files.map(async (file) => toDataUrl(await compressImageFile(file, 768, 0.8))));
  const { data, error } = await supabase.functions.invoke("sort-references", { body: { slots, images } });
  if (error) throw new Error(error.message || "Could not sort the photos.");
  const result = data as { ok?: boolean; reason?: string; assignments?: { image: number; slot: string | null; seen: string }[] } | null;
  if (!result?.ok) throw new Error(result?.reason ?? "Could not sort the photos.");
  return files.map((file, index) => {
    const hit = result.assignments?.find((a) => a.image === index);
    return { file, slotId: hit?.slot ?? null, seen: hit?.seen ?? "" };
  });
}
