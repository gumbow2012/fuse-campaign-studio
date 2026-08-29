import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Check } from "lucide-react";
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import UniversalAuthPanel from "@/components/auth/UniversalAuthPanel";
import { markPlanActivating } from "@/lib/planActivation";

type ClaimResponse = {
  ok?: boolean;
  activating?: boolean;
  return_to?: string;
  requiresSignIn?: boolean;
  email?: string;
  template?: string | null;
  error?: string;
};

const CLAIM_TOKEN_KEY = "fuse.claimToken";

/**
 * /welcome — post-Stripe return for the checkout-first (guest) funnel.
 * The claim call is the ONLY gate; ?success is never trusted.
 */
export default function PaymentReturnPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = params.get("session_id");

  const [status, setStatus] = useState<"claiming" | "activating" | "signin" | "error">("claiming");
  const [message, setMessage] = useState<string | null>(null);
  const [existingEmail, setExistingEmail] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState("/app/templates");
  const startedRef = useRef(false);

  const callClaim = useCallback(async (): Promise<ClaimResponse> => {
    const { data: { session } } = await supabase.auth.getSession();
    let claimToken: string | null = null;
    try {
      claimToken = sessionStorage.getItem(CLAIM_TOKEN_KEY);
    } catch {
      /* storage unavailable */
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/claim-paid-checkout`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ sessionId, claimToken }),
    });
    return (await response.json().catch(() => ({}))) as ClaimResponse;
  }, [sessionId]);

  const waitForEntitlement = useCallback(async (destination: string) => {
    setStatus("activating");
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const { data } = await supabase.functions.invoke("check-subscription");
      if (data?.subscribed || Number(data?.credits_balance ?? 0) > 0) {
        navigate(destination, { replace: true });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    // Still pending — the webhook is authoritative and will post shortly.
    markPlanActivating();
    navigate(destination, { replace: true });
  }, [navigate]);

  const runClaim = useCallback(async () => {
    if (!sessionId) {
      setStatus("error");
      setMessage("Missing checkout reference. If you were charged, your plan will still activate.");
      return;
    }

    // Anonymous identity carries the paid entitlement — no OTP, no password yet.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) {
        setStatus("error");
        setMessage("We could not open your workspace automatically. Please sign in to continue — your payment is safe.");
        return;
      }
    }

    const result = await callClaim();

    if (result.requiresSignIn) {
      setExistingEmail(result.email ?? null);
      setReturnTo(result.return_to ?? "/app/templates");
      setStatus("signin");
      return;
    }

    if (!result.ok) {
      setStatus("error");
      setMessage(result.error ?? "We could not confirm this checkout yet.");
      return;
    }

    try {
      sessionStorage.removeItem(CLAIM_TOKEN_KEY);
    } catch {
      /* ignore */
    }

    const destination = result.return_to ?? "/app/templates";
    setReturnTo(destination);

    if (result.activating) {
      void waitForEntitlement(destination);
      return;
    }

    navigate(destination, { replace: true });
  }, [callClaim, navigate, sessionId, waitForEntitlement]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void runClaim();
  }, [runClaim]);

  if (status === "signin") {
    return (
      <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4">
        <h1 className="font-display text-2xl uppercase tracking-tight">You already have a FUSE account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in{existingEmail ? ` as ${existingEmail}` : ""} to open your campaign.
        </p>
        <div className="mt-6">
          <UniversalAuthPanel
            oauthRedirectTo={`${window.location.origin}/welcome?session_id=${encodeURIComponent(sessionId ?? "")}`}
            initialMode="signin"
            autoRequestEmail={existingEmail}
            authSurface="payment_return"
            onAuthenticated={() => {
              void (async () => {
                const result = await callClaim();
                navigate(result.return_to ?? returnTo, { replace: true });
              })();
            }}
          />

        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col items-center justify-center px-4 text-center">
      {status === "error" ? (
        <>
          <h1 className="font-display text-2xl uppercase tracking-tight">We're finishing up</h1>
          <p className="mt-3 text-sm text-muted-foreground">{message}</p>
          <button
            type="button"
            onClick={() => navigate("/app/templates", { replace: true })}
            className="mt-6 text-sm font-semibold text-primary underline"
          >
            Go to campaigns
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 text-primary">
            <Check className="h-5 w-5" />
            <span className="font-display text-lg uppercase tracking-widest">Payment complete</span>
          </div>
          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {status === "activating" ? "Activating your plan…" : "Opening your campaign…"}
          </p>
        </>
      )}
    </div>
  );
}
