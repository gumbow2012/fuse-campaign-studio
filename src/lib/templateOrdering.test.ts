import { describe, expect, it } from "vitest";
import { sortTemplatesForStudio } from "./templateOrdering";

describe("template studio ordering", () => {
  it("pins Grillz first, then sorts remaining templates by highest credit cost", () => {
    const ordered = sortTemplatesForStudio([
      { name: "Amazon Guy", estimated_credits_per_run: 945 },
      { name: "Paparazzi", estimated_credits_per_run: 210 },
      { name: "GRILLZZZZ", estimated_credits_per_run: 100 },
      { name: "Raven", estimated_credits_per_run: 420 },
    ]);

    expect(ordered.map((template) => template.name)).toEqual([
      "GRILLZZZZ",
      "Amazon Guy",
      "Raven",
      "Paparazzi",
    ]);
  });

  it("keeps ordering deterministic when prices match", () => {
    const ordered = sortTemplatesForStudio([
      { name: "Zephyr", estimated_credits_per_run: 300 },
      { name: "Alpha", estimated_credits_per_run: 300 },
    ]);

    expect(ordered.map((template) => template.name)).toEqual(["Alpha", "Zephyr"]);
  });
});
