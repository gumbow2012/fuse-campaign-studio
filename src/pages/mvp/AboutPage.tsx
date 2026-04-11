import SiteShell from "@/components/mvp/SiteShell";

const sections = [
  {
    label: "Why this reset",
    copy:
      "The old surface was trying to be a marketing site, creator platform, analytics deck, and internal tool at the same time. The MVP cuts that down to the pieces that actually move work: account access, template execution, and direct ops contact.",
  },
  {
    label: "What the product is",
    copy:
      "FUSE is a template runner for campaign asset generation. You choose a template, upload the required source assets, and the backend pipeline handles orchestration, outputs, and auditability.",
  },
  {
    label: "What happens next",
    copy:
      "The stripped shell gives you a stable base for growth. New templates, richer account controls, billing, and admin tooling can evolve behind this cleaner boundary instead of forcing public users through an overbuilt front door.",
  },
];

export default function AboutPage() {
  return (
    <SiteShell>
      <section className="container py-16 md:py-24">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-100">About Fuse</p>
          <h1 className="mt-4 font-display text-5xl font-bold tracking-[-0.05em] text-white md:text-6xl">
            A deliberately smaller surface for a better product loop.
          </h1>
          <p className="mt-6 text-lg leading-8 text-slate-300">
            This version of Fuse is intentionally stripped down. The product story is straightforward now: authenticate, run templates, manage your account, and keep the ops loop tight.
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
