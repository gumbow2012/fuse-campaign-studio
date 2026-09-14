import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShieldCheck } from "lucide-react";

type ConsentDetails = {
  authorization_id: string;
  redirect_uri: string;
  client: { id: string; name: string; uri?: string; logo_uri?: string };
  scope?: string;
};

const PERMISSIONS = [
  "Search FUSE campaign templates",
  "Upload product photos and assets you provide",
  "Prepare and start campaign runs you approve (uses your credits only after you confirm)",
  "See and download your FUSE outputs",
  "Edit and export your campaigns",
];

const panelClass =
  "mx-auto w-full max-w-xl rounded-[2rem] border border-white/10 bg-slate-950/75 p-7 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl";

export default function OAuthConsentPage() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id");
  const [details, setDetails] = useState<ConsentDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<"allow" | "deny" | null>(null);

  const load = useCallback(async () => {
    if (!authorizationId) {
      setError("This link is missing its authorization id.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        const target = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
        window.location.assign(`/auth?mode=signin&returnTo=${encodeURIComponent(target)}`);
        return;
      }

      const { data, error: detailsError } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
      if (detailsError) throw detailsError;

      if (!data || !("authorization_id" in data)) {
        const redirectUrl = (data as { redirect_url?: string } | null)?.redirect_url;
        if (redirectUrl) {
          window.location.assign(redirectUrl);
          return;
        }
        throw new Error("This authorization request is no longer valid.");
      }

      setDetails(data as ConsentDetails);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this authorization request.");
    } finally {
      setLoading(false);
    }
  }, [authorizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (choice: "allow" | "deny") => {
    if (!authorizationId) return;
    setDeciding(choice);
    setError(null);

    try {
      const { data, error: decisionError } =
        choice === "allow"
          ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
          : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });

      if (decisionError) throw decisionError;
      if (!data?.redirect_url) throw new Error("No redirect was returned for this request.");
      window.location.assign(data.redirect_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete this request.");
      setDeciding(null);
    }
  };

  const scopes = (details?.scope ?? "").split(" ").filter(Boolean);
  const clientName = details?.client?.name ?? "this app";

  return (
    <SiteShell>
      <PageMeta
        title="Authorize access — FUSE"
        description="Review and approve access to your FUSE account."
        path="/oauth/consent"
        noindex
      />
      <section className="container py-16 md:py-24">
        <div className={panelClass}>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              Loading this request…
            </div>
          ) : !details ? (
            <div>
              <h1 className="font-display text-2xl font-bold tracking-[-0.03em] text-white">Authorization unavailable</h1>
              <p className="mt-3 text-sm text-destructive">{error ?? "This authorization request is not available."}</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 text-cyan-200">
                <ShieldCheck size={16} aria-hidden="true" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em]">Authorize access</p>
              </div>

              <h1 className="mt-4 font-display text-3xl font-bold tracking-[-0.04em] text-white">
                Connect {clientName} to FUSE
              </h1>

              <p className="mt-5 text-sm text-foreground/90">This lets {clientName}:</p>
              <ul className="mt-3 space-y-2 text-sm text-foreground/85">
                {PERMISSIONS.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span aria-hidden="true" className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <p className="mt-4 text-xs text-muted-foreground">
                It cannot manage billing, change your subscription, or see payment details.
              </p>

              {scopes.length ? (
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {scopes.map((scope) => (
                    <span
                      key={scope}
                      className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 font-mono text-[10px] text-cyan-200"
                    >
                      {scope}
                    </span>
                  ))}
                </div>
              ) : null}

              <p className="mt-5 break-all text-xs text-muted-foreground">Redirects to {details.redirect_uri}</p>

              {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

              <div className="mt-7 flex flex-wrap gap-3">
                <Button
                  onClick={() => void decide("allow")}
                  disabled={deciding !== null}
                  className="rounded-full bg-cyan-300 font-sans text-xs font-bold uppercase tracking-[0.1em] text-slate-950 hover:bg-cyan-200"
                >
                  {deciding === "allow" ? "Allowing…" : "Allow"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void decide("deny")}
                  disabled={deciding !== null}
                  className="rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10"
                >
                  {deciding === "deny" ? "Denying…" : "Deny"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>
    </SiteShell>
  );
}
