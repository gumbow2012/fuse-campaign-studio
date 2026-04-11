import { Link } from "react-router-dom";
import SiteShell from "@/components/mvp/SiteShell";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <SiteShell>
      <section className="container flex min-h-[calc(100vh-90px)] items-center justify-center py-12">
        <div className="max-w-2xl rounded-[2rem] border border-white/10 bg-slate-950/75 p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-100">404</p>
          <h1 className="mt-4 font-display text-5xl font-bold tracking-[-0.05em] text-white">This route is not part of the MVP shell.</h1>
          <p className="mt-4 text-base leading-7 text-slate-300">
            The public surface was cut down aggressively. Start from home or jump directly into the authenticated template studio.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild className="rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200">
              <Link to="/">Go home</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10"
            >
              <Link to="/auth">Sign in</Link>
            </Button>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
