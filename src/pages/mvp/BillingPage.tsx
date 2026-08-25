import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, Crown, Loader2, Rocket, Settings, ShieldCheck, Zap } from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { CREDIT_PACKS, STRIPE_TIERS } from "@/lib/stripe-config";
import {
  clearPendingCheckout,
  readPendingCheckout,
  rememberPendingCheckout,
  trackEvent,
  trackEventOnce,
} from "@/lib/metaPixel";

const tierCopy = {
  starter: {
    icon: Zap,
    description:
      "For brands getting started. Full template library. Standard processing. Everything you need to launch your first drops with real campaign visuals.",
    features: ["Full campaign template library", "Standard processing", "Commercial rights on every asset"],
  },
  pro: {
    icon: Rocket,
    description:
      "For brands that drop regularly. Priority processing. Faster turnaround. The full creative toolkit for brands running a real drop calendar.",
    features: ["Priority processing", "Faster turnaround on every vibe", "Full campaign template library"],
  },
  studio: {
    icon: Crown,
    description:
      "For teams and agencies. Fastest processing. Largest volume. Built for brands running multiple lines or managing client drops.",
    features: ["Fastest processing", "Largest monthly volume", "Built for multi-brand and client work"],
  },
} as const;


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

function formatBillingDate(value: string | null | undefined) {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function BillingPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin, user, profile, refreshSubscription } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);
  const [creditPackSmoke, setCreditPackSmoke] = useState<CreditPackSmokeResult | null>(null);
  const [checkoutEmail, setCheckoutEmail] = useState("");
  const [brandName, setBrandName] = useState("");

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
      const onceKey = `purchase.${pending?.startedAt ?? searchParams.toString()}`;
      trackEventOnce(onceKey, "Purchase", {
        value: pending?.value,
        currency: "USD",
        content_type: "product",
      });
      if (!pending || pending.mode === "subscription") {
        trackEventOnce(`subscribe.${pending?.startedAt ?? searchParams.toString()}`, "Subscribe", {
          value: pending?.value,
          currency: "USD",
        });
      }
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

    const tierForPixel = STRIPE_TIERS[tierKey];
    trackEvent("AddToCart", { value: tierForPixel.price, currency: "USD", content_name: tierForPixel.name });
    trackEvent("InitiateCheckout", { value: tierForPixel.price, currency: "USD", content_name: tierForPixel.name });
    // Stripe Checkout is hosted off-domain, so this is the closest observable proxy.
    trackEvent("AddPaymentInfo", { value: tierForPixel.price, currency: "USD", content_name: tierForPixel.name });
    rememberPendingCheckout({ mode: "subscription", value: tierForPixel.price, contentName: tierForPixel.name });

    setLoading(tierKey);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          planKey: tierKey,
          email: user ? undefined : normalizedEmail,
          brandName: brandName.trim() || undefined,
          templateId: selectedTemplateId || undefined,
          templateName: selectedTemplateName || undefined,
        },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("Stripe checkout URL not returned.");
      if (!user && typeof window !== "undefined") {
        window.localStorage.setItem("fuse.checkoutAccessEmail", normalizedEmail);
        if (selectedTemplateId) {
          window.localStorage.setItem("fuse.checkoutTemplate", selectedTemplateId);
        }
      }
      window.location.assign(data.url);
    } catch (error) {
      toast({
        title: "Checkout failed",
        description: error instanceof Error ? error.message : "Could not start Stripe checkout.",
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
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

  const handleCreditCheckout = async (packKey: keyof typeof CREDIT_PACKS) => {
    if (!user) {
      navigate("/auth?mode=signup");
      return;
    }
    if (isAdmin) return;

    const packForPixel = CREDIT_PACKS[packKey];
    trackEvent("AddToCart", { value: packForPixel.price, currency: "USD", content_name: `${packForPixel.name} credit pack` });
    trackEvent("InitiateCheckout", { value: packForPixel.price, currency: "USD", content_name: `${packForPixel.name} credit pack` });
    trackEvent("AddPaymentInfo", { value: packForPixel.price, currency: "USD", content_name: `${packForPixel.name} credit pack` });
    rememberPendingCheckout({ mode: "credits", value: packForPixel.price, contentName: `${packForPixel.name} credit pack` });

    setLoading(packKey);
    try {
      const { data, error } = await supabase.functions.invoke("create-credit-checkout", {
        body: { packKey },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("Stripe checkout URL not returned.");
      window.location.assign(data.url);
    } catch (error) {
      toast({
        title: "Credit checkout failed",
        description: error instanceof Error ? error.message : "Could not start credit checkout.",
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
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
  const creditValue = isAdmin ? "∞" : String(profile?.credits_balance ?? 0);
  const currentPlanLabel = isAdmin ? "admin" : currentPlan;
  const subscriptionLabel = isAdmin ? "bypass enabled" : profile?.subscription_status ?? "inactive";
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
              {isTemplateCheckout ? "Unlock this template." : "Campaign-Grade Creative. Fraction of the Cost."}
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
              {isTemplateCheckout
                ? "Tell us where to send your studio access, choose the plan that covers this campaign, and continue to payment."
                : "A single lookbook shoot runs $2,000–$5,000. A Fuse campaign takes 5 minutes."}
            </p>
          </div>
          {user ? (
            <Button
              variant="outline"
              onClick={() => void refreshSubscription()}
              className="rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10"
            >
              Refresh status
            </Button>
          ) : (
            <Button asChild className="rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200">
              <Link to="/app/templates">Browse templates</Link>
            </Button>
          )}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6">
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              {isTemplateCheckout ? "Order summary" : user ? "Current state" : "Get started"}
            </p>
            {isTemplateCheckout ? (
              <div className="mt-5 rounded-[1.5rem] border border-cyan-300/20 bg-cyan-300/[0.08] p-4">
                <p className="text-sm text-cyan-50">Template</p>
                <p className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-white">
                  {selectedTemplateName || "Selected template"}
                </p>
                <div className="mt-4 grid gap-3 text-sm text-slate-200 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    Output: {selectedTemplateOutputs ? `${selectedTemplateOutputs} vertical videos` : "Included with template"}
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    Required: {selectedTemplateCredits ? `${selectedTemplateCredits} credits` : "Plan credits"}
                  </div>
                </div>
              </div>
            ) : null}

            {!user ? (
              <div className="mt-5 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="checkout-email" className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Where should we send your studio access?
                  </Label>
                  <Input
                    id="checkout-email"
                    type="email"
                    value={checkoutEmail}
                    onChange={(event) => setCheckoutEmail(event.target.value)}
                    required
                    placeholder="you@brand.com"
                    className="h-12 rounded-2xl border-white/10 bg-white/[0.03] text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="brand-name" className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Brand name optional
                  </Label>
                  <Input
                    id="brand-name"
                    value={brandName}
                    onChange={(event) => setBrandName(event.target.value)}
                    placeholder="Brand"
                    className="h-12 rounded-2xl border-white/10 bg-white/[0.03] text-white"
                  />
                </div>
              </div>
            ) : null}

            {user ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <div className="rounded-[1.5rem] border border-white/8 bg-black/20 p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Plan</p>
                  <p className="mt-2 text-3xl font-semibold capitalize text-white">{currentPlanLabel}</p>
                </div>
                <div className="rounded-[1.5rem] border border-white/8 bg-black/20 p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Credits</p>
                  <p className="mt-2 text-3xl font-semibold text-white">{creditValue}</p>
                </div>
                <div className="rounded-[1.5rem] border border-white/8 bg-black/20 p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Subscription</p>
                  <p className="mt-2 text-xl font-semibold capitalize text-white">{subscriptionLabel}</p>
                </div>
                <div className="rounded-[1.5rem] border border-white/8 bg-black/20 p-4">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Period ends</p>
                  <p className="mt-2 text-xl font-semibold text-white">{formatBillingDate(profile?.subscription_period_end)}</p>
                </div>
              </div>
            ) : (
              <p className="mt-5 text-sm leading-6 text-slate-300">
                Pick a plan on the right to start generating drop campaigns. Full commercial rights, no watermarks.
              </p>
            )}


            {isAdmin ? (
              <div className="mt-6 rounded-[1.5rem] border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm leading-6 text-cyan-50">
                Admin accounts bypass membership and credit locks inside the runner. Use a normal user account when you want to test the real customer subscription flow.
              </div>
            ) : null}

            {isAdmin ? (
              <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
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
              </div>
            ) : null}

            {user && currentTier && !isAdmin ? (
              <Button
                onClick={() => void handlePortal()}
                disabled={loading === "portal"}
                variant="outline"
                className="mt-6 rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10"
              >
                <Settings className="h-4 w-4" />
                {loading === "portal" ? "Opening portal..." : "Manage subscription"}
              </Button>
            ) : null}
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            {(Object.keys(STRIPE_TIERS) as Array<keyof typeof STRIPE_TIERS>).map((tierKey) => {
              const tier = STRIPE_TIERS[tierKey];
              const tierMeta = tierCopy[tierKey];
              const Icon = tierMeta.icon;
              const isCurrent = currentPlan === tierKey;
              const tierCtaLabel =
                tierKey === "starter" ? "Start Creating" : tierKey === "pro" ? "Launch Your Drops" : "Contact Us";
              const ctaLabel = isAdmin
                ? "Admin access"
                  : isCurrent
                    ? "Current plan"
                    : loading === tierKey
                      ? "Loading..."
                    : tierCtaLabel;

              return (
                <article
                  key={tierKey}
                  className={`rounded-[2rem] border p-6 ${
                    isCurrent
                      ? "border-cyan-300/40 bg-cyan-300/10"
                      : "border-white/10 bg-slate-950/75"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-cyan-100" />
                    <p className="font-display text-xl font-semibold text-white">{tier.name}</p>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-300">{tierMeta.description}</p>
                  <p className="mt-5 text-4xl font-semibold text-white">
                    ${tier.price}
                    <span className="ml-1 text-sm font-normal text-slate-400">/mo</span>
                  </p>
                  <p className="mt-2 text-sm text-slate-300">{tier.monthlyCredits.toLocaleString()} credits each cycle</p>
                  <p className="mt-3 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.06] px-3 py-2 text-xs leading-5 text-cyan-50">
                    Have a discount code? Enter it in Stripe Checkout.
                  </p>

                  <ul className="mt-5 space-y-3 text-sm text-slate-200">
                    {tierMeta.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 text-cyan-200" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    onClick={() => void handleCheckout(tierKey)}
                    disabled={isAdmin || isCurrent || !!loading}
                    className={`mt-6 w-full rounded-full ${
                      isCurrent || isAdmin
                        ? "bg-white/10 text-white hover:bg-white/10"
                        : "bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                    }`}
                  >
                    {ctaLabel}
                    {!isCurrent && !isAdmin ? <ArrowRight className="h-4 w-4" /> : null}
                  </Button>
                </article>
              );
            })}
          </section>
        </div>

        {hasActivePaidMembership || isAdmin ? (
        <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.03] p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Credit packs</p>
              <h2 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-white">
                Top up without changing your plan.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                Active members can buy one-time top-ups. Credits post automatically after payment clears. Promo codes work here too.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {(Object.keys(CREDIT_PACKS) as Array<keyof typeof CREDIT_PACKS>).map((packKey) => {
              const pack = CREDIT_PACKS[packKey];
              return (
                <article key={packKey} className="rounded-[1.5rem] border border-white/10 bg-slate-950/75 p-5">
                  <p className="font-display text-xl font-semibold text-white">{pack.name}</p>
                  <p className="mt-3 text-4xl font-semibold text-white">
                    ${pack.price}
                    <span className="ml-1 text-sm font-normal text-slate-400">one-time</span>
                  </p>
                  <p className="mt-2 text-sm text-slate-300">{pack.credits} credits</p>
                  <Button
                    onClick={() => void handleCreditCheckout(packKey)}
                    disabled={isAdmin || !!loading}
                    className="mt-6 w-full rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                  >
                    {isAdmin ? "Admin access" : loading === packKey ? "Loading..." : "Buy credits"}
                    {!isAdmin ? <ArrowRight className="h-4 w-4" /> : null}
                  </Button>
                </article>
              );
            })}
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
