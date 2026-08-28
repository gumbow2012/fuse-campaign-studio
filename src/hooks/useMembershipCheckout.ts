import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { CREDIT_PACKS, STRIPE_TIERS } from "@/lib/stripe-config";
import { quoteCreditTopUp } from "@/lib/creditPricing";
import { rememberPendingCheckout, trackEvent } from "@/lib/metaPixel";
import { rememberPendingCreditTopUp } from "@/components/mvp/CreditTopUpSuccessWatcher";
import { track } from "@/lib/analytics/track";

type PlanCheckoutOptions = {
  email?: string;
  brandName?: string;
  templateId?: string;
  templateName?: string;
  /** Internal path to land on after a successful checkout. Never /auth. */
  returnPath?: string;
  onRedirect?: () => void;
};

/**
 * Shared membership checkout behaviour (unchanged from the pricing page implementation).
 * Prices, credit values, edge functions and pixel events are reused verbatim.
 */
export function useMembershipCheckout() {
  const [loading, setLoading] = useState<string | null>(null);

  const startPlanCheckout = async (
    tierKey: keyof typeof STRIPE_TIERS,
    options: PlanCheckoutOptions = {},
  ) => {
    const tierForPixel = STRIPE_TIERS[tierKey];
    trackEvent("AddToCart", { value: tierForPixel.price, currency: "USD", content_name: tierForPixel.name });
    trackEvent("InitiateCheckout", { value: tierForPixel.price, currency: "USD", content_name: tierForPixel.name });
    // Stripe Checkout is hosted off-domain, so this is the closest observable proxy.
    trackEvent("AddPaymentInfo", { value: tierForPixel.price, currency: "USD", content_name: tierForPixel.name });
    rememberPendingCheckout({ mode: "subscription", value: tierForPixel.price, contentName: tierForPixel.name });
    track("checkout_started", { plan_key: String(tierKey), kind: "subscription" });

    setLoading(tierKey);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          planKey: tierKey,
          email: options.email,
          brandName: options.brandName,
          templateId: options.templateId,
          templateName: options.templateName,
          returnPath: options.returnPath,
        },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("Stripe checkout URL not returned.");
      options.onRedirect?.();
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

  const startCreditCheckout = async (packKey: keyof typeof CREDIT_PACKS) => {
    const packForPixel = CREDIT_PACKS[packKey];
    trackEvent("AddToCart", { value: packForPixel.price, currency: "USD", content_name: `${packForPixel.name} credit pack` });
    trackEvent("InitiateCheckout", { value: packForPixel.price, currency: "USD", content_name: `${packForPixel.name} credit pack` });
    trackEvent("AddPaymentInfo", { value: packForPixel.price, currency: "USD", content_name: `${packForPixel.name} credit pack` });
    rememberPendingCheckout({ mode: "credits", value: packForPixel.price, contentName: `${packForPixel.name} credit pack` });
    track("checkout_started", { kind: "credits", pack_key: String(packKey) });

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

  /**
   * Credit top-up checkout. The client sends ONLY the credits integer — the
   * server computes and owns the price.
   */
  const startCreditTopUp = async (credits: number, options: { balanceBefore?: number } = {}) => {
    const quote = quoteCreditTopUp(credits);
    const contentName = `${credits.toLocaleString()} FUSE credits`;
    const params = { value: quote.dollars, currency: "USD", content_name: contentName };
    trackEvent("AddToCart", params);
    trackEvent("InitiateCheckout", params);
    trackEvent("AddPaymentInfo", params);
    rememberPendingCheckout({ mode: "credits", value: quote.dollars, contentName });
    rememberPendingCreditTopUp(credits, options.balanceBefore ?? 0);
    track("checkout_started", { kind: "credits", credits });

    setLoading(String(credits));
    try {
      const { data, error } = await supabase.functions.invoke("create-credit-checkout", {
        body: { credits },
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

  return { loading, setLoading, startPlanCheckout, startCreditCheckout, startCreditTopUp };
}
