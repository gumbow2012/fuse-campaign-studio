/**
 * ACHIEVEMENTS grid for the Account area.
 * Reads via the "list" action (no side effects) and evaluates once on mount
 * so real unlocks surface with a single tasteful toast. No credit copy.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Lock, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  announceUnlocks,
  evaluateAchievements,
  listAchievements,
  type Achievement,
} from "@/services/achievements";

function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function AchievementCard({ achievement, animate }: { achievement: Achievement; animate: boolean }) {
  const unlocked = Boolean(achievement.unlocked_at);
  const inProgress = !unlocked && achievement.current > 0;
  const pct = achievement.target > 0
    ? Math.min(100, Math.round((achievement.current / achievement.target) * 100))
    : 0;

  return (
    <div
      className={`rounded-2xl border p-4 ${
        unlocked
          ? "border-cyan-300/40 bg-cyan-400/[0.06]"
          : "border-white/10 bg-white/[0.02]"
      } ${animate ? "transition-colors duration-300" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-lg">
            {achievement.icon || (unlocked ? "🏆" : "•")}
          </span>
          <p
            className="font-display text-sm font-semibold tracking-[-0.01em] text-white"
            style={{ fontFamily: "Orbitron, var(--font-display, inherit)" }}
          >
            {achievement.title}
          </p>
        </div>
        {unlocked ? (
          <Check className="h-4 w-4 shrink-0 text-cyan-200" aria-label="Unlocked" />
        ) : (
          <Lock className="h-4 w-4 shrink-0 text-slate-500" aria-label="Locked" />
        )}
      </div>

      {unlocked ? null : (
        <p className="mt-2 text-xs leading-5 text-slate-400">{achievement.description}</p>
      )}

      {inProgress ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-cyan-100">
            {achievement.current} / {achievement.target}
          </p>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full bg-cyan-300/70 ${animate ? "transition-[width] duration-500" : ""}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      ) : null}

      {!unlocked && achievement.action_label && achievement.action_url ? (
        <Button asChild size="sm" variant="outline" className="mt-3 h-8 border-white/15 text-xs">
          <Link to={achievement.action_url}>{achievement.action_label}</Link>
        </Button>
      ) : null}
    </div>
  );
}

export default function AchievementsSection() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [summary, setSummary] = useState({ unlocked: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const animate = useMemo(() => !prefersReducedMotion(), []);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const listed = await listAchievements();
        if (!active) return;
        setAchievements(listed.achievements);
        setSummary(listed.summary);
      } catch {
        /* keep the section quiet if the engine is unavailable */
      } finally {
        if (active) setLoading(false);
      }

      try {
        const evaluated = await evaluateAchievements();
        if (!active) return;
        setAchievements(evaluated.achievements);
        setSummary(evaluated.summary);
        announceUnlocks(evaluated);
      } catch {
        /* evaluation is best-effort */
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  if (!loading && !achievements.length) return null;

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.24em] text-white"
          style={{ fontFamily: "Orbitron, var(--font-display, inherit)" }}
        >
          <Trophy className="h-4 w-4 text-cyan-200" aria-hidden />
          Achievements
        </h2>
        <p
          className="text-xs text-slate-400"
          style={{ fontFamily: "'IBM Plex Sans', var(--font-body, inherit)" }}
        >
          {summary.unlocked} / {summary.total} unlocked
        </p>
      </div>

      <div
        className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        style={{ fontFamily: "'IBM Plex Sans', var(--font-body, inherit)" }}
      >
        {loading
          ? Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-28 rounded-2xl border border-white/10 bg-white/[0.03]"
                aria-hidden
              />
            ))
          : achievements.map((achievement) => (
              <AchievementCard key={achievement.key} achievement={achievement} animate={animate} />
            ))}
      </div>
    </section>
  );
}
