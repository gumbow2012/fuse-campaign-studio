import { describe, expect, it } from "vitest";
import {
  MAX_TEMPLATE_BRANCHES,
  MAX_TEMPLATE_INPUTS,
  canAdvanceTemplateBuilder,
  clampTemplateBranchCount,
  clampTemplateInputCount,
  resolveTemplateBranchInputIndex,
} from "./templateBuilder";

describe("template builder rules", () => {
  it("caps user upload inputs below the old accidental 8-input path", () => {
    expect(clampTemplateInputCount(8)).toBe(MAX_TEMPLATE_INPUTS);
    expect(MAX_TEMPLATE_INPUTS).toBeLessThan(8);
  });

  it("keeps output branches independent from user upload input count", () => {
    expect(clampTemplateBranchCount(8)).toBe(MAX_TEMPLATE_BRANCHES);
    expect(clampTemplateBranchCount(3)).toBe(3);
  });

  it("requires a template name before leaving setup", () => {
    expect(canAdvanceTemplateBuilder("setup", "")).toBe(false);
    expect(canAdvanceTemplateBuilder("setup", "   ")).toBe(false);
    expect(canAdvanceTemplateBuilder("setup", "Audit Smoke")).toBe(true);
    expect(canAdvanceTemplateBuilder("branches", "")).toBe(true);
  });

  it("resolves branch source uploads by selected input slot instead of always using the first upload", () => {
    const slotIds = ["top", "bottom", "logo", "hat", "shoe"];

    expect(resolveTemplateBranchInputIndex(slotIds, "top", 0)).toBe(0);
    expect(resolveTemplateBranchInputIndex(slotIds, "bottom", 1)).toBe(1);
    expect(resolveTemplateBranchInputIndex(slotIds, "logo", 2)).toBe(2);
    expect(resolveTemplateBranchInputIndex(slotIds, "missing", 6)).toBe(1);
    expect(resolveTemplateBranchInputIndex([], "top", 0)).toBe(-1);
  });
});
