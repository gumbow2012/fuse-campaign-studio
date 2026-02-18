import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Check, Zap, Crown, Building2, Rocket, ArrowRight } from "lucide-react";
import { useState } from "react";

/* ─── Tier data ─── */
const tiers = [
  {
    name: "Starter",
    price: 49,
    badge: null,
    color: "from-muted to-muted",
    borderColor: "border-border/40",
    credits: 25,
    overage: "$2.75",
    icon: Zap,
    description: "For small brands testing the waters.",
    features: [
      "25 credits / month",
      "Access to basic drops",
      "Watermarked exports",
      "Standard render queue",
      "Email support",
    ],
    limitations: ["No team access", "No Vault storage", "No Brand Kits"],
    cta: "Start Building",
    popular: false,
  },
  {
    name: "Pro",
    price: 149,
    badge: "Most Popular",
    color: "from-primary/20 to-primary/5",
    borderColor: "border-primary/40",
    credits: 100,
    overage: "$2.25",
    icon: Rocket,
    description: "Your money maker. Full drop access, no limits.",
    features: [
      "100 credits / month",
      "Access to ALL drop packs",
      "No watermark",
      "Priority render queue",
      "Save to Vault",
      "Export sizes (IG, TikTok, Shopify)",
      "1-month credit rollover",
    ],
    limitations: [],
    cta: "Go Pro",
    popular: true,
  },
  {
    name: "Studio",
    price: 399,
    badge: null,
    color: "from-accent/15 to-accent/5",
    borderColor: "border-accent/30",
    credits: 300,
    overage: "$2.00",
    icon: Crown,
    description: "For agencies & serious brands at scale.",
    features: [
      "300 credits / month",
      "Team workspace",
      "Brand kit locking",
      "Campaign pack generation",
      "Faster render queue",
      "Early drop access",
      "Template remix & save recipes",
      "2-month credit rollover",
    ],
    limitations: [],
    cta: "Launch Studio",
    popular: false,
  },
  {
    name: "Enterprise",
    price: null,
    badge: null,
    color: "from-secondary to-secondary",
    borderColor: "border-border/30",
    credits: null,
    overage: "Volume",
    icon: Building2,
    description: "Custom compute. Custom drops. Your rules.",
    features: [
      "Dedicated compute",
      "Custom drops for your brand",
      "API access",
      "Volume credit pricing",
      "SSO & advanced security",
      "Custom onboarding",
      "SLA guarantee",
    ],
    limitations: [],
    cta: "Contact Sales",
    popular: false,
  },
];

const creditCosts = [
  { type: "Standard Drop", credits: 10, example: "Basic on-model, closeups" },
  { type: "Premium Drop", credits: 20, example: "Editorial, multi-angle" },
  { type: "Campaign Pack", credits: 30, example: "Full campaign system" },
  { type: "UGC Variation", credits: 8, example: "Phone-native content" },
  { type: "Lookbook Grid", credits: 15, example: "Multi-look editorial" },
  { type: "Store Assets", credits: 12, example: "Hero, banners, thumbnails" },
];

const creditPacks = [
  { credits: 25, price: 75, perCredit: "3.00" },
  { credits: 100, price: 275, perCredit: "2.75" },
  { credits: 300, price: 750, perCredit: "2.50" },
];

