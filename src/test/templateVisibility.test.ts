import { describe, expect, it } from "vitest";
import { canSeeTemplate, normalizeVisibility } from "../../supabase/functions/_shared/template-visibility";

describe("template visibility", () => {
  it("public templates are visible to everyone, including signed-out visitors", () => {
    expect(canSeeTemplate("public", [])).toBe(true);
    expect(canSeeTemplate(null, [])).toBe(true);
  });
  it("creators-only templates: creators, admins and devs", () => {
    expect(canSeeTemplate("creators", [])).toBe(false);
    expect(canSeeTemplate("creators", ["user"])).toBe(false);
    expect(canSeeTemplate("creators", ["user", "creator"])).toBe(true);
    expect(canSeeTemplate("creators", ["admin"])).toBe(true);
  });
  it("admins-only templates: admins and devs only", () => {
    expect(canSeeTemplate("admins", ["creator"])).toBe(false);
    expect(canSeeTemplate("admins", ["dev"])).toBe(true);
    expect(canSeeTemplate("admins", ["admin"])).toBe(true);
  });
  it("unknown values fall back to public", () => {
    expect(normalizeVisibility("secret")).toBe("public");
  });
});
