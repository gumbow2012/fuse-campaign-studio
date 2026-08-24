/**
 * FUSE Cinema — model adapters.
 *
 * READ-ONLY mirror of the video model keys defined in
 * supabase/functions/_shared/fal.ts. That file is NOT imported or modified here
 * (edge-function code must not be pulled into the browser bundle).
 */

import type { DirectorConfigField } from "./types";

/** Mirror of VIDEO_MODELS keys in supabase/functions/_shared/fal.ts (read-only). */
export type CinemaVideoModelKey =
  | "kling-3.0-pro"
  | "kling-3.0-standard"
  | "kling-2.5"
  | "seedance-2.0"
  | "seedance-2.0-fast";

export type FieldSupport = "FULL_SUPPORT" | "PROMPT_BASED" | "UNSUPPORTED";

export type FieldResolution = {
  support: FieldSupport;
  nativeParam?: { key: string; value: unknown };
  promptText?: string;
};

export interface ModelAdapter {
  model: CinemaVideoModelKey;
  resolveField(field: DirectorConfigField, value: unknown): FieldResolution;
}

function describe(field: DirectorConfigField, value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return `${field}: ${value}`;
  try {
    return `${field}: ${JSON.stringify(value)}`;
  } catch {
    return `${field}: unspecified`;
  }
}

/** Stub adapter: every cinematography field is expressed through the prompt. */
function createPromptOnlyAdapter(model: CinemaVideoModelKey): ModelAdapter {
  return {
    model,
    resolveField(field, value) {
      return { support: "PROMPT_BASED", promptText: describe(field, value) };
    },
  };
}

export const seedanceAdapter = createPromptOnlyAdapter("seedance-2.0");
export const seedanceFastAdapter = createPromptOnlyAdapter("seedance-2.0-fast");
export const kling3ProAdapter = createPromptOnlyAdapter("kling-3.0-pro");
export const kling3StandardAdapter = createPromptOnlyAdapter("kling-3.0-standard");
export const kling25Adapter = createPromptOnlyAdapter("kling-2.5");

export const CINEMA_MODEL_ADAPTERS: Record<CinemaVideoModelKey, ModelAdapter> = {
  "seedance-2.0": seedanceAdapter,
  "seedance-2.0-fast": seedanceFastAdapter,
  "kling-3.0-pro": kling3ProAdapter,
  "kling-3.0-standard": kling3StandardAdapter,
  "kling-2.5": kling25Adapter,
};

export function getCinemaModelAdapter(model: string): ModelAdapter {
  return CINEMA_MODEL_ADAPTERS[model as CinemaVideoModelKey] ?? kling3ProAdapter;
}
