import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { track } from "@/lib/analytics/track";
import { clearPendingReferralCode, readPendingReferralCode } from "@/lib/pendingReferral";

/**
 * Auto-applies a captured referral code once a session exists (email OTP or the
 * Google OAuth redirect return). Runs at most once per mount and always clears
 * the pending code on a definitive server response so it never loops.
 */
export function usePendingReferral() {
  const { user, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  const attempted = useRef(false);

  useEffect(() => {
    if (!user || attempted.current) return;
    const code = readPendingReferralCode();
    if (!code) return;

    attempted.current = true;

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("referrals", {
          body: { action: "apply-code", code },
        });
        // Transport failure: keep the code so the next authenticated visit retries.
        if (error && !data) throw error;

        const serverError = (data as { error?: string } | null)?.error;
        // Handled response (invalid / already attributed / self-referral) — stop retrying.
        clearPendingReferralCode(code);

        if (serverError) return;

        const bonus = Number((data as { bonusCredits?: number } | null)?.bonusCredits ?? 0);
        track("referral_attributed", { has_bonus: bonus > 0 });
        toast({
          title: "Referral applied",
          description: bonus > 0 ? `${bonus} bonus credits added to your account.` : "Your referral was recorded.",
        });

        await refreshProfile();
        queryClient.invalidateQueries({ queryKey: ["my-referral"] });
        queryClient.invalidateQueries({ queryKey: ["credit-ledger"] });
        queryClient.invalidateQueries({ queryKey: ["credit-balance"] });
      } catch {
        // Network/transport issue only — leave the pending code in place, stay silent.
        attempted.current = false;
      }
    })();
  }, [queryClient, refreshProfile, user]);
}
