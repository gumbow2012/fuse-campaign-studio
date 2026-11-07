import { describe, expect, it } from "vitest";
import { activeMention, expandMentions, toElementName, type StudioElement } from "./elements";

const marv: StudioElement = { id: "1", name: "Marv", kind: "person", urls: ["m1", "m2"] };
const sweater: StudioElement = { id: "2", name: "red_sweater", kind: "object", urls: ["s1"] };

describe("studio elements", () => {
  it("attaches element images after manual references and rewrites mentions", () => {
    const out = expandMentions("@Marv wears @red_sweater, @marv smiles. @nobody", [marv, sweater], ["ref"], 15);
    expect(out.urls).toEqual(["ref", "m1", "m2", "s1"]);
    expect(out.prompt).toBe(
      "Marv (the person shown in reference images 2, 3) wears red_sweater (the object shown in reference image 4), " +
        "Marv (the person shown in reference images 2, 3) smiles. @nobody",
    );
    expect(out.used.map((e) => e.name)).toEqual(["Marv", "red_sweater"]);
  });

  it("reuses an image already in the references and respects the cap", () => {
    const out = expandMentions("@Marv and @red_sweater", [marv, sweater], ["m2", "x"], 3);
    expect(out.urls).toEqual(["m2", "x", "m1"]);
    expect(out.dropped).toBe(1);
    expect(out.prompt).toBe("Marv (the person shown in reference images 3, 1) and red_sweater");
  });

  it("finds the mention being typed and normalizes names", () => {
    expect(activeMention("hi @Ma", 6)).toEqual({ query: "Ma", start: 3 });
    expect(activeMention("email@x", 7)).toBeNull();
    expect(toElementName(" Red Sweater! ")).toBe("Red_Sweater");
  });
});