import { ChevronDown, RotateCcw } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

/** Collapsible inspector section in the FUSE editor style. */
export function InspectorSection({
  title,
  meta,
  open,
  onToggle,
  onReset,
  children,
}: {
  title: string;
  meta?: string;
  open: boolean;
  onToggle: () => void;
  onReset?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/70">
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <ChevronDown
            className={cn("h-3.5 w-3.5 text-cyan-300 transition-transform", open ? "" : "-rotate-90")}
          />
          <span className="font-display text-[11px] uppercase tracking-[0.18em] text-white">{title}</span>
          {meta ? <span className="ml-auto font-mono text-[10px] text-slate-500">{meta}</span> : null}
        </button>
        {onReset ? (
          <button
            type="button"
            onClick={onReset}
            aria-label={`Reset ${title}`}
            className="text-slate-500 transition-colors hover:text-cyan-200"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {open ? <div className="space-y-4 border-t border-white/[0.06] px-4 py-4">{children}</div> : null}
    </section>
  );
}

/** Labelled slider with live value read-out. */
export function AdjustSlider({
  label,
  value,
  min = -100,
  max = 100,
  step = 1,
  suffix = "",
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-slate-400">
        <span>{label}</span>
        <span className="font-mono text-slate-300">
          {Number.isInteger(value) ? value : value.toFixed(2)}
          {suffix}
        </span>
      </div>
      <Slider
        className="mt-2"
        value={[value]}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        onValueChange={([next]) => onChange(next)}
        onValueCommit={([next]) => onCommit?.(next)}
      />
    </div>
  );
}

/** Pill row of exclusive options (presets, modes, ratios). */
export function OptionRow<T extends string>({
  label,
  options,
  value,
  onChange,
  columns = 3,
}: {
  label?: string;
  options: { id: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (id: T) => void;
  columns?: number;
}) {
  return (
    <div>
      {label ? (
        <p className="mb-2 text-[10px] uppercase tracking-[0.16em] text-slate-400">{label}</p>
      ) : null}
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={option.disabled}
            onClick={() => onChange(option.id)}
            className={cn(
              "rounded-lg border px-2 py-1.5 text-[11px] transition-colors disabled:opacity-40",
              value === option.id
                ? "border-cyan-300/60 bg-cyan-400/15 text-cyan-100"
                : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Small on/off toggle chip. */
export function ToggleChip({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={cn(
        "rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors",
        active
          ? "border-cyan-300/60 bg-cyan-400/15 text-cyan-100"
          : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25",
      )}
    >
      {label}
    </button>
  );
}
