import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Shared FUSE studio primitives — Orbitron-led titles, segmented controls and
 * panels. Presentation only; no product logic lives here.
 */

export function FusePanel({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        "rounded-2xl border border-white/10 bg-[hsl(var(--card)/0.75)] p-5 shadow-[0_18px_60px_-30px_rgba(0,0,0,0.9)] backdrop-blur-xl transition-colors",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  hint,
  className,
}: {
  children: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1", className)}>
      <h2 className="font-display text-[19px] font-semibold leading-tight tracking-[0.02em] text-foreground">
        {children}
      </h2>
      {hint ? <span className="text-[13px] text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

export function FieldHelper({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{children}</p>;
}

export type SegmentedOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  glyph?: React.ReactNode;
  title?: string;
};

/** Orbitron segmented control with a cyan active edge and smooth transitions. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
  size = "md",
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex flex-wrap gap-1 rounded-xl border border-white/10 bg-black/40 p-1",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex items-center gap-2 rounded-lg font-display font-semibold tracking-[0.03em] transition-all duration-200",
              size === "sm" ? "px-3 py-1.5 text-[12px]" : "px-4 py-2 text-[14px]",
              active
                ? "border border-[hsl(var(--electric-blue)/0.6)] bg-[hsl(var(--electric-blue)/0.14)] text-[hsl(var(--electric-cyan))] shadow-[0_0_18px_-6px_hsl(var(--electric-blue)/0.8)]"
                : "border border-transparent text-foreground/70 hover:border-white/10 hover:bg-white/[0.04] hover:text-foreground",
            )}
          >
            {option.glyph}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
