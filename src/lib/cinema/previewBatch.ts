/**
 * FUSE Cinema — preview batch generation contract (ADMIN/DEV only).
 *
 * Builds, from the ACTUAL preset data, the list of preview stills a category
 * needs and drives the admin batch run through the `cinema-studio` function.
 *
 * NOTHING here runs on import or on mount: `runPreviewBatch` is only ever
 * called from an explicit admin click, and every call spends fal credits.
 */

import { supabase } from "@/integrations/supabase/client";
import { CAMERA_PRESETS } from "./presets/cameraPresets";
import { APERTURE_OPTIONS, LENS_PRESETS } from "./presets/lensPresets";
import { LIGHTING_PRESETS } from "./presets/lightingPresets";
import { COLOR_PRESETS } from "./presets/colorPresets";
import { COMPOSITION_PRESETS, FOCUS_PRESETS } from "./presets/compositionPresets";
import { ATMOSPHERE_PRESETS } from "./presets/atmospherePresets";
import { OPTICS_PRESETS } from "./presets/opticsPresets";
import { MOVEMENT_PRESETS } from "./presets/movementPresets";
import type { CanonicalScene, CinemaPreviewCategory } from "./previewTypes";
import { loadPreviewRegistry } from "./previewRegistry";

/** One preview slot to generate. */
export type PreviewBatchItem = {
  presetId: string;
  category: CinemaPreviewCategory;
  name: string;
  presetCategory?: string;
  tags: string[];
  detail?: string;
  scene: CanonicalScene;
  kind: "still" | "loop";
};

export type PreviewBatchCategory = {
  category: CinemaPreviewCategory;
  label: string;
  scene: CanonicalScene;
  kind: "still" | "loop";
  /** Video categories are pricier and are NOT part of the first still pass. */
  video: boolean;
  items: PreviewBatchItem[];
};

/** fal nano-banana-pro edit — flat per-image estimate used for the cost readout. */
export const PREVIEW_STILL_USD = 0.05;
/** Image-to-video loop estimate (2–3s), shown only as a warning for MOVEMENT. */
export const PREVIEW_LOOP_USD = 0.4;
export const USD_PER_CREDIT = 0.098;
export const PREVIEW_CONCURRENCY = 3;

function still(
  category: CinemaPreviewCategory,
  scene: CanonicalScene,
  items: Array<Omit<PreviewBatchItem, "category" | "scene" | "kind">>,
): PreviewBatchItem[] {
  return items.map((item) => ({ ...item, category, scene, kind: "still" as const }));
}

export function buildPreviewBatchCategories(): PreviewBatchCategory[] {
  return [
    {
      category: "CAMERA",
      label: "Camera bodies",
      scene: "PORTRAIT",
      kind: "still",
      video: false,
      items: still("CAMERA", "PORTRAIT", CAMERA_PRESETS.map((preset) => ({
        presetId: preset.id,
        name: preset.name,
        presetCategory: preset.category,
        tags: preset.tags ?? [],
      }))),
    },
    {
      category: "LENS",
      label: "Lenses",
      scene: "PORTRAIT",
      kind: "still",
      video: false,
      items: still("LENS", "PORTRAIT", LENS_PRESETS.map((preset) => ({
        presetId: preset.id,
        name: preset.name,
        presetCategory: preset.category,
        tags: preset.tags ?? [],
        detail: preset.config.lens?.value
          ? `${preset.config.lens.value.focalLengthMm}mm ${preset.config.lens.value.type}, character: ${preset.config.lens.value.character}`
          : undefined,
      }))),
    },
    {
      category: "APERTURE",
      label: "Apertures",
      scene: "PORTRAIT",
      kind: "still",
      video: false,
      items: still("APERTURE", "PORTRAIT", APERTURE_OPTIONS.map((option) => ({
        presetId: option.id,
        name: option.label,
        tags: [option.value.depthOfField],
        detail: `f/${option.value.fStop}, ${option.value.depthOfField} depth of field, bokeh: ${option.value.bokeh}`,
      }))),
    },
    {
      category: "LIGHTING",
      label: "Lighting setups",
      scene: "PORTRAIT",
      kind: "still",
      video: false,
      items: still("LIGHTING", "PORTRAIT", LIGHTING_PRESETS.map((preset) => ({
        presetId: preset.id,
        name: preset.name,
        presetCategory: preset.category,
        tags: preset.tags ?? [],
        detail: preset.illuminationStyle,
      }))),
    },
    {
      category: "COLOR",
      label: "Colour grades",
      scene: "PORTRAIT",
      kind: "still",
      video: false,
      items: still("COLOR", "PORTRAIT", COLOR_PRESETS.map((preset) => ({
        presetId: preset.id,
        name: preset.name,
        presetCategory: preset.category,
        tags: preset.tags ?? [],
        detail: describeColor(preset.config.color?.value),
      }))),
    },
    {
      category: "COMPOSITION",
      label: "Compositions",
      scene: "PORTRAIT",
      kind: "still",
      video: false,
      items: still("COMPOSITION", "PORTRAIT", COMPOSITION_PRESETS.map((preset) => ({
        presetId: preset.id,
        name: preset.name,
        tags: [],
        detail: preset.hint,
      }))),
    },
    {
      category: "FOCUS",
      label: "Focus behaviours",
      scene: "PORTRAIT",
      kind: "still",
      video: false,
      items: still("FOCUS", "PORTRAIT", FOCUS_PRESETS.map((preset) => ({
        presetId: preset.id,
        name: preset.name,
        tags: [],
        detail: preset.hint,
      }))),
    },
    {
      category: "OPTICS",
      label: "Optical artefacts",
      scene: "ENVIRONMENT",
      kind: "still",
      video: false,
      items: still("OPTICS", "ENVIRONMENT", OPTICS_PRESETS.map((preset) => ({
        presetId: preset.id,
        name: preset.name,
        tags: preset.tags ?? [],
        detail: `flare: ${preset.flare}`,
      }))),
    },
    {
      category: "ATMOSPHERE",
      label: "Atmosphere",
      scene: "ENVIRONMENT",
      kind: "still",
      video: false,
      items: still("ATMOSPHERE", "ENVIRONMENT", ATMOSPHERE_PRESETS.map((preset) => ({
        presetId: preset.id,
        name: preset.name,
        tags: [],
        detail: preset.hint,
      }))),
    },
    {
      category: "MOVEMENT",
      label: "Movement loops (video — pricier, later pass)",
      scene: "PORTRAIT",
      kind: "loop",
      video: true,
      items: MOVEMENT_PRESETS.map((preset) => ({
        presetId: preset.id,
        category: "MOVEMENT" as CinemaPreviewCategory,
        name: preset.name,
        presetCategory: preset.category,
        tags: preset.tags ?? [],
        scene: "PORTRAIT" as CanonicalScene,
        kind: "loop" as const,
      })),
    },
  ];
}

