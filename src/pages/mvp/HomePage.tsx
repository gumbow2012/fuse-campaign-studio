import { Link } from "react-router-dom";
import { ArrowRight, Check, Layers3, LockKeyhole, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import SiteShell from "@/components/mvp/SiteShell";

const pillars = [
  {
    title: "Production workflows",
    body: "Reusable generation templates turn source assets into customer-ready campaign outputs without custom ops per run.",
    icon: LockKeyhole,
  },
  {
    title: "Fast execution loop",
    body: "Pick a workflow, upload the required inputs, and track the job until the final images or videos are ready.",
    icon: Layers3,
  },
  {
    title: "Operational visibility",
    body: "Account changes, billing events, inbound contact, and runner failures stay visible in Supabase instead of disappearing into the UI.",
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
            AI Campaign Production
          </div>
          <div className="space-y-4">
            <h1 className="max-w-4xl font-display text-5xl font-bold leading-[0.92] tracking-[-0.05em] text-foreground md:text-7xl">
              Turn product inputs into campaign assets without a messy workflow stack.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
              FUSE gives brands a clean path from upload to output: secure accounts, subscription-backed access, and template runs powered by the live execution pipeline.
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
              <Link to="/pricing">View memberships</Link>
            </Button>
          </div>

          <div className="grid gap-3 pt-4 sm:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Flow</p>
              <p className="mt-2 text-sm text-slate-200">Create an account, become a member, run templates, download deliverables.</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Backend</p>
              <p className="mt-2 text-sm text-slate-200">Supabase auth, storage, billing state, and execution jobs with live status tracking.</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Support</p>
              <p className="mt-2 text-sm text-slate-200">Customer messages land directly in the database and audit trail for follow-up.</p>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-slate-950/65 p-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="rounded-[1.5rem] border border-cyan-300/15 bg-[linear-gradient(180deg,rgba(20,24,33,0.95),rgba(8,11,17,0.92))] p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-cyan-100">What Fuse Handles</p>
                <h2 className="mt-2 font-display text-2xl font-bold tracking-[-0.03em] text-white">Built for actual customer use</h2>
              </div>
              <div className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-cyan-100">
                Live
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
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Customer path</p>
              <ul className="mt-3 space-y-3 text-sm text-slate-200">
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 text-cyan-200" />
                  Account creation, sign-in, recovery, and protected workspace access
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 text-cyan-200" />
                  Membership management with Stripe-backed checkout and portal flows
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 text-cyan-200" />
                  Template execution with job polling, outputs, and credit-based access control
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
