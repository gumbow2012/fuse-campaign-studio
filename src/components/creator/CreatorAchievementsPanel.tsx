/**
 * PUBLIC creator badges — EARNED achievements only.
 * The list comes from `creator-portfolio` (service role, real
 * `user_achievements`); locked achievements, progress and rewards are never
 * exposed on a public storefront.
 */

import type { CreatorPublicAchievement } from "@/services/creatorDashboard";

export default function CreatorAchievementsPanel({
  achievements,
}: {
  achievements: CreatorPublicAchievement[];
}) {
  if (!achievements.length) {
    return (
      <div className="rounded-[1.25rem] border border-white/8 bg-black/20 p-6 text-sm text-slate-300">
        No achievements earned yet.
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {achievements.map((achievement) => (
        <div
          key={achievement.key}
          className="rounded-2xl border border-cyan-300/30 bg-cyan-400/[0.06] p-4"
        >
          <div className="flex items-center gap-2">
            <span aria-hidden className="text-lg">
              {achievement.icon || "🏆"}
            </span>
            <p className="text-sm font-semibold text-white">{achievement.title}</p>
          </div>
          {achievement.description ? (
            <p className="mt-2 text-xs leading-5 text-slate-400">{achievement.description}</p>
          ) : null}
          {achievement.unlockedAt ? (
            <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-cyan-200/70">
              Earned {new Date(achievement.unlockedAt).toLocaleDateString()}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
