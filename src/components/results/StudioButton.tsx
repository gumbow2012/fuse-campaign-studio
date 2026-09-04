/**
 * FUSE CREATIVE STUDIO button system.
 *
 * One place decides hierarchy, height, radius and motion so the results
 * workspace reads like a product rather than a pile of pills:
 *   primary   — cyan fill, dark label, the single strongest action in a zone
 *   secondary — dark fill with a cyan border
 *   tertiary  — transparent with a subtle border
 *   icon      — square, never below a 40px target
 * Cyan is reserved for primary / active / progress — never decoration.
 */
import { forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

export type StudioButtonTone = "primary" | "secondary" | "tertiary" | "danger";
export type StudioButtonSize = "xl" | "lg" | "md" | "icon" | "icon-lg";

const BASE =
  "inline-flex select-none items-center justify-center gap-2 rounded-xl font-display font-semibold uppercase " +
  "tracking-[0.14em] transition-[background-color,border-color,color,box-shadow,transform] duration-200 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-slate-950 disabled:pointer-events-none disabled:opacity-45 " +
  "active:translate-y-[1px] motion-reduce:transition-none motion-reduce:active:translate-y-0";

const TONES: Record<StudioButtonTone, string> = {
  primary:
    "bg-cyan-300 text-slate-950 shadow-[0_10px_34px_-14px_rgba(103,232,249,0.85)] hover:bg-cyan-200 " +
    "hover:shadow-[0_14px_44px_-14px_rgba(103,232,249,0.95)]",
  secondary:
    "border border-cyan-300/45 bg-slate-950/70 text-cyan-100 hover:border-cyan-300/80 hover:bg-cyan-300/10 hover:text-white",
  tertiary:
    "border border-white/12 bg-white/[0.03] text-slate-300 hover:border-white/25 hover:bg-white/[0.07] hover:text-white",
  danger:
    "border border-amber-300/40 bg-amber-300/10 text-amber-100 hover:border-amber-300/70 hover:bg-amber-300/20",
};

const SIZES: Record<StudioButtonSize, string> = {
  xl: "h-14 px-7 text-[13px]",
  lg: "h-12 px-6 text-[12px]",
  md: "h-11 px-5 text-[11px]",
  icon: "h-10 w-10 rounded-lg",
  "icon-lg": "h-11 w-11 rounded-xl",
};

export interface StudioButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: StudioButtonTone;
  size?: StudioButtonSize;
  asChild?: boolean;
}

export const StudioButton = forwardRef<HTMLButtonElement, StudioButtonProps>(
  ({ tone = "primary", size = "lg", asChild, className, type, ...props }, ref) => {
    const Component = asChild ? Slot : "button";
    return (
      <Component
        ref={ref}
        type={asChild ? undefined : type ?? "button"}
        className={cn(BASE, TONES[tone], SIZES[size], className)}
        {...props}
      />
    );
  },
);
StudioButton.displayName = "StudioButton";

export default StudioButton;
