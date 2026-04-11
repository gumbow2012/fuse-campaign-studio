import { Link } from "react-router-dom";
import { ArrowRight, Check, Layers3, LockKeyhole, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import SiteShell from "@/components/mvp/SiteShell";

const pillars = [
  {
    title: "Authenticated by default",
    body: "Email/password auth, profile persistence, and a locked app surface are the only public gates in the MVP.",
    icon: LockKeyhole,
  },
  {
    title: "Template runner first",
    body: "The app now centers on picking a template, uploading source assets, and running the existing backend pipeline.",
    icon: Layers3,
  },
  {
    title: "Ops loop intact",
    body: "Contact flows, audit logging, and backend orchestration stay online while the presentation layer gets dramatically simpler.",
    icon: Sparkles,
  },
];

export default function HomePage() {
  const { user } = useAuth();

  return (
    <SiteShell>
      <section className="container grid gap-10 py-16 md:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className="space-y-6">
          <div className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-100">
            April MVP Cut
          </div>
          <div className="space-y-4">
            <h1 className="max-w-4xl font-display text-5xl font-bold leading-[0.92] tracking-[-0.05em] text-foreground md:text-7xl">
              Template-driven asset generation without the old surface noise.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
              FUSE now ships a lean public shell: auth, account control, contact intake, and one focused template runner wired to the existing backend.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="rounded-full bg-cyan-300 px-7 text-slate-950 hover:bg-cyan-200">
              <Link to={user ? "/app/templates" : "/auth?mode=signup"}>
                {user ? "Open Template Studio" : "Create Account"}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full border-white/15 bg-white/5 px-7 text-foreground hover:bg-white/10"
            >
              <Link to="/about">Read the product brief</Link>
            </Button>
          </div>

          <div className="grid gap-3 pt-4 sm:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Flow</p>
              <p className="mt-2 text-sm text-slate-200">Sign in, pick a template, upload inputs, run.</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Backend</p>
              <p className="mt-2 text-sm text-slate-200">Supabase auth/storage plus the existing execution pipeline.</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Ops</p>
              <p className="mt-2 text-sm text-slate-200">Public contact intake lands directly in your database.</p>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-slate-950/65 p-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="rounded-[1.5rem] border border-cyan-300/15 bg-[linear-gradient(180deg,rgba(20,24,33,0.95),rgba(8,11,17,0.92))] p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-100">MVP Surface</p>
                <h2 className="mt-2 font-display text-2xl font-bold tracking-[-0.03em] text-white">What remains live</h2>
              </div>
              <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-cyan-100">
                Lean
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {pillars.map(({ title, body, icon: Icon }) => (
                <div key={title} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 rounded-xl border border-cyan-300/20 bg-cyan-300/10 p-2 text-cyan-100">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">{title}</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-300">{body}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-white/8 bg-black/25 p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Current scope</p>
              <ul className="mt-3 space-y-3 text-sm text-slate-200">
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 text-cyan-200" />
                  Public home, about, contact, auth
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 text-cyan-200" />
                  Protected account settings
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 text-cyan-200" />
                  Minimal template runner and result viewer
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
