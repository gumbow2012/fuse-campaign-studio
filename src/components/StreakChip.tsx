import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useStreak } from "@/hooks/useStreak";
import { todayIso } from "@/services/streaks";

/** Compact daily-activity streak indicator for the header cluster. */
export function StreakChip() {
  const { streak } = useStreak();
  const current = Number(streak?.current_streak ?? 0);
  if (!streak || current <= 0) return null;

  const longest = Number(streak.longest_streak ?? 0);
  const total = Number(streak.total_active_days ?? 0);
  /* RETENTION P4 — gentle nudge only: not active today AND a real streak to keep. */
  const needsNudge = current >= 2 && streak.last_active_on !== todayIso();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Daily streak"
          aria-label={`Daily streak: ${current} day${current === 1 ? "" : "s"}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 font-sans text-xs font-semibold text-amber-200 backdrop-blur-sm transition-colors duration-200 hover:brightness-110 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span aria-hidden="true">🔥</span>
          <span>{current}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-56 rounded-2xl border-white/10 bg-[#0B1120]/95 p-4 font-sans shadow-2xl backdrop-blur-xl"
      >
        <p className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Streak
        </p>
        <p className="mt-1 text-2xl font-bold text-foreground">
          {current}
          <span className="ml-1.5 text-xs font-medium text-muted-foreground">
            day{current === 1 ? "" : "s"} in a row
          </span>
        </p>
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          <p>Longest streak: {longest.toLocaleString()} days</p>
          <p>Total active days: {total.toLocaleString()}</p>
        </div>
        {needsNudge ? (
          <p className="mt-3 rounded-xl border border-amber-300/25 bg-amber-300/[0.07] px-3 py-2 text-[11px] text-amber-100">
            Keep your streak going — create something today.
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export default StreakChip;
