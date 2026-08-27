import { Building2, Crown, Layers, Package, Rocket, Sparkles, Zap, type LucideIcon } from "lucide-react";
import { STRIPE_TIERS, type StripeTierKey } from "@/lib/stripe-config";

/**
 * Template-first plan ladder for the Membership Center and public pricing page.
 *
 * Credits are the fuel underneath a membership, never the headline. Benefits describe
 * marketplace + campaign access; models are an implementation detail and are not sold.
 *
 * `checkout: "live"`  → backed by an EXISTING Stripe price (Starter / Pro / Studio monthly).
 * `checkout: "gated"` → no Stripe price exists yet; the CTA opens the graceful early-access
 *                       action (see GatedPlanDialog). NEVER map a gated plan to another price.
 *
 * STRIPE OBJECTS STILL TO BE CREATED (none of these exist today):
 *   - PLUS monthly ($59)
 *   - CAPSULE monthly ($75)
 *   - TEAM monthly ($699)
 *   - ANNUAL prices for EVERY plan: Starter, Plus, Pro, Studio, Team
 *   (FREE needs no Stripe product.)
 *
 * ADVERTISED ladder — backend entitlement enforcement for Cast / priority / concurrency /
 * team features is NOT yet implemented (follow-up task).
 */

export type PlanCheckoutMode = "live" | "gated" | "none";

/** One controlled accent per plan — dark FUSE system, not a rainbow page. */
export type PlanAccentKey = "graphite" | "cyan" | "sky" | "violet" | "lime" | "magenta" | "royal";

/** Intentional, non-duplicated recommendation badges. */
export type PlanRecommendation = "MOST POPULAR" | "BEST VALUE" | "FOR TEAMS";

export type PlanLadderEntry = {
  key: string;
  name: string;
  /** Positioning tagline — template-first, never credit-first. */
  tagline: string;
  badge: string;
  icon: LucideIcon;
  /** Controlled accent used for glow / badge / CTA / border / key metric. */
  accent: PlanAccentKey;
  /** Only Capsule / Pro / Team carry one. */
  recommendation?: PlanRecommendation;
  description: string;
  /** Monthly USD price (designed). */
  price: number;
  /** Annual plan billed monthly (designed). All annual checkout is gated. */
  annualPrice: number;
  /** Monthly credits (fuel). Null only for Team, which uses a shared pool. */
  monthlyCredits: number | null;
  /** Display label for the fuel line. */
  creditsLabel: string;
  /** "Good for" campaign-capacity line — never raw image/video counts. */
  goodFor: string;
  /** Template-first benefits. */
  benefits: string[];
  checkout: PlanCheckoutMode;
  /** Present only for live tiers; used by the existing checkout handler. */
  stripeTierKey?: StripeTierKey;
  ctaLabel: string;
  recommended?: boolean;
  featured?: boolean;
  isFreeState?: boolean;
};

