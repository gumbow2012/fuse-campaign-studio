import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2, Layers3, Rocket, Share2, Coins, ArrowRight } from "lucide-react";
import PageMeta from "@/components/mvp/PageMeta";
import fuseLogo from "@/assets/fuse-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics/track";

export const CREATOR_INVITE_PREFILL_KEY = "fuse.creatorInvitePrefill";

type InviteContext = {
  firstName?: string | null;
  instagramHandle?: string | null;
  displayName?: string | null;
  personalNote?: string | null;
};

type Resolved =
  | { status: "loading" }
  | { status: "valid"; invite: InviteContext; actionLink: string }
  | { status: "expired" | "revoked" }
  | { status: "accepted"; signedIn: boolean };

const BENEFITS = [
  { icon: Layers3, label: "CREATE", line: "Build reusable campaign templates" },
  { icon: Rocket, label: "PUBLISH", line: "Add them to your Creator profile" },
  { icon: Share2, label: "SHARE", line: "Get your own creator + template links" },
  { icon: Coins, label: "EARN", line: "Earn when eligible templates are run" },
];

/**
 * Branded creator invite welcome page (/creator/invite/:token).
 * Resolves the branded token server-side, renders VIP context before auth, and
 * hands off to the secure Supabase verify link on claim. No raw URLs rendered.
 */
const CreatorInviteRedirectPage = () => {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<Resolved>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      if (!token) {
        setState({ status: "expired" });
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
        const data = (await response.json().catch(() => ({}))) as {
          status?: string;
          invite?: InviteContext | null;
          actionLink?: string;
        };
        if (cancelled) return;

        if (data.status === "valid" && data.actionLink) {
          setState({ status: "valid", invite: data.invite ?? {}, actionLink: data.actionLink });
          track("creator_invite_landing_view", { invite_status: "valid" });
          return;
        }
        if (data.status === "accepted") {
          const { data: sessionData } = await supabase.auth.getSession();
          if (cancelled) return;
          setState({ status: "accepted", signedIn: Boolean(sessionData.session) });
          track("creator_invite_landing_view", { invite_status: "accepted" });
          return;
        }
        const status = data.status === "revoked" ? "revoked" : "expired";
        setState({ status });
        track("creator_invite_landing_view", { invite_status: status });
      } catch {
        if (!cancelled) setState({ status: "expired" });
      }
    };

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const claim = (invite: InviteContext, actionLink: string) => {
    try {
      window.localStorage.setItem(
        CREATOR_INVITE_PREFILL_KEY,
        JSON.stringify({
          firstName: invite.firstName ?? null,
          instagramHandle: invite.instagramHandle ?? null,
          displayName: invite.displayName ?? null,
        }),
      );
    } catch {
      /* non-blocking */
    }
    track("creator_invite_claim_started");
    window.location.assign(actionLink);
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] px-5 py-12 sm:px-6">
      <PageMeta
        title="FUSE Creator Access invite | FUSE"
        description="Claim your VIP FUSE Creator Access and turn your campaigns into one-click templates."
        path="/creator/invite"
      />
      <div className="mx-auto w-full max-w-md">
        <div className="text-center">
          <div className="inline-block rounded-xl bg-white px-5 py-3">
            <img src={fuseLogo} alt="FUSE" className="h-8 w-auto" />
          </div>
          <div className="mx-auto mt-4 h-0.5 w-14 bg-cyan-300" />
        </div>

        {state.status === "loading" && (
          <div className="mt-10 text-center">
            <h1 className="flex items-center justify-center gap-2 text-lg font-semibold text-white">
              <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
              Verifying your invite…
            </h1>
            <p className="mt-2 text-sm text-white/60">Hang tight, we're opening your Creator Access.</p>
          </div>
        )}

        {state.status === "valid" && (
          <div className="mt-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-300">
              FUSE Creator
            </p>
            <h1 className="mt-3 text-3xl font-bold uppercase leading-tight text-white">
              {state.invite.firstName
                ? `Welcome, ${state.invite.firstName}.`
                : "Welcome to FUSE Creator."}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-white/65">
              Your VIP Creator Access is ready. Turn your campaigns into one-click templates, publish
              them to FUSE, share your creator page, and earn when customers run your work.
            </p>

            {state.invite.instagramHandle && (
              <div className="mt-5 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">
                  Invited creator
                </span>
                <span className="text-sm font-semibold text-cyan-300">
                  @{state.invite.instagramHandle}
                </span>
              </div>
            )}

            {state.invite.personalNote && (
              <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">
                  Invited by FUSE
                </p>
                <p className="mt-2 text-sm italic leading-relaxed text-white/75">
                  “{state.invite.personalNote}”
                </p>
              </div>
            )}

            <ul className="mt-7 space-y-3">
              {BENEFITS.map(({ icon: Icon, label, line }) => (
                <li key={label} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-cyan-300/30 bg-cyan-300/10">
                    <Icon className="h-4 w-4 text-cyan-300" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-white">
                      {label}
                    </span>
                    <span className="block text-sm text-white/60">{line}</span>
                  </span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => claim(state.invite, state.actionLink)}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-cyan-300 px-6 py-4 text-sm font-bold uppercase tracking-wide text-[#0a0a0a] transition hover:bg-cyan-200"
            >
              Claim creator access
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {state.status === "expired" && (
          <div className="mt-10 text-center">
            <h1 className="text-xl font-bold uppercase text-white">This creator invite has expired</h1>
            <p className="mt-2 text-sm text-white/60">Contact the person who invited you.</p>
            <Link
              to="/creators"
              className="mt-6 inline-block rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white"
            >
              Learn about the Creator Program
            </Link>
          </div>
        )}

        {state.status === "revoked" && (
          <div className="mt-10 text-center">
            <h1 className="text-xl font-bold uppercase text-white">This invite is no longer active.</h1>
            <Link
              to="/creators"
              className="mt-6 inline-block rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white"
            >
              Learn about the Creator Program
            </Link>
          </div>
        )}

        {state.status === "accepted" && (
          <div className="mt-10 text-center">
            <h1 className="text-xl font-bold uppercase text-white">
              {state.signedIn ? "Creator access already active" : "Sign in to your creator account"}
            </h1>
            <Link
              to={state.signedIn ? "/app/creator" : "/auth"}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-cyan-300 px-6 py-3.5 text-sm font-bold uppercase tracking-wide text-[#0a0a0a]"
            >
              {state.signedIn ? "Open creator studio" : "Sign in"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </main>
  );
};

export default CreatorInviteRedirectPage;
