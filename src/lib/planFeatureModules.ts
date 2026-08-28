/**
 * Grouped FEATURE MODULES for the pricing cards — 2–3 labeled boxes per plan
 * instead of one long checklist.
 *
 * AUDITED: every line below maps to a capability the product actually gates
 * today (marketplace templates, Brand Workspace, saved assets, campaign history,
 * credit top-ups, FUSE Cast/avatars, workflow customization, team workspace).
 * Nothing claims priority generation, SLAs or concurrency — those are NOT
 * implemented, so they are not sold here.
 */

export type PlanFeatureModule = {
  label: string;
  items: string[];
};

const MODULES: Record<string, PlanFeatureModule[]> = {
  free: [
    {
      label: "Explore FUSE",
      items: ["Browse the campaign marketplace", "Free-eligible templates", "Preview creator campaigns"],
    },
    {
      label: "Your Brand",
      items: ["Brand Workspace setup", "100 welcome credits"],
    },
  ],
  starter: [
    {
      label: "Campaign Engine",
      items: ["Full campaign templates", "Image templates", "Campaign history"],
    },
    {
      label: "Your Brand",
      items: ["Brand Workspace", "Saved products + brand assets"],
    },
    {
      label: "More Creative Capacity",
      items: ["Monthly credits included", "Credit top-ups"],
    },
  ],
  plus: [
    {
      label: "Campaign Engine",
      items: ["Everything in Starter", "FUSE Cast"],
    },
    {
      label: "Your Brand",
      items: ["Your own avatars", "Saved products + brand assets"],
    },
    {
      label: "More Creative Capacity",
      items: ["Higher monthly credits", "Higher campaign volume"],
    },
  ],
  capsule: [
    {
      label: "Campaign Engine",
      items: ["Everything in Starter", "FUSE Cast", "Full campaign templates"],
    },
    {
      label: "Your Brand",
      items: ["Brand Workspace", "Your own avatars", "Saved products + brand assets"],
    },
    {
      label: "More Creative Capacity",
      items: ["Enough credits for a full capsule drop", "Credit top-ups"],
    },
  ],
  pro: [
    {
      label: "Campaign Engine",
      items: ["Everything in Capsule", "Workflow customization", "Campaign versions + revisions"],
    },
    {
      label: "Your Brand",
      items: ["Private template forks", "Saved products + brand assets"],
    },
    {
      label: "More Creative Capacity",
      items: ["A campaign every week, all month", "Credit top-ups"],
    },
  ],
  studio: [
    {
      label: "Campaign Engine",
      items: ["Everything in Pro", "Full advanced toolset", "Campaign versions + revisions"],
    },
    {
      label: "Your Brand",
      items: ["Largest saved-asset library", "Private template forks"],
    },
    {
      label: "More Creative Capacity",
      items: ["Multiple campaigns every week", "Credit top-ups"],
    },
  ],
  team: [
    {
      label: "Team Workspace",
      items: ["Shared team workspace", "3 seats included", "Roles and permissions"],
    },
    {
      label: "Campaign Engine",
      items: ["Everything in Studio", "Workflow customization"],
    },
    {
      label: "More Creative Capacity",
      items: ["Shared team credit pool"],
    },
  ],
};

export function planFeatureModules(planKey: string): PlanFeatureModule[] {
  return MODULES[planKey] ?? [];
}
