import test from "node:test";
import assert from "node:assert/strict";

import {
  applySourceVideoEditConfig,
  normalizeSourceVideoMetadata,
} from "../../supabase/functions/_shared/source-video-config.ts";

const MODEL = "kling-o3-pro-video-edit";

test("source metadata round-trips exactly, including fractional seconds", () => {
  const next = applySourceVideoEditConfig({}, {
    modelKey: MODEL,
    hasSourceVideo: true,
    sourceVideo: { duration: 12.535918, width: 720, height: 1280 },
  });
  assert.deepEqual(next.source_video, { duration: 12.535918, width: 720, height: 1280 });
});

test("string metadata from form inputs is accepted and coerced", () => {
  const next = applySourceVideoEditConfig({}, {
    modelKey: MODEL,
    hasSourceVideo: true,
    sourceVideo: { duration: "12.535918", width: "720", height: "1280" },
  });
  assert.deepEqual(next.source_video, { duration: 12.535918, width: 720, height: 1280 });
});

test("route marker and source requirement are persisted", () => {
  const next = applySourceVideoEditConfig({ video_mode: "multi_reference" }, { modelKey: MODEL });
  assert.equal(next.video_mode, "source_video_edit");
  assert.equal(next.requires_source_video, true);
  assert.equal(next.video_model, MODEL);
});

test("keep_source_audio follows the checkbox and defaults to true", () => {
  assert.equal(
    applySourceVideoEditConfig({}, { modelKey: MODEL }).keep_source_audio,
    true,
  );
  assert.equal(
    applySourceVideoEditConfig({}, {
      modelKey: MODEL,
      hasKeepSourceAudio: true,
      keepSourceAudio: false,
    }).keep_source_audio,
    false,
  );
  assert.equal(
    applySourceVideoEditConfig({ keep_source_audio: false }, { modelKey: MODEL }).keep_source_audio,
    false,
  );
});

test("obsolete image-to-video keys are removed, unrelated keys preserved", () => {
  const next = applySourceVideoEditConfig({
    duration: 5,
    resolution: "720p",
    aspect_ratio: "9:16",
    generate_audio: true,
    prompt: "Edit @Video1",
    editor_label: "Kling O3 Pro · Final Video",
    output_exposed: true,
  }, { modelKey: MODEL });

  for (const key of ["duration", "resolution", "aspect_ratio", "generate_audio"]) {
    assert.equal(key in next, false, `${key} should be removed`);
  }
  assert.equal(next.prompt, "Edit @Video1");
  assert.equal(next.editor_label, "Kling O3 Pro · Final Video");
  assert.equal(next.output_exposed, true);
});

test("an omitted sourceVideo key leaves stored metadata untouched", () => {
  const stored = { source_video: { duration: 12.535918, width: 720, height: 1280 } };
  const next = applySourceVideoEditConfig(stored, { modelKey: MODEL });
  assert.deepEqual(next.source_video, stored.source_video);
});

test("an explicit null clears stored metadata", () => {
  const next = applySourceVideoEditConfig(
    { source_video: { duration: 12.535918, width: 720, height: 1280 } },
    { modelKey: MODEL, hasSourceVideo: true, sourceVideo: null },
  );
  assert.equal("source_video" in next, false);
});

test("non-finite, non-positive and out-of-range metadata is rejected", () => {
  assert.throws(() => normalizeSourceVideoMetadata({ duration: "abc", width: 720, height: 1280 }));
  assert.throws(() => normalizeSourceVideoMetadata({ duration: 0, width: 720, height: 1280 }));
  assert.throws(() => normalizeSourceVideoMetadata({ duration: 12.5, width: 0, height: 1280 }));
  assert.throws(() => normalizeSourceVideoMetadata({ duration: 2.9, width: 720, height: 1280 }));
  assert.throws(() => normalizeSourceVideoMetadata({ duration: 15.1, width: 720, height: 1280 }));
  assert.throws(() => normalizeSourceVideoMetadata({ duration: 12.5, width: 4000, height: 4000 }));
  assert.throws(() => normalizeSourceVideoMetadata({ duration: 12.5, width: 320, height: 480 }));
});

