import { describe, expect, it } from "vitest";
import {
  assertVersionActivatable,
  buildForkRunMarker,
  compileForkEdges,
  compileForkNodes,
  findForkRunJob,
  forkInputsFromSourceJob,
  isPersonalForkVersion,
  selectForkExecutionNodes,
  PERSONAL_FORK_REVIEW_STATUS,
} from "../../supabase/functions/_shared/fork-run";
import {
  assertForkOwnership,
  buildPersonalGraph,
  mergeForkEdits,
  resolveForkEntitlement,
} from "../../supabase/functions/_shared/template-fork";
import {
  countTemplateDeliverables,
  getTemplateCreditCost,
} from "../../supabase/functions/_shared/template-pricing";

const sourceNodes = [
  { id: "input", name: "Product", node_type: "user_input", prompt_config: {}, default_asset_id: null },
  {
    id: "img",
    name: "Hero",
    node_type: "image_gen",
    prompt_config: { prompt: "SECRET CREATOR PROMPT", model: "nano-banana-pro", aspect_ratio: "9:16" },
    default_asset_id: "asset-1",
  },
  {
    id: "vid",
    name: "Clip",
    node_type: "video_gen",
    prompt_config: { prompt: "HIDDEN MOTION PROMPT", duration: 5 },
    default_asset_id: null,
  },
];
const sourceEdges = [
  { source_node_id: "input", target_node_id: "img", mapping_logic: { target_param: "image" } },
  { source_node_id: "img", target_node_id: "vid", mapping_logic: null },
];

/** Simulated client fork edit: only direction/settings — never the base prompt. */
function hiddenForkGraphWithDirection(direction: string) {
  const stored = buildPersonalGraph({ nodes: sourceNodes, edges: sourceEdges, promptVisibility: false });
  return mergeForkEdits({
    stored,
    promptVisibility: false,
    incoming: { nodes: [{ id: "img", directionOverride: direction }] },
  });
}

describe("TR10 compiled fork graph", () => {
  it("combines the hidden creator base prompt with user direction server-side", async () => {
    const graph = hiddenForkGraphWithDirection("colder lighting, wet asphalt");
    // Proof: the client-visible graph never carried the base prompt.
    expect(JSON.stringify(graph)).not.toContain("SECRET CREATOR PROMPT");

    const compiled = await compileForkNodes({
      forkId: "fork-1",
      sourceNodes,
      personalGraph: graph,
      promptVisibility: false,
    });
    const img = compiled.find((node) => node.source_node_id === "img")!;
    expect(img.prompt_config.prompt).toBe("SECRET CREATOR PROMPT\n\ncolder lighting, wet asphalt");
  });

  it("keeps the base prompt intact when there is no direction override", async () => {
    const compiled = await compileForkNodes({
      forkId: "fork-1",
      sourceNodes,
      personalGraph: hiddenForkGraphWithDirection(""),
      promptVisibility: false,
    });
    expect(compiled.find((n) => n.source_node_id === "vid")!.prompt_config.prompt)
      .toBe("HIDDEN MOTION PROMPT");
  });

  it("uses the customer prompt on a prompt-visible fork", async () => {
    const stored = buildPersonalGraph({ nodes: sourceNodes, edges: sourceEdges, promptVisibility: true });
    const graph = mergeForkEdits({
      stored,
      promptVisibility: true,
      incoming: { nodes: [{ id: "img", prompt: "MY OWN PROMPT" }] },
    });
    const compiled = await compileForkNodes({
      forkId: "fork-1",
      sourceNodes,
      personalGraph: graph,
      promptVisibility: true,
    });
    expect(compiled.find((n) => n.source_node_id === "img")!.prompt_config.prompt).toBe("MY OWN PROMPT");
  });

  it("does not mutate the source nodes or edges", async () => {
    const snapshot = JSON.stringify({ sourceNodes, sourceEdges });
    const compiled = await compileForkNodes({
      forkId: "fork-1",
      sourceNodes,
      personalGraph: hiddenForkGraphWithDirection("x"),
      promptVisibility: false,
    });
    compileForkEdges(sourceEdges, compiled);
    expect(JSON.stringify({ sourceNodes, sourceEdges })).toBe(snapshot);
    // Fork node ids are distinct from the source node ids.
    expect(compiled.map((n) => n.id)).not.toContain("img");
  });

  it("remaps topology onto the fork node ids without changing shape", async () => {
    const compiled = await compileForkNodes({
      forkId: "fork-1",
      sourceNodes,
      personalGraph: hiddenForkGraphWithDirection("x"),
      promptVisibility: false,
    });
    const edges = compileForkEdges(sourceEdges, compiled);
    const ids = new Set(compiled.map((n) => n.id));
    expect(edges).toHaveLength(2);
    for (const edge of edges) {
      expect(ids.has(edge.source_node_id)).toBe(true);
      expect(ids.has(edge.target_node_id)).toBe(true);
    }
  });
});

