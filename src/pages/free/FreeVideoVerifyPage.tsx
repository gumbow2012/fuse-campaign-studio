/**
 * F4 — /free/verify — post email-confirmation callback.
 *
 * The campaign is resolved ONLY from the server-side free-video intent
 * (httpOnly nonce cookie). No client-supplied return URL is trusted.
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { claimFreeVideoIntent } from "@/services/freeVideoIntent";

export default function FreeVideoVerifyPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const startedRef = useRef(false);
  const [message, setMessage] = useState("Email confirmed ✓ — loading your campaign…");

  useEffect(() => {
    if (loading) return;
    if (!session?.user?.id) {
      setMessage("Confirm your email from the link we sent to continue.");
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;

    void (async () => {
      try {
        const { templateId } = await claimFreeVideoIntent();
        navigate(templateId ? `/app/templates/${templateId}` : "/app/templates", { replace: true });
      } catch {
        navigate("/app/templates", { replace: true });
      }
    })();
  }, [loading, navigate, session?.user?.id]);

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-400/10">
          {session?.user?.id ? (
            <Check className="h-6 w-6 text-emerald-200" />
          ) : (
            <Loader2 className="h-6 w-6 animate-spin text-foreground/70" />
          )}
        </div>
        <h1 className="text-lg font-bold uppercase tracking-[0.16em] text-foreground">Free first video</h1>
        <p className="flex items-center gap-2 text-sm text-foreground/70">
          {session?.user?.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {message}
        </p>
      </div>
    </main>
  );
}
