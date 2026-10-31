import { describe, expect, it } from "vitest";
import { normalizeCampaignFields } from "./campaignFields";

describe("normalizeCampaignFields labels", () => {
  it("keeps a plain human label that happens to equal its key", () => {
    const [brand, site] = normalizeCampaignFields([
      { key: "brand_name", label: "Brand name", type: "text" },
      { key: "website", label: "Website", type: "text" },
    ]);
    expect(brand.label).toBe("Brand name");
    expect(site.label).toBe("Website");
  });

  it("still replaces machine-looking labels with the friendly category name", () => {
    const [a, b] = normalizeCampaignFields([
      { key: "hat_1", label: "hat_1", type: "image" },
      { key: "ref-2", label: "ref-2", type: "image" },
    ]);
    expect(a.label).not.toBe("hat_1");
    expect(b.label).not.toBe("ref-2");
  });
});
