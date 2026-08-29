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
      className="group flex h-[42px] w-full items-center justify-center gap-2 border-b border-cyan-500/60 bg-cyan-300 px-4 text-center text-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.45)] transition-[filter] hover:brightness-105 motion-reduce:transition-none sm:h-[46px]"
    >
      <span className="font-sans text-[11.5px] font-bold uppercase tracking-[0.14em] sm:text-[12.5px]">
        New customer offer — 20% off your first month
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden />
    </Link>
  );
}