export const PLAN_LADDER: PlanLadderEntry[] = [
  {
    key: "free",
    name: "Free",
    tagline: "Explore FUSE",
    badge: "Free",
    icon: Sparkles,
    accent: "graphite",
    description: "Browse the marketplace, preview campaigns and follow the creators behind them.",
    price: 0,
    annualPrice: 0,
    monthlyCredits: 0,
    creditsLabel: "100 welcome credits",
    goodFor: "Trying FUSE on free-eligible templates",
    benefits: [
      "Explore FUSE",
      "Free-eligible templates",
      "Brand Workspace",
      "100 welcome credits",
    ],
    checkout: "none",
    ctaLabel: "Start free",
    isFreeState: true,
  },
  {
    key: "starter",
    name: STRIPE_TIERS.starter.name,
    tagline: "For first drops",
    badge: "Entry",
    icon: Zap,
    accent: "cyan",
    description: "Run real campaigns from the marketplace and launch your first drops.",
    price: STRIPE_TIERS.starter.price,
    annualPrice: 20,
    monthlyCredits: STRIPE_TIERS.starter.monthlyCredits,
    creditsLabel: `${STRIPE_TIERS.starter.monthlyCredits.toLocaleString()} credits/mo`,
    goodFor: "Your first campaigns",
    benefits: [
      "Full campaign templates",
      "Image Templates",
      "Brand Workspace",
      "Saved products + assets",
      "Campaign history",
      "Credit top-ups",
    ],
    checkout: "live",
    stripeTierKey: "starter",
    ctaLabel: "Start with Starter",
    featured: true,
  },
  {
    key: "plus",
    name: "Plus",
    tagline: "For weekly content",
    badge: "Growing",
    icon: Layers,
    accent: "sky",
    description: "For brands posting every week, with FUSE Cast and your own avatars.",
    price: 59,
    annualPrice: 47,
    monthlyCredits: 7500,
    creditsLabel: "7,500 credits/mo",
    goodFor: "Weekly campaign content",
    benefits: [
      "Everything in Starter",
      "More monthly credits",
      "FUSE Cast",
      "Higher campaign capacity",
    ],
    checkout: "gated",
    ctaLabel: "Choose Plus",
  },
  {
    // Designed tier — no Stripe price exists yet, so checkout MUST stay gated.
    // Placed by price so the ladder stays monotonic ($59 Plus → $75 Capsule → $149 Pro).
    key: "capsule",
    name: "Capsule",
    tagline: "For a full capsule drop",
    badge: "Coming soon",
    icon: Package,
    accent: "violet",
    recommendation: "MOST POPULAR",
    description: "Enough campaign volume to shoot an entire capsule collection in one month.",
    price: 75,
    annualPrice: 60,
    monthlyCredits: 10000,
    creditsLabel: "10,000 credits/mo",
    goodFor: "One full capsule drop a month",
    benefits: [
      "Everything in Starter",
      "More monthly credits",
      "FUSE Cast",
      "Higher campaign capacity",
    ],
    checkout: "gated",
    ctaLabel: "Join the Capsule waitlist",
    featured: true,
  },
  {
    key: "pro",
    name: STRIPE_TIERS.pro.name,
    tagline: "For active brands",
    badge: "Most popular",
    icon: Rocket,
    accent: "lime",
    recommendation: "BEST VALUE",
    description: "For brands running a real drop calendar with priority turnaround.",
    price: STRIPE_TIERS.pro.price,
    annualPrice: 119,
    monthlyCredits: STRIPE_TIERS.pro.monthlyCredits,
    creditsLabel: `${STRIPE_TIERS.pro.monthlyCredits.toLocaleString()} credits/mo`,
    goodFor: "A campaign every week, all month",
    benefits: [
      "Everything in Capsule",
      "Workflow customization",
      "Advanced generation controls",
      "Campaign versions + revisions",
    ],
    checkout: "live",
    stripeTierKey: "pro",
    ctaLabel: "Go Pro",
    recommended: true,
    featured: true,
  },
  {
    key: "studio",
    name: STRIPE_TIERS.studio.name,
    tagline: "High volume",
    badge: "Volume",
    icon: Crown,
    accent: "magenta",
    description: "For multi-line brands and studios shipping campaigns constantly.",
    price: STRIPE_TIERS.studio.price,
    annualPrice: 319,
    monthlyCredits: STRIPE_TIERS.studio.monthlyCredits,
    creditsLabel: `${STRIPE_TIERS.studio.monthlyCredits.toLocaleString()} credits/mo`,
    goodFor: "Multiple campaigns every week",
    benefits: [
      "Everything in Pro",
      "Very high monthly campaign capacity",
      "Full advanced toolset",
      "Largest saved-asset library",
    ],
    checkout: "live",
    stripeTierKey: "studio",
    ctaLabel: "Get Studio",
    featured: true,
  },
  {
    key: "team",
    name: "Team",
    tagline: "For agencies + teams",
    badge: "Teams",
    icon: Building2,
    accent: "royal",
    recommendation: "FOR TEAMS",
    description: "A shared workspace for agencies running campaigns for several brands.",
    price: 699,
    annualPrice: 559,
    monthlyCredits: null,
    creditsLabel: "Shared team pool",
    goodFor: "Client campaigns, all month",
    benefits: [
      "Shared team workspace",
      "Shared team credit pool",
      "3 seats included",
      "Roles and permissions",
    ],
    checkout: "gated",
    ctaLabel: "Go Team",
  },
];

export const FEATURED_PLANS = PLAN_LADDER.filter((entry) => entry.featured);

/** Selector label — the exact percent lives on each card (it can vary by plan). */
export const ANNUAL_SAVINGS_LABEL = "Best savings";

/** Annual checkout is gated for every plan until annual Stripe prices exist. */
export function isCheckoutLive(entry: PlanLadderEntry, cycle: "monthly" | "annual") {
  return entry.checkout === "live" && cycle === "monthly";
}

export function planPrice(entry: PlanLadderEntry, cycle: "monthly" | "annual") {
  return cycle === "annual" ? entry.annualPrice : entry.price;
}
