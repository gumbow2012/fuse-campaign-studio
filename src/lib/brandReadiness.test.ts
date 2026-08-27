import { describe, expect, it } from "vitest";
import { deriveBrandReadiness } from "./brandReadiness";
import type { BrandProfile } from "@/services/brandProfiles";

function brand(overrides: Partial<BrandProfile> = {}) {
  return {
    id: "b1",
    name: "FUSE",
    website: null,
    description: null,
    primary_logo_url: "https://x/logo.png",
    secondary_logo_url: null,
    colors: ["#111111"],
    metadata: {},
    ...overrides,
  } as unknown as BrandProfile;
}

describe("brand readiness", () => {
  it("is ready with name + logo + one color and nothing else", () => {
    const readiness = deriveBrandReadiness(brand(), [], [], null);
    expect(readiness.requiredMissing).toBe(0);
    expect(readiness.ready).toBe(true);
  });

  it("accepts the noLogo / neutralPalette opt-outs", () => {
    const readiness = deriveBrandReadiness(
      brand({
        primary_logo_url: null,
        colors: [],
        metadata: { noLogo: true, neutralPalette: true } as never,
      }),
      [],
      [],
      null,
    );
    expect(readiness.requiredMissing).toBe(0);
  });

  it("never marks products, website, models, DNA or assets as required", () => {
    const items = deriveBrandReadiness(brand(), [], [], null).sections.flatMap((s) => s.items);
    const required = items.filter((item) => item.level === "required").map((item) => item.key);
    expect(required.sort()).toEqual(["colors", "name", "primary_logo"]);
    expect(items.find((item) => item.key === "product")?.level).toBe("recommended");
  });

  it("still flags missing required identity", () => {
    const readiness = deriveBrandReadiness(brand({ name: "", primary_logo_url: null, colors: [] }), [], [], null);
    expect(readiness.ready).toBe(false);
    expect(readiness.requiredMissing).toBe(3);
  });
});
