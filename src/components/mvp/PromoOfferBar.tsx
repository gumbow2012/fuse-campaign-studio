import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { track } from "@/lib/analytics/track";

/**
 * NEW CUSTOMER OFFER bar — mirrors the verified Starter welcome discount
 * (20% off the first month, applied server-side at checkout). No countdown, no
 * fabricated scarcity. Hidden for members on an active paid plan.
 */
export default function PromoOfferBar() {
  const { profile } = useAuth();
  const plan = (profile?.plan ?? "free").toLowerCase();
  const status = (profile?.subscription_status ?? "").toLowerCase();
  const isActivePaidMember = plan !== "free" && (status === "active" || status === "trialing");

  if (isActivePaidMember) return null;

  return (
    <Link
      to="/pricing"
      onClick={() => track("checkout_offer_view", { surface: "promo_bar" })}
      className="group flex w-full items-center justify-center gap-2 bg-[#c8f31d] px-4 py-2 text-center text-black transition-colors hover:bg-[#d4fa3a]"
    >
      <span className="font-sans text-[11.5px] font-bold uppercase tracking-[0.1em] sm:text-[12.5px]">
        ✦ New customer offer — 20% off your first month
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden />
    </Link>
  );
}
