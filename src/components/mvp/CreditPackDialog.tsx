import { useState, type ReactNode } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { CREDIT_PACKS, type CreditPackKey } from "@/lib/stripe-config";
import { rememberPendingCheckout, trackEvent } from "@/lib/metaPixel";

interface CreditPackDialogProps {
  trigger: ReactNode;
}

export default function CreditPackDialog({ trigger }: CreditPackDialogProps) {
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();
  const [loading, setLoading] = useState<CreditPackKey | null>(null);

  const handleCreditCheckout = async (packKey: CreditPackKey) => {
    if (!user) {
      navigate("/auth?mode=signup");
      return;
    }
    if (isAdmin) return;

    const pack = CREDIT_PACKS[packKey];
    const packParams = { value: pack.price, currency: "USD", content_name: `${pack.name} credit pack` };
    trackEvent("AddToCart", packParams);
    trackEvent("InitiateCheckout", packParams);
    // Proxy for card entry: Stripe Checkout is hosted on Stripe's domain.
    trackEvent("AddPaymentInfo", packParams);
    rememberPendingCheckout({ mode: "credits", value: pack.price, contentName: `${pack.name} credit pack` });

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

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="border-white/10 bg-slate-950 text-white sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl tracking-[-0.04em]">Get credits</DialogTitle>
          <DialogDescription>
            Quick buy one-time credit packs. Credits post automatically after payment clears. Promo codes can be entered in Stripe Checkout.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-3">
          {(Object.keys(CREDIT_PACKS) as CreditPackKey[]).map((packKey) => {
            const pack = CREDIT_PACKS[packKey];
            return (
              <article key={packKey} className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
                <p className="font-display text-xl font-semibold text-white">{pack.name}</p>
                <p className="mt-3 text-4xl font-semibold text-white">
                  ${pack.price}
                  <span className="ml-1 text-sm font-normal text-slate-400">one-time</span>
                </p>
                <p className="mt-2 text-sm text-slate-300">{pack.credits.toLocaleString()} credits</p>
                <Button
                  onClick={() => void handleCreditCheckout(packKey)}
                  disabled={isAdmin || !!loading}
                  className="mt-6 w-full rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
                >
                  {loading === packKey ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {isAdmin ? "Admin access" : loading === packKey ? "Loading..." : "Buy credits"}
                  {!isAdmin && loading !== packKey ? <ArrowRight className="h-4 w-4" /> : null}
                </Button>
              </article>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
