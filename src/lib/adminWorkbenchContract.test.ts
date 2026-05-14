import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin template workbench contract", () => {
  it("does not write review_status values rejected by the database constraint", () => {
    const source = readFileSync(
      resolve(process.cwd(), "supabase/functions/admin-template-workbench/index.ts"),
      "utf8",
    );

    expect(source).not.toContain('review_status: "Testing"');
    expect(source).toContain('review_status: "Unreviewed"');
  });

  it("blocks activation unless the publish gate has a completed approved run", () => {
    const source = readFileSync(
      resolve(process.cwd(), "supabase/functions/admin-template-workbench/index.ts"),
      "utf8",
    );

    expect(source).toContain("getVersionPublishGate");
    expect(source).toContain("Publish blocked");
    expect(source).toContain("template_run_admin_audits");
    expect(source).toContain('verdict", "approved"');
    expect(source).toContain("template_output_reports");
  });

  it("creates video outputs with explicit vertical aspect ratio", () => {
    const source = readFileSync(
      resolve(process.cwd(), "supabase/functions/admin-template-workbench/index.ts"),
      "utf8",
    );

    expect(source).toContain('const VERTICAL_VIDEO_ASPECT_RATIO = "9:16"');
    expect(source).toContain("aspect_ratio: VERTICAL_VIDEO_ASPECT_RATIO");
  });

  it("prices templates from the output-count credit table", () => {
    const source = readFileSync(
      resolve(process.cwd(), "supabase/functions/_shared/template-pricing.ts"),
      "utf8",
    );

    expect(source).toContain("{ maxOutputs: 1, credits: 210 }");
    expect(source).toContain("{ maxOutputs: 2, credits: 315 }");
    expect(source).toContain("{ maxOutputs: 3, credits: 420 }");
    expect(source).toContain("{ maxOutputs: 4, credits: 525 }");
    expect(source).toContain("{ maxOutputs: 5, credits: 735 }");
    expect(source).toContain("{ maxOutputs: Number.POSITIVE_INFINITY, credits: 945 }");
  });

  it("charges live template runs from counted graph deliverables", () => {
    const source = readFileSync(
      resolve(process.cwd(), "supabase/functions/start-template-run/index.ts"),
      "utf8",
    );

    expect(source).toContain("countTemplateDeliverables");
    expect(source).toContain("deliverableCounts");
    expect(source).toContain("getTemplateCreditCost(templateName, deliverableCounts)");
  });

  it("keeps frontend and webhook plan credit grants aligned", () => {
    const frontendSource = readFileSync(
      resolve(process.cwd(), "src/lib/stripe-config.ts"),
      "utf8",
    );
    const edgeSource = readFileSync(
      resolve(process.cwd(), "supabase/functions/_shared/stripe-plans.ts"),
      "utf8",
    );

    for (const credits of ["3000", "18000", "55000"]) {
      expect(frontendSource).toContain(`monthlyCredits: ${credits}`);
      expect(edgeSource).toContain(`monthlyCredits: ${credits}`);
    }
  });
});
