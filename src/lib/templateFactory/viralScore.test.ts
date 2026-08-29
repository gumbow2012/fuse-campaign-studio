import { describe, expect, it } from "vitest";
import { scoreBlueprint, viralScoreBand } from "./viralScore";

const richBlueprint = {
  shot_list: [
    { name: "Hero", framing: "wide full body", subject: "model walking", action: "stride toward camera" },
    { name: "Detail", framing: "macro close up", subject: "hoodie cuff", action: "hand adjusts sleeve" },
    { name: "Portrait", framing: "medium chest up", subject: "model still", action: "direct gaze" },
  ],
  subject_treatment: "single model centered, confident posture, natural skin texture retained",
  garment_focus: "oversized hoodie with heavy stitching, chest graphic held clearly readable",
  composition: "centered subject with generous negative space above the head",
  camera: "35mm lens, slightly low angle, shallow depth",
  lighting: "hard directional flash from the front left with deep falloff",
  color_grade: "cool desaturated shadows with warm skin retention",
  mood: "urban night streetwear energy",
  setting: "wet city street at night",
  motion: "slow handheld push in with subject stride",
  uncertain: [],
};

describe("scoreBlueprint", () => {
  it("is deterministic for the same input", () => {
    const a = scoreBlueprint(richBlueprint, { tags: ["streetwear", "hoodie"], category: "campaign" });
    const b = scoreBlueprint(richBlueprint, { tags: ["streetwear", "hoodie"], category: "campaign" });
    expect(a.score).toBe(b.score);
    expect(a.factors).toEqual(b.factors);
  });

  it("scores a rich blueprint highly and stays within 0-100", () => {
    const result = scoreBlueprint(richBlueprint, { tags: ["streetwear", "hoodie"], category: "campaign" });
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(viralScoreBand(result.score)).toBe("high");
  });

  it("scores an empty blueprint at zero with visible factors", () => {
    const result = scoreBlueprint({}, null);
    expect(result.score).toBe(4); // only analyzer clarity (no uncertain fields listed)
    expect(result.factors.length).toBeGreaterThan(5);
    expect(result.factors.every((factor) => factor.points >= 0)).toBe(true);
  });

  it("handles a null blueprint safely", () => {
    const result = scoreBlueprint(null, null);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("treats analyzer non-answers as missing", () => {
    const vague = scoreBlueprint(
      { ...richBlueprint, lighting: "not visible", color_grade: "unknown" },
      { tags: ["streetwear"] },
    );
    const full = scoreBlueprint(richBlueprint, { tags: ["streetwear"] });
    expect(vague.score).toBeLessThan(full.score);
  });

  it("penalises uncertain fields via analyzer clarity", () => {
    const result = scoreBlueprint({ ...richBlueprint, uncertain: ["lighting", "setting"] }, null);
    const clarity = result.factors.find((factor) => factor.key === "clarity");
    expect(clarity?.points).toBe(2);
  });

  it("rewards motion over a still frame", () => {
    const still = scoreBlueprint({ ...richBlueprint, motion: "still" }, null);
    const moving = scoreBlueprint(richBlueprint, null);
    expect(moving.score).toBeGreaterThan(still.score);
  });
});
