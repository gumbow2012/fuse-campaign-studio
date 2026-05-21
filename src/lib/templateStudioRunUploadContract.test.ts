import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("template run upload contract", () => {
  it("uploads images before starting app template runs", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/pages/mvp/TemplateStudioPage.tsx"),
      "utf8",
    );

    expect(source).toContain("uploadedImageInputs");
    expect(source).toContain("...uploadedImageInputs");
    expect(source).not.toContain("inputFiles,");
  });

  it("keeps admin template validation runs on the same uploaded URL path", () => {
    const canvasSource = readFileSync(
      resolve(process.cwd(), "src/pages/TemplateCanvas.tsx"),
      "utf8",
    );
    const labSource = readFileSync(
      resolve(process.cwd(), "src/pages/TemplateLab.tsx"),
      "utf8",
    );

    for (const source of [canvasSource, labSource]) {
      expect(source).toContain("uploadRunInputFile");
      expect(source).toContain("uploadedInputs");
      expect(source).not.toContain("inputFiles,");
    }
  });

  it("keeps the upload endpoint authenticated and size-limited", () => {
    const source = readFileSync(
      resolve(process.cwd(), "supabase/functions/upload-run-input/index.ts"),
      "utf8",
    );

    expect(source).toContain("requireUser(req, admin)");
    expect(source).toContain("hasValidRunnerCode(req)");
    expect(source).toContain("MAX_UPLOAD_BYTES");
    expect(source).toContain("system/run-inputs/");
    expect(source).toContain('from("fuse-assets")');
  });

  it("keeps legacy access-code lab runs on uploaded URL inputs", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/pages/PapparaziLab.tsx"),
      "utf8",
    );

    expect(source).toContain("uploadRunInputFileWithRunnerCode");
    expect(source).toContain("uploadedInputUrl");
    expect(source).not.toContain("inputFiles:");
  });
});
