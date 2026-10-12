import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { CREDIT_PACKS } from "@/lib/stripe-config";
import { useMembershipCheckout } from "@/hooks/useMembershipCheckout";

type PackKey = keyof typeof CREDIT_PACKS;
const PACK_ORDER: PackKey[] = ["boost", "growth", "bulk"];

export default function CreditPacksPage() {
  const navigate = useNavigate();
  const { user, profile, isAdmin } = useAuth();
  const { loading, startCreditCheckout } = useMembershipCheckout();

  const buy = (key: PackKey) => {
    if (!user) {
      navigate("/auth?mode=signin");
      return;
    }
    void startCreditCheckout(key);
  };

  return (
    <SiteShell>
      <PageMeta
        title="Credit packs — FUSE"
        description="Top up your FUSE account with one-time Boost, Growth or Bulk credit packs."
        path="/credits"
      />
      <section className="container py-14 md:py-20">
        <div className="max-w-3xl space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-200/80">Credits</p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">Credit packs</h1>
          <p className="text-muted-foreground">
            One-time packs for members who need more credits this month. Credits are added automatically after payment.
          </p>
          {user && profile ? (
            <p className="text-sm text-muted-foreground">
              Your balance: <span className="font-semibold text-foreground">{Number(profile.credits_balance ?? 0).toLocaleString()} credits</span>
            </p>
          ) : null}
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {PACK_ORDER.map((key) => {
            const pack = CREDIT_PACKS[key];
            const busy = loading === key;
            return (
              <div key={key} className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <h2 className="font-heading text-xl font-semibold">{pack.name}</h2>
                <p className="mt-4 font-heading text-4xl font-semibold tracking-tight">${pack.price}</p>
                <p className="mt-1 text-sm text-muted-foreground">{pack.credits.toLocaleString()} credits</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  ${(pack.price / pack.credits).toFixed(3)} per credit
                </p>
                <Button
                  className="mt-6"
                  disabled={busy || isAdmin || loading !== null}
                  onClick={() => buy(key)}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {user ? `Buy ${pack.name}` : "Sign in to buy"}
                </Button>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          Credit packs need an active membership. New to FUSE?{" "}
          <Link to="/pricing" className="text-foreground underline underline-offset-4">See memberships</Link>.
        </p>
      </section>
    </SiteShell>
  );
}
