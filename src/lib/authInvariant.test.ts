/**
 * REGRESSION — an authenticated user must NEVER be routed to the
 * account-creation UI. The only path back to /auth is an explicit sign-out.
 */
import { describe, expect, it } from "vitest";
import { resolveIntentDestination, sanitizeReturnTo, DEFAULT_AUTH_DESTINATION } from "@/lib/pendingAuthIntent";
import {
  normalizeOfferState,
  offerDecisionPending,
  hasActivePaidSubscription,
} from "@/lib/onboardingPlanOffer";

describe("post-auth destination", () => {
  it("never resolves to the auth page", () => {
    for (const returnTo of ["/auth", "/auth?mode=signup", "/auth/callback"]) {
      expect(resolveIntentDestination({ returnTo })).toBe(DEFAULT_AUTH_DESTINATION);
    }
  });

  it("keeps a legitimate internal destination", () => {
    expect(resolveIntentDestination({ returnTo: "/app/templates?template=x" })).toBe(
      "/app/templates?template=x",
    );
    expect(resolveIntentDestination({ templateId: "abc" })).toBe("/app/templates?template=abc");
    expect(resolveIntentDestination({})).toBe(DEFAULT_AUTH_DESTINATION);
  });

  it("rejects external return targets", () => {
    expect(sanitizeReturnTo("https://evil.example.com")).toBeFalsy();
    expect(sanitizeReturnTo("//evil.example.com")).toBeFalsy();
  });
});

describe("onboarding plan offer decision", () => {
  it("shows only for an explicitly undecided account", () => {
    expect(offerDecisionPending(normalizeOfferState("unseen"))).toBe(true);
    expect(offerDecisionPending(normalizeOfferState("shown"))).toBe(true);
    for (const decided of ["free", "starter", "capsule", "dismissed"]) {
      expect(offerDecisionPending(normalizeOfferState(decided))).toBe(false);
    }
  });

  it("treats unknown/missing state as undecided but never crashes", () => {
    expect(normalizeOfferState(undefined)).toBe("unseen");
    expect(normalizeOfferState("garbage")).toBe("unseen");
  });

  it("never offers onboarding upgrades to paid members", () => {
    expect(hasActivePaidSubscription("starter", "active")).toBe(true);
    expect(hasActivePaidSubscription("free", null)).toBe(false);
  });
});
