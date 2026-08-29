import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";

const SECTIONS: Array<{ title: string; body: string[] }> = [
  {
    title: "1. Who we are",
    body: [
      "This Privacy Policy explains how [PLACEHOLDER — COMPANY LEGAL NAME], of [PLACEHOLDER — REGISTERED ADDRESS], handles personal data in connection with the FUSE platform.",
      "Standard SaaS placeholder language. Final wording is pending legal review.",
    ],
  },
  {
    title: "2. Data we collect",
    body: [
      "Account data: name, email address, password credentials handled by our authentication provider, and account settings.",
      "Brand and creative inputs: logos, product images, reference images, avatars, prompts, and other material you upload or generate.",
      "Usage data: pages viewed, features used, campaign runs, credit transactions, and error diagnostics.",
      "Billing data: subscription status and payment records. Card details are handled by our payment processor and are not stored by us.",
      "Device and technical data: IP address, browser and device type, and approximate location derived from IP.",
    ],
  },
  {
    title: "3. How we use data",
    body: [
      "To provide and operate the service, run generations, maintain your campaign library, and support your account.",
      "To handle memberships, credits, and invoicing.",
      "To monitor reliability, prevent abuse and fraud, and improve product quality.",
      "To send service, security, and — where permitted — marketing communications.",
    ],
  },
  {
    title: "4. Cookies and analytics",
    body: [
      "We use cookies and similar technologies to keep you signed in, remember preferences, and measure product and marketing performance.",
      "We use analytics and advertising measurement tools that may set cookies or receive event data, including page views and conversion events. Where required, marketing identifiers are hashed before transmission.",
      "You can control cookies through your browser settings; disabling some cookies may break sign-in or other features.",
    ],
  },
  {
    title: "5. Third-party processors",
    body: [
      "We rely on service providers acting on our instructions, in generic categories: cloud hosting and storage, database and authentication, content delivery, generative model providers, email delivery, payment processing, analytics and advertising measurement, and customer support tooling.",
      "Providers receive only the data needed for their function and are bound by contractual confidentiality and security obligations. A current list is available on request.",
    ],
  },
  {
    title: "6. Legal basis and retention",
    body: [
      "Where applicable law requires a legal basis, we rely on contract performance, legitimate interests, consent (for optional cookies and marketing), and legal obligations.",
      "We keep personal data for as long as your account is active, plus the period needed for legal, accounting, and dispute-resolution purposes. Retention periods are [PLACEHOLDER — RETENTION SCHEDULE].",
    ],
  },
  {
    title: "7. International transfers",
    body: [
      "Data may be processed in countries other than yours. Where required, transfers rely on approved safeguards such as standard contractual clauses. Details: [PLACEHOLDER — TRANSFER MECHANISM].",
    ],
  },
  {
    title: "8. Security",
    body: [
      "We use access controls, encryption in transit, row-level authorisation on stored records, and audit logging. No system is perfectly secure, and you are responsible for keeping your credentials safe.",
    ],
  },
  {
    title: "9. Your rights and data requests",
    body: [
      "Subject to applicable law, you may request access to your data, correction, deletion, a portable copy, restriction of processing, or objection to certain processing, and you may withdraw consent where consent applies.",
      "To make a request, use the Contact page or write to [PLACEHOLDER — PRIVACY CONTACT EMAIL]. We may need to verify your identity. You may also complain to your local supervisory authority: [PLACEHOLDER — SUPERVISORY AUTHORITY].",
    ],
  },
  {
    title: "10. Children",
    body: ["The service is not intended for people under [PLACEHOLDER — MINIMUM AGE], and we do not knowingly collect their data."],
  },
  {
    title: "11. Changes",
    body: ["We may update this policy. Material changes will be signposted in the product or by email before they take effect."],
  },
];

export default function PrivacyPage() {
  return (
    <SiteShell>
      <PageMeta
        title="Privacy Policy — FUSE"
        description="Draft FUSE Privacy Policy covering the data we collect, cookies and analytics, third-party processors, retention, security and how to make a data request."
        path="/privacy"
      />
      <section className="container py-14 md:py-20">
        <div className="max-w-3xl space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-200/80">Legal</p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">Privacy Policy</h1>
          <div className="rounded-xl border border-amber-300/25 bg-amber-300/[0.08] px-4 py-3 text-sm text-amber-100">
            Draft — pending legal review. This page uses standard placeholder language and does not yet make binding
            commitments.
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
