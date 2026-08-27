import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  getMyStreak,
  touchStreak,
  daysBetween,
  todayIso,
  STREAK_MILESTONES,
  type UserStreak,
} from "@/services/streaks";

interface StreakContextValue {
  streak: UserStreak | null;
  loading: boolean;
}

const StreakContext = createContext<StreakContextValue>({ streak: null, loading: false });

const touchKey = (userId: string) => `fuse:streak:touched:${userId}`;
const welcomeKey = (userId: string) => `fuse:streak:welcomed:${userId}`;
const milestoneKey = (userId: string) => `fuse:streak:milestone:${userId}`;

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/**
 * Records one streak touch per authenticated app load (and at most once per UTC
 * day thanks to the localStorage day-guard). Detects returning users from the
 * PRE-touch last_active_on, and celebrates milestone streaks client-side only.
 */
export function StreakProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [streak, setStreak] = useState<UserStreak | null>(null);
  const [loading, setLoading] = useState(false);
  const ranFor = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setStreak(null);
      ranFor.current = null;
      return;
    }
    if (ranFor.current === user.id) return;
    ranFor.current = user.id;

    let cancelled = false;
    const today = todayIso();

    (async () => {
      setLoading(true);
      try {
        const before = await getMyStreak().catch(() => null);
        if (cancelled) return;

        // Day-guard: skip the RPC when we already touched today on this device.
        if (read(touchKey(user.id)) === today) {
          setStreak(before);
          return;
        }

        const after = await touchStreak().catch(() => null);
        if (cancelled) return;
        write(touchKey(user.id), today);
        const next = after ?? before;
        setStreak(next);

        // Welcome back: gap of more than one day since the last active date.
        const previous = before?.last_active_on ?? null;
        const gap = previous ? daysBetween(previous, today) : 0;
        const reset = Boolean(before && after && after.current_streak === 1 && before.current_streak > 1);
        if ((gap > 1 || reset) && read(welcomeKey(user.id)) !== today) {
          write(welcomeKey(user.id), today);
          toast("Welcome back", {
            description: "Your workspace is right where you left it.",
          });
        }

        // Milestone celebration (client-side only, once per milestone).
        const current = next?.current_streak ?? 0;
        if (STREAK_MILESTONES.includes(current) && read(milestoneKey(user.id)) !== String(current)) {
          write(milestoneKey(user.id), String(current));
          toast.success(`${current}-day streak`, {
            description: "🔥 Consistency looks good on you.",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return <StreakContext.Provider value={{ streak, loading }}>{children}</StreakContext.Provider>;
}

export const useStreak = () => useContext(StreakContext);
