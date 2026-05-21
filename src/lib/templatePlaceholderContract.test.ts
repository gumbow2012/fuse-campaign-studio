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

  it("maps Grillz-specific input labels away from generic shirt artwork", async () => {
    const source = await studioSource();

    expect(source).toContain('face: "/template-placeholders/face.png?v=20260520"');
    expect(source).toContain('grillz: "/template-placeholders/grillz.png?v=20260520"');
    expect(source).toContain('chain: "/template-placeholders/chain.png?v=20260520"');
    expect(source).toContain('car: "/template-placeholders/car.png?v=20260520"');
    expect(source).toContain('pants: "/template-placeholders/pants.png?v=20260520"');
    expect(source).toContain('if (/(face|headshot|portrait|artist)/.test(normalized)) return "face";');
    expect(source).toContain('if (/(grill|grillz|teeth|tooth|dental)/.test(normalized)) return "grillz";');
    expect(source).toContain('if (/(chain|necklace|pendant)/.test(normalized)) return "chain";');
    expect(source).toContain('if (/(car|vehicle|auto|automotive)/.test(normalized)) return "car";');
  });

  it("offers Grillz-specific slots in the draft builder", async () => {
    const source = await canvasSource();

    expect(source).toContain('{ key: "face", label: "Face", targetParam: "face_image", expected: "image" }');
    expect(source).toContain('{ key: "grillz", label: "Grillz", targetParam: "grillz_image", expected: "image" }');
    expect(source).toContain('{ key: "chain", label: "Chain", targetParam: "chain_image", expected: "image" }');
    expect(source).toContain('{ key: "car", label: "Car", targetParam: "car_image", expected: "image" }');
  });
});
