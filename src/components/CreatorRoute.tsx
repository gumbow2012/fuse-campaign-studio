import { Link } from "react-router-dom";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AuthRetry, AuthSpinner } from "@/components/AuthGuardStates";
import { Button } from "@/components/ui/button";
import SiteShell from "@/components/mvp/SiteShell";

/** Gates the creator-facing Creator Studio to users holding the `creator` role. */
const CreatorRoute = ({ children }: { children: React.ReactNode }) => {
  const { authStatus, isCreator, isAdmin, refreshAccess } = useAuth();

  if (authStatus === "initializing_session" || authStatus === "loading_access") {
    return <AuthSpinner />;
  }

  if (authStatus === "access_load_failed") {
    return <AuthRetry onRetry={() => void refreshAccess()} />;
  }

  if (authStatus === "unauthorized") {
    return <Navigate to="/auth" replace />;
  }

  if (!isCreator && !isAdmin) {
    return (
      <SiteShell>
        <div className="mx-auto max-w-xl px-6 py-24 text-center">
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">Creator Program</p>
          <h1 className="mt-3 font-display text-3xl font-black text-foreground">
            Creator Studio is invite-only
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Creator Studio is where approved FUSE creators publish templates and track their work.
            Reach out and we'll walk you through joining the program.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild className="rounded-full bg-cyan-300 px-5 text-slate-950 hover:bg-cyan-200">
              <Link to="/contact">Join the program</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="rounded-full border-white/15 bg-white/5 px-5 text-foreground hover:bg-white/10"
            >
              <Link to="/app/templates">Browse templates</Link>
            </Button>
          </div>
        </div>
      </SiteShell>
    );
  }

  return <>{children}</>;
};

export default CreatorRoute;
