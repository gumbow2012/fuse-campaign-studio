import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { STRIPE_TIERS } from "@/lib/stripe-config";
import { toast } from "@/hooks/use-toast";
import { useState } from "react";
import { Zap, Check, ArrowRight, Settings } from "lucide-react";

const Billing = () => {
  const { profile, refreshSubscription } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);

  const handleCheckout = async (priceId: string, tierName: string) => {
    setLoading(tierName);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const handlePortal = async () => {
    setLoading("portal");
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const currentPlan = profile?.plan ?? "free";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16 container mx-auto px-6 max-w-4xl">
        <h1 className="font-display text-3xl font-black text-foreground mb-1">Billing</h1>
        <p className="text-muted-foreground text-sm mb-8">Manage your subscription and credits.</p>

        {/* Current Plan */}
        <div className="rounded-xl border border-border/40 bg-card p-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-1">Current Plan</p>
              <p className="font-display text-2xl font-black text-foreground capitalize">{currentPlan}</p>
              <div className="flex items-center gap-2 mt-2">
                <Zap size={14} className="text-primary" />
                <span className="text-sm text-foreground">{profile?.credits_balance ?? 0} credits remaining</span>
              </div>
            </div>
            {currentPlan !== "free" && (
              <Button onClick={handlePortal} disabled={loading === "portal"} variant="outline" className="border-border/50 text-foreground bg-secondary hover:bg-secondary/80">
                <Settings size={14} className="mr-2" /> Manage Subscription
              </Button>
            )}
          </div>
        </div>

        {/* Refresh */}
        <div className="mb-8 text-right">
          <button onClick={refreshSubscription} className="text-xs text-primary hover:text-primary/80 transition-colors">
            Refresh subscription status ↻
          </button>
        </div>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {Object.entries(STRIPE_TIERS).map(([key, tier]) => {
            const isCurrentPlan = currentPlan === key;
            return (
              <div key={key} className={`rounded-xl border ${isCurrentPlan ? "border-primary/50 ring-1 ring-primary/30" : "border-border/40"} bg-card p-6`}>
                {isCurrentPlan && (
                  <span className="inline-block mb-3 text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-primary/20 text-primary">
                    Your Plan
                  </span>
                )}
                <h3 className="font-display text-lg font-bold text-foreground mb-1">{tier.name}</h3>
                <p className="font-display text-3xl font-black text-foreground mb-1">${tier.price}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                <p className="text-xs text-muted-foreground mb-4">{tier.monthlyCredits} credits/month</p>
                
                <Button
                  onClick={() => handleCheckout(tier.price_id, key)}
                  disabled={isCurrentPlan || !!loading}
                  className={`w-full ${isCurrentPlan ? "bg-secondary text-muted-foreground" : "gradient-primary text-primary-foreground border-0 glow-blue-sm"} font-bold`}
                >
                  {isCurrentPlan ? "Current" : loading === key ? "Loading..." : "Subscribe"}
                  {!isCurrentPlan && <ArrowRight size={14} className="ml-2" />}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Billing;
