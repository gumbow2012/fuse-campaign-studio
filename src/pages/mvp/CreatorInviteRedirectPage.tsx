import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import PageMeta from "@/components/mvp/PageMeta";
import fuseLogo from "@/assets/fuse-logo.png";

/**
 * Branded creator invite landing page.
 * Resolves /creator/invite/:token through the public resolver and forwards
 * to the real accept link. No raw URLs are ever rendered.
 */
const CreatorInviteRedirectPage = () => {
  const { token } = useParams<{ token: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      if (!token) {
        setError("This invite link is not valid.");
        return;
      }
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
          headers.apikey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        }
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-creator-invite`,
          { method: "POST", headers, body: JSON.stringify({ token }) },
        );
        const data = (await response.json().catch(() => ({}))) as { redirect?: string };
        if (cancelled) return;
        if (response.ok && data.redirect) {
          window.location.replace(data.redirect);
          return;
        }
        setError("This invite link has expired or was already used.");
      } catch {
        if (!cancelled) setError("We couldn't verify your invite. Please try again.");
      }
    };

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-6">
      <PageMeta
        title="Creator invite | FUSE"
        description="Verifying your FUSE Creator Program invite."
        path="/creator/invite"
      />
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto inline-block rounded-xl bg-white px-5 py-3">
          <img src={fuseLogo} alt="FUSE" className="h-8 w-auto" />
        </div>
        <div className="mx-auto mt-4 h-0.5 w-14 bg-cyan-300" />
        {error ? (
          <>
            <h1 className="mt-8 text-lg font-semibold text-white">Invite unavailable</h1>
            <p className="mt-2 text-sm text-white/60">{error}</p>
            <Link
              to="/creators"
              className="mt-6 inline-block rounded-full bg-cyan-300 px-6 py-3 text-sm font-semibold text-[#0a0a0a]"
            >
              Learn about the Creator Program
            </Link>
          </>
        ) : (
          <>
            <h1 className="mt-8 flex items-center justify-center gap-2 text-lg font-semibold text-white">
              <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
              Verifying your invite…
            </h1>
            <p className="mt-2 text-sm text-white/60">Hang tight, we're opening your Creator Access.</p>
          </>
        )}
      </div>
    </main>
  );
};

export default CreatorInviteRedirectPage;
