/**
 * FUSE Cinema — CV9 Control Lab (ADMIN/DEV only).
 *
 * Objective A/B harness data layer: pick one variable pair, run a small number
 * of attempts through the EXISTING cinema generate path, then record what was
 * observed (difference / consistency / notes) plus a promotion decision that
 * writes the CV1 `CinemaControlValidation` metadata for that preset.
 *
 * Cinema-only. Nothing here is imported outside `src/lib/cinema` /
 * `src/components/cinema` / `src/pages/app/cinema`. It never changes adapters,
 * credit math, or any other feature, and it NEVER launches a job by itself —
 * `runControlTestPair` only runs when the admin explicitly calls it.
 */

import { supabase } from "@/integrations/supabase/client";
import { cinemaPromptCompiler } from "./promptCompiler";
import { CINEMA_MODEL_KEYS, cinemaModelCapabilities } from "./modelAdapters";
import type { CinemaVideoModelKey } from "./modelAdapters";
import { SYSTEM_DEFAULT_CONFIG } from "./resolveConfig";
import {
  CAMERA_LIBRARY,
  COLOR_LIBRARY,
  FULL_LIBRARY,
  LIGHTING_LIBRARY,
  MOVEMENT_LIBRARY,
} from "./presets/libraryAdapters";
import type { LibraryPreset } from "./presetLibrary";
import type { CinemaControlValidation } from "./previewTypes";
import type { DirectorConfig, DirectorConfigField, PartialDirectorConfig, Sourced } from "./types";
import { startCinemaGeneration } from "@/services/cinemaStudio";
import type { CinemaGeneration } from "@/services/cinemaStudio";

export const CONTROL_LAB_CATEGORIES = [
  "camera",
  "lighting",
  "color",
  "movement",
  "full",
] as const;

export type ControlLabCategory = (typeof CONTROL_LAB_CATEGORIES)[number];

/** Preset pool per testable category (builtin CODE presets). */
export const CONTROL_LAB_LIBRARIES: Record<ControlLabCategory, LibraryPreset[]> = {
  camera: CAMERA_LIBRARY,
  lighting: LIGHTING_LIBRARY,
  color: COLOR_LIBRARY,
  movement: MOVEMENT_LIBRARY,
  full: FULL_LIBRARY,
};

export const CONTROL_LAB_MODELS: Array<{ key: CinemaVideoModelKey; label: string }> =
  CINEMA_MODEL_KEYS.map((key) => ({
    key: key as CinemaVideoModelKey,
    label: cinemaModelCapabilities(key).label,
  }));

/** Lowest sane attempt count — deliberately small; admin can raise to MAX. */
export const DEFAULT_ATTEMPTS = 2;
export const MAX_ATTEMPTS = 3;

export type ControlTestOutput = {
  variable: "A" | "B";
  attempt: number;
  generationId: string;
  presetId: string;
  presetName: string;
  prompt: string;
  outputUrl: string | null;
  status: string;
};

export type PresetSupportType = CinemaControlValidation["supportType"];

export type ControlPromotion = "PROVEN" | "MERGE" | "REMOVE" | null;

export type ControlTestRecord = {
  id: string;
  presetId: string;
  category: string;
  model: string;
  variableA: string;
  variableB: string;
  outputs: ControlTestOutput[];
  testDate: string;
  evaluatorNotes: string | null;
  differenceScore: number | null;
  consistencyScore: number | null;
  supportType: PresetSupportType | null;
  promotion: ControlPromotion;
  createdAt: string;
};

/* ------------------------------------------------------------------ */
/* Presets                                                             */
/* ------------------------------------------------------------------ */

export function controlLabPreset(
  category: ControlLabCategory,
  presetId: string,
): LibraryPreset | undefined {
  return CONTROL_LAB_LIBRARIES[category].find((p) => p.id === presetId);
}

