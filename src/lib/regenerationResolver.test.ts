import { describe, expect, it } from "vitest";
import {
  assertRegenerationAccess,
  buildOutputNumberByNodeId,
  resolveRegenerationSubgraphFromGraph,
  type RegenEdge,
  type RegenNode,
  type RegenStep,
} from "../../supabase/functions/_shared/regeneration";
import { estimateTemplateCreditCost } from "../../supabase/functions/_shared/template-pricing";

// fixture: input -> imageA -> videoA (videoA is the exposed deliverable)
const nodes: RegenNode[] = [
  { id: "input", node_type: "user_input" },
  { id: "imageA", node_type: "image_gen", prompt_config: { output_exposed: false } },
  { id: "videoA", node_type: "video_gen", prompt_config: { output_exposed: true } },
];
const edges: RegenEdge[] = [
  { source_node_id: "input", target_node_id: "imageA" },
  { source_node_id: "imageA", target_node_id: "videoA" },
];
const steps: RegenStep[] = [
  { node_id: "imageA", status: "complete", output_asset_id: "asset-image" },
  { node_id: "videoA", status: "complete", output_asset_id: "asset-video" },
];

describe("TR6 regeneration resolver (dry-run)", () => {
  it("regenerating videoA re-runs only videoA and reuses upstream", () => {
    const result = resolveRegenerationSubgraphFromGraph({ nodes, edges, steps, target: { outputNumber: 1 } });

    expect(result.targetNodeId).toBe("videoA");
    expect(result.toRunNodeIds).toEqual(["videoA"]);
    expect(result.reusedNodeIds.sort()).toEqual(["imageA", "input"]);
    expect(result.staleDownstreamOutputNumbers).toEqual([]);
    expect(result.estimatedCredits).toBe(estimateTemplateCreditCost({ videoOutputs: 1 }));
  });

  it("regenerating imageA marks videoA's output number stale", () => {
    const result = resolveRegenerationSubgraphFromGraph({ nodes, edges, steps, target: { nodeId: "imageA" } });

    expect(result.toRunNodeIds).toEqual(["imageA"]);
    expect(result.reusedNodeIds).toEqual(["input"]);
    expect(result.staleDownstreamNodeIds).toEqual(["videoA"]);
    // videoA is exposed output #1
    expect(result.staleDownstreamOutputNumbers).toEqual([1]);
    expect(result.estimatedCredits).toBe(estimateTemplateCreditCost({ imageOutputs: 1 }));
  });

  it("user_input / prompt nodes never contribute cost", () => {
    const promptGraph = resolveRegenerationSubgraphFromGraph({
      nodes: [...nodes, { id: "promptA", node_type: "prompt" }],
      edges: [...edges, { source_node_id: "promptA", target_node_id: "videoA" }],
      steps,
      target: { nodeId: "videoA" },
    });
    expect(promptGraph.breakdown.imageNodes).toBe(0);
    expect(promptGraph.breakdown.videoNodes).toBe(1);
    expect(promptGraph.reusedNodeIds.sort()).toEqual(["imageA", "input", "promptA"]);
    expect(promptGraph.estimatedCredits).toBe(estimateTemplateCreditCost({ videoOutputs: 1 }));
  });

  it("missing upstream output forces that ancestor back into the to-run set", () => {
    const result = resolveRegenerationSubgraphFromGraph({
      nodes,
      edges,
      steps: [{ node_id: "videoA", status: "failed", output_asset_id: null }],
      target: { nodeId: "videoA" },
    });

    expect(result.toRunNodeIds.sort()).toEqual(["imageA", "videoA"]);
    expect(result.reusedNodeIds).toEqual(["input"]);
    expect(result.estimatedCredits).toBe(estimateTemplateCreditCost({ imageOutputs: 1, videoOutputs: 1 }));
  });

  it("numbers exposed deliverables the same way the run status does", () => {
    expect(buildOutputNumberByNodeId(nodes, steps)).toEqual({ videoA: 1 });
  });

  it("rejects an unknown target", () => {
    expect(() => resolveRegenerationSubgraphFromGraph({ nodes, edges, steps, target: { outputNumber: 9 } }))
      .toThrow(/not found/i);
  });

  it("rejects a non-owner and allows owner/admin", () => {
    expect(() => assertRegenerationAccess({ jobUserId: "owner", userId: "someone-else", roles: [] }))
      .toThrow(/Forbidden/);
    expect(assertRegenerationAccess({ jobUserId: "owner", userId: "owner", roles: [] })).toBe(true);
    expect(assertRegenerationAccess({ jobUserId: "owner", userId: "admin-user", roles: ["admin"] })).toBe(true);
  });

  it("endpoint stays read-only (no inserts / provider calls / credit charges)", async () => {
    const source = await import("fs").then((fs) =>
      fs.readFileSync("supabase/functions/regenerate-estimate/index.ts", "utf8")
    );
    expect(source).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|apply_credit_transaction|runGraphJob/);
    expect(source).toContain("dryRun: true");
  });
});
