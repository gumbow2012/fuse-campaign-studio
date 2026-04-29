import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Check, ArrowRight, Rocket, Crown, Zap } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { STRIPE_TIERS } from "@/lib/stripe-config";

const tierCopy = {
  starter: {
    icon: Zap,
    description: "For smaller brands running consistent drops.",
    features: ["Included monthly credits", "Access to the full template runner", "Standard processing queue"],
  },
  pro: {
    icon: Rocket,
    description: "For brands shipping weekly campaigns.",
    features: ["Higher included credit volume", "Faster generation queue", "Priority support"],
  },
  studio: {
    icon: Crown,
    description: "For teams and agencies running multiple brands.",
    features: ["Largest included credit bundle", "Multi-project workflow", "Admin-friendly template QA surface"],
  },
} as const;

const Pricing = () => {
  const [loading, setLoading] = useState<string | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleTierCta = async (tierName: keyof typeof STRIPE_TIERS) => {
    if (!user) {
      navigate("/auth");
      return;
    }

    const tier = STRIPE_TIERS[tierName];
    setLoading(tier.name);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { planKey: tierName },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <section className="pt-32 pb-16 relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 30%, rgba(34,141,214,0.15) 0%, transparent 60%), linear-gradient(135deg, hsl(var(--background)) 0%, hsl(var(--secondary)) 100%)",
          }}
        />

        <div className="container mx-auto px-6 relative z-10 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-muted-foreground mb-4">
            Subscriptions Only
          </p>
          <h1 className="font-display text-4xl md:text-6xl font-black tracking-tight text-foreground mb-4">
            Pick Your Monthly
            <br />
            <span className="gradient-text">Credit Tier.</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
            The MVP uses subscription billing only. Each tier includes recurring credits for template generation. No top-ups, no metering.
          </p>
          <Button
            className="h-12 px-8 rounded-lg gradient-primary text-primary-foreground font-bold text-sm tracking-wide glow-blue border-0"
            onClick={() => navigate(user ? "/billing" : "/auth")}
          >
            {user ? "Go to Billing" : "Create Account"}
            <ArrowRight size={16} className="ml-2" />
          </Button>
        </div>
      </section>

      <section className="pb-20 relative z-10">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {(Object.keys(STRIPE_TIERS) as Array<keyof typeof STRIPE_TIERS>).map((tierKey) => {
              const tier = STRIPE_TIERS[tierKey];
              const copy = tierCopy[tierKey];
              const Icon = copy.icon;

              return (
                <div
                  key={tier.name}
                  className={`relative rounded-xl border ${tierKey === "pro" ? "border-primary/40 ring-1 ring-primary/40" : "border-border/40"} bg-card p-6 flex flex-col`}
                >
                  {tierKey === "pro" && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider">
                      Most Popular
                    </div>
                  )}

                  <div className="flex items-center gap-2 mb-3">
                    <Icon size={18} className="text-primary" />
                    <h3 className="font-display text-lg font-bold text-foreground">{tier.name}</h3>
                  </div>

                  <p className="text-sm text-muted-foreground mb-5 leading-relaxed">{copy.description}</p>

                  <div className="mb-5">
                    <div className="flex items-baseline gap-1">
                      <span className="font-display text-4xl font-black text-foreground">${tier.price}</span>
                      <span className="text-sm text-muted-foreground">/mo</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {tier.monthlyCredits} credits included each month
                    </p>
                  </div>

                  <Button
                    onClick={() => handleTierCta(tierKey)}
                    disabled={loading === tier.name}
                    className="w-full mb-6 rounded-lg font-bold text-sm tracking-wide gradient-primary text-primary-foreground glow-blue-sm border-0"
                  >
                    {loading === tier.name ? "Loading..." : `Subscribe to ${tier.name}`}
                    <ArrowRight size={14} className="ml-2" />
                  </Button>

                  <div className="flex-1 space-y-2.5">
                    {copy.features.map((feature) => (
                      <div key={feature} className="flex items-start gap-2.5">
                        <Check size={14} className="text-primary mt-0.5 shrink-0" />
                        <span className="text-sm text-foreground/80">{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-16 border-t border-border/30">
        <div className="container mx-auto px-6">
          <div className="max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              { title: "Subscriptions Only", desc: "The MVP ships with recurring tier billing. No one-time credit packs in MVP." },
              { title: "Ledger First", desc: "Every run deducts credits through the ledger pipeline so balances stay auditable." },
              { title: "Admin QA", desc: "TemplateLab remains the internal tool for auditing and tuning the 13 templates." },
              { title: "Future Builder Ready", desc: "The template schema stays generic enough to support a real builder later." },
            ].map((item) => (
              <div key={item.title} className="p-5 rounded-xl border border-border/30 bg-card/50">
                <h4 className="font-display text-sm font-bold text-foreground mb-1.5">{item.title}</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Pricing;
