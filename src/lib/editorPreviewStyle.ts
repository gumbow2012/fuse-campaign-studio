/**
 * Turns a RenderSpec into DOM styles for the live preview.
 * The maths here MUST mirror the export worker so preview == export.
 */
import { noiseTileBytes, type RenderSpec } from "@/services/editorAdjustments";

const grainCache = new Map<string, string>();

/** Deterministic grain tile as a data url (same PRNG the exporter uses). */
export function grainDataUrl(tile: number, softness: number) {
  const key = `${tile}|${softness.toFixed(2)}`;
  const cached = grainCache.get(key);
  if (cached) return cached;
  const { bytes, dimension } = noiseTileBytes(tile, softness);
  const canvas = document.createElement("canvas");
  canvas.width = dimension;
  canvas.height = dimension;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.putImageData(new ImageData(bytes, dimension, dimension), 0, 0);
  const url = canvas.toDataURL("image/png");
  grainCache.set(key, url);
  return url;
}

export function videoStyleFor(spec: RenderSpec): React.CSSProperties {
  const { transform } = spec;
  return {
    filter: spec.filter,
    objectFit: transform.fit,
    transform: [
      `translate(${transform.offsetX}%, ${transform.offsetY}%)`,
      `scale(${transform.scale})`,
      `rotate(${transform.rotate}deg)`,
      transform.flip ? "scaleX(-1)" : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

export type OverlayLayer = { key: string; style: React.CSSProperties };

export function overlayLayersFor(spec: RenderSpec): OverlayLayer[] {
  const layers: OverlayLayer[] = [];

  spec.overlays.tints.forEach((tint, index) => {
    layers.push({
      key: `tint-${index}`,
      style: {
        backgroundColor: `rgb(${tint.color[0]} ${tint.color[1]} ${tint.color[2]})`,
        opacity: tint.alpha,
        mixBlendMode: tint.blend as React.CSSProperties["mixBlendMode"],
      },
    });
  });

  if (spec.overlays.vignette > 0) {
    layers.push({
      key: "vignette",
      style: {
        background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,${spec.overlays.vignette}) 100%)`,
      },
    });
  }

  const grain = spec.overlays.grain;
  if (grain) {
    layers.push({
      key: "grain",
      style: {
        backgroundImage: `url(${grainDataUrl(grain.tile, grain.softness)})`,
        backgroundRepeat: "repeat",
        backgroundSize: `${grain.tile}px ${grain.tile}px`,
        opacity: grain.alpha,
        mixBlendMode: "overlay",
      },
    });
  }

  return layers;
}

/** Inner frame box when the clip overrides the project aspect ratio. */
export function frameBoxStyle(spec: RenderSpec): React.CSSProperties {
  if (!spec.transform.aspect) return { position: "absolute", inset: 0 };
  return {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    aspectRatio: String(spec.transform.aspect),
    maxWidth: "100%",
    maxHeight: "100%",
    width: "100%",
    overflow: "hidden",
  };
}
