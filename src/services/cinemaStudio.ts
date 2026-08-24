import { supabase } from "@/integrations/supabase/client";
import type { ColorPalette } from "@/lib/cinema/types";

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
