import {
  AlertTriangle,
  Award,
  BadgeCheck,
  Bell,
  CheckCircle2,
  Coins,
  CreditCard,
  Gift,
  Sparkles,
  Star,
  UserPlus,
  Upload,
  Wand2,
  type LucideIcon,
} from "lucide-react";

/** Icon + tone per supported notification type (falls back to a neutral bell). */
const TYPE_MAP: Record<string, { icon: LucideIcon; tone: string }> = {
  generation_complete: { icon: CheckCircle2, tone: "text-cyan-300" },
  generation_failed: { icon: AlertTriangle, tone: "text-orange-300" },
  new_template_drop: { icon: Sparkles, tone: "text-lime-300" },
  new_feature: { icon: Wand2, tone: "text-lime-300" },
  creator_submission: { icon: Upload, tone: "text-slate-300" },
  creator_approved: { icon: BadgeCheck, tone: "text-cyan-300" },
  creator_reward: { icon: Gift, tone: "text-lime-300" },
  low_credits: { icon: Coins, tone: "text-amber-300" },
  billing: { icon: CreditCard, tone: "text-slate-300" },
  system: { icon: Bell, tone: "text-slate-300" },
  achievement_unlocked: { icon: Award, tone: "text-lime-300" },
  creator_followed: { icon: UserPlus, tone: "text-cyan-300" },
  creator_new_template: { icon: Star, tone: "text-cyan-300" },
  creator_verified: { icon: BadgeCheck, tone: "text-cyan-300" },
  brand_activation: { icon: Sparkles, tone: "text-cyan-300" },
};

export function notificationVisual(type: string) {
  return TYPE_MAP[type] ?? TYPE_MAP.system;
}

/** Short relative time ("just now", "12m", "3h", "2d", then a date). */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