const Pricing = () => {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-16 relative overflow-hidden">
        {/* Background glow */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 30%, rgba(34,141,214,0.15) 0%, transparent 60%), linear-gradient(135deg, hsl(var(--background)) 0%, hsl(var(--secondary)) 100%)",
          }}
        />

        <div className="container mx-auto px-6 relative z-10 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-muted-foreground mb-4">
            Pricing
          </p>
          <h1 className="font-display text-4xl md:text-6xl font-black tracking-tight text-foreground mb-4">
            Pick Your Drop
            <br />
            <span className="gradient-text">Capacity.</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-lg mx-auto mb-8">
            Credits power every run. Choose the tier that matches your output.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center gap-1 p-1 rounded-full bg-secondary/60 border border-border/40 mb-12">
            <button
              onClick={() => setBillingCycle("monthly")}
              className={`px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                billingCycle === "monthly"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle("annual")}
              className={`px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                billingCycle === "annual"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Annual
              <span className="ml-1.5 text-[9px] text-primary font-bold">-20%</span>
            </button>
          </div>
        </div>
      </section>

      {/* Tiers */}
      <section className="pb-20 relative z-10">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            {tiers.map((tier) => {
              const Icon = tier.icon;
              const displayPrice = tier.price
                ? billingCycle === "annual"
                  ? Math.round(tier.price * 0.8)
                  : tier.price
                : null;

              return (
                <div
                  key={tier.name}
                  className={`relative rounded-xl border ${tier.borderColor} bg-gradient-to-b ${tier.color} p-6 flex flex-col ${
                    tier.popular ? "ring-1 ring-primary/50 shadow-lg shadow-primary/10" : ""
                  }`}
                >
                  {tier.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider">
                      {tier.badge}
                    </div>
                  )}

                  <div className="flex items-center gap-2 mb-3">
                    <Icon size={18} className="text-primary" />
                    <h3 className="font-display text-lg font-bold text-foreground">{tier.name}</h3>
                  </div>

                  <p className="text-sm text-muted-foreground mb-5 leading-relaxed">{tier.description}</p>

                  {/* Price */}
                  <div className="mb-5">
                    {displayPrice !== null ? (
                      <div className="flex items-baseline gap-1">
                        <span className="font-display text-4xl font-black text-foreground">${displayPrice}</span>
                        <span className="text-sm text-muted-foreground">/mo</span>
                      </div>
                    ) : (
                      <span className="font-display text-2xl font-black text-foreground">Custom</span>
                    )}
                    {tier.credits && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {tier.credits} credits included · Overage {tier.overage}/credit
                      </p>
                    )}
                  </div>

                  {/* CTA */}
                  <Button
                    className={`w-full mb-6 rounded-lg font-bold text-sm tracking-wide ${
                      tier.popular
                        ? "gradient-primary text-primary-foreground glow-blue-sm border-0"
                        : "bg-secondary text-foreground hover:bg-secondary/80 border border-border/40"
                    }`}
                  >
                    {tier.cta}
                    <ArrowRight size={14} className="ml-2" />
                  </Button>

                  {/* Features */}
                  <div className="flex-1 space-y-2.5">
                    {tier.features.map((feature) => (
                      <div key={feature} className="flex items-start gap-2.5">
                        <Check size={14} className="text-primary mt-0.5 shrink-0" />
                        <span className="text-sm text-foreground/80">{feature}</span>
                      </div>
                    ))}
                    {tier.limitations.map((limitation) => (
                      <div key={limitation} className="flex items-start gap-2.5 opacity-40">
                        <span className="w-3.5 h-3.5 mt-0.5 shrink-0 text-center text-xs text-muted-foreground">—</span>
                        <span className="text-sm text-muted-foreground">{limitation}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Credit Cost Table */}
      <section className="py-20 border-t border-border/30">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-muted-foreground mb-3">
              Credit System
            </p>
            <h2 className="font-display text-3xl md:text-4xl font-black text-foreground mb-3">
              How Credits Work
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Every template type has a credit cost. More complex outputs cost more credits.
            </p>
          </div>

          <div className="max-w-2xl mx-auto rounded-xl border border-border/40 overflow-hidden bg-card">
            <div className="grid grid-cols-3 gap-0 px-5 py-3 bg-secondary/40 border-b border-border/30">
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Run Type</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground text-center">Credits</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground text-right">Example</span>
            </div>
            {creditCosts.map((row, i) => (
              <div
                key={row.type}
                className={`grid grid-cols-3 gap-0 px-5 py-3.5 ${
                  i < creditCosts.length - 1 ? "border-b border-border/20" : ""
                }`}
              >
                <span className="text-sm font-semibold text-foreground">{row.type}</span>
                <span className="text-sm text-primary font-bold text-center">{row.credits} credits</span>
                <span className="text-xs text-muted-foreground text-right">{row.example}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* One-Time Credit Packs */}
      <section className="py-20 border-t border-border/30">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-muted-foreground mb-3">
              Need More?
            </p>
            <h2 className="font-display text-3xl md:text-4xl font-black text-foreground mb-3">
              One-Time Credit Packs
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Top up anytime. No subscription required.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-3xl mx-auto">
            {creditPacks.map((pack) => (
              <div
                key={pack.credits}
                className="rounded-xl border border-border/40 bg-card p-6 text-center hover:border-primary/30 transition-colors"
              >
                <p className="font-display text-3xl font-black text-foreground mb-1">{pack.credits}</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-4">
                  Credits
                </p>
                <p className="font-display text-2xl font-black text-foreground mb-1">${pack.price}</p>
                <p className="text-xs text-muted-foreground mb-5">${pack.perCredit} per credit</p>
                <Button
                  variant="outline"
                  className="w-full rounded-lg border-border/50 text-foreground hover:bg-secondary/60 text-sm font-medium"
                >
                  Buy Pack
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Credit mechanics */}
      <section className="py-16 border-t border-border/30">
        <div className="container mx-auto px-6">
          <div className="max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              { title: "Credits Expire", desc: "Unused credits expire after 90 days. Stay active, stay creative." },
              { title: "Rollover on Pro+", desc: "Pro and Studio plans roll over unused credits for 1–2 months." },
              { title: "Campaign Packs", desc: "Complex packs cost more credits but generate 6–12 assets in one run." },
              { title: "Early Access Drops", desc: "Limited drops may cost extra credits. First movers get first picks." },
            ].map((item) => (
              <div key={item.title} className="p-5 rounded-xl border border-border/30 bg-card/50">
                <h4 className="font-display text-sm font-bold text-foreground mb-1.5">{item.title}</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-20 border-t border-border/30 text-center">
        <div className="container mx-auto px-6">
          <h2 className="font-display text-3xl md:text-4xl font-black text-foreground mb-4">
            Ready to Run Your First Drop?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Start with Starter. Upgrade when you're hooked.
          </p>
          <Button className="h-12 px-10 rounded-lg gradient-primary text-primary-foreground font-bold text-sm tracking-wide glow-blue border-0">
            Get Started Free
            <ArrowRight size={16} className="ml-2" />
          </Button>
        </div>
      </section>
    </div>
  );
};

export default Pricing;
