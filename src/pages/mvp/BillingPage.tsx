import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, Crown, Rocket, Settings, Zap } from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { CREDIT_PACKS, STRIPE_TIERS } from "@/lib/stripe-config";

const tierCopy = {
  starter: {
    icon: Zap,
    description: "For smaller brands running consistent drops.",
    features: ["500 monthly credits", "Template runner access", "Standard queue"],
  },
  pro: {
    icon: Rocket,
    description: "For brands shipping weekly campaigns.",
    features: ["2,000 monthly credits", "Priority queueing", "Faster iteration loops"],
  },
  studio: {
    icon: Crown,
    description: "For larger teams or agencies operating multiple brands.",
    features: ["6,000 monthly credits", "Largest monthly allotment", "Best fit for active ops"],
  },
} as const;

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

  useEffect(() => {
    const success = searchParams.get("success");
    const canceled = searchParams.get("canceled");
    if (!success && !canceled) return;

    if (success) {
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
    if (!user) {
      navigate("/auth?mode=signup");
      return;
    }
    if (isAdmin) return;

    setLoading(tierKey);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { planKey: tierKey },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("Stripe checkout URL not returned.");
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

  const currentPlan = profile?.plan ?? "free";
  const currentTier = currentPlan === "free" ? null : STRIPE_TIERS[currentPlan as keyof typeof STRIPE_TIERS];
  const creditValue = isAdmin ? "∞" : String(profile?.credits_balance ?? 0);
  const currentPlanLabel = isAdmin ? "admin" : currentPlan;
  const subscriptionLabel = isAdmin ? "bypass enabled" : profile?.subscription_status ?? "inactive";

  return (
    <SiteShell>
      <section className="container py-12 md:py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-100">Memberships</p>
            <h1 className="mt-4 font-display text-5xl font-bold tracking-[-0.05em] text-white">Membership controls, credits, and billing state.</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
              Stripe handles checkout and subscription management. Supabase stores the member state, credit balance, billing events, and entitlement gates used by the runner.
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
              <Link to="/auth?mode=signup">Create account</Link>
            </Button>
          )}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6">
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Current state</p>
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

            {isAdmin ? (
              <div className="mt-6 rounded-[1.5rem] border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm leading-6 text-cyan-50">
                Admin accounts bypass membership and credit locks inside the runner. Use a normal user account when you want to test the real customer subscription flow.
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
              const ctaLabel = isAdmin
                ? "Admin access"
                : isCurrent
                  ? "Current plan"
                  : loading === tierKey
                    ? "Loading..."
                    : `Choose ${tier.name}`;

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
                  <p className="mt-2 text-sm text-slate-300">{tier.monthlyCredits} credits each cycle</p>

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

        <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.03] p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Credit packs</p>
              <h2 className="mt-2 font-display text-3xl font-semibold tracking-[-0.04em] text-white">
                Top up without changing your plan.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                One-time Stripe checkout. Credits post automatically after payment clears.
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
      </section>
    </SiteShell>
  );
}
