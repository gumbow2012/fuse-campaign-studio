import { useEffect, type ReactNode } from "react";
import { Helmet } from "react-helmet-async";
import SiteShell from "@/components/mvp/SiteShell";
import { FEATURE_FLAGS } from "@/config/featureFlags";
import CroHero from "@/components/cro/CroHero";
import BeforeAfterProofPreview from "@/components/cro/BeforeAfterProofPreview";
import ProductFidelityMessage from "@/components/cro/ProductFidelityMessage";
import WhyFuseIsDifferent from "@/components/cro/WhyFuseIsDifferent";
import OfferBanner, { FreeSampleBlock } from "@/components/cro/OfferBanner";
import CampaignCardPreview from "@/components/cro/CampaignCardPreview";
import CampaignValueBox from "@/components/cro/CampaignValueBox";
import CampaignCtaButton from "@/components/cro/CampaignCtaButton";
import PricingPreview from "@/components/cro/PricingPreview";
import RiskReversalCopy from "@/components/cro/RiskReversalCopy";
import CheckoutLeadInPreview from "@/components/cro/CheckoutLeadInPreview";
import FirstRunGuidePreview from "@/components/cro/FirstRunGuidePreview";
import { PROPOSED_TEMPLATE_DESCRIPTIONS } from "@/content/templateDescriptions";

/** Internal comparison header used by every section on this preview only. */
function Section({
  index,
  title,
  current,
  proposed,
  children,
}: {
  index: number;
  title: string;
  current: string;
  proposed: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 border-t border-border/70 pt-8">
      <header className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {index}. {title}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <p className="rounded-[14px] border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Current issue: </span>
            {current}
          </p>
          <p className="rounded-[14px] border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Proposed fix: </span>
            {proposed}
          </p>
        </div>
      </header>
      <div>{children}</div>
    </section>
  );
}