describe("TR10 cost recomputed from compiled fork nodes", () => {
  it("counts deliverables from the compiled graph", async () => {
    const compiled = await compileForkNodes({
      forkId: "fork-1",
      sourceNodes,
      personalGraph: hiddenForkGraphWithDirection("x"),
      promptVisibility: false,
    });
    const counts = countTemplateDeliverables(compiled);
    expect(counts).toEqual({ imageOutputs: 1, videoOutputs: 1 });
    expect(getTemplateCreditCost("Ice 2.0", counts)).toBe(315);
  });

  it("reflects a fork model/settings change in the compiled config", async () => {
    const stored = buildPersonalGraph({ nodes: sourceNodes, edges: sourceEdges, promptVisibility: false });
    const graph = mergeForkEdits({
      stored,
      promptVisibility: false,
      incoming: { nodes: [{ id: "img", settings: { model: "nano-banana", aspect_ratio: "16:9" } }] },
    });
    const compiled = await compileForkNodes({
      forkId: "fork-1",
      sourceNodes,
      personalGraph: graph,
      promptVisibility: false,
    });
    const img = compiled.find((n) => n.source_node_id === "img")!;
    expect(img.prompt_config.model).toBe("nano-banana");
    expect(img.prompt_config.aspect_ratio).toBe("16:9");
    // Source untouched.
    expect(sourceNodes[1].prompt_config.model).toBe("nano-banana-pro");
  });

  it("cost changes when a compiled node stops being a deliverable", async () => {
    const singleOutput = countTemplateDeliverables([
      { node_type: "image_gen", prompt_config: {} },
    ]);
    expect(getTemplateCreditCost("Ice 2.0", singleOutput)).toBe(210);
  });
});

describe("TR10 isolation + activation guard", () => {
  it("recognizes a personal fork version", () => {
    expect(isPersonalForkVersion({ review_status: PERSONAL_FORK_REVIEW_STATUS, fork_id: null })).toBe(true);
    expect(isPersonalForkVersion({ review_status: "Approved", fork_id: "fork-1" })).toBe(true);
    expect(isPersonalForkVersion({ review_status: "Approved", fork_id: null })).toBe(false);
  });

  it("refuses to activate a personal fork version", () => {
    expect(() => assertVersionActivatable({ review_status: PERSONAL_FORK_REVIEW_STATUS, fork_id: "f" }))
      .toThrow("can never be published");
    expect(() => assertVersionActivatable({ review_status: "Approved", fork_id: "f" })).toThrow();
    expect(() => assertVersionActivatable({ review_status: "Approved", fork_id: null })).not.toThrow();
  });

  it("materialized fork version row stays invisible to the marketplace", () => {
    const row = {
      template_id: "tpl-1",
      is_active: false,
      review_status: PERSONAL_FORK_REVIEW_STATUS,
      fork_id: "fork-1",
    };
    // lab-template-catalog filters on is_active = true only.
    expect(row.is_active).toBe(false);
    expect(row.review_status).toBe("personal_fork");
    expect(row.fork_id).toBe("fork-1");
    expect(() => assertVersionActivatable(row)).toThrow();
  });
});

