/**
 * FUSE Cinema — CV2 active-config tiles (presentation layer only).
 *
 * Maps the CURRENT DirectorConfig onto the CV1 preview media of whichever
 * builtin preset matches it, so the active-config strip can be visual instead
 * of plain text. Pure read-only derivation: no config is written here, no
 * media is generated, no provider is called.
 */

import { resolvePreviewMedia, type CinemaPreviewCategory, type PreviewMedia } from "./previewTypes";
import { CAMERA_PRESETS } from "./presets/cameraPresets";
import { LENS_PRESETS } from "./presets/lensPresets";
import { LIGHTING_PRESETS } from "./presets/lightingPresets";
import { COLOR_PRESETS, presetSwatches } from "./presets/colorPresets";
import { COMPOSITION_PRESETS } from "./presets/compositionPresets";
import { ATMOSPHERE_PRESETS } from "./presets/atmospherePresets";
import { OPTICS_PRESETS } from "./presets/opticsPresets";
import { MOVEMENT_PRESETS } from "./presets/movementPresets";
import type { CinemaReference, DirectorConfig, DirectorConfigField } from "./types";

/** Modal keys understood by the composer (config fields + the two browsers). */
export type ConfigTileKey = "references" | "presets" | DirectorConfigField;

export type ActiveConfigTile = {
  key: ConfigTileKey;
  label: string;
  /** Current value summary, e.g. the matched preset name. */
  summary: string;
  /** Which existing panel the tile opens. */
  opens: ConfigTileKey;
  media: PreviewMedia;
};

type Previewable = { category?: string; tags?: string[]; thumbnail?: string; preview?: PreviewMedia };

function media(
  category: CinemaPreviewCategory,
  preset: Previewable | undefined,
  swatches?: string[],
): PreviewMedia {
  return resolvePreviewMedia({ category, preset: preset ?? {}, swatches });
}

function titleCase(value: string): string {
  return value.replace(/(^|[\s-])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

export function buildActiveConfigTiles(
  config: DirectorConfig,
  references: CinemaReference[],
): ActiveConfigTile[] {
  const camera = config.camera.value;
  const lens = config.lens.value;
  const lighting = config.lighting.value;
  const movement = config.movement.value;
  const composition = config.composition.value;
  const color = config.color.value;
  const optics = config.optics.value;
  const atmosphere = config.atmosphere.value;

  const cameraPreset = CAMERA_PRESETS.find((p) => p.config.camera?.value.body === camera.body);
  const lensPreset = LENS_PRESETS.find(
    (p) =>
      p.config.lens?.value.character === lens.character &&
      p.config.lens?.value.type === lens.type,
  );
  const lightingPreset = LIGHTING_PRESETS.find(
    (p) => p.config.lighting?.value.mood && p.config.lighting.value.mood === lighting.mood,
  );
  const movementPreset = MOVEMENT_PRESETS.find(
    (p) =>
      p.config.movement?.value.motionType === movement.motionType &&
      p.config.movement?.value.speed === movement.speed,
  );
  const compositionPreset = COMPOSITION_PRESETS.find(
    (p) => p.value.rule === composition.rule && p.value.framing === composition.framing,
  );
  const colorPreset = COLOR_PRESETS.find(
    (p) => p.config.color?.value.skinToneTreatment === color.skinToneTreatment,
  );
  const opticsPreset = OPTICS_PRESETS.find((p) => p.flare === optics.flare);
  const atmospherePreset = ATMOSPHERE_PRESETS.find(
    (p) => p.id === atmosphere.presetId || p.name === atmosphere.presetName,
  );

  const swatches = (color.swatches ?? []).map((s) => s.hex).filter(Boolean);

  return [
    {
      key: "references",
      opens: "references",
      label: "References",
      summary: references.length ? `${references.length} attached` : "None",
      media: {
        kind: "still",
        canonicalScene: "PORTRAIT",
        src: references[0]?.url,
      },
    },
    {
      key: "camera",
      opens: "camera",
      label: "Camera",
      summary: cameraPreset?.name ?? titleCase(camera.body ?? "Auto"),
      media: media("CAMERA", cameraPreset),
    },
    {
      key: "lens",
      opens: "camera",
      label: "Lens",
      summary: lensPreset?.name ?? `${lens.focalLengthMm ?? 50}mm`,
      media: media("LENS", lensPreset),
    },
    {
      key: "lighting",
      opens: "lighting",
      label: "Light",
      summary: lightingPreset?.name ?? titleCase(lighting.mood ?? "Auto"),
      media: media("LIGHTING", lightingPreset),
    },
    {
      key: "movement",
      opens: "movement",
      label: "Movement",
      summary: movementPreset?.name ?? titleCase(movement.motionType ?? "Auto"),
      media: media("MOVEMENT", movementPreset),
    },
    {
      key: "color",
      opens: "color",
      label: "Color",
      summary: colorPreset?.name ?? titleCase(color.skinToneTreatment ?? "Auto"),
      media: media(
        "COLOR",
        colorPreset,
        swatches.length ? swatches : colorPreset ? presetSwatches(colorPreset) : undefined,
      ),
    },
    {
      key: "composition",
      opens: "composition",
      label: "Composition",
      summary: compositionPreset?.name ?? titleCase(composition.framing ?? "Auto"),
      media: media("COMPOSITION", compositionPreset),
    },
    {
      key: "atmosphere",
      opens: "atmosphere",
      label: "Atmosphere",
      summary: atmospherePreset?.name ?? titleCase(atmosphere.weather ?? "Auto"),
      media: media("ATMOSPHERE", atmospherePreset),
    },
    {
      key: "optics",
      opens: "optics",
      label: "Optics",
      summary: opticsPreset?.name ?? titleCase(optics.flare ?? "Auto"),
      media: media("OPTICS", opticsPreset),
    },
    {
      key: "filmSetup",
      opens: "filmSetup",
      label: "Film Setup",
      summary: titleCase(
        String(config.filmSetup.value.productionType ?? config.filmSetup.value.format ?? "Auto"),
      ),
      media: media("FULL", undefined),
    },
    {
      key: "presets",
      opens: "presets",
      label: "Presets",
      summary: "Full setups",
      media: media("FULL", undefined),
    },
  ];
}