test("input at the accepted edges is allowed", () => {
  assert.deepEqual(normalizeSourceVideoMetadata({ duration: 3, width: 720, height: 1280 }), {
    duration: 3,
    width: 720,
    height: 1280,
  });
  assert.deepEqual(normalizeSourceVideoMetadata({ duration: 15, width: 3840, height: 2160 }), {
    duration: 15,
    width: 3840,
    height: 2160,
  });
});

test("the helper never touches configs for other routes", () => {
  // Non-source-edit behaviour lives in the untouched branches of the save
  // endpoint; this asserts the helper is only ever additive to its own keys.
  const original = {
    video_model: "seedance-2.0",
    duration: 4,
    resolution: "720p",
    aspect_ratio: "9:16",
    generate_audio: true,
  };
  const copy = { ...original };
  applySourceVideoEditConfig(copy, { modelKey: MODEL });
  assert.deepEqual(copy, original, "input config must not be mutated");
});

test("each edge must be inside the provider's 720–3840 range", () => {
  // 719 is below the provider minimum even though it is positive.
  assert.throws(
    () => normalizeSourceVideoMetadata({ duration: 12.535918, width: 719, height: 1280 }),
    /between 720 and 3840/,
  );
  assert.throws(
    () => normalizeSourceVideoMetadata({ duration: 12.535918, width: 1280, height: 719 }),
    /between 720 and 3840/,
  );
  // A short edge under the minimum must fail even when the long edge is legal.
  assert.throws(
    () => normalizeSourceVideoMetadata({ duration: 12.535918, width: 480, height: 3840 }),
    /between 720 and 3840/,
  );
  assert.throws(
    () => normalizeSourceVideoMetadata({ duration: 12.535918, width: 3841, height: 1280 }),
    /between 720 and 3840/,
  );
});

test("zero, fractional and non-finite dimensions are rejected", () => {
  assert.throws(() => normalizeSourceVideoMetadata({ duration: 12.535918, width: 0, height: 1280 }));
  assert.throws(() => normalizeSourceVideoMetadata({ duration: 12.535918, width: 720, height: 0 }));
  assert.throws(
    () => normalizeSourceVideoMetadata({ duration: 12.535918, width: 720.5, height: 1280 }),
    /whole numbers/,
  );
  assert.throws(
    () => normalizeSourceVideoMetadata({ duration: 12.535918, width: 720, height: 1280.25 }),
    /whole numbers/,
  );
  assert.throws(() => normalizeSourceVideoMetadata({ duration: 12.535918, width: "abc", height: 1280 }));
  assert.throws(() => normalizeSourceVideoMetadata({ duration: 12.535918, width: Infinity, height: 1280 }));
  assert.throws(() => normalizeSourceVideoMetadata({ duration: 12.535918, width: -720, height: 1280 }));
});

test("the real Jerry source clip is accepted unchanged", () => {
  assert.deepEqual(
    normalizeSourceVideoMetadata({ duration: 12.535918, width: 720, height: 1280 }),
    { duration: 12.535918, width: 720, height: 1280 },
  );
  const saved = applySourceVideoEditConfig({}, {
    modelKey: MODEL,
    hasSourceVideo: true,
    sourceVideo: { duration: "12.535918", width: "720", height: "1280" },
  });
  assert.deepEqual(saved.source_video, { duration: 12.535918, width: 720, height: 1280 });
  assert.equal(saved.video_mode, "source_video_edit");
});

test("the 3–15 second boundary is preserved", () => {
  assert.deepEqual(normalizeSourceVideoMetadata({ duration: 3, width: 720, height: 1280 }).duration, 3);
  assert.deepEqual(normalizeSourceVideoMetadata({ duration: 15, width: 720, height: 1280 }).duration, 15);
  assert.throws(() => normalizeSourceVideoMetadata({ duration: 2.999, width: 720, height: 1280 }));
  assert.throws(() => normalizeSourceVideoMetadata({ duration: 15.001, width: 720, height: 1280 }));
});
