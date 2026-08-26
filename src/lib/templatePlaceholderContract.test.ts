import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("template upload placeholders", () => {
  const studioSource = () => readFile(
    resolve(process.cwd(), "src/pages/mvp/TemplateStudioPage.tsx"),
    "utf8",
  );
  const canvasSource = () => readFile(
    resolve(process.cwd(), "src/pages/TemplateCanvas.tsx"),
    "utf8",
  );

  it("ships the production placeholder assets used by upload cards", () => {
    for (const name of ["pants", "face", "grillz", "chain", "car"]) {
      expect(existsSync(resolve(process.cwd(), `public/template-placeholders/${name}.png`))).toBe(true);
    }
  });

  it("keeps placeholder artwork out of the customer builder and maps Grillz labels to a grill slot", async () => {
    const source = await studioSource();
    const sources = await readFile(resolve(process.cwd(), "src/lib/templateInputSources.ts"), "utf8");

    // The customer builder shows the real uploaded asset only — never placeholder art.
    expect(source).not.toContain("/template-placeholders/");
    // Grillz-style labels still resolve to a jewelry/grill slot, not a generic garment one.
    expect(sources).toContain("grill|grillz|jewel|chain|pendant|ring|watch|diamond");
    expect(sources).toContain('return /grill/i.test(label) ? "GRILL" : "JEWELRY";');
    expect(sources).toContain('{ kind: "library", label: "Jewelry Library" }');
  });


  it("offers Grillz-specific slots in the draft builder", async () => {
    const source = await canvasSource();

    expect(source).toContain('{ key: "face", label: "Face", targetParam: "face_image", expected: "image" }');
    expect(source).toContain('{ key: "grillz", label: "Grillz", targetParam: "grillz_image", expected: "image" }');
    expect(source).toContain('{ key: "chain", label: "Chain", targetParam: "chain_image", expected: "image" }');
    expect(source).toContain('{ key: "car", label: "Car", targetParam: "car_image", expected: "image" }');
  });
});
