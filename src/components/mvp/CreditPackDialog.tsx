import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
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
import { rememberPendingCheckout, trackEvent } from "@/lib/metaPixel";
import { quoteCreditTopUp } from "@/lib/creditPricing";
import { getMetaMatchParams } from "@/lib/metaMatch";
import { getStoredUtm } from "@/lib/utmParams";
import CreditTopUpModule from "@/components/mvp/membership/CreditTopUpModule";
import { rememberPendingCreditTopUp } from "@/components/mvp/CreditTopUpSuccessWatcher";

interface CreditPackDialogProps {
  /** Optional when the dialog is controlled (e.g. opened from a popover that unmounts). */
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Shows the gated $10 / 200-credit entry tier as "coming soon" (display only). */
  showEntryTierPreview?: boolean;
}

export default function CreditPackDialog({
  trigger,
  open,
  onOpenChange,
  showEntryTierPreview = false,
}: CreditPackDialogProps) {
  const navigate = useNavigate();
  const { isAdmin, user, profile } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);

  const handleCreditCheckout = async (credits: number) => {
    if (!user) {
      navigate("/auth?mode=signup");
      return;
    }
    if (isAdmin) return;

    // Display-only mirror of the server quote (pixel value + pending record).
    const quote = quoteCreditTopUp(credits);
    const contentName = `${credits.toLocaleString()} FUSE credits`;
    const params = { value: quote.dollars, currency: "USD", content_name: contentName };
    trackEvent("AddToCart", params);
    trackEvent("InitiateCheckout", params);
    // Proxy for card entry: Stripe Checkout is hosted on Stripe's domain.
    trackEvent("AddPaymentInfo", params);
    rememberPendingCheckout({ mode: "credits", value: quote.dollars, contentName });
    rememberPendingCreditTopUp(credits, Number(profile?.credits_balance ?? 0));

    setLoading(String(credits));
    try {
      const match = getMetaMatchParams();
      const { data, error } = await supabase.functions.invoke("create-credit-checkout", {
        body: { credits, fbc: match.fbc, fbp: match.fbp, ...getStoredUtm() },
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="border-white/10 bg-slate-950 text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl tracking-[-0.04em]">Get credits</DialogTitle>
          <DialogDescription>
            Quick buy one-time credit packs. Credits post automatically after payment clears. Promo codes can be
            entered in Stripe Checkout.
          </DialogDescription>
        </DialogHeader>

        <CreditTopUpModule
          loading={loading}
          isAdmin={isAdmin}
          hidePlanNote
          showEntryTierPreview={showEntryTierPreview}
          onCheckout={(credits) => void handleCreditCheckout(credits)}
        />
      </DialogContent>
    </Dialog>
  );
}
