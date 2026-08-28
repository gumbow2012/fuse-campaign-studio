/**
 * PLAN DIFFERENTIATORS for the pricing cards.
 *
 * Short, non-redundant lists: each plan states what it adds over the plan below it,
 * so nothing repeats down the ladder ("Full campaign templates" is a Starter line and
 * is never restated on Capsule/Pro/Studio).
 *
 * AUDITED: every line maps to a capability the product actually gates today
 * (marketplace templates, Brand Workspace, saved assets, campaign history, credit
 * top-ups, FUSE Cast/avatars, workflow customization, private forks, team workspace).
 * Nothing claims priority generation, SLAs or concurrency — those are NOT implemented,
 * so they are not sold here.
 */

import { WELCOME_CREDITS_ONCE } from "@/lib/planLadder";

export type PlanDifferentiators = {
  /** "Everything in Starter, plus:" — omitted for Free. */
  inherits: string | null;
  /** 4–6 real differentiators. Everything else lives in the comparison table. */
  items: string[];
};

const DIFFERENTIATORS: Record<string, PlanDifferentiators> = {
  free: {
    inherits: null,
    items: [
      "Browse the campaign marketplace",
      "Free-eligible templates",
      "Brand Workspace setup",
      `${WELCOME_CREDITS_ONCE} welcome credits (one-time)`,
    ],
  },
  starter: {
    inherits: null,
    items: [
      "Full campaign templates",
      "Image templates",
      "Saved products + brand assets",
      "Campaign history",
      "Credit top-ups",
    ],
  },
  capsule: {
    inherits: "Starter",
    items: ["FUSE Cast", "2.5x the monthly credits", "Built for weekly creative testing"],
  },
  pro: {
    inherits: "Capsule",
    items: [
      "Workflow customization",
      "Private workflow forks",
      "Advanced generation controls",
      "Campaign versions + revisions",
    ],
  },
  studio: {
    inherits: "Pro",
    items: ["Highest monthly allowance", "Full advanced toolkit"],
  },
  team: {
    inherits: "Studio",
    items: ["Shared team workspace", "3 seats included", "Roles and permissions", "Shared team credit pool"],
  },
  /** Retired from sale — kept so historical Plus records still render something truthful. */
  plus: {
    inherits: "Starter",
    items: ["FUSE Cast", "Your own avatars", "Higher monthly credits"],
  },
};

export function planDifferentiators(planKey: string): PlanDifferentiators {
  return DIFFERENTIATORS[planKey] ?? { inherits: null, items: [] };
}
