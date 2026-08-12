import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";

const sections = [
  {
    label: "What Fuse does",
    copy:
      "Fuse is an AI campaign engine built specifically for streetwear. Upload your product, pick a campaign vibe, and get a full set of drop-ready creative — lookbook shots, social content, and video — without hiring a photographer, renting a studio, or briefing an agency.",
  },
  {
    label: "How it works",
    copy:
      "Pick from campaign templates designed around streetwear aesthetics — night shoots, studio editorial, urban flash, golden hour. Upload your design. Fuse handles the lighting, environment, model, and styling. Download your assets and launch.",
  },
  {
    label: "Who it's for",
    copy:
      "Independent streetwear brands that drop regularly and need campaign-quality visuals without campaign-level budgets. Whether you're shipping your first drop or your fiftieth, Fuse gives you the creative to match the product.",
  },
];

export default function AboutPage() {
  return (
    <SiteShell>
      <PageMeta
        title="About FUSE — The Creative Engine Behind Streetwear Drops"
        description="Fuse is the AI campaign engine for streetwear, built by Madden Media. Upload your design. Get a full drop campaign in minutes."
        path="/about"
      />
      <section className="container py-16 md:py-24">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-100">About Fuse</p>
          <h1 className="mt-4 font-display text-5xl font-bold tracking-[-0.05em] text-white md:text-6xl">
            The Creative Engine Behind Streetwear Drops
          </h1>
          <p className="mt-6 text-lg leading-8 text-slate-300">
            Every streetwear brand has a drop date and a design. Fuse gives them the campaign to match — lookbook imagery, social content, and video, generated in minutes from AI trained on how streetwear actually looks.
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

        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          <article className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-6 md:p-8">
            <h2 className="font-display text-3xl font-semibold tracking-[-0.04em] text-white">The Agency Behind It</h2>
            <p className="mt-4 text-sm leading-7 text-slate-200">
              Fuse is built by Madden Media, a creative agency with over 40 years of experience in campaign strategy, visual storytelling, and brand building. Madden's work has driven measurable results across hundreds of brands in markets where visual identity drives commerce. Fuse brings that same level of campaign thinking to the streetwear economy — automated, instant, and accessible to every brand regardless of budget.
            </p>
          </article>

          <article className="rounded-[1.75rem] border border-cyan-300/20 bg-cyan-300/[0.08] p-6 md:p-8">
            <h2 className="font-display text-3xl font-semibold tracking-[-0.04em] text-white">The Vision</h2>
            <p className="mt-4 text-sm leading-7 text-cyan-50">
              We're starting with streetwear because it's the culture where campaign visuals matter most. But the problem we're solving — giving independent brands access to campaign-level creative — exists everywhere merch is sold. Band merchandise. Creator apparel. Craft brands. Gaming communities. Fuse is designed to expand into every corner of the merch economy.
            </p>
          </article>
        </div>
      </section>
    </SiteShell>
  );
}
