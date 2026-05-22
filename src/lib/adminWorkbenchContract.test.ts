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

  it("deletes canvas nodes without destroying historical execution steps", () => {
    const workbenchSource = readFileSync(
      resolve(process.cwd(), "supabase/functions/admin-template-workbench/index.ts"),
      "utf8",
    );
    const migrationSource = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260517022000_set_execution_steps_node_delete_null.sql"),
      "utf8",
    );

    expect(workbenchSource).toContain('.from("execution_steps")');
    expect(workbenchSource).toContain("update({ node_id: null })");
    expect(workbenchSource).toContain('.eq("node_id", nodeId)');
    expect(migrationSource).toContain("on delete set null");
  });

  it("supports template cover metadata and live unpublishing", () => {
    const workbenchSource = readFileSync(
      resolve(process.cwd(), "supabase/functions/admin-template-workbench/index.ts"),
      "utf8",
    );
    const catalogSource = readFileSync(
      resolve(process.cwd(), "supabase/functions/lab-template-catalog/index.ts"),
      "utf8",
    );
    const migrationSource = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260519013000_add_fuse_template_preview_metadata.sql"),
      "utf8",
    );

    expect(workbenchSource).toContain('"unpublish_template"');
    expect(workbenchSource).toContain("uploadTemplateCoverAsset");
    expect(workbenchSource).toContain("preview_url");
    expect(workbenchSource).toContain("preview_asset_type");
    expect(catalogSource).toContain("template?.preview_url");
    expect(catalogSource).toContain("description: template?.description ?? null");
    expect(migrationSource).toContain("add column if not exists preview_url text");
    expect(migrationSource).toContain("fuse_templates_preview_asset_type_check");
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

  it("does not execute orphan graph nodes during live template runs", () => {
    const startSource = readFileSync(
      resolve(process.cwd(), "supabase/functions/start-template-run/index.ts"),
      "utf8",
    );
    const executorSource = readFileSync(
      resolve(process.cwd(), "supabase/functions/_shared/executor.ts"),
      "utf8",
    );

    expect(startSource).toContain('from("edges")');
    expect(startSource).toContain("targetNodeIds");
    expect(startSource).toContain("skipped_orphan_execution_node_ids");
    expect(startSource).toContain("Template version has no connected execution nodes");
    expect(executorSource).toContain("incomingEdges.length > 0");
    expect(executorSource).toContain("completeOrphanExecutionStep");
    expect(executorSource).toContain("Skipped orphan execution node with no incoming edges");
  });

  it("keeps template catalog prices and output counts limited to connected execution nodes", () => {
    const catalogSource = readFileSync(
      resolve(process.cwd(), "supabase/functions/lab-template-catalog/index.ts"),
      "utf8",
    );

    expect(catalogSource).toContain('.from("edges")');
    expect(catalogSource).toContain("connectedExecutionNodeIdsByVersion");
    expect(catalogSource).toContain('node.node_type === "image_gen" && connectedExecutionNodeIds.has(node.id)');
    expect(catalogSource).toContain('node.node_type === "video_gen" && connectedExecutionNodeIds.has(node.id)');
  });

  it("splits draft creation from hidden guide image uploads", () => {
    const workbenchSource = readFileSync(
      resolve(process.cwd(), "supabase/functions/admin-template-workbench/index.ts"),
      "utf8",
    );
    const canvasSource = readFileSync(
      resolve(process.cwd(), "src/pages/TemplateCanvas.tsx"),
      "utf8",
    );

    expect(workbenchSource).toContain("const referenceDrafts = referenceAssets");
    expect(workbenchSource).toContain("const asset = draft.file?.dataUrl");
    expect(workbenchSource).toContain("branchIndex: reference.branchIndex");
    expect(canvasSource).toContain("const preparedReferences = newTemplateReferences.map");
    expect(canvasSource).toContain("file: null");
    expect(canvasSource).toContain("/functions/v1/save-template-editor");
    expect(canvasSource).toContain("Number(item.branchIndex) === reference.branchIndex");
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

  it("supports ordered incoming references in the workbench and executor", () => {
    const workbenchSource = readFileSync(
      resolve(process.cwd(), "supabase/functions/admin-template-workbench/index.ts"),
      "utf8",
    );
    const executorSource = readFileSync(
      resolve(process.cwd(), "supabase/functions/_shared/executor.ts"),
      "utf8",
    );
    const detailSource = readFileSync(
      resolve(process.cwd(), "supabase/functions/lab-template-detail/index.ts"),
      "utf8",
    );

    expect(workbenchSource).toContain('"reorder_edge"');
    expect(workbenchSource).toContain("inferEdgeTargetParam");
    expect(workbenchSource).toContain("edge_order");
    expect(executorSource).toContain("sortEdgesByExecutionOrder");
    expect(executorSource).toContain("image_urls: effectiveInputs");
    expect(detailSource).toContain("sortOrder: readEdgeOrder(edge)");
  });
});
