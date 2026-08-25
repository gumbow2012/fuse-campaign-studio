import { Building2, Crown, Layers, Rocket, Sparkles, Zap, type LucideIcon } from "lucide-react";
import { STRIPE_TIERS } from "@/lib/stripe-config";

/**
 * Data-driven plan ladder for the Membership Center.
 *
 * `checkout: "live"` entries map 1:1 to REAL Stripe prices already defined in
 * src/lib/stripe-config.ts (amounts + credits are read from there, never redefined here).
 * `checkout: "gated"` entries have NO Stripe product/price yet — they render honestly with
 * no invented prices or credit numbers and no checkout wiring.
 *
 * TO MAKE THE GATED POSITIONS REAL, the following Stripe objects must be created first
 * (product + recurring monthly price, then mapped into stripe-config.ts):
 *   1. FREE  — no Stripe product needed (entitlement-only state); requires a real free
 *              monthly credit allotment decision if it should grant credits.
 *   2. PLUS  — Product "FUSE Plus" + monthly recurring price (amount + credit grant TBD).
 *   3. TEAM  — Product "FUSE Team" + monthly recurring price (or custom/quote-based flow).
 *   4. ANNUAL — one additional yearly recurring price per live tier
 *              (FUSE Starter / Pro / Studio) before the annual toggle can check out.
 * Until those exist, do not add price IDs, amounts, discounts, or savings copy here.
 */

export type PlanCheckoutMode = "live" | "gated";

export type LiveTierKey = keyof typeof STRIPE_TIERS;

export type PlanLadderEntry = {
  key: string;
  name: string;
  tagline: string;
  badge: string;
  icon: LucideIcon;
  description: string;
  /** Real monthly credits — only ever set for live tiers (or a real free allotment). */
  monthlyCredits: number | null;
  /** Real monthly USD price — only ever set for live tiers, or 0 for the free state. */
  price: number | null;
  checkout: PlanCheckoutMode;
  /** Present only for live tiers; the key used by the existing checkout handler. */
  stripeTierKey?: LiveTierKey;
  /** Honest CTA for gated positions. */
  gatedCta?: { label: string; href?: string };
  recommended?: boolean;
  /** True for the free position, which is "current" when no paid plan is active. */
  isFreeState?: boolean;
};

export const PLAN_LADDER: PlanLadderEntry[] = [
  {
    key: "free",
    name: "Free",
    tagline: "For exploring FUSE",
    badge: "Free",
    icon: Sparkles,
    description: "Browse the template library and explore the studio. Running templates requires a membership.",
    // No real free monthly credit allotment exists today — never invent one.
    monthlyCredits: null,
    price: 0,
    checkout: "gated",
    isFreeState: true,
  },
  {
    key: "starter",
    name: STRIPE_TIERS.starter.name,
    tagline: "For first campaigns",
    badge: "Entry",
    icon: Zap,
    description:
      "For brands getting started. Full template library. Standard processing. Everything you need to launch your first drops with real campaign visuals.",
    monthlyCredits: STRIPE_TIERS.starter.monthlyCredits,
    price: STRIPE_TIERS.starter.price,
    checkout: "live",
    stripeTierKey: "starter",
  },
  {
    key: "plus",
    name: "Plus",
    tagline: "For growing drop calendars",
    badge: "Coming soon",
    icon: Layers,
    description: "A step between Starter and Pro. Not available yet — no pricing or credit allotment is set.",
    monthlyCredits: null,
    price: null,
    checkout: "gated",
    gatedCta: { label: "Coming soon" },
  },
  {
    key: "pro",
    name: STRIPE_TIERS.pro.name,
    tagline: "For active brands",
    badge: "Most popular",
    icon: Rocket,
    description:
      "For brands that drop regularly. Priority processing. Faster turnaround. The full creative toolkit for brands running a real drop calendar.",
    monthlyCredits: STRIPE_TIERS.pro.monthlyCredits,
    price: STRIPE_TIERS.pro.price,
    checkout: "live",
    stripeTierKey: "pro",
    recommended: true,
  },
  {
    key: "studio",
    name: STRIPE_TIERS.studio.name,
    tagline: "For high-volume creators",
    badge: "Volume",
    icon: Crown,
    description:
      "Fastest processing and the largest monthly volume. Built for brands running multiple lines or managing client drops.",
    monthlyCredits: STRIPE_TIERS.studio.monthlyCredits,
    price: STRIPE_TIERS.studio.price,
    checkout: "live",
    stripeTierKey: "studio",
  },
  {
    key: "team",
    name: "Team",
    tagline: "For agencies & teams",
    badge: "Custom",
    icon: Building2,
    description: "Multi-seat access and agency workflows. Pricing is bespoke — talk to us.",
    monthlyCredits: null,
    price: null,
    checkout: "gated",
    gatedCta: { label: "Contact us", href: "/contact" },
  },
];
