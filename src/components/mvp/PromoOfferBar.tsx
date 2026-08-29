import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import { track } from "@/lib/analytics/track";

/** Flip to true only when the backing offer is live. */
const PROMO_ACTIVE = false;

export default function PromoOfferBar() {
  if (!PROMO_ACTIVE) return null;

  return (
    <Link
      to="/auth?mode=signup"
      onClick={() => track("promo_offer_click")}
      className="group flex h-[56px] w-full items-center justify-center gap-2 bg-[#c8f31d] px-4 text-center text-black transition-colors hover:bg-[#d4fa3a] sm:h-[50px]"
    >
      <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
      <span className="font-sans text-[12px] font-semibold uppercase tracking-[0.12em] sm:text-[13px]">
        Sign up &amp; unlock 20% off your first 3 months
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1" aria-hidden />
    </Link>
  );
}
