import SiteShell from "@/components/mvp/SiteShell";

const sections = [
  {
    label: "What Fuse is",
    copy:
      "Fuse is a customer-facing template execution product for fashion and brand teams that need repeatable campaign asset generation without rebuilding the workflow every time.",
  },
  {
    label: "How it works",
    copy:
      "Members pick a workflow, upload the required inputs, start a run, and watch the execution job resolve into final deliverables. Stripe controls membership. Supabase tracks state, assets, logs, and billing.",
  },
  {
    label: "Why teams use it",
    copy:
      "The point is consistency. When a workflow is good, it should be reusable, fast to rerun, and visible when it fails so the team can trust it in production.",
  },
];

export default function AboutPage() {
  return (
    <SiteShell>
      <section className="container py-16 md:py-24">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-100">About Fuse</p>
          <h1 className="mt-4 font-display text-5xl font-bold tracking-[-0.05em] text-white md:text-6xl">
            Template-led campaign production for brands that need speed and control.
          </h1>
          <p className="mt-6 text-lg leading-8 text-slate-300">
            Fuse is designed to keep the customer path obvious: sign up, manage membership, run workflows, and get outputs without bouncing through internal-only product clutter.
          </p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {sections.map((section) => (
            <article key={section.label} className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">{section.label}</p>
              <p className="mt-4 text-sm leading-7 text-slate-200">{section.copy}</p>
            </article>
          ))}
        </div>
      </section>
    </SiteShell>
  );
}
