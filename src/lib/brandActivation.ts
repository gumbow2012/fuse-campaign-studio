/**
 * Brand Workspace ACTIVATION — Phase 1: the single source of truth for
 * "how complete is this brand, and what should we nudge next?".
 *
 * Pure module: no React, no queries, no writes. It only interprets the
 * readiness derived by `deriveBrandReadiness` plus the activation state stored
 * on `brand.metadata.activation`. Rendering is a later phase.
 */
import type { BrandProfile } from "@/services/brandProfiles";
import type { BrandReadiness, ReadinessItem } from "@/lib/brandReadiness";

/** Analytics event names reserved for later activation phases (not fired here). */
export const ACTIVATION_EVENTS = {
  nudgeShown: "brand_nudge_shown",
  nudgeClicked: "brand_nudge_clicked",
  nudgeDismissed: "brand_nudge_dismissed",
  onboardingStarted: "brand_onboarding_started",
  onboardingDeferred: "brand_onboarding_deferred",
  onboardingResumed: "brand_onboarding_resumed",
  onboardingCompleted: "brand_onboarding_completed",
  assetSavedToBrand: "campaign_asset_saved_to_brand",
} as const;

export const ONBOARDING_ROUTE = "/app/brand/onboarding";

/** Persisted nudge state (lives at brand.metadata.activation). */
export interface BrandActivationState {
  deferredAt?: string;
  dismissedAt?: string;
  /** When the welcome modal was last actually shown. */
  shownAt?: string;
  lastReminderType?: string;
  lastReminderAt?: string;
  /** Phase 3 banner: when it was dismissed and for WHICH activation state. */
  bannerDismissedAt?: string;
  /** Signature of the readiness state at dismissal — advancing it re-shows the banner. */
  bannerDismissedSignature?: string;
}


export interface BrandCompletion {
  /** Satisfied / (required + recommended) items, rounded. Optional excluded. */
  percent: number;
  satisfied: number;
  total: number;
  requiredMissing: number;
  recommendedMissing: number;
}

export interface HighestValueMissing {
  key: string;
  label: string;
  step: number;
}

export type BrandActivationNudge = {
  level: "modal" | "banner" | "notification" | "contextual";
  reason: "no_brand" | "incomplete";
  completionPercent: number;
  highestValueMissing: HighestValueMissing | null;
  title: string;
  body: string;
  ctaLabel: string;
  deepLink: string;
} | null;

/** How recently a dismissal still suppresses the modal level. */
const DISMISS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** A signup younger than this counts as "brand new / first session". */
const FIRST_SESSION_MS = 24 * 60 * 60 * 1000;

function scored(readiness: BrandReadiness) {
  return readiness.sections.flatMap((section) =>
    section.items
      .filter((item) => item.level !== "optional")
      .map((item) => ({ item, step: section.step })),
  );
}

/**
 * REAL completion percent: satisfied required+recommended items over the total
 * of those items. Optional items never inflate or deflate the number.
 */
export function computeBrandCompletion(readiness: BrandReadiness | null): BrandCompletion {
  const entries = readiness ? scored(readiness) : [];
  const total = entries.length;
  const satisfied = entries.filter((entry) => entry.item.done).length;
  return {
    percent: total === 0 ? 0 : Math.round((satisfied / total) * 100),
    satisfied,
    total,
    requiredMissing: readiness?.requiredMissing ?? 0,
    recommendedMissing: readiness?.recommendedMissing ?? 0,
  };
}

/**
 * Priority order for the single highest-value missing item. Readiness item keys
 * in the order a brand actually becomes useful for campaigns.
 */
const PRIORITY: { key: string; label: string }[] = [
  { key: "name", label: "Name your brand" },
  { key: "primary_logo", label: "Add your primary logo" },
  { key: "colors", label: "Set your brand colors" },
  { key: "product", label: "Add your first product" },
  { key: "product_back", label: "Add product back views" },
  { key: "model", label: "Choose your cast" },
  { key: "dna", label: "Define your creative DNA" },
];

export function findHighestValueMissing(readiness: BrandReadiness | null): HighestValueMissing | null {
  if (!readiness) return { key: "name", label: "Name your brand", step: 1 };
  const entries = scored(readiness);
  const byKey = new Map<string, { item: ReadinessItem; step: number }>();
  for (const entry of entries) byKey.set(entry.item.key, entry);

  for (const candidate of PRIORITY) {
    const entry = byKey.get(candidate.key);
    if (entry && !entry.item.done) {
      return { key: candidate.key, label: candidate.label, step: entry.step };
    }
  }
  // Anything else still missing, in readiness order.
  const fallback = entries.find((entry) => !entry.item.done);
  return fallback ? { key: fallback.item.key, label: fallback.item.label, step: fallback.step } : null;
}