function describeColor(value: unknown): string | undefined {
  const color = value as
    | { paletteName?: string; swatches?: Array<{ hex?: string }>; temperature?: number; contrast?: number }
    | undefined;
  if (!color) return undefined;
  const hexes = (color.swatches ?? []).map((s) => s?.hex).filter(Boolean).slice(0, 5).join(", ");
  const bits = [
    color.paletteName,
    hexes ? `palette ${hexes}` : null,
    typeof color.temperature === "number" ? `temperature ${color.temperature}` : null,
    typeof color.contrast === "number" ? `contrast ${color.contrast}` : null,
  ].filter(Boolean);
  return bits.length ? bits.join(", ") : undefined;
}

/* ------------------------------- estimates ------------------------------- */

export function estimateBatchUsd(count: number, kind: "still" | "loop") {
  return count * (kind === "loop" ? PREVIEW_LOOP_USD : PREVIEW_STILL_USD);
}

export function estimateBatchCredits(count: number, kind: "still" | "loop") {
  const usd = estimateBatchUsd(count, kind);
  return usd <= 0 ? 0 : Math.max(1, Math.ceil(usd / USD_PER_CREDIT));
}

/* ------------------------------- edge calls ------------------------------ */

async function invokePreviewAction<T>(action: string, payload: Record<string, unknown> = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Please sign in again.");
  const { data, error } = await supabase.functions.invoke("cinema-studio", {
    body: { action, ...payload },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) throw new Error(error.message);
  if ((data as any)?.error) throw new Error(String((data as any).error));
  return data as T;
}

export type PreviewInventory = {
  registered: Array<{ preset_id: string; category: string; kind: string; src: string | null }>;
  bases: Record<string, boolean>;
};

export function fetchPreviewInventory() {
  return invokePreviewAction<PreviewInventory>("preview-inventory");
}

/** Ensures the canonical base still for a scene. `generate: true` spends credits. */
export function ensureCanonicalBase(scene: CanonicalScene, generate: boolean) {
  return invokePreviewAction<{
    base: { scene: string; path: string; url: string | null; generated: boolean };
  }>("preview-base", { scene, generate });
}

export type PreviewBatchResult = {
  presetId: string;
  status: "done" | "skipped" | "failed";
  src?: string;
  error?: string;
};

/**
 * Generates one still per item with bounded concurrency. RESUMABLE: the backend
 * skips any preset that already has registered media unless `force` is set.
 */
export async function runPreviewBatch(args: {
  items: PreviewBatchItem[];
  force?: boolean;
  concurrency?: number;
  onResult: (result: PreviewBatchResult) => void;
  shouldStop?: () => boolean;
}): Promise<PreviewBatchResult[]> {
  const results: PreviewBatchResult[] = [];
  const queue = [...args.items];
  const workers = Math.max(1, Math.min(args.concurrency ?? PREVIEW_CONCURRENCY, 5));

  async function worker() {
    for (;;) {
      if (args.shouldStop?.()) return;
      const item = queue.shift();
      if (!item) return;
      let result: PreviewBatchResult;
      try {
        const response = await invokePreviewAction<{ src?: string; skipped?: boolean }>(
          "preview-generate",
          {
            presetId: item.presetId,
            category: item.category,
            name: item.name,
            presetCategory: item.presetCategory,
            tags: item.tags,
            detail: item.detail,
            scene: item.scene,
            kind: "still",
            force: args.force === true,
          },
        );
        result = response?.skipped
          ? { presetId: item.presetId, status: "skipped", src: response.src }
          : { presetId: item.presetId, status: "done", src: response?.src };
      } catch (error) {
        result = {
          presetId: item.presetId,
          status: "failed",
          error: error instanceof Error ? error.message : "Generation failed",
        };
      }
      results.push(result);
      args.onResult(result);
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()));
  await loadPreviewRegistry(true);
  return results;
}
