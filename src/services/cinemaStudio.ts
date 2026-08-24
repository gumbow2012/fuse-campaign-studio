import { supabase } from "@/integrations/supabase/client";
import type {
  ColorPalette,
  DirectorConfigField,
  PartialDirectorConfig,
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
