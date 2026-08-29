import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

const PENDING_TOPUP_KEY = "fuse_pending_credit_topup";

export function rememberPendingCreditTopUp(credits: number, balanceBefore: number) {
  try {
    window.sessionStorage.setItem(
      PENDING_TOPUP_KEY,
      JSON.stringify({ credits, balanceBefore, startedAt: Date.now() }),
    );
  } catch {
    // ignore
  }
}

type Pending = { credits: number; balanceBefore: number; startedAt: number };

function readPending(): Pending | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_TOPUP_KEY);
    return raw ? (JSON.parse(raw) as Pending) : null;
  } catch {
    return null;
  }
}

function clearPending() {
  try {
    window.sessionStorage.removeItem(PENDING_TOPUP_KEY);
  } catch {
    // ignore
  }
}

/**
 * After returning from Stripe with a success flag, confirms the credit grant by
 * refreshing the profile until the balance reflects the purchase, then toasts
 * the new balance. No full page reload is needed — the header reads the same
 * profile state.
 */
export default function CreditTopUpSuccessWatcher() {
  const location = useLocation();
  const { user, refreshProfile } = useAuth();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current || !user) return;
    const params = new URLSearchParams(location.search);
    if (params.get("success") !== "true") return;
    const pending = readPending();
    if (!pending) return;

    handled.current = true;
    let cancelled = false;

    const run = async () => {
      // The webhook posts credits asynchronously — poll a bounded number of times.
      for (let attempt = 0; attempt < 8 && !cancelled; attempt++) {
        const profile = await refreshProfile();
        const balance = Number(profile?.credits_balance ?? 0);
        if (balance >= pending.balanceBefore + pending.credits) {
          clearPending();
          toast({
            title: `+${pending.credits.toLocaleString()} credits added`,
            description: `New balance: ${balance.toLocaleString()} credits.`,
          });
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      if (cancelled) return;
      clearPending();
      toast({
        title: "Payment received",
        description: `${pending.credits.toLocaleString()} credits are being added to your balance.`,
      });
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [location.search, user, refreshProfile]);

  return null;
}
