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
});
