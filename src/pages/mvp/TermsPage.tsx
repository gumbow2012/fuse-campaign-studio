import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";

const SECTIONS: Array<{ title: string; body: string[] }> = [
  {
    title: "1. Agreement",
    body: [
      "These Terms of Service govern access to and use of the FUSE platform operated by [PLACEHOLDER — COMPANY LEGAL NAME] (\"we\", \"us\"). By creating an account or using the service you agree to these terms.",
      "Standard SaaS placeholder language. Final wording is pending legal review.",
    ],
  },
  {
    title: "2. Accounts",
    body: [
      "You must provide accurate account information and keep your credentials secure. You are responsible for activity that occurs under your account.",
      "Accounts are for the individual or organisation that registered them and may not be shared or resold without written permission.",
    ],
  },
  {
    title: "3. Subscriptions and credits",
    body: [
      "Access to generation features is provided through memberships and credit balances. Plan inclusions, credit amounts, and prices are described on the Pricing page and may change with notice.",
      "Credits are a prepaid usage unit, not currency, and have no cash value. Unless stated otherwise at purchase, credits are non-refundable and non-transferable.",
    ],
  },
  {
    title: "4. Acceptable use",
    body: [
      "You agree not to use the service to create unlawful, infringing, defamatory, hateful, or sexually explicit material, to impersonate a real person without their consent, or to attempt to bypass technical or usage limits.",
      "We may suspend access where use presents legal risk or degrades the platform for others.",
    ],
  },
  {
    title: "5. Your content and inputs",
    body: [
      "You retain ownership of the brand assets, product images, logos, and other material you upload. You confirm you hold the rights and permissions needed for those inputs, including any likeness rights.",
      "You grant us a limited licence to process your inputs for the purpose of operating the service and producing your requested outputs.",
    ],
  },
  {
    title: "6. Generated outputs",
    body: [
      "Subject to these terms and payment in good standing, outputs generated from your inputs are yours to use for your own commercial marketing.",
      "Generative systems can produce similar results for different users. We do not warrant that outputs are unique or that they are free of third-party rights.",
    ],
  },
  {
    title: "7. Templates and creator content",
    body: [
      "Templates, workflows, prompts, model configurations, and other platform materials remain the property of us or the relevant creator. You receive a right to run templates, not a right to their underlying implementation.",
      "Creator-published templates may carry additional terms presented at the point of use.",
    ],
  },
  {
    title: "8. Third-party services",
    body: [
      "The service relies on third-party infrastructure and model providers. Their availability, changes, or restrictions may affect features.",
    ],
  },
  {
    title: "9. Availability and changes",
    body: [
      "The service is provided on an \"as is\" and \"as available\" basis. We may add, modify, or remove features. No specific uptime or performance commitment is made in this draft.",
    ],
  },
  {
    title: "10. Termination",
    body: [
      "You may stop using the service at any time. We may suspend or terminate access for breach of these terms or where required by law. Sections intended to survive termination will continue to apply.",
    ],
  },
  {
    title: "11. Disclaimers and liability",
    body: [
      "To the maximum extent permitted by applicable law, we disclaim implied warranties and limit our aggregate liability. Specific limitation amounts are [PLACEHOLDER — TO BE SET ON LEGAL REVIEW].",
    ],
  },
  {
    title: "12. Governing law",
    body: [
      "These terms are governed by the laws of [PLACEHOLDER — JURISDICTION], and disputes will be handled as set out in [PLACEHOLDER — DISPUTE RESOLUTION CLAUSE].",
    ],
  },
  {
    title: "13. Contact",
    body: [
      "Notices may be sent to [PLACEHOLDER — COMPANY LEGAL NAME], [PLACEHOLDER — REGISTERED ADDRESS], or through the Contact page.",
    ],
  },
];

export default function TermsPage() {
  return (
    <SiteShell>
      <PageMeta
        title="Terms of Service — FUSE"
        description="Draft Terms of Service for the FUSE campaign platform, covering accounts, memberships and credits, acceptable use, content ownership and generated outputs."
        path="/terms"
      />
      <section className="container py-14 md:py-20">
        <div className="max-w-3xl space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-200/80">Legal</p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">Terms of Service</h1>
          <div className="rounded-xl border border-amber-300/25 bg-amber-300/[0.08] px-4 py-3 text-sm text-amber-100">
            Draft — pending legal review. This page uses standard SaaS placeholder language and is not yet a binding
            agreement.
          </div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Last updated: [PLACEHOLDER — EFFECTIVE DATE]
          </p>
        </div>

        <div className="mt-10 max-w-3xl space-y-8">
          {SECTIONS.map((section) => (
            <article key={section.title} className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-foreground">{section.title}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph} className="text-sm leading-6 text-muted-foreground">
                  {paragraph}
                </p>
              ))}
            </article>
          ))}
        </div>
      </section>
    </SiteShell>
  );
}