/** New/unvalidated presets default to PROMPT_EXPERIMENTAL. */
export const DEFAULT_SUPPORT_TYPE: PresetSupportType = "PROMPT_EXPERIMENTAL";

/**
 * Effective validation for a preset: the builtin CV1 record, overlaid with the
 * newest recorded Control Lab result (scores + support type + models tested).
 */
export function resolvePresetValidation(
  preset: LibraryPreset,
  tests: ControlTestRecord[],
): CinemaControlValidation {
  const base: CinemaControlValidation = preset.validation ?? {
    presetId: preset.id,
    modelsTested: [],
    visibleDifferenceScore: 0,
    consistencyScore: 0,
    supportType: DEFAULT_SUPPORT_TYPE,
  };

  const mine = tests
    .filter((t) => t.presetId === preset.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!mine.length) return base;

  const latest = mine[mine.length - 1];
  const modelsTested = Array.from(new Set([...base.modelsTested, ...mine.map((t) => t.model)]));

  return {
    presetId: preset.id,
    modelsTested,
    visibleDifferenceScore: latest.differenceScore ?? base.visibleDifferenceScore,
    consistencyScore: latest.consistencyScore ?? base.consistencyScore,
    supportType: latest.supportType ?? base.supportType,
  };
}

/** Newest promotion flag recorded for a preset, if any. */
export function latestPromotion(
  presetId: string,
  tests: ControlTestRecord[],
): ControlPromotion {
  const mine = tests
    .filter((t) => t.presetId === presetId && t.promotion)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return mine.length ? mine[mine.length - 1].promotion : null;
}

/* ------------------------------------------------------------------ */
/* Storage (cinema_control_tests — admin/own-row RLS)                   */
/* ------------------------------------------------------------------ */

type Row = {
  id: string;
  preset_id: string;
  category: string;
  model: string;
  variable_a: string;
  variable_b: string;
  outputs: unknown;
  test_date: string;
  evaluator_notes: string | null;
  difference_score: number | null;
  consistency_score: number | null;
  support_type: string | null;
  promotion: string | null;
  created_at: string;
};

function toRecord(row: Row): ControlTestRecord {
  return {
    id: row.id,
    presetId: row.preset_id,
    category: row.category,
    model: row.model,
    variableA: row.variable_a,
    variableB: row.variable_b,
    outputs: Array.isArray(row.outputs) ? (row.outputs as ControlTestOutput[]) : [],
    testDate: row.test_date,
    evaluatorNotes: row.evaluator_notes,
    differenceScore: row.difference_score,
    consistencyScore: row.consistency_score,
    supportType: (row.support_type as PresetSupportType | null) ?? null,
    promotion: (row.promotion as ControlPromotion) ?? null,
    createdAt: row.created_at,
  };
}

