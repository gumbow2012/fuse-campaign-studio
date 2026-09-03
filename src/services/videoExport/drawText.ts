/**
 * Canvas text rendering for the export worker.
 * Uses the same layer maths as the preview overlay so burned-in text matches
 * what the editor shows.
 */
import {
  fontStack,
  hexToRgba,
  textLayerStateAt,
  TEXT_REFERENCE_WIDTH,
  wrapLines,
  type TextLayer,
} from "@/services/editorText";

type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, Math.min(w, h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/** Draws every visible layer for `timeMs` into a frame of `width` x `height`. */
export function drawTextLayers(
  ctx: Ctx,
  layers: TextLayer[],
  timeMs: number,
  width: number,
  height: number,
) {
  if (!layers.length) return;
  const unit = width / TEXT_REFERENCE_WIDTH;

  for (const layer of layers) {
    const state = textLayerStateAt(layer, timeMs);
    if (!state || state.opacity <= 0.002) continue;

    const fontSize = (layer.sizePct / 100) * height;
    const font = `${layer.weight} ${fontSize}px ${fontStack(layer.fontId)}`;
    ctx.save();
    ctx.font = font;
    ctx.textBaseline = "middle";
    ctx.textAlign = layer.align;

    const spacing = layer.letterSpacing * fontSize;
    const measure = (line: string) =>
      ctx.measureText(line).width + Math.max(0, line.length - 1) * spacing;

    const maxWidth = layer.width * width - layer.padding * unit * 2;
    const lines = wrapLines(measure, layer.uppercase ? layer.text.toUpperCase() : layer.text, maxWidth);
    const lineHeight = fontSize * layer.lineHeight;
    const blockHeight = lines.length * lineHeight;
    const blockWidth = Math.min(maxWidth, Math.max(...lines.map(measure), 1));

    const centreX = (layer.x + state.dx) * width;
    const centreY = (layer.y + state.dy) * height;

    ctx.globalAlpha = state.opacity;
    ctx.translate(centreX, centreY);
    ctx.scale(state.scale, state.scale);

    if (layer.bgOpacity > 0.002) {
      const padding = layer.padding * unit;
      ctx.fillStyle = hexToRgba(layer.bgColor, layer.bgOpacity);
      roundRect(
        ctx,
        -blockWidth / 2 - padding,
        -blockHeight / 2 - padding * 0.7,
        blockWidth + padding * 2,
        blockHeight + padding * 1.4,
        layer.bgRadius * unit,
      );
      ctx.fill();
    }

    if (layer.shadow > 0) {
      ctx.shadowColor = `rgba(0,0,0,${(layer.shadow / 100) * 0.8})`;
      ctx.shadowBlur = (layer.shadow / 100) * 28 * unit;
      ctx.shadowOffsetY = (layer.shadow / 100) * 4 * unit;
    }

    const alignX = layer.align === "left" ? -blockWidth / 2 : layer.align === "right" ? blockWidth / 2 : 0;

    lines.forEach((line, index) => {
      const y = -blockHeight / 2 + lineHeight * (index + 0.5);
      const drawLine = (paint: () => void) => paint();
      if (spacing === 0) {
        if (layer.outlineWidth > 0) {
          ctx.lineJoin = "round";
          ctx.lineWidth = layer.outlineWidth * unit * 2;
          ctx.strokeStyle = layer.outlineColor;
          drawLine(() => ctx.strokeText(line, alignX, y));
        }
        ctx.fillStyle = layer.color;
        drawLine(() => ctx.fillText(line, alignX, y));
        return;
      }
      // Manual letter spacing keeps worker output identical across browsers.
      const lineWidth = measure(line);
      let cursor =
        layer.align === "left" ? -blockWidth / 2 : layer.align === "right" ? blockWidth / 2 - lineWidth : -lineWidth / 2;
      const previousAlign = ctx.textAlign;
      ctx.textAlign = "left";
      for (const character of line) {
        if (layer.outlineWidth > 0) {
          ctx.lineJoin = "round";
          ctx.lineWidth = layer.outlineWidth * unit * 2;
          ctx.strokeStyle = layer.outlineColor;
          ctx.strokeText(character, cursor, y);
        }
        ctx.fillStyle = layer.color;
        ctx.fillText(character, cursor, y);
        cursor += ctx.measureText(character).width + spacing;
      }
      ctx.textAlign = previousAlign;
    });

    ctx.restore();
  }
}