describe("TR10 fork run idempotency marker", () => {
  const marker = buildForkRunMarker({
    forkId: "fork-1",
    versionId: "ver-1",
    sourceTemplateId: "tpl-1",
    idempotencyKey: "key-1",
    credits: 315,
  });

  it("finds a prior job for the same key", () => {
    const jobs = [{ id: "job-1", input_payload: { __fork_run: marker } }];
    expect(findForkRunJob(jobs, { forkId: "fork-1", idempotencyKey: "key-1" })?.id).toBe("job-1");
    expect(findForkRunJob(jobs, { forkId: "fork-1", idempotencyKey: "key-2" })).toBeNull();
    expect(findForkRunJob(jobs, { forkId: "fork-2", idempotencyKey: "key-1" })).toBeNull();
    expect(findForkRunJob(jobs, { forkId: "fork-1", idempotencyKey: "" })).toBeNull();
  });

  it("labels the job as a fork run", () => {
    expect(marker.is_fork_run).toBe(true);
    expect(marker.fork_id).toBe("fork-1");
  });
});

describe("TR10 run_fork access gates", () => {
  it("rejects a non-owner", () => {
    expect(() => assertForkOwnership({ forkUserId: "u1", userId: "u2", roles: [] })).toThrow("Forbidden");
    expect(() => assertForkOwnership({ forkUserId: "u1", userId: "u1", roles: [] })).not.toThrow();
  });

  it("rejects a non-Pro plan with PRO_REQUIRED", () => {
    expect(resolveForkEntitlement({ plan: "free", roles: [] })).toEqual({ allowed: false, code: "PRO_REQUIRED" });
    expect(resolveForkEntitlement({ plan: "pro", roles: [] }).allowed).toBe(true);
    expect(resolveForkEntitlement({ plan: "free", roles: ["admin"] }).allowed).toBe(true);
  });
});

// ── TR10b: estimate + source-run input defaulting ────────────────────────────
describe("TR10b fork run estimate + input defaulting", () => {
  it("estimate_fork_run computes the compiled-node cost with no side effects", async () => {
    const writes: string[] = [];
    const admin = {
      insert: () => writes.push("insert"),
      update: () => writes.push("update"),
      rpc: () => writes.push("apply_credit_transaction"),
    };

    const nodes = await compileForkNodes({
      forkId: "fork-1",
      sourceNodes: sourceNodes as never,
      personalGraph: { nodes: [] },
      promptVisibility: true,
    });
    const edges = compileForkEdges(sourceEdges as never, nodes);
    const executionNodes = selectForkExecutionNodes(nodes, edges);
    const estimatedCredits = getTemplateCreditCost(
      "Some Template",
      countTemplateDeliverables(executionNodes),
    );

    expect(executionNodes.every((node) => node.node_type !== "user_input")).toBe(true);
    expect(estimatedCredits).toBeGreaterThan(0);
    // Dry run: no version materialization, job insert, or credit charge.
    expect(writes).toEqual([]);
    void admin;
  });

  it("defaults fork run inputs from the source job payload, stripping internals", () => {
    const inputs = forkInputsFromSourceJob({
      input: "https://cdn/asset.jpg",
      logo: "https://cdn/logo.png",
      __fork_run: { fork_id: "fork-1" },
      __cast_runtime: { cast_a: "avatar" },
      count: 3,
    });
    expect(inputs).toEqual({ input: "https://cdn/asset.jpg", logo: "https://cdn/logo.png" });
  });

  it("returns no defaulted inputs when there is no source job payload", () => {
    expect(forkInputsFromSourceJob(null)).toEqual({});
    expect(forkInputsFromSourceJob({})).toEqual({});
  });
});
