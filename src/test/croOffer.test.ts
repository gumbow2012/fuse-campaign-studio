import { describe, expect, it } from "vitest";
import { campaignCapacityLine, campaignsPerMonth } from "@/lib/croOffer";

describe("plan → campaigns per month", () => {
  it("maps the three live plans", () => {
    expect(campaignsPerMonth("starter")).toBe(3);
    expect(campaignsPerMonth("pro")).toBe(19);
    expect(campaignsPerMonth("studio")).toBe(58);
  });

  it("is case and whitespace tolerant", () => {
    expect(campaignsPerMonth(" Starter ")).toBe(3);
  });

  it("returns null for unknown or missing plans", () => {
    expect(campaignsPerMonth("free")).toBeNull();
    expect(campaignsPerMonth(null)).toBeNull();
    expect(campaignsPerMonth(undefined)).toBeNull();
  });

  it("formats the capacity line", () => {
    expect(campaignCapacityLine("pro")).toBe("About 19 campaigns/month");
    expect(campaignCapacityLine("team")).toBeNull();
  });
});
