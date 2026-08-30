import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { track } from "@/lib/analytics/track";

/**
 * Promo bar — mirrors the verified Starter welcome discount (20% off the first
 * month, applied server-side at checkout). No countdown, no fabricated
 * scarcity. Hidden for members on an active paid plan.
 */

/** Copy variants, kept as constants for later A/B testing. */
export const PROMO_COPY = {
  /** Production variant. */
  a: {
    desktopLead: "Get",
    desktopEmphasis: "20% off",
    desktopTail: "your first month — start creating",
    mobileEmphasis: "20% off",
    mobileTail: "your first month",
  },
  /** Alternate variant (not live). */
  b: {
    desktopLead: "Your first month is",
    desktopEmphasis: "20% off",
    desktopTail: "— explore campaigns",
    mobileEmphasis: "20% off",
    mobileTail: "your first month",
  },
} as const;

const ACTIVE_VARIANT: keyof typeof PROMO_COPY = "a";

export default function PromoOfferBar() {
  const { profile } = useAuth();
  const plan = (profile?.plan ?? "free").toLowerCase();
  const status = (profile?.subscription_status ?? "").toLowerCase();
  const isActivePaidMember = plan !== "free" && (status === "active" || status === "trialing");

  if (isActivePaidMember) return null;

  const copy = PROMO_COPY[ACTIVE_VARIANT];

  return (
    <Link
      to="/pricing"
      onClick={() => track("checkout_offer_view", { surface: "promo_bar" })}
      className="group relative flex h-[40px] w-full items-center justify-center overflow-hidden border-b border-white/25 px-4 text-center sm:h-[44px]"
      style={{
        backgroundImage:
          "linear-gradient(100deg, #8b9199 0%, #c9ced4 16%, #f4f6f8 32%, #d5dae0 46%, #6f757d 62%, #b9bfc6 80%, #9aa0a8 100%)",
      }}
    >
      {/* slow specular sweep */}
      <span
        aria-hidden
        className="promo-chrome-sweep pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent"
      />
      {/* cyan lower-edge glow */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-cyan-400/80 shadow-[0_0_12px_rgba(34,211,238,0.65)]"
      />

      <span className="relative z-10 flex items-center gap-1.5 whitespace-nowrap font-sans text-[11.5px] uppercase text-neutral-950 sm:text-[12.5px]">
        {/* mobile copy */}
        <span className="sm:hidden">
          <strong className="font-extrabold tracking-[0.02em]">{copy.mobileEmphasis}</strong>{" "}
          <span className="font-medium tracking-[0.04em]">{copy.mobileTail}</span>
        </span>
        {/* desktop copy */}
        <span className="hidden sm:inline">
          <span className="font-medium tracking-[0.04em]">{copy.desktopLead}</span>{" "}
          <strong className="font-extrabold tracking-[0.02em]">{copy.desktopEmphasis}</strong>{" "}
          <span className="font-medium tracking-[0.04em]">{copy.desktopTail}</span>
        </span>
        <ArrowRight
          className="h-3.5 w-3.5 shrink-0 text-cyan-600 transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none"
          aria-hidden
        />
      </span>
    </Link>
  );
}
