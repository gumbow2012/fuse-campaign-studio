import { describe, expect, it } from "vitest";
import { FEATURE_REGISTRY, NEW_WINDOW_DAYS, isFeatureNew } from "@/lib/featureRegistry";

describe("featureRegistry", () => {
  it("marks a feature NEW inside its launch window", () => {
    const entry = FEATURE_REGISTRY[0];
    const justAfterLaunch = new Date(new Date(entry.launchedAt).getTime() + 86_400_000);
    expect(isFeatureNew(entry.key, justAfterLaunch)).toBe(true);
  });

  it("drops the badge after the window expires", () => {
    const entry = FEATURE_REGISTRY[0];
    const later = new Date(new Date(entry.launchedAt).getTime() + (NEW_WINDOW_DAYS + 2) * 86_400_000);
    expect(isFeatureNew(entry.key, later)).toBe(false);
  });

  it("has one registry entry per key", () => {
    const keys = FEATURE_REGISTRY.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
