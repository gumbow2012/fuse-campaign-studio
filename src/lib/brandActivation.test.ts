import { describe, expect, it } from "vitest";
import { deriveBrandReadiness } from "@/lib/brandReadiness";
import type { BrandProfile } from "@/services/brandProfiles";
import type { ProductProfile } from "@/services/productProfiles";
import {
  computeBrandCompletion,
  findHighestValueMissing,
  resolveBrandActivationNudge,
} from "@/lib/brandActivation";

const brand = (patch: Partial<BrandProfile> = {}): BrandProfile =>
  ({
    id: "brand-1",
    user_id: "user-1",
    name: "FUSE",
    website: "https://fuse-us.com",
    description: "",
    primary_logo_url: null,
    secondary_logo_url: null,
    colors: [],
    metadata: {},
    created_at: new Date().toISOString(),
    ...patch,
  }) as unknown as BrandProfile;

const product = (): ProductProfile =>
  ({
    id: "p1",
    brand_id: "brand-1",
    type: "product",
    name: "Tee",
    assets: [{ role: "front", url: "https://x/y.jpg" }],
  }) as unknown as ProductProfile;

const readinessOf = (b: BrandProfile | null, products: ProductProfile[] = [], models: string[] = []) =>
  deriveBrandReadiness(b, products, models, null);

describe("computeBrandCompletion", () => {
  it("is 0 with no readiness and excludes optional items from the denominator", () => {
    expect(computeBrandCompletion(null).percent).toBe(0);

    const readiness = readinessOf(brand());
    const completion = computeBrandCompletion(readiness);
    const nonOptional = readiness.sections.flatMap((s) => s.items.filter((i) => i.level !== "optional"));
    expect(completion.total).toBe(nonOptional.length);
    expect(completion.satisfied).toBe(nonOptional.filter((i) => i.done).length);
    expect(completion.percent).toBe(Math.round((completion.satisfied / completion.total) * 100));
  });

  it("reaches 100 when every required and recommended item is satisfied", () => {
    const full = brand({
      primary_logo_url: "https://x/logo.png",
      secondary_logo_url: "https://x/logo-inv.png",
      colors: ["#000000"],
      metadata: {
        visualStyle: { tone: "raw street", tags: ["street"], styleSignals: [], referenceBrands: [], referenceImages: [], references: [] },
      },
    } as Partial<BrandProfile>);
    const readiness = deriveBrandReadiness(full, [product()], ["model-1"], {
      tone: "raw street",
      tags: ["street"],
      styleSignals: [],
      referenceBrands: [],
      referenceImages: [],
      references: [],
      instagram: "",
      pinterest: "",
    } as never);
    expect(computeBrandCompletion(readiness).percent).toBe(100);
    expect(resolveBrandActivationNudge({ brand: full, readiness })).toBeNull();
  });
});

describe("resolveBrandActivationNudge", () => {
  it("returns a modal for a user with no brand", () => {
    const nudge = resolveBrandActivationNudge({ brand: null, readiness: null });
    expect(nudge?.level).toBe("modal");
    expect(nudge?.reason).toBe("no_brand");
    expect(nudge?.completionPercent).toBe(0);
    expect(nudge?.deepLink).toContain("/app/brand/onboarding");
  });

  it("downgrades the modal to a banner when dismissed or deferred", () => {
    const now = Date.now();
    const signupAt = new Date(now - 60 * 60 * 1000).toISOString();
    const b = brand();
    const readiness = readinessOf(b);

    expect(resolveBrandActivationNudge({ brand: b, readiness, signupAt, now })?.level).toBe("modal");
    expect(
      resolveBrandActivationNudge({
        brand: b,
        readiness,
        signupAt,
        now,
        nudgeState: { dismissedAt: new Date(now - 1000).toISOString() },
      })?.level,
    ).toBe("banner");
    expect(
      resolveBrandActivationNudge({ brand: b, readiness, signupAt, now, nudgeState: { deferredAt: signupAt } })
        ?.level,
    ).toBe("banner");
  });

  it("uses a banner for older accounts and reports incomplete", () => {
    const now = Date.now();
    const b = brand();
    const nudge = resolveBrandActivationNudge({
      brand: b,
      readiness: readinessOf(b),
      signupAt: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(),
      now,
    });
    expect(nudge?.level).toBe("banner");
    expect(nudge?.reason).toBe("incomplete");
  });
});

describe("highest-value missing ordering", () => {
  it("prefers logo over product, and product over cast", () => {
    const noLogo = brand();
    expect(findHighestValueMissing(readinessOf(noLogo, [product()], ["m1"]))?.key).toBe("primary_logo");

    const withIdentity = brand({ primary_logo_url: "https://x/l.png", secondary_logo_url: "https://x/i.png", colors: ["#111"] });
    expect(findHighestValueMissing(readinessOf(withIdentity, [], ["m1"]))?.key).toBe("product");
    expect(findHighestValueMissing(readinessOf(withIdentity, [product()], []))?.key).toBe("model");
  });

  it("maps the missing item to its wizard step for deep-linking", () => {
    const nudge = resolveBrandActivationNudge({ brand: brand(), readiness: readinessOf(brand()) });
    expect(nudge?.highestValueMissing?.step).toBe(2);
    expect(nudge?.deepLink).toContain("step=2");
  });
});
