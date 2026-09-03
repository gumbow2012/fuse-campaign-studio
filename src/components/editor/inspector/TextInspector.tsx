import { useState } from "react";
import { Copy, Eye, EyeOff, Plus, Trash2, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AdjustSlider, InspectorSection, OptionRow, ToggleChip } from "./AdjustControls";
import { formatSeconds } from "@/services/campaignEditor";
import {
  TEXT_ANIMS,
  TEXT_FONTS,
  TEXT_PRESETS,
  type TextAlign,
  type TextAnim,
  type TextFontId,
  type TextLayer,
} from "@/services/editorText";
import { cn } from "@/lib/utils";

/** Text layer panel — add, style and time overlay text. */
export default function TextInspector({
  layers,
  selectedId,
  onSelect,
  onAdd,
  onPatch,
  onDelete,
  onDuplicate,
  durationMs,
  currentMs,
}: {
  layers: TextLayer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onPatch: (id: string, patch: Partial<TextLayer>, options?: { label?: string }) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  durationMs: number;
  currentMs: number;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({ style: true, timing: false });
  const layer = layers.find((item) => item.id === selectedId) ?? null;
  const toggle = (key: string) => setOpen((state) => ({ ...state, [key]: !state[key] }));
  const patch = (value: Partial<TextLayer>, label?: string) => layer && onPatch(layer.id, value, { label });

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-[11px] uppercase tracking-[0.18em] text-white">Text</h3>
          <Button
            type="button"
            size="sm"
            onClick={onAdd}
            className="h-8 bg-cyan-400 font-display text-[11px] uppercase tracking-[0.1em] text-slate-950 hover:bg-cyan-300"
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add text
          </Button>
        </div>

        {layers.length === 0 ? (
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            Add a headline, subtitle or price tag. Drag it straight on the preview to place it.
          </p>
        ) : (
          <div className="mt-3 grid gap-1.5">
            {layers.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-2 py-1.5",
                  item.id === selectedId
                    ? "border-cyan-300/60 bg-cyan-400/10"
                    : "border-white/10 bg-white/[0.03]",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <Type className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                  <span className="truncate text-[11px] text-slate-200">{item.text || "Text"}</span>
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-500">
                    {formatSeconds(item.startMs)}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={item.hidden ? "Show layer" : "Hide layer"}
                  onClick={() => onPatch(item.id, { hidden: !item.hidden }, { label: "text visibility" })}
                  className="text-slate-500 hover:text-cyan-200"
                >
                  {item.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  aria-label="Duplicate layer"
                  onClick={() => onDuplicate(item.id)}
                  className="text-slate-500 hover:text-cyan-200"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Delete layer"
                  onClick={() => onDelete(item.id)}
                  className="text-slate-500 hover:text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {layer ? (
        <>
          <InspectorSection title="Content & style" open={!!open.style} onToggle={() => toggle("style")}>
            <Textarea
              value={layer.text}
              onChange={(event) => patch({ text: event.target.value })}
              rows={2}
              aria-label="Text content"
              className="border-white/10 bg-white/[0.03] text-sm text-white"
            />
            <OptionRow
              label="Preset"
              columns={4}
              value={""}
              onChange={(id) => {
                const preset = TEXT_PRESETS.find((item) => item.id === id);
                if (preset) patch(preset.patch, "text preset");
              }}
              options={TEXT_PRESETS.map((preset) => ({ id: preset.id, label: preset.label }))}
            />
            <OptionRow<TextFontId>
              label="Font"
              columns={3}
              value={layer.fontId}
              onChange={(id) => patch({ fontId: id }, "text font")}
              options={TEXT_FONTS.map((font) => ({ id: font.id, label: font.label }))}
            />
            <OptionRow<TextAlign>
              label="Align"
              columns={3}
              value={layer.align}
              onChange={(id) => patch({ align: id }, "text align")}
              options={[
                { id: "left", label: "Left" },
                { id: "center", label: "Centre" },
                { id: "right", label: "Right" },
              ]}
            />
            <AdjustSlider
              label="Size"
              value={layer.sizePct}
              min={1.5}
              max={24}
              step={0.2}
              suffix="%"
              onChange={(value) => patch({ sizePct: value })}
              onCommit={(value) => patch({ sizePct: value }, "text size")}
            />
            <AdjustSlider
              label="Weight"
              value={layer.weight}
              min={300}
              max={900}
              step={100}
              onChange={(value) => patch({ weight: value })}
              onCommit={(value) => patch({ weight: value }, "text weight")}
            />
            <AdjustSlider
              label="Box width"
              value={layer.width}
              min={0.15}
              max={1}
              step={0.01}
              onChange={(value) => patch({ width: value })}
              onCommit={(value) => patch({ width: value }, "text width")}
            />
            <AdjustSlider
              label="Letter spacing"
              value={layer.letterSpacing}
              min={-0.05}
              max={0.4}
              step={0.01}
              suffix="em"
              onChange={(value) => patch({ letterSpacing: value })}
              onCommit={(value) => patch({ letterSpacing: value }, "letter spacing")}
            />
            <AdjustSlider
              label="Line height"
              value={layer.lineHeight}
              min={0.8}
              max={2}
              step={0.05}
              onChange={(value) => patch({ lineHeight: value })}
              onCommit={(value) => patch({ lineHeight: value }, "line height")}
            />
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[10px] uppercase tracking-[0.16em] text-slate-400">
                Text colour
                <input
                  type="color"
                  value={layer.color}
                  onChange={(event) => patch({ color: event.target.value }, "text colour")}
                  className="mt-1 h-8 w-full rounded-md border border-white/10 bg-transparent"
                />
              </label>
              <label className="text-[10px] uppercase tracking-[0.16em] text-slate-400">
                Box colour
                <input
                  type="color"
                  value={layer.bgColor}
                  onChange={(event) => patch({ bgColor: event.target.value }, "box colour")}
                  className="mt-1 h-8 w-full rounded-md border border-white/10 bg-transparent"
                />
              </label>
            </div>
            <AdjustSlider
              label="Box opacity"
              value={layer.bgOpacity}
              min={0}
              max={1}
              step={0.05}
              onChange={(value) => patch({ bgOpacity: value })}
              onCommit={(value) => patch({ bgOpacity: value }, "box opacity")}
            />
            <AdjustSlider
              label="Outline"
              value={layer.outlineWidth}
              min={0}
              max={24}
              onChange={(value) => patch({ outlineWidth: value })}
              onCommit={(value) => patch({ outlineWidth: value }, "text outline")}
            />
            <AdjustSlider
              label="Shadow"
              value={layer.shadow}
              min={0}
              max={100}
              onChange={(value) => patch({ shadow: value })}
              onCommit={(value) => patch({ shadow: value }, "text shadow")}
            />
            <div className="flex flex-wrap gap-1.5">
              <ToggleChip
                label="Uppercase"
                active={layer.uppercase}
                onToggle={() => patch({ uppercase: !layer.uppercase }, "uppercase")}
              />
            </div>
          </InspectorSection>

          <InspectorSection
            title="Timing & motion"
            meta={`${formatSeconds(layer.startMs)} → ${formatSeconds(layer.endMs)}`}
            open={!!open.timing}
            onToggle={() => toggle("timing")}
          >
            <AdjustSlider
              label="Start"
              value={layer.startMs}
              min={0}
              max={Math.max(1000, durationMs)}
              step={50}
              suffix="ms"
              onChange={(value) => patch({ startMs: value, endMs: Math.max(value + 300, layer.endMs) })}
              onCommit={(value) =>
                patch({ startMs: value, endMs: Math.max(value + 300, layer.endMs) }, "text start")
              }
            />
            <AdjustSlider
              label="End"
              value={layer.endMs}
              min={layer.startMs + 300}
              max={Math.max(layer.startMs + 1000, durationMs)}
              step={50}
              suffix="ms"
              onChange={(value) => patch({ endMs: value })}
              onCommit={(value) => patch({ endMs: value }, "text end")}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => patch({ startMs: Math.round(currentMs) }, "text start")}
                className="border-white/15 bg-white/[0.03] text-[11px] text-slate-200"
              >
                Start here
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  patch({ endMs: Math.max(layer.startMs + 300, Math.round(currentMs)) }, "text end")
                }
                className="border-white/15 bg-white/[0.03] text-[11px] text-slate-200"
              >
                End here
              </Button>
            </div>
            <OptionRow<TextAnim>
              label="Animate in"
              columns={5}
              value={layer.animIn}
              onChange={(id) => patch({ animIn: id }, "text animation")}
              options={TEXT_ANIMS}
            />
            <OptionRow<TextAnim>
              label="Animate out"
              columns={5}
              value={layer.animOut}
              onChange={(id) => patch({ animOut: id }, "text animation")}
              options={TEXT_ANIMS}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => patch({ startMs: 0, endMs: Math.max(1000, durationMs) }, "text full length")}
              className="w-full border-white/15 bg-white/[0.03] text-slate-200"
            >
              Span whole campaign
            </Button>
          </InspectorSection>
        </>
      ) : null}
    </div>
  );
}
