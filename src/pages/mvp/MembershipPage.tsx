import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import CompactAccountBar from "@/components/mvp/membership/CompactAccountBar";
import TemplatePreviewCarousel from "@/components/mvp/membership/TemplatePreviewCarousel";
import FindYourPlan from "@/components/mvp/membership/FindYourPlan";
import MembershipFaq from "@/components/mvp/membership/MembershipFaq";
import PlanTierCards, { type BillingCycle } from "@/components/mvp/membership/PlanTierCards";
import CreditTopUpModule from "@/components/mvp/membership/CreditTopUpModule";
import CreditMixCalculator from "@/components/mvp/membership/CreditMixCalculator";
import CreditsOverviewCard from "@/components/mvp/membership/CreditsOverviewCard";
import EarnCreditsCard from "@/components/mvp/membership/EarnCreditsCard";
import CreditUsageHistory from "@/components/mvp/membership/CreditUsageHistory";
import UsageProjectionPanel from "@/components/mvp/membership/UsageProjectionPanel";
import PromoCodeEntry from "@/components/mvp/membership/PromoCodeEntry";


import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useMembershipCheckout } from "@/hooks/useMembershipCheckout";

// Structured as data so extra modes (e.g. "Model Access") can be appended later.
const TABS = [
  { id: "upgrade", label: "Upgrade Plan" },
  { id: "credits", label: "Buy Credits" },
  { id: "usage", label: "Usage & Benefits" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const isTabId = (value: string | null): value is TabId =>
  Boolean(value) && TABS.some((tab) => tab.id === value);

export default function MembershipPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin, profile } = useAuth();
  const { loading, startPlanCheckout, startCreditTopUp } = useMembershipCheckout();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [selectedCreditAmount, setSelectedCreditAmount] = useState<number | null>(null);

  const paramTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<TabId>(isTabId(paramTab) ? paramTab : "upgrade");

  useEffect(() => {
    if (isTabId(paramTab) && paramTab !== activeTab) setActiveTab(paramTab);
  }, [paramTab, activeTab]);

  const selectTab = (tab: TabId) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };

  const currentPlan = profile?.plan ?? "free";
  const hasActivePaidMembership = useMemo(
    () =>
      currentPlan !== "free" &&
      (profile?.subscription_status === "active" || profile?.subscription_status === "trialing"),
    [currentPlan, profile?.subscription_status],
  );

  const mixBudget = selectedCreditAmount ?? Number(profile?.credits_balance ?? 0);

  return (
    <SiteShell>
      <PageMeta
        title="Membership & Credits — FUSE"
        description="Manage your FUSE membership, top up credits, and review your credit usage."
        path="/membership"
      />
      <section className="container py-12 md:py-16">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-100">Membership</p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-[-0.04em] text-white sm:text-5xl">
          Never start a campaign from scratch again.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
          Pick a proven template. Add your brand. FUSE does the rest.
        </p>

        <div className="mt-6">
          <CompactAccountBar onManage={() => selectTab("upgrade")} />
        </div>

        {/* Sticky mode selector — full-width segmented control on mobile */}
        <div className="sticky top-16 z-30 -mx-2 mt-6 px-2 py-3 backdrop-blur-xl">
          <div className="grid w-full grid-cols-3 gap-1 rounded-2xl border border-white/10 bg-white/[0.03] p-1 sm:inline-grid sm:w-auto sm:grid-flow-col sm:auto-cols-max">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectTab(tab.id)}
                className={`rounded-xl px-2 py-2 text-center font-display text-[10px] font-bold uppercase leading-tight tracking-[0.1em] transition-colors duration-200 motion-reduce:transition-none sm:px-4 sm:text-xs sm:tracking-[0.14em] ${
                  activeTab === tab.id
                    ? "bg-cyan-300 text-slate-950"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}

          </div>
        </div>

        {activeTab === "upgrade" ? (
          <div className="mt-6 space-y-6">
            <PlanTierCards
              hero
              comparison
              billingCycle={billingCycle}
              onBillingCycleChange={setBillingCycle}
              loading={loading}
              isAdmin={isAdmin}
              currentPlan={currentPlan}
              subscriptionStatus={profile?.subscription_status}
              onCheckout={(tierKey) => {
                if (isAdmin) return;
                void startPlanCheckout(tierKey);
              }}
            />

            <TemplatePreviewCarousel />

            <FindYourPlan />

            <PromoCodeEntry />


            <MembershipFaq />
          </div>
        ) : null}

        {activeTab === "credits" ? (
          <div className="mt-6 space-y-6">
            {hasActivePaidMembership || isAdmin ? (
              <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 md:p-8">
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Top up credits</p>
                <h2 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-white">
                  One-time credit packs.
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                  Active members can buy one-time top-ups without changing their plan. Credits post automatically after
                  payment clears.
                </p>
                <div className="mt-6">
                  <CreditTopUpModule
                    loading={loading}
                    isAdmin={isAdmin}
                    onAmountChange={setSelectedCreditAmount}
                    onCheckout={(credits) => {
                      if (isAdmin) return;
                      void startCreditTopUp(credits, {
                        balanceBefore: Number(profile?.credits_balance ?? 0),
                      });
                    }}
                  />
                </div>

                <div className="mt-8">
                  <CreditMixCalculator
                    budget={mixBudget}
                    budgetSource={selectedCreditAmount ? "pack" : "balance"}
                  />
                </div>
              </section>
            ) : (
              <section className="rounded-[2rem] border border-amber-300/20 bg-amber-300/[0.06] p-6">
                <p className="text-[11px] uppercase tracking-[0.24em] text-amber-100">Membership first</p>
                <h2 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-white">
                  Choose a membership to start running templates.
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-amber-50/90">
                  One-time credit packs are only available after an active membership is set up, because credits alone
                  do not unlock the runner.
                </p>
                <Button
                  onClick={() => selectTab("upgrade")}
                  className="mt-5 rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                >
                  See plans
                </Button>
              </section>
            )}

            <EarnCreditsCard />
          </div>
        ) : null}

        {activeTab === "usage" ? (
          <div className="mt-6 space-y-6">
            <CreditsOverviewCard buyCreditsHref="/membership?tab=credits" />
            <EarnCreditsCard />
            <UsageProjectionPanel onNavigateTab={selectTab} />
            <CreditUsageHistory />

            <p className="text-xs text-slate-500">
              Need profile or password settings?{" "}
              <Link to="/account" className="text-cyan-300 hover:text-cyan-200">
                Go to account settings →
              </Link>
            </p>
          </div>
        ) : null}
      </section>
    </SiteShell>
  );
}