export function readActivationState(brand: BrandProfile | null): BrandActivationState {
  const meta = (brand?.metadata ?? {}) as Record<string, unknown>;
  const raw = meta.activation;
  if (!raw || typeof raw !== "object") return {};
  const value = raw as Record<string, unknown>;
  const text = (key: string) => (typeof value[key] === "string" ? (value[key] as string) : undefined);
  return {
    deferredAt: text("deferredAt"),
    dismissedAt: text("dismissedAt"),
    shownAt: text("shownAt"),
    lastReminderType: text("lastReminderType"),
    lastReminderAt: text("lastReminderAt"),
  };
}

/**
 * Builds the metadata patch for a state change. Persisting it is the caller's
 * job (later phases) — this helper never writes.
 */
export function buildActivationStatePatch(
  prev: BrandActivationState,
  change: Partial<BrandActivationState>,
): { activation: BrandActivationState } {
  return { activation: { ...prev, ...change } };
}

const COPY: Record<string, { title: string; body: string; ctaLabel: string }> = {
  name: {
    title: "Set up your brand",
    body: "Build it once. FUSE remembers the rest.",
    ctaLabel: "Set up brand",
  },
  primary_logo: {
    title: "Add your logo",
    body: "Your logo gets placed automatically on every campaign you generate.",
    ctaLabel: "Add logo",
  },
  colors: {
    title: "Lock your brand colors",
    body: "Colors keep every campaign on-brand without you re-picking them.",
    ctaLabel: "Add colors",
  },
  product: {
    title: "Add your products",
    body: "Add your products to unlock faster campaign setup.",
    ctaLabel: "Add product",
  },
  product_back: {
    title: "Add product back views",
    body: "Back views let templates show the full garment — no re-uploads later.",
    ctaLabel: "Add views",
  },
  model: {
    title: "Choose your cast",
    body: "Pick the faces that carry your brand so every campaign stays consistent.",
    ctaLabel: "Choose cast",
  },
  dna: {
    title: "Define your creative DNA",
    body: "Tell FUSE your style once and every template inherits it.",
    ctaLabel: "Add creative DNA",
  },
};

const DEFAULT_COPY = {
  title: "Finish your brand setup",
  body: "Build it once. FUSE remembers the rest.",
  ctaLabel: "Continue setup",
};

function isRecent(iso: string | undefined, windowMs: number, now: number): boolean {
  if (!iso) return false;
  const time = Date.parse(iso);
  return Number.isFinite(time) && now - time < windowMs;
}

export function resolveBrandActivationNudge(input: {
  brand: BrandProfile | null;
  readiness: BrandReadiness | null;
  nudgeState?: BrandActivationState;
  signupAt?: string | null;
  now?: Date | number;
}): BrandActivationNudge {
  const { brand, readiness } = input;
  const state = input.nudgeState ?? {};
  const now = typeof input.now === "number" ? input.now : (input.now ?? new Date()).getTime();

  const completion = computeBrandCompletion(readiness);

  // Sufficiently complete → stop generic reminders entirely.
  if (brand && readiness && completion.requiredMissing === 0) return null;

  const missing = findHighestValueMissing(brand ? readiness : null);
  const copy = (missing && COPY[missing.key]) || DEFAULT_COPY;

  const firstSession = !brand || isRecent(input.signupAt ?? undefined, FIRST_SESSION_MS, now);
  let level: NonNullable<BrandActivationNudge>["level"] = firstSession ? "modal" : "banner";
  if (level === "modal" && (state.deferredAt || isRecent(state.dismissedAt, DISMISS_WINDOW_MS, now))) {
    level = "banner";
  }

  const step = missing?.step ?? 1;

  return {
    level,
    reason: brand ? "incomplete" : "no_brand",
    completionPercent: brand ? completion.percent : 0,
    highestValueMissing: missing,
    title: copy.title,
    body: copy.body,
    ctaLabel: copy.ctaLabel,
    deepLink: brand
      ? `${ONBOARDING_ROUTE}?brand=${encodeURIComponent(brand.id)}&step=${step}`
      : `${ONBOARDING_ROUTE}?step=1`,
  };
}

/**
 * Truthful "FUSE now knows your …" list for the completion celebration.
 * Only includes what actually exists on the brand.
 */
export function describeBrandKnowledge(input: {
  brand: BrandProfile | null;
  productCount: number;
  castCount: number;
  dnaPresent: boolean;
}): string[] {
  const known: string[] = [];
  const flags = (input.brand?.metadata ?? {}) as Record<string, unknown>;
  if (input.brand?.name?.trim()) known.push("Identity");
  if (input.productCount > 0) known.push("Products");
  if ((input.brand?.colors?.length ?? 0) > 0 || flags.neutralPalette === true) known.push("Brand colors");
  if (input.castCount > 0) known.push("Cast");
  if (input.dnaPresent) known.push("Creative direction");
  return known;
}
