import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { clearPlanActivating, isPlanActivating } from "@/lib/planActivation";

/**
 * Shown when a plan was just purchased but the authoritative billing state
 * (webhook-granted credits / subscription) hasn't posted yet. Polls the server;
 * never mints credits client-side.
 */
export default function PlanActivationNotice() {
  const { profile, refreshProfile } = useAuth();
  const [activating, setActivating] = useState(() => isPlanActivating());

  useEffect(() => {
    if (!activating) return;

    const posted = Number(profile?.credits_balance ?? 0) > 0 ||
      profile?.subscription_status === "active" ||
      profile?.subscription_status === "trialing";
    if (posted) {
      clearPlanActivating();
      setActivating(false);
      return;
    }

    const timer = setInterval(() => {
      void refreshProfile();
    }, 4000);
    const stop = setTimeout(() => {
      clearPlanActivating();
      setActivating(false);
    }, 3 * 60 * 1000);

    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [activating, profile?.credits_balance, profile?.subscription_status, refreshProfile]);

  if (!activating) return null;

  return (
    <div className="mb-4 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
      <span>Activating your plan… your credits will appear here in a moment.</span>
    </div>
  );
}
