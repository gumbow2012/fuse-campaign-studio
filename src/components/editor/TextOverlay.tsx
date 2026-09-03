import { useCallback, useEffect, useRef, useState } from "react";
import {
  fontStack,
  hexToRgba,
  textLayerStateAt,
  TEXT_REFERENCE_WIDTH,
  type TextLayer,
} from "@/services/editorText";

/**
 * DOM text overlay for the preview. The maths mirror the export worker's canvas
 * renderer so what you drag here is exactly what renders.
 */
export default function TextOverlay({
  layers,
  currentMs,
  selectedId,
  onSelect,
  onMove,
  onMoveCommit,
  interactive = true,
  showGuides = false,
}: {
  layers: TextLayer[];
  currentMs: number;
  selectedId: string | null;
  onSelect?: (id: string) => void;
  onMove?: (id: string, x: number, y: number) => void;
  onMoveCommit?: (id: string, x: number, y: number) => void;
  interactive?: boolean;
  showGuides?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const dragRef = useRef<{ id: string; x: number; y: number } | null>(null);

  useEffect(() => {
    const node = boxRef.current;
    if (!node) return;
    const measure = () => setSize({ width: node.clientWidth, height: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const scale = size.width / TEXT_REFERENCE_WIDTH || 1;

  const startDrag = useCallback(
    (layer: TextLayer, event: React.PointerEvent<HTMLDivElement>) => {
      if (!interactive || !onMove) return;
      event.preventDefault();
      event.stopPropagation();
      onSelect?.(layer.id);
      const node = boxRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      dragRef.current = { id: layer.id, x: layer.x, y: layer.y };
      const move = (moveEvent: PointerEvent) => {
        const x = Math.min(1, Math.max(0, (moveEvent.clientX - rect.left) / rect.width));
        const y = Math.min(1, Math.max(0, (moveEvent.clientY - rect.top) / rect.height));
        dragRef.current = { id: layer.id, x, y };
        onMove(layer.id, x, y);
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        const final = dragRef.current;
        dragRef.current = null;
        if (final) onMoveCommit?.(final.id, final.x, final.y);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [interactive, onMove, onMoveCommit, onSelect],
  );

  return (
    <div ref={boxRef} className="absolute inset-0 overflow-hidden">
      {showGuides ? (
        <div className="pointer-events-none absolute inset-[6%] rounded-lg border border-dashed border-white/20" />
      ) : null}
      {layers.map((layer) => {
        const state = textLayerStateAt(layer, currentMs);
        if (!state) return null;
        const fontSize = (layer.sizePct / 100) * (size.height || 1);
        const selected = selectedId === layer.id;
        return (
          <div
            key={layer.id}
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
            onPointerDown={(event) => startDrag(layer, event)}
            className={interactive ? "absolute cursor-move" : "pointer-events-none absolute"}
            style={{
              left: `${(layer.x + state.dx) * 100}%`,
              top: `${(layer.y + state.dy) * 100}%`,
              width: `${layer.width * 100}%`,
              transform: `translate(-50%, -50%) scale(${state.scale})`,
              opacity: state.opacity,
              outline: selected && interactive ? "1px dashed rgba(49,224,255,0.8)" : undefined,
              outlineOffset: 4,
            }}
          >
            <span
              style={{
                display: "block",
                fontFamily: fontStack(layer.fontId),
                fontSize: `${fontSize}px`,
                fontWeight: layer.weight,
                lineHeight: layer.lineHeight,
                letterSpacing: `${layer.letterSpacing}em`,
                textTransform: layer.uppercase ? "uppercase" : "none",
                textAlign: layer.align,
                color: layer.color,
                padding: `${layer.padding * scale}px ${layer.padding * scale * 1.2}px`,
                borderRadius: `${Math.min(layer.bgRadius, 999) * scale}px`,
                background: layer.bgOpacity > 0 ? hexToRgba(layer.bgColor, layer.bgOpacity) : "transparent",
                WebkitTextStrokeWidth: layer.outlineWidth > 0 ? `${layer.outlineWidth * scale}px` : undefined,
                WebkitTextStrokeColor: layer.outlineWidth > 0 ? layer.outlineColor : undefined,
                textShadow:
                  layer.shadow > 0
                    ? `0 ${0.02 * fontSize}px ${(layer.shadow / 100) * fontSize * 0.35}px rgba(0,0,0,${
                        0.2 + (layer.shadow / 100) * 0.6
                      })`
                    : undefined,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {layer.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}
