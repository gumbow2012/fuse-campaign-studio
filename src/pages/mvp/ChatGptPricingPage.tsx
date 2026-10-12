import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { CREDIT_PACKS, STRIPE_TIERS } from "@/lib/stripe-config";
import { useMembershipCheckout } from "@/hooks/useMembershipCheckout";

type TierKey = keyof typeof STRIPE_TIERS;
type PackKey = keyof typeof CREDIT_PACKS;
const TIERS: TierKey[] = ["starter", "pro", "studio"];
const PACKS: PackKey[] = ["boost", "growth", "bulk"];

/** Standalone pricing page ChatGPT links buyers to: plans + credit packs, each opening the existing checkout. */
export default function ChatGptPricingPage() {
  const navigate = useNavigate();
  const { user, profile, isAdmin } = useAuth();
  const { loading, startPlanCheckout, startCreditCheckout } = useMembershipCheckout();
  const busy = loading !== null || isAdmin;

  const buyPack = (key: PackKey) => {
    if (!user) {
      navigate("/auth?mode=signin");
      return;
    }
    void startCreditCheckout(key);
  };

  return (
    <SiteShell>
      <PageMeta
        title="FUSE pricing for ChatGPT"
        description="FUSE plans and credit packs with prices. Buy securely and use your credits in ChatGPT."
        path="/chatgpt/pricing"
      />
      <section className="container py-14 md:py-20">
        <div className="max-w-3xl space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-200/80">FUSE for ChatGPT</p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">Plans and credits</h1>
          <p className="text-muted-foreground">
            Your FUSE credits work on the site and in ChatGPT. Pick a plan, or top up with a credit pack.
          </p>
          {user && profile ? (
            <p className="text-sm text-muted-foreground">
              Your balance:{" "}
              <span className="font-semibold text-foreground">
                {Number(profile.credits_balance ?? 0).toLocaleString()} credits
              </span>
            </p>
          ) : null}
        </div>

        <h2 className="mt-12 font-heading text-xl font-semibold">Plans</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {TIERS.map((key) => {
            const tier = STRIPE_TIERS[key];
            return (
              <div key={key} className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <h3 className="font-heading text-xl font-semibold">{tier.name}</h3>
                <p className="mt-4 font-heading text-4xl font-semibold tracking-tight">
                  ${tier.price}
                  <span className="text-base font-normal text-muted-foreground">/mo</span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{tier.monthlyCredits.toLocaleString()} credits a month</p>
                {key === "starter" ? (
                  <p className="mt-1 text-xs text-cyan-200/80">20% off your first month</p>
                ) : null}
                <Button
                  className="mt-6"
                  disabled={busy}
                  onClick={() => void startPlanCheckout(key, { email: user?.email ?? undefined, returnPath: "/account" })}
                >
                  {loading === key ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Choose {tier.name}
                </Button>
              </div>
            );
          })}
        </div>

        <h2 className="mt-12 font-heading text-xl font-semibold">Credit packs</h2>
        <p className="mt-1 text-sm text-muted-foreground">One-time top-ups for members. Credits are added automatically after payment.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {PACKS.map((key) => {
            const pack = CREDIT_PACKS[key];
            return (
              <div key={key} className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <h3 className="font-heading text-xl font-semibold">{pack.name}</h3>
                <p className="mt-4 font-heading text-4xl font-semibold tracking-tight">${pack.price}</p>
                <p className="mt-1 text-sm text-muted-foreground">{pack.credits.toLocaleString()} credits</p>
                <Button className="mt-6" variant="outline" disabled={busy} onClick={() => buyPack(key)}>
                  {loading === key ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {user ? `Buy ${pack.name}` : "Sign in to buy"}
                </Button>
              </div>
            );
          })}
        </div>
      </section>
    </SiteShell>
  );
}
