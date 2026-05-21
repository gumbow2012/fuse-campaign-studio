import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("template studio run upload contract", () => {
  it("uploads images before starting a template run", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/pages/mvp/TemplateStudioPage.tsx"),
      "utf8",
    );

    expect(source).toContain('supabase.functions.invoke("upload-run-input"');
    expect(source).toContain("uploadedImageInputs");
    expect(source).toContain("...uploadedImageInputs");
    expect(source).not.toContain("inputFiles,");
  });

  it("keeps the upload endpoint authenticated and size-limited", () => {
    const source = readFileSync(
      resolve(process.cwd(), "supabase/functions/upload-run-input/index.ts"),
      "utf8",
    );

    expect(source).toContain("requireUser(req, admin)");
    expect(source).toContain("MAX_UPLOAD_BYTES");
    expect(source).toContain("system/run-inputs/");
    expect(source).toContain('from("fuse-assets")');
  });
});
