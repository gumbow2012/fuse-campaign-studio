/**
 * FT10 static tests — pure functions only. No provider calls, no credits, no generation.
 */
import { assertEquals, assertStrictEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CAST_CONFIGURATION_INVALID,
  CastConfigurationError,
  castAuditMetadata,
  resolveTemplateCast,
  validateCastSelection,
} from "./cast.ts";

type Value = { url: string; type: "image" | "video"; assetId?: string };

const makeValue = (url: string, previous: Value): Value => ({ ...previous, assetId: undefined, url });

const TARGET_NODE = "node-model";
const CAST_CONFIG = {
  supported: true,
  required: false,
  slots: [{ id: "cast_a", label: "Cast A", nodeId: TARGET_NODE, targetInputKey: "model", identityStrength: "STRONG" }],
};
const RUNTIME = {
  slotId: "cast_a",
  avatarId: "avatar-1",
  avatarImageUrl: "https://cdn/avatar-1.png",
  mode: "DIRECT_CONDITIONING" as const,
};

function baseInputs(): Array<[string, Value]> {
  return [
    ["model", { url: "https://cdn/template-model.png", type: "image", assetId: "a1" }],
    ["garment", { url: "https://cdn/garment.png", type: "image", assetId: "a2" }],
    ["logo", { url: "https://cdn/logo.png", type: "image", assetId: "a3" }],
    ["product", { url: "https://cdn/product.png", type: "image", assetId: "a4" }],
    ["environment", { url: "https://cdn/env.png", type: "image", assetId: "a5" }],
  ];
}

Deno.test("1) legacy template without cast_config → inputs identical (same instance)", () => {
  const inputs = baseInputs();
  const result = resolveTemplateCast<Value>({
    nodeId: TARGET_NODE,
    inputs,
    castConfigValue: null,
    runtime: null,
    makeValue,
  });
  assertStrictEquals(result.inputs, inputs);
  assertEquals(result.applied, null);
  assertEquals(castAuditMetadata(result.applied), {});
});

Deno.test("2) cast template + no avatar → optional passes as legacy, required throws", () => {
  assertEquals(
    validateCastSelection({
      castConfigValue: CAST_CONFIG,
      selection: {},
      avatarImages: {},
      versionNodeIds: new Set([TARGET_NODE]),
    }),
    null,
  );

  assertThrows(
    () =>
      validateCastSelection({
        castConfigValue: { ...CAST_CONFIG, required: true },
        selection: null,
        avatarImages: {},
        versionNodeIds: new Set([TARGET_NODE]),
      }),
    CastConfigurationError,
    CAST_CONFIGURATION_INVALID,
  );
});

Deno.test("3-6) cast template + avatar → ONLY the designated identity input changes", () => {
  const inputs = baseInputs();
  const before = inputs.map(([key, value]) => [key, { ...value }] as [string, Value]);
  const result = resolveTemplateCast<Value>({
    nodeId: TARGET_NODE,
    inputs,
    castConfigValue: CAST_CONFIG,
    runtime: RUNTIME,
    makeValue,
  });

  // 3) identity input replaced with the avatar reference
  assertEquals(result.inputs[0][0], "model");
  assertEquals(result.inputs[0][1].url, RUNTIME.avatarImageUrl);
  // 4/5/6) garment, logo, product and environment refs byte-for-byte unchanged
  assertEquals(result.inputs.slice(1), before.slice(1));
  // input order and arity unchanged
  assertEquals(result.inputs.map(([key]) => key), before.map(([key]) => key));
  // source array not mutated
  assertEquals(inputs[0][1].url, "https://cdn/template-model.png");
});

Deno.test("7-8) non-target nodes are untouched → no extra step, no extra provider call, cost unchanged", () => {
  const inputs = baseInputs();
  const result = resolveTemplateCast<Value>({
    nodeId: "node-other",
    inputs,
    castConfigValue: CAST_CONFIG,
    runtime: RUNTIME,
    makeValue,
  });
  assertStrictEquals(result.inputs, inputs);
  assertEquals(result.applied, null);

  // MODE A never emits an additional generation request: applying cast returns
  // the SAME number of inputs on the SAME single step.
  const applied = resolveTemplateCast<Value>({
    nodeId: TARGET_NODE,
    inputs: baseInputs(),
    castConfigValue: CAST_CONFIG,
    runtime: RUNTIME,
    makeValue,
  });
  assertEquals(applied.inputs.length, baseInputs().length);
  assertEquals(castAuditMetadata(applied.applied), {
    cast_enabled: true,
    cast_slot_id: "cast_a",
    avatar_id: "avatar-1",
    cast_mode: "DIRECT_CONDITIONING",
    target_node_id: TARGET_NODE,
  });
});

Deno.test("9) invalid target config throws before any provider submission", () => {
  // target input key not present on the node
  assertThrows(
    () =>
      resolveTemplateCast<Value>({
        nodeId: TARGET_NODE,
        inputs: [["garment", { url: "https://cdn/garment.png", type: "image" }]],
        castConfigValue: CAST_CONFIG,
        runtime: RUNTIME,
        makeValue,
      }),
    CastConfigurationError,
    CAST_CONFIGURATION_INVALID,
  );

  // target node missing from the version
  assertThrows(
    () =>
      validateCastSelection({
        castConfigValue: CAST_CONFIG,
        selection: { cast_a: "avatar-1" },
        avatarImages: { "avatar-1": "https://cdn/avatar-1.png" },
        versionNodeIds: new Set(["node-else"]),
      }),
    CastConfigurationError,
  );

  // avatar identity reference unavailable
  assertThrows(
    () =>
      validateCastSelection({
        castConfigValue: CAST_CONFIG,
        selection: { cast_a: "avatar-1" },
        avatarImages: { "avatar-1": null },
        versionNodeIds: new Set([TARGET_NODE]),
      }),
    CastConfigurationError,
  );

  // cast runtime present but template does not support cast
  assertThrows(
    () =>
      resolveTemplateCast<Value>({
        nodeId: TARGET_NODE,
        inputs: baseInputs(),
        castConfigValue: null,
        runtime: RUNTIME,
        makeValue,
      }),
    CastConfigurationError,
  );

  // selection on a non-cast template
  assertThrows(
    () =>
      validateCastSelection({
        castConfigValue: null,
        selection: { cast_a: "avatar-1" },
        avatarImages: { "avatar-1": "https://cdn/avatar-1.png" },
        versionNodeIds: new Set([TARGET_NODE]),
      }),
    CastConfigurationError,
  );
});

Deno.test("validated selection returns a persistable runtime", () => {
  const runtime = validateCastSelection({
    castConfigValue: CAST_CONFIG,
    selection: { cast_a: "avatar-1" },
    avatarImages: { "avatar-1": "https://cdn/avatar-1.png" },
    versionNodeIds: new Set([TARGET_NODE]),
  });
  assertEquals(runtime, RUNTIME);
});
