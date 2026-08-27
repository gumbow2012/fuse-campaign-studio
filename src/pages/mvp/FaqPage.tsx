import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "What is FUSE?",
    a: "FUSE is a campaign engine for streetwear and fashion brands. Instead of briefing a shoot, you pick a proven campaign template and FUSE generates the finished creative — images and video — using your brand, your products, and your cast.",
  },
  {
    q: "What is a template?",
    a: "A template is a pre-built creative workflow made by our team or a verified creator. It already contains the direction, lighting, framing, motion, and prompt engineering. You supply the brand inputs; the template does the rest, so every run comes out consistent.",
  },
  {
    q: "What do I need to upload?",
    a: "Usually a product image or two, and optionally your logo and a model or avatar. Each template tells you exactly which slots it needs before you start, with guidance on the ideal shot. Anything already saved in your Brand Workspace autofills.",
  },
  {
    q: "Do I need a model or a photographer?",
    a: "No. You can use a FUSE cast avatar, create your own avatar, or upload a real person you have rights to. Product-only campaigns are supported too.",
  },
  {
    q: "How long does a campaign take?",
    a: "Most image campaigns finish in a few minutes. Video steps take longer because each clip is rendered individually. You can leave the page — results are saved to your campaign library and you get notified when they land.",
  },
  {
    q: "How do credits work?",
    a: "Every generation costs credits, and the exact amount is shown before you confirm a run. Memberships include a monthly credit allowance, and you can top up at any time. Current amounts and prices always live on the Pricing page.",
  },
  {
    q: "What happens if a generation fails?",
    a: "You are not charged for work that does not produce a result. Failed steps are refunded automatically, and you can regenerate an individual output rather than re-running the whole campaign.",
  },
  {
    q: "Can I regenerate just one image?",
    a: "Yes. Any output can be regenerated on its own, and previous versions are kept so you can flip back through revisions and pick your favourite.",
  },
  {
    q: "Who owns the content FUSE creates?",
    a: "You do. Assets generated from your brand inputs are yours to use in your marketing, including paid media. You are responsible for holding the rights to whatever you upload — products, logos, and likenesses.",
  },
  {
    q: "Can I customise a template?",
    a: "Pro members can fork a template into a private version and adjust it in the workflow editor. Your private version stays private and never changes the public marketplace template.",
  },
  {
    q: "Can I sell my own templates?",
    a: "Yes — the Creator Program lets approved creators publish templates, build a public storefront, and earn a revenue share when brands run their work.",
  },
  {
    q: "How do I get help?",
    a: "Use the Contact page. Include your brand name and the campaign you were running and we can look at the exact run.",
  },
];

export default function FaqPage() {
  return (
    <SiteShell>
      <PageMeta
        title="FUSE FAQ — Templates, campaigns, credits and ownership"
        description="Answers about how FUSE campaign templates work, what you upload, how credits and memberships work, and who owns the creative you generate."
        path="/faq"
      />
      <section className="container py-14 md:py-20">
        <div className="max-w-2xl space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-200/80">Frequently asked</p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">Questions about FUSE</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            How templates work, what you need to bring, and what you get back.
          </p>
        </div>

        <div className="mt-10 max-w-3xl rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 md:px-6">
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((item, index) => (
              <AccordionItem key={item.q} value={`faq-${index}`} className="border-white/10">
                <AccordionTrigger className="text-left text-sm font-semibold text-foreground hover:text-cyan-100">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-6 text-muted-foreground">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
    </SiteShell>
  );
}