export default function CroPreviewPage() {
  useEffect(() => {
    document.body.classList.add("campaign-flat");
    return () => document.body.classList.remove("campaign-flat");
  }, []);

  if (!FEATURE_FLAGS.croPreview) return null;

  return (
    <SiteShell>
      <Helmet>
        <title>CRO preview — internal</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="campaign-surface mx-auto w-full max-w-6xl px-4 pb-24 pt-4 sm:px-6">
        <div className="sticky top-0 z-30 -mx-4 mb-6 border-b border-border bg-background/95 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground backdrop-blur sm:-mx-6 sm:px-6">
          CRO preview — not public final
        </div>

        <div className="space-y-10">
          <Section
            index={1}
            title="Hero"
            current={`"Fuse your product into scroll-stopping campaigns."`}
            proposed="Outcome-first headline, one primary action, real proof beside it."
          >
            <CroHero internalLabels />
          </Section>

          <Section
            index={2}
            title="Before/after proof"
            current="No input-to-output evidence anywhere above the fold."
            proposed="Real uploaded product photo next to the generated frame from the same job."
          >
            <BeforeAfterProofPreview internalLabels />
          </Section>

          <Section
            index={3}
            title="Product-fidelity message"
            current={`"AI campaigns for your brand" — says nothing about the product staying right.`}
            proposed="Four approved lines about the real garment and its graphic."
          >
            <ProductFidelityMessage />
          </Section>

          <Section
            index={4}
            title="Why FUSE is different"
            current="No comparison against prompt-based tools."
            proposed="Side-by-side contrast between prompting and a campaign system."
          >
            <WhyFuseIsDifferent />
          </Section>

          <Section
            index={5}
            title="Offer system"
            current={`Multiple stacked offers: "250 welcome credits" and "Free first video".`}
            proposed="One offer — 20% off the first month — shown consistently in each placement."
          >
            <div className="space-y-8">
              <OfferBanner internalLabels />
              <div className="pt-16">
                <FreeSampleBlock internalLabels />
              </div>
            </div>
          </Section>

          <Section
            index={6}
            title="Campaign card copy"
            current={`"945 CR · 2/2 READY · UNLOCK ACCESS · by @kade".`}
            proposed="Campaign name, use case, real output counts, plan line, one clear action."
          >
            <CampaignCardPreview state="signed_out" />
          </Section>

          <Section
            index={7}
            title="Campaign value box + CTA states"
            current="Credits and readiness counters lead; the outcome is never stated."
            proposed="What you upload, what you get, plan capacity, credits behind an Advanced line."
          >
            <div className="space-y-6">
              <div className="grid gap-4 lg:grid-cols-2">
                <CampaignValueBox slug="group-meet" />
                <CampaignValueBox slug="grillzzzz" />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {(
                  [
                    ["signed_out", "Signed out"],
                    ["active", "Signed in, active plan"],
                    ["no_credits", "No credits"],
                  ] as const
                ).map(([state, label]) => (
                  <div key={state} className="space-y-2 rounded-[18px] border border-border/70 bg-card p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {label}
                    </p>
                    <CampaignCtaButton state={state} surface="campaign_page" templateSlug="group-meet" />
                  </div>
                ))}
              </div>
            </div>
          </Section>

          <Section
            index={8}
            title="Pricing preview"
            current="Plans are sold as credit bundles before any proof is shown."
            proposed="Proof, campaign contents, cost comparison, then plans framed as campaigns."
          >
            <PricingPreview internalLabels />
          </Section>

          <Section
            index={9}
            title="Risk reversal"
            current="No reassurance before checkout."
            proposed="Soft promise now; refund wording only with owner approval."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <RiskReversalCopy variant="soft" internalLabels />
              <RiskReversalCopy variant="refund" internalLabels />
            </div>
          </Section>

          <Section
            index={10}
            title="Checkout lead-in"
            current="Checkout starts with no summary of what is being bought."
            proposed="Price, capacity, security and the soft promise directly above the button."
          >
            <CheckoutLeadInPreview internalLabels />
          </Section>

          <Section
            index={11}
            title="Post-purchase first-run guide"
            current="New members land on a full studio with no first step."
            proposed="Three steps, the campaign they picked, and one action."
          >
            <FirstRunGuidePreview />
          </Section>

          <Section
            index={12}
            title="Template descriptions"
            current="Descriptions read like internal template names."
            proposed="One plain sentence per campaign, stating what the customer gets."
          >
            <div className="overflow-x-auto rounded-[18px] border border-border/70">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  <tr>
                    <th scope="col" className="p-3">Slug</th>
                    <th scope="col" className="p-3">Current</th>
                    <th scope="col" className="p-3">Proposed</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(PROPOSED_TEMPLATE_DESCRIPTIONS).map(([slug, proposed]) => (
                    <tr key={slug} className="border-t border-border/70">
                      <td className="p-3 align-top text-foreground">{slug}</td>
                      <td className="p-3 align-top text-muted-foreground">
                        Live catalog description (not changed in this pass)
                      </td>
                      <td className="p-3 align-top text-foreground">{proposed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            index={13}
            title="Tracking note"
            current="CTA clicks are not attributed to a surface."
            proposed="One event from the shared CTA component."
          >
            <div className="space-y-3 rounded-[18px] border border-border/70 bg-card p-5 text-sm text-muted-foreground">
              <p className="text-base text-foreground">
                <code>campaign_cta_click</code> is wired in <code>CampaignCtaButton</code> (preview
                only).
              </p>
              <ul className="space-y-1">
                <li>surface: home | pricing | campaign_page | template_card | mobile_bar</li>
                <li>signed_in: boolean</li>
                <li>template_slug: string</li>
                <li>cta_text: string</li>
              </ul>
              <p className="rounded-[14px] border border-dashed border-border bg-muted/30 p-3">
                Counter: not shown — no verified public metric yet.
              </p>
            </div>
          </Section>
        </div>
      </div>
    </SiteShell>
  );
}