export async function listControlTests(): Promise<ControlTestRecord[]> {
  const { data, error } = await supabase
    .from("cinema_control_tests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(toRecord);
}

export async function saveControlTest(input: {
  presetId: string;
  category: string;
  model: string;
  variableA: string;
  variableB: string;
  outputs: ControlTestOutput[];
  evaluatorNotes?: string | null;
  differenceScore?: number | null;
  consistencyScore?: number | null;
  supportType?: PresetSupportType | null;
  promotion?: ControlPromotion;
}): Promise<ControlTestRecord> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("Sign in required");

  const { data, error } = await supabase
    .from("cinema_control_tests")
    .insert({
      user_id: userId,
      preset_id: input.presetId,
      category: input.category,
      model: input.model,
      variable_a: input.variableA,
      variable_b: input.variableB,
      outputs: input.outputs as unknown as never,
      evaluator_notes: input.evaluatorNotes ?? null,
      difference_score: input.differenceScore ?? null,
      consistency_score: input.consistencyScore ?? null,
      support_type: input.supportType ?? null,
      promotion: input.promotion ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toRecord(data as Row);
}

/** Records evaluation + promotion on an existing test (validation write). */
export async function updateControlTest(
  id: string,
  patch: {
    evaluatorNotes?: string | null;
    differenceScore?: number | null;
    consistencyScore?: number | null;
    supportType?: PresetSupportType | null;
    promotion?: ControlPromotion;
    outputs?: ControlTestOutput[];
  },
): Promise<ControlTestRecord> {
  const body: Record<string, unknown> = {};
  if (patch.evaluatorNotes !== undefined) body.evaluator_notes = patch.evaluatorNotes;
  if (patch.differenceScore !== undefined) body.difference_score = patch.differenceScore;
  if (patch.consistencyScore !== undefined) body.consistency_score = patch.consistencyScore;
  if (patch.supportType !== undefined) body.support_type = patch.supportType;
  if (patch.promotion !== undefined) body.promotion = patch.promotion;
  if (patch.outputs !== undefined) body.outputs = patch.outputs;

  const { data, error } = await supabase
    .from("cinema_control_tests")
    .update(body as never)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toRecord(data as Row);
}

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

/** Base config + ONE preset fragment — the only thing that differs A vs B. */
export function configWithVariable(fragment: PartialDirectorConfig): DirectorConfig {
  const next = { ...SYSTEM_DEFAULT_CONFIG } as Record<DirectorConfigField, Sourced<unknown>>;
  (Object.keys(fragment) as DirectorConfigField[]).forEach((field) => {
    const entry = fragment[field] as Sourced<unknown> | undefined;
    if (!entry || entry.value === undefined || entry.value === null) return;
    next[field] = { value: entry.value, source: "USER" };
  });
  return next as unknown as DirectorConfig;
}

export type ControlTestPlan = {
  category: ControlLabCategory;
  model: CinemaVideoModelKey;
  prompt: string;
  referenceUrl: string | null;
  attempts: number;
  presetA: LibraryPreset;
  presetB: LibraryPreset;
};

/**
 * Runs the A/B pair through the EXISTING generate path. Called ONLY from an
 * explicit admin click — never on mount, never on state change.
 */
export async function runControlTestPair(
  plan: ControlTestPlan,
  onProgress?: (done: number, total: number) => void,
): Promise<ControlTestOutput[]> {
  const attempts = Math.max(1, Math.min(MAX_ATTEMPTS, Math.floor(plan.attempts)));
  const total = attempts * 2;
  const outputs: ControlTestOutput[] = [];

  const references = plan.referenceUrl
    ? [{ url: plan.referenceUrl, name: "control-input", roles: [] as never[] }]
    : [];

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    for (const variable of ["A", "B"] as const) {
      const preset = variable === "A" ? plan.presetA : plan.presetB;
      const config = configWithVariable(preset.config);
      const compiled = cinemaPromptCompiler({
        resolvedConfig: config,
        prompt: plan.prompt,
        references: [],
        model: plan.model,
      });

      let created: CinemaGeneration | null = null;
      try {
        created = await startCinemaGeneration({
          model: plan.model,
          prompt: compiled.finalPrompt,
          promptSource: "COMPILED",
          nativeParams: compiled.nativeParams,
          resolvedConfig: config,
          references,
          referenceUrls: plan.referenceUrl ? [plan.referenceUrl] : [],
          presetIds: [preset.id],
        });
      } catch (error) {
        outputs.push({
          variable,
          attempt,
          generationId: "",
          presetId: preset.id,
          presetName: preset.name,
          prompt: compiled.finalPrompt,
          outputUrl: null,
          status: error instanceof Error ? `failed: ${error.message}` : "failed",
        });
        onProgress?.(outputs.length, total);
        continue;
      }

      outputs.push({
        variable,
        attempt,
        generationId: created.id,
        presetId: preset.id,
        presetName: preset.name,
        prompt: compiled.finalPrompt,
        outputUrl: created.outputUrl ?? null,
        status: created.status ?? "queued",
      });
      onProgress?.(outputs.length, total);
    }
  }

  return outputs;
}
