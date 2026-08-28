import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Settings, ShieldCheck } from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import CompactAccountBar from "@/components/mvp/membership/CompactAccountBar";
import PlanTierCards from "@/components/mvp/membership/PlanTierCards";
import CreditTopUpModule from "@/components/mvp/membership/CreditTopUpModule";
import PlanComparisonMatrix from "@/components/mvp/membership/PlanComparisonMatrix";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useMembershipCheckout } from "@/hooks/useMembershipCheckout";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics/track";
import { CREDIT_PACKS, STRIPE_TIERS } from "@/lib/stripe-config";
import {
  checkoutEventId,
  clearPendingCheckout,
  readPendingCheckout,
  trackEvent,
  trackEventOnce,
} from "@/lib/metaPixel";



type CreditPackSmokeResult = {
  ok?: boolean;
  request_id?: string;
  pack?: {
    name?: string;
    credits?: number;
  };
  profile?: {
    credits_balance?: number;
  };
  purchase?: {
    status?: string;
    ledger_id?: string | null;
  };
  first_webhook?: {
    status?: number;
  };
  duplicate_webhook?: {
    status?: number;
  };
  error?: string;
};


export default function BillingPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin, user, profile, refreshSubscription } = useAuth();
  const { loading, setLoading, startPlanCheckout, startCreditTopUp } = useMembershipCheckout();
  const [creditPackSmoke, setCreditPackSmoke] = useState<CreditPackSmokeResult | null>(null);
  const [checkoutEmail, setCheckoutEmail] = useState("");
  const [brandName, setBrandName] = useState("");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");

  const selectedTemplateId = searchParams.get("template") ?? "";
  const selectedTemplateName = searchParams.get("templateName") ?? selectedTemplateId;
  const selectedTemplateCredits = Number(searchParams.get("credits") ?? 0);
  const selectedTemplateOutputs = Number(searchParams.get("outputs") ?? 0);
  const isTemplateCheckout = Boolean(selectedTemplateId || selectedTemplateName);

  useEffect(() => {
    trackEvent("ViewContent", { content_name: "Pricing" });
  }, []);

  useEffect(() => {
    const success = searchParams.get("success");
    const canceled = searchParams.get("canceled");
    if (!success && !canceled) return;

    if (success) {
      const pending = readPendingCheckout();
      // Meta Purchase/Subscribe are reported server-side via CAPI (single source of truth).
      track("paid", { mode: pending?.mode ?? "subscription" });

      // P7 funnel — checkout returned successful (already guarded once per session).
      track("checkout_completed", { mode: pending?.mode ?? "subscription" });
      clearPendingCheckout();
      setLoading("refresh");
      void refreshSubscription()
        .then(() => {
          toast({
            title: "Membership updated",
            description: "Stripe returned successfully. Billing state has been refreshed.",
          });
        })
        .catch((error) => {
          toast({
            title: "Refresh failed",
            description: error instanceof Error ? error.message : "Could not refresh billing state.",
            variant: "destructive",
          });
        })
        .finally(() => {
          setLoading(null);
          setSearchParams({}, { replace: true });
        });
      return;
    }

    toast({
      title: "Checkout canceled",
      description: "No billing change was made.",
    });
    setSearchParams({}, { replace: true });
  }, [refreshSubscription, searchParams, setSearchParams]);

  const handleCheckout = async (tierKey: keyof typeof STRIPE_TIERS) => {
    const normalizedEmail = checkoutEmail.trim().toLowerCase();

    if (!user && !normalizedEmail) {
      toast({
        title: "Email required",
        description: "Enter where we should send your studio access.",
        variant: "destructive",
      });
      return;
    }
    if (isAdmin) return;

    track("plan_selected", { plan_key: String(tierKey) });
    track("checkout_start", { plan_key: String(tierKey), kind: "subscription" });

    await startPlanCheckout(tierKey, {
      email: user ? undefined : normalizedEmail,
      brandName: brandName.trim() || undefined,
      templateId: selectedTemplateId || undefined,
      templateName: selectedTemplateName || undefined,
      onRedirect: () => {
        if (!user && typeof window !== "undefined") {
          window.localStorage.setItem("fuse.checkoutAccessEmail", normalizedEmail);
          if (selectedTemplateId) {
            window.localStorage.setItem("fuse.checkoutTemplate", selectedTemplateId);
          }
        }
      },
    });
  };

  const handlePortal = async () => {
    setLoading("portal");
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) throw error;
      if (!data?.url) throw new Error("Stripe portal URL not returned.");
      window.location.assign(data.url);
    } catch (error) {
      toast({
        title: "Portal failed",
        description: error instanceof Error ? error.message : "Could not open the billing portal.",
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  const handleCreditCheckout = async (credits: number) => {
    if (!user) {
      navigate("/auth?mode=signup");
      return;
    }
    if (isAdmin) return;

    track("checkout_start", { kind: "credits", credits });
    await startCreditTopUp(credits, { balanceBefore: Number(profile?.credits_balance ?? 0) });
  };


  const handleCreditPackSmoke = async () => {
    if (!isAdmin) return;
    setLoading("credit-pack-smoke");
    setCreditPackSmoke(null);
    try {
      const { data, error } = await supabase.functions.invoke("admin-credit-pack-smoke", {
        body: {
          packKey: "boost",
          cleanup: true,
        },
      });
      if (error) throw error;
      const result = data as CreditPackSmokeResult | null;
      if (!result?.ok) throw new Error(result?.error ?? "Credit-pack smoke did not return ok.");
      setCreditPackSmoke(result);
      toast({
        title: "Credit-pack smoke passed",
        description: `Webhook credited ${result.profile?.credits_balance ?? result.pack?.credits ?? 0} test credits and stayed idempotent.`,
      });
    } catch (error) {
      toast({
        title: "Credit-pack smoke failed",
        description: error instanceof Error ? error.message : "Could not validate credit-pack billing.",
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  const currentPlan = profile?.plan ?? "free";
  const currentTier = currentPlan === "free" ? null : STRIPE_TIERS[currentPlan as keyof typeof STRIPE_TIERS];
  const hasActivePaidMembership =
    currentPlan !== "free" &&
    (profile?.subscription_status === "active" || profile?.subscription_status === "trialing");

  return (
    <SiteShell>
      <PageMeta
        title="FUSE Pricing — Streetwear Drop Campaigns Starting at $25/mo"
        description="Campaign-grade creative for streetwear drops starting at $25/mo. Lookbook imagery, social content, and video — in minutes. A fraction of what a photoshoot costs."
        path="/pricing"
      />
      <section className="container py-12 md:py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-100">
              {isTemplateCheckout ? "Checkout" : "Membership"}
            </p>
            <h1 className="mt-3 font-display text-2xl font-bold leading-tight text-white sm:text-4xl">
              {isTemplateCheckout ? "Unlock this template." : "Never start a campaign from scratch again."}
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
              {isTemplateCheckout
                ? "Tell us where to send your studio access, choose the plan that covers this campaign, and continue to payment."
                : "Pick a proven template. Add your brand. FUSE does the rest."}
            </p>
          </div>
          {user ? (
            <div className="flex flex-wrap items-center gap-3">
              <Link to="/membership" className="text-sm text-cyan-300 hover:text-cyan-200">
                Go to your Membership Center →
              </Link>
              <Button
                variant="outline"
                onClick={() => void refreshSubscription()}
                className="rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10"
              >
                Refresh status
              </Button>
            </div>

          ) : (
            <Button asChild className="rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200">
              <Link to="/app/templates">Browse templates</Link>
            </Button>
          )}
        </div>

        {/* Compact context strip — membership state, order summary, or guest intake. */}
        <div className="mt-8 space-y-4">
          {user ? (
            <CompactAccountBar onManage={() => void navigate("/membership")} />
          ) : null}

          {isTemplateCheckout ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.08] px-4 py-3 sm:flex-row sm:items-center sm:gap-x-4">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-100">Order summary</span>
              <span className="font-display text-sm font-bold text-white">
                {selectedTemplateName || "Selected template"}
              </span>
              <span className="hidden text-slate-500 sm:inline">·</span>
              <span className="text-sm text-slate-200">
                {selectedTemplateOutputs ? `${selectedTemplateOutputs} vertical videos` : "Included with template"}
              </span>
              <span className="hidden text-slate-500 sm:inline">·</span>
              <span className="text-sm text-slate-200">
                {selectedTemplateCredits ? `${selectedTemplateCredits} credits required` : "Plan credits"}
              </span>
            </div>
          ) : null}

          {!user ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-5 sm:px-6 sm:py-6">
              <h2 className="font-display text-lg font-bold uppercase tracking-[0.16em] text-white sm:text-xl">
                Start your membership
              </h2>
              <p className="mt-1.5 text-sm text-slate-400">Tell us where to send your FUSE access.</p>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-[1.6] space-y-2">
                  <label
                    htmlFor="checkout-email"
                    className="block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400"
                  >
                    Email address
                  </label>
                  <Input
                    id="checkout-email"
                    type="email"
                    value={checkoutEmail}
                    onChange={(event) => setCheckoutEmail(event.target.value)}
                    required
                    placeholder="you@brand.com"
                    className="h-[56px] w-full rounded-xl border-white/10 bg-slate-950/60 px-4 text-base text-white placeholder:text-slate-500 focus-visible:border-cyan-300/60 focus-visible:ring-2 focus-visible:ring-cyan-300/40"
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <label
                    htmlFor="checkout-brand"
                    className="block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500"
                  >
                    Brand name — optional
                  </label>
                  <Input
                    id="checkout-brand"
                    value={brandName}
                    onChange={(event) => setBrandName(event.target.value)}
                    placeholder="Brand name"
                    className="h-[56px] w-full rounded-xl border-white/10 bg-slate-950/60 px-4 text-base text-white placeholder:text-slate-500 focus-visible:border-cyan-300/60 focus-visible:ring-2 focus-visible:ring-cyan-300/40"
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-6">
          <PlanTierCards
            hero
            billingCycle={billingCycle}
            onBillingCycleChange={setBillingCycle}
            loading={loading}
            isAdmin={isAdmin}
            currentPlan={currentPlan}
            subscriptionStatus={profile?.subscription_status}
            onCheckout={(tierKey) => void handleCheckout(tierKey)}
          />
        </div>

        {isAdmin ? (
          <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.03] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Billing QA</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Runs a signed Stripe test webhook against a temporary user, confirms the credit ledger top-up, then cleans up.
                </p>
              </div>
              <Button
                type="button"
                onClick={() => void handleCreditPackSmoke()}
                disabled={loading === "credit-pack-smoke"}
                className="rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
              >
                {loading === "credit-pack-smoke" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Run credit smoke
              </Button>
            </div>
            {creditPackSmoke ? (
              <div className="mt-4 grid gap-2 text-xs text-slate-200 sm:grid-cols-4">
                <div className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2">
                  Webhook {creditPackSmoke.first_webhook?.status ?? "?"}
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2">
                  Duplicate {creditPackSmoke.duplicate_webhook?.status ?? "?"}
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2">
                  {creditPackSmoke.profile?.credits_balance ?? 0} credits
                </div>
                <div className="rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2">
                  {creditPackSmoke.purchase?.status ?? "unknown"}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {user && currentTier && !isAdmin ? (
          <div className="mt-6 flex justify-center">
            <Button
              onClick={() => void handlePortal()}
              disabled={loading === "portal"}
              variant="outline"
              className="rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10"
            >
              <Settings className="h-4 w-4" />
              {loading === "portal" ? "Opening portal..." : "Manage subscription"}
            </Button>
          </div>
        ) : null}

        <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 md:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Compare plans</p>
              <h2 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-white">
                Membership comparison.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                All memberships unlock the same tools and templates. The only difference is how many credits you get each month.
              </p>
            </div>
          </div>

          <div className="mt-6">
            <PlanComparisonMatrix plan={profile?.plan} subscriptionStatus={profile?.subscription_status} />
          </div>
        </section>


        {hasActivePaidMembership || isAdmin ? (
        <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 md:p-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Top up credits</p>
              <h2 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-white">
                One-time credit packs.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                Active members can buy one-time top-ups without changing their plan. Credits post automatically after payment clears.
              </p>
            </div>
          </div>

          <div className="mt-6">
            <CreditTopUpModule
              loading={loading}
              isAdmin={isAdmin}
              onCheckout={(credits) => void handleCreditCheckout(credits)}
            />
          </div>

        </section>
        ) : (
          <section className="mt-8 rounded-[2rem] border border-amber-300/20 bg-amber-300/[0.06] p-6">
            <p className="text-[11px] uppercase tracking-[0.24em] text-amber-100">Membership first</p>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-white">
              Choose a membership to start running templates.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-amber-50/90">
              One-time credit packs are only available after an active membership is set up, because credits alone do not unlock the runner.
            </p>
          </section>
        )}

        <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 md:p-8">
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Cost comparison</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-white">
            What a Traditional Campaign Costs
          </h2>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5">
              <p className="text-sm font-semibold text-white">Traditional shoot</p>
              <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-300">
                <li className="flex justify-between gap-4"><span>Photographer (day rate)</span><span className="text-white">$800–$2,500</span></li>
                <li className="flex justify-between gap-4"><span>Model</span><span className="text-white">$300–$1,000</span></li>
                <li className="flex justify-between gap-4"><span>Studio or location</span><span className="text-white">$200–$800</span></li>
                <li className="flex justify-between gap-4"><span>Retouching and editing</span><span className="text-white">$300–$700</span></li>
                <li className="flex justify-between gap-4 border-t border-white/10 pt-3 font-semibold text-white"><span>Total per campaign</span><span>$1,600–$5,000</span></li>
                <li className="flex justify-between gap-4"><span>Turnaround</span><span className="text-white">2–4 weeks</span></li>
              </ul>
            </div>
            <div className="rounded-[1.5rem] border border-cyan-300/25 bg-cyan-300/[0.08] p-5">
              <p className="text-sm font-semibold text-white">With Fuse</p>
              <ul className="mt-4 space-y-2 text-sm leading-6 text-cyan-50">
                <li className="flex justify-between gap-4"><span>Starting at</span><span className="font-semibold text-white">$25/mo</span></li>
                <li className="flex justify-between gap-4"><span>Lookbook imagery</span><span className="text-white">Included</span></li>
                <li className="flex justify-between gap-4"><span>Social content</span><span className="text-white">Included</span></li>
                <li className="flex justify-between gap-4"><span>Video clips</span><span className="text-white">Included</span></li>
                <li className="flex justify-between gap-4 border-t border-cyan-100/20 pt-3 font-semibold text-white"><span>Turnaround</span><span>About 5 minutes</span></li>
              </ul>
            </div>
          </div>
          <p className="mt-6 max-w-3xl text-sm leading-7 text-slate-300">
            One professional photoshoot with a photographer, studio rental, and model costs $2,000–$5,000 and takes 2–4 weeks to schedule. One Fuse campaign takes 5 minutes and is included in your plan.
          </p>
        </section>

        <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 md:p-8">
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">FAQ</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-white">
            Questions, answered.
          </h2>
          <dl className="mt-6 grid gap-4 md:grid-cols-2">
            {[
              {
                q: "Will the images actually look real?",
                a: "Yes — see examples in our gallery.",
                to: "/app/templates",
              },
              {
                q: "What does a credit get me?",
                a: "Credits are consumed per generation. Your plan's monthly credits cover a full run of campaign assets; heavier templates use more.",
              },
              {
                q: "Can I use these commercially?",
                a: "Yes — full commercial rights, no watermarks, no attribution required.",
              },
              {
                q: "How is this different from Midjourney or other AI tools?",
                a: "Those generate single images from prompts. Fuse generates complete drop campaigns from your product.",
              },
              {
                q: "What if I don't like the output?",
                a: "Regenerate with a different vibe. You're not locked in.",
              },
            ].map((item) => (
              <div key={item.q} className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5">
                <dt className="text-sm font-semibold text-white">{item.q}</dt>
                <dd className="mt-2 text-sm leading-6 text-slate-300">
                  {item.a}
                  {item.to ? (
                    <>
                      {" "}
                      <Link to={item.to} className="text-cyan-200 underline underline-offset-4">
                        Browse examples
                      </Link>
                    </>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </section>
    </SiteShell>
  );
}
