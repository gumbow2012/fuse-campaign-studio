/**
 * BRAND ACTIVATION — Phase 4: deduplicated reminder notifications.
 *
 * Mounted ONCE in the app shell. It reads the Phase 1 resolver
 * (useBrandActivation) for the single highest-value missing item, maps it to at
 * most one reminder type, and inserts it into `user_notifications` only when no
 * unread/recent reminder of that type exists. Fire-and-forget: any failure is
 * swallowed so the app never breaks.
 */
import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { useBrandActivation } from "@/hooks/useBrandActivation";
import { ONBOARDING_ROUTE, findHighestValueMissing } from "@/lib/brandActivation";
import {
  createBrandActivationReminder,
  type BrandActivationReminderType,
} from "@/services/notifications";

const SESSION_KEY = "fuse_brand_activation_reminder_run";
/** Do not re-create the same reminder type inside this window. */
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

const COPY: Record<
  BrandActivationReminderType,
  { title: string; body: string; actionLabel: string; step: number }
> = {
  build_brand: {
    title: "Build your brand",
    body: "Make future campaigns faster.",
    actionLabel: "Build brand",
    step: 1,
  },
  add_product: {
    title: "Add your first product",
    body: "FUSE can preload compatible campaign inputs.",
    actionLabel: "Add product",
    step: 3,
  },
  add_creative_dna: {
    title: "Teach FUSE your style",
    body: "Add Creative DNA to improve recommendations.",
    actionLabel: "Add Creative DNA",
    step: 5,
  },
};

function ranThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function markRanThisSession() {
  try {
    window.sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* best effort */
  }
}

export function useBrandActivationReminders(): void {
  const { user } = useAuth();
  const { activeBrand } = useBrand();
  const { readiness, activationState, completionPercent, loading, brandSetupEnabled } =
    useBrandActivation();
  const attempted = useRef(false);

  useEffect(() => {
    if (loading || !brandSetupEnabled || !user?.id || attempted.current || ranThisSession()) return;

    // No brand at all → the only reminder is to build one.
    let reminderType: BrandActivationReminderType | null = null;
    let step = 1;

    if (!activeBrand) {
      reminderType = "build_brand";
    } else if (readiness) {
      const missing = findHighestValueMissing(readiness);
      // Satisfied state → nothing due. Required identity gaps are handled by the
      // banner/modal, so only enrichment gaps become notifications here.
      if (missing?.key === "product") {
        reminderType = "add_product";
        step = missing.step;
      } else if (missing?.key === "dna") {
        reminderType = "add_creative_dna";
        step = missing.step;
      }
    } else {
      return; // readiness not resolved yet
    }

    if (!reminderType) return;

    // Respect an explicit dismissal/defer until readiness advances or cooldown ends.
    const dismissedAt = Date.parse(
      activationState.bannerDismissedAt ?? activationState.dismissedAt ?? activationState.deferredAt ?? "",
    );
    const signature = `${reminderType}:${completionPercent}`;
    const dismissalStillFresh =
      Number.isFinite(dismissedAt) &&
      Date.now() - dismissedAt < COOLDOWN_MS &&
      activationState.bannerDismissedSignature === signature;
    if (dismissalStillFresh) return;

    attempted.current = true;
    markRanThisSession();

    const copy = COPY[reminderType];
    const actionUrl = activeBrand
      ? `${ONBOARDING_ROUTE}?brand=${encodeURIComponent(activeBrand.id)}&step=${step || copy.step}`
      : `${ONBOARDING_ROUTE}?step=1`;

    void createBrandActivationReminder({
      userId: user.id,
      reminderType,
      title: copy.title,
      body: copy.body,
      actionLabel: copy.actionLabel,
      actionUrl,
      brandId: activeBrand?.id ?? null,
      completionState: completionPercent,
    }).catch(() => {
      /* reminders are non-critical */
    });
  }, [loading, brandSetupEnabled, user?.id, activeBrand, readiness, activationState, completionPercent]);
}
