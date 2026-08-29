import { describe, expect, it } from "vitest";
import {
  assertForkOwnership,
  buildBasedOnLabel,
  buildPersonalGraph,
  defaultForkName,
  mergeForkEdits,
  resolveCustomizability,
  resolveForkEntitlement,
  sanitizePersonalGraphForClient,
} from "../../supabase/functions/_shared/template-fork";

const nodes = [
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
const edges = [
  { source_node_id: "input", target_node_id: "img", mapping_logic: { target_param: "image" } },
  { source_node_id: "img", target_node_id: "vid", mapping_logic: null },
];

describe("TR8 fork entitlement", () => {
  it("denies free/plus plans with PRO_REQUIRED", () => {
    expect(resolveForkEntitlement({ plan: "free", roles: [] })).toEqual({ allowed: false, code: "PRO_REQUIRED" });
    expect(resolveForkEntitlement({ plan: "plus", roles: [] }).code).toBe("PRO_REQUIRED");
  });

  it("allows pro/studio/team and admin/dev", () => {
    expect(resolveForkEntitlement({ plan: "pro", roles: [] }).allowed).toBe(true);
    expect(resolveForkEntitlement({ plan: "studio", roles: [] }).allowed).toBe(true);
    expect(resolveForkEntitlement({ plan: "team", roles: [] }).allowed).toBe(true);
    expect(resolveForkEntitlement({ plan: "free", roles: ["dev"] }).allowed).toBe(true);
  });
});

describe("TR8 customizability / prompt visibility", () => {
  it("blocks creator templates with allow_customer_edit=false and non-admin creator", () => {
    const result = resolveCustomizability({
      allowCustomerEdit: false,
      allowPromptVisibility: false,
      createdByRoles: ["creator"],
    });
    expect(result.customizable).toBe(false);
    expect(result.promptVisibility).toBe(false);
  });

  it("allows FUSE-owned templates (admin created_by) with prompt visibility", () => {
    const result = resolveCustomizability({
      allowCustomerEdit: false,
      allowPromptVisibility: false,
      createdByRoles: ["admin"],
    });
    expect(result.fuseOwned).toBe(true);
    expect(result.customizable).toBe(true);
    expect(result.promptVisibility).toBe(true);
  });

  it("allows opted-in creator templates without prompt visibility", () => {
    const result = resolveCustomizability({
      allowCustomerEdit: true,
      allowPromptVisibility: false,
      createdByRoles: ["creator"],
    });
    expect(result.customizable).toBe(true);
    expect(result.promptVisibility).toBe(false);
  });
});

describe("TR8 personal graph snapshot", () => {
  it("omits base prompt text when prompt visibility is false", () => {
    const graph = buildPersonalGraph({ nodes, edges, promptVisibility: false });
    const serialized = JSON.stringify(graph);
    expect(serialized).not.toContain("SECRET CREATOR PROMPT");
    expect(serialized).not.toContain("HIDDEN MOTION PROMPT");
    const img = graph.nodes.find((n) => n.id === "img")!;
    expect(img.prompt).toBeUndefined();
    expect(img.directionOverride).toBe("");
    expect(img.settings).toEqual({ model: "nano-banana-pro", aspect_ratio: "9:16" });
    expect(graph.edges).toHaveLength(2);
    expect(graph.nodes.find((n) => n.id === "input")?.directionOverride).toBeUndefined();
  });

  it("includes editable prompt text when prompt visibility is true", () => {
    const graph = buildPersonalGraph({ nodes, edges, promptVisibility: true });
    expect(graph.nodes.find((n) => n.id === "img")?.prompt).toBe("SECRET CREATOR PROMPT");
  });

  it("sanitizer strips prompts for prompt-hidden forks", () => {
    const stored = buildPersonalGraph({ nodes, edges, promptVisibility: true });
    const client = sanitizePersonalGraphForClient(stored, false)!;
    expect(JSON.stringify(client)).not.toContain("SECRET CREATOR PROMPT");
    expect(client.nodes.find((n) => n.id === "vid")?.directionOverride).toBe("");
  });
});

describe("TR8 fork ownership + labels", () => {
  it("rejects a non-owner", () => {
    expect(() => assertForkOwnership({ forkUserId: "u1", userId: "u2", roles: [] })).toThrow("Forbidden");
    expect(() => assertForkOwnership({ forkUserId: "u1", userId: "u1", roles: [] })).not.toThrow();
    expect(() => assertForkOwnership({ forkUserId: "u1", userId: "u2", roles: ["admin"] })).not.toThrow();
  });

  it("builds labels", () => {
    expect(defaultForkName("Ice 2.0")).toBe("Ice 2.0 (yours)");
    expect(buildBasedOnLabel("Ice 2.0", 3)).toBe("Based on Ice 2.0 v3");
  });
});

describe("TR9 update_fork merge whitelist", () => {
  const hidden = buildPersonalGraph({ nodes, edges, promptVisibility: false });
  const visible = buildPersonalGraph({ nodes, edges, promptVisibility: true });

  it("ignores an injected prompt on a prompt-hidden fork but saves direction + whitelisted settings", () => {
    const merged = mergeForkEdits({
      stored: hidden,
      promptVisibility: false,
      incoming: {
        nodes: [
          {
            id: "img",
            prompt: "INJECTED PROMPT",
            directionOverride: "colder lighting",
            settings: { model: "nano-banana", secret_flag: true, provider: "evil" },
          },
        ],
      },
    });
    const img = merged.nodes.find((n) => n.id === "img")!;
    expect(img.prompt).toBeUndefined();
    expect(JSON.stringify(merged)).not.toContain("INJECTED PROMPT");
    expect(img.directionOverride).toBe("colder lighting");
    expect(img.settings.model).toBe("nano-banana");
    expect(img.settings.secret_flag).toBeUndefined();
    expect(img.settings.provider).toBeUndefined();
  });

  it("saves prompt edits on a prompt-visible fork", () => {
    const merged = mergeForkEdits({
      stored: visible,
      promptVisibility: true,
      incoming: { nodes: [{ id: "img", prompt: "MY PROMPT", settings: { aspect_ratio: "16:9" } }] },
    });
    const img = merged.nodes.find((n) => n.id === "img")!;
    expect(img.prompt).toBe("MY PROMPT");
    expect(img.settings.aspect_ratio).toBe("16:9");
  });

  it("keeps topology read-only", () => {
    const merged = mergeForkEdits({
      stored: hidden,
      promptVisibility: false,
      incoming: {
        nodes: [{ id: "brand-new", node_type: "image_gen", directionOverride: "x" }],
        edges: [],
      },
    });
    expect(merged.nodes.map((n) => n.id)).toEqual(["input", "img", "vid"]);
    expect(merged.edges).toHaveLength(2);
  });

  it("ignores prompt edits on non-promptable nodes", () => {
    const merged = mergeForkEdits({
      stored: visible,
      promptVisibility: true,
      incoming: { nodes: [{ id: "input", prompt: "nope" }] },
    });
    expect(merged.nodes.find((n) => n.id === "input")?.prompt).toBeUndefined();
  });
});
