import { describe, expect, it } from "vitest";
import { isProductPhotoLabel, viewForLabel } from "./fillReferenceView";

describe("AI view fill: which slots", () => {
  it("offers back, sides and inside only", () => {
    expect(viewForLabel("Back")).toBe("back");
    expect(viewForLabel("Hat · Back")).toBe("back");
    expect(viewForLabel("Wearer's left side")).toBe("left");
    expect(viewForLabel("Wearer's right side")).toBe("right");
    expect(viewForLabel("Inside / underside")).toBe("inside");
    expect(viewForLabel("Front")).toBeNull();
    expect(viewForLabel("Brand logo")).toBeNull();
    expect(viewForLabel("Brand / background vibe")).toBeNull();
  });
  it("builds a view only from photos of the product, never the logo", () => {
    expect(isProductPhotoLabel("Front")).toBe(true);
    expect(isProductPhotoLabel("Hat 1")).toBe(true);
    expect(isProductPhotoLabel("Detail 2")).toBe(true);
    expect(isProductPhotoLabel("Brand logo")).toBe(false);
  });
});
