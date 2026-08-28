import { describe, it, expect } from "vitest";
import { buildReconstructionPromptV2 } from "../../supabase/functions/_shared/outfit-swap-assembly.ts";

describe("phase7", () => {
  it("legacy single subject unchanged", () => {
    const r = buildReconstructionPromptV2({
      legacyPrompt: "LEGACY",
      frameSubjects: [{ subjectId: "s1", garmentOrientation: "FRONT" }],
      garments: [{ id: "g1", url: "u", type: "hoodie" }],
      castAssignment: { s1: { topGarmentId: "g1" } },
      modelAssignment: { s1: { modelSource: "keep_original" } },
    });
    expect(r.enriched).toBe(false);
    expect(r.prompt).toBe("LEGACY");
  });
  it("multi subject enriched", () => {
    const r = buildReconstructionPromptV2({
      legacyPrompt: "LEGACY",
      frameSubjects: [{ subjectId: "s1" }, { subjectId: "s2" }],
      garments: [{ id: "g1", url: "u", type: "hoodie", label: "Fuse Hoodie", hasBackDesign: true, backUrl: "b" }],
      castAssignment: { s1: { topGarmentId: "g1" } },
      modelAssignment: { s1: { modelSource: "avatar" }, s2: { modelSource: "keep_original" } },
    });
    expect(r.enriched).toBe(true);
    expect(r.prompt).toContain("exactly 2 people");
    expect(r.prompt).toContain("rear print");
  });
});
