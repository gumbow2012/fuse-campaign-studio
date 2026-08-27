import { Link } from "react-router-dom";
import { ArrowRight, Mail, Star, UsersRound } from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

const panelClass =
  "rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm";

export default function CreatorProgramPage() {
  const { user, isCreator } = useAuth();
  const isCreatorUser = Boolean(user && isCreator);

  return (
    <SiteShell>
      <PageMeta
        title="FUSE Creator Program | FUSE"
        description="An invite-only program for selected creators to build campaign templates for all FUSE customers."
        path="/creators"
      />

      <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        <header className="text-center">
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">Invite-only</p>
          <h1 className="mt-3 font-display text-4xl font-black text-foreground sm:text-5xl md:text-6xl">
            FUSE Creator Program
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Selected creators build campaign templates that publish to every FUSE customer after admin review.
            No public application form yet — this is an invitation-driven launch.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {isCreatorUser ? (
              <Button
                asChild
                className="rounded-full bg-cyan-300 px-6 text-slate-950 hover:bg-cyan-200"
              >
                <Link to="/app/creator">
                  <Star className="h-4 w-4" />
                  Go to Creator Studio
                </Link>
              </Button>
            ) : (
              <Button
                asChild
                className="rounded-full bg-cyan-300 px-6 text-slate-950 hover:bg-cyan-200"
              >
                <Link to="/auth">
                  Have an invite? Sign in / sign up
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            )}
            <Button
              asChild
              variant="outline"
              className="rounded-full border-white/15 bg-white/5 px-6 text-foreground hover:bg-white/10"
            >
              <Link to="/creators/apply">
                <Mail className="h-4 w-4" />
                Request an invite
              </Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              className="rounded-full px-5 text-slate-300 hover:text-white"
            >
              <Link to="/creators/browse">
                Meet the creators
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </header>

        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div className={panelClass}>
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-cyan-200/20 bg-cyan-200/10 text-cyan-200">
              <UsersRound className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-display text-lg font-bold text-foreground">1. Get invited</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              FUSE ops sends an invite to your email. New signups with a matching invite are automatically granted the creator role.
            </p>
          </div>
          <div className={panelClass}>
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-cyan-200/20 bg-cyan-200/10 text-cyan-200">
              <Star className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-display text-lg font-bold text-foreground">2. Set up your profile</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Claim your handle, upload an avatar and banner, and pick your specialties. Your public creator page goes live when you are ready.
            </p>
          </div>
          <div className={panelClass}>
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-cyan-200/20 bg-cyan-200/10 text-cyan-200">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128A2.25 2.25 0 016.75 21H4.5a3 3 0 01-3-3.75V5.25A3 3 0 014.5 2h9a3 3 0 013 3v.75" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v12.75a2.25 2.25 0 01-2.25 2.25h-2.25" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.75a2.25 2.25 0 01-2.25 2.25h-2.25" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5a2.25 2.25 0 01-2.25 2.25h-2.25" />
              </svg>
            </div>
            <h3 className="mt-4 font-display text-lg font-bold text-foreground">3. Build templates</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Use the FUSE template builder to assemble drop kits, scenes, and campaign assets. Everything stays in your Creator Studio workspace.
            </p>
          </div>
          <div className={panelClass}>
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-cyan-200/20 bg-cyan-200/10 text-cyan-200">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.001 3.001 0 00-1.767 3.124c.127 1.068-.483 2.103-1.318 2.65a4.002 4.002 0 00-2.188 3.71 3.001 3.001 0 01-3.25 2.913 4.002 4.002 0 00-3.753 1.3 3.001 3.001 0 01-4.124 0 4.002 4.002 0 00-3.753-1.3 3.001 3.001 0 01-3.25-2.913 4.002 4.002 0 00-2.188-3.71c-.835-.547-1.445-1.582-1.318-2.65a3.001 3.001 0 00-1.767-3.124C.63 14.39 0 13.268 0 12s.63-2.39 1.593-3.068a3.001 3.001 0 001.767-3.124c-.127-1.068.483-2.103 1.318-2.65A4.002 4.002 0 006.68 1.447 3.001 3.001 0 019.932.534a4.002 4.002 0 003.753-1.3 3.001 3.001 0 014.124 0 4.002 4.002 0 003.753 1.3 3.001 3.001 0 013.252 2.913 4.002 4.002 0 002.188 3.71c.835.547 1.445 1.582 1.318 2.65a3.001 3.001 0 001.767 3.124C23.37 9.61 24 10.732 24 12z" />
              </svg>
            </div>
            <h3 className="mt-4 font-display text-lg font-bold text-foreground">4. Submit & go live</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Submit your template for review. Once approved, it is published to all FUSE customers with your authorship credit.
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className={panelClass}>
            <h2 className="font-display text-xl font-bold text-foreground">What you get</h2>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" />
                A public creator profile page at <code className="rounded bg-white/10 px-1 py-0.5 text-foreground">/creator/&lt;handle&gt;</code>.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" />
                The Creator Studio workspace to manage templates, drafts, and submissions.
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" />
                Authorship credit on every template you publish.
              </li>
            </ul>
          </div>

          <div className={panelClass}>
            <h2 className="font-display text-xl font-bold text-foreground">Coming soon</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Creator rewards, payouts, level progression, and analytics are on the roadmap but not live yet. We will not show placeholder earnings or credit numbers.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              If you want early access, the fastest path is an invite from the FUSE team.
            </p>
          </div>
        </div>

        <div className="mt-12 text-center">
          <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
            Questions?{" "}
            <Link to="/contact" className="text-cyan-200/80 underline underline-offset-4 hover:text-cyan-200">
              Contact the FUSE team
            </Link>
          </p>
        </div>
      </div>
    </SiteShell>
  );
}
