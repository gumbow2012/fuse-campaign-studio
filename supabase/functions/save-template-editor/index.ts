import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  requireBuilderUser,
} from "../_shared/supabase-admin.ts";
import { assertVersionAccess, FORBIDDEN_TEMPLATE_MESSAGE } from "../_shared/template-scope.ts";
import { uploadTemplateReferenceAsset } from "../_shared/template-assets.ts";
import { applySourceVideoEditConfig } from "../_shared/source-video-config.ts";

const VERTICAL_VIDEO_ASPECT_RATIO = "9:16";
const MAX_VIDEO_DURATION_SECONDS = 5;
const VIDEO_MODEL_KEYS = [
  "kling-3.0-pro",
  "kling-3.0-standard",
  "kling-2.5",
  "kling-o3-pro-video-edit",
  "seedance-2.0",
  "seedance-2.0-fast",
] as const;
const DEFAULT_VIDEO_MODEL_KEY = "kling-3.0-pro";
const SEEDANCE_RESOLUTIONS = ["480p", "720p", "1080p", "4k"];
const SEEDANCE_ASPECT_RATIOS = ["9:16", "16:9", "1:1", "4:3", "3:4", "21:9"];

type Body = {
  versionId?: string;
  nodeId?: string;
  displayLabel?: string | null;
  prompt?: string | null;
  expected?: string | null;
  editorMode?: "upload" | "reference" | null;
  slotKey?: string | null;
  sampleUrl?: string | null;
  outputExposed?: boolean | null;
  required?: boolean | null;
  keepEditorMode?: boolean | null;
  detachAsset?: boolean | null;
  videoModel?: string | null;
  duration?: number | string | null;
  resolution?: string | null;
  aspectRatio?: string | null;
  generateAudio?: boolean | null;
  /** Source-video edit route only: keep the ORIGINAL soundtrack. */
  keepSourceAudio?: boolean | null;
  /** Source-video edit route only: explicit route marker. */
  videoMode?: string | null;
  /**
   * Source-video edit route only: measured facts about the attached clip.
   * The provider derives length and framing from the clip itself, so these
   * values are used for cost estimation and pre-submit validation only.
   */
  sourceVideo?: {
    duration?: number | string | null;
    width?: number | string | null;
    height?: number | string | null;
  } | null;
  referenceFile?: {
    dataUrl?: string | null;
    filename?: string | null;
  } | null;
};

function normalizeNullable(value: string | null | undefined) {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeVideoModel(value: unknown) {
  const key = typeof value === "string" ? value.trim() : "";
  return (VIDEO_MODEL_KEYS as readonly string[]).includes(key) ? key : DEFAULT_VIDEO_MODEL_KEY;
}

function clampSeedanceDuration(value: unknown) {
  const next = Number(value ?? 4);
  if (!Number.isFinite(next)) return 4;
  return Math.min(15, Math.max(4, Math.round(next)));
}

function clampKling3Duration(value: unknown) {
  const next = Number(value ?? 5);
  if (!Number.isFinite(next)) return 5;
  return Math.min(15, Math.max(3, Math.round(next)));
}

function normalizeDuration(value: unknown) {
  const next = Number(value ?? MAX_VIDEO_DURATION_SECONDS);
  return Number.isFinite(next) && next > 0
    ? Math.min(next, MAX_VIDEO_DURATION_SECONDS)
    : MAX_VIDEO_DURATION_SECONDS;
}


async function markVersionNeedsReview(
  admin: ReturnType<typeof createAdminClient>,
  versionId: string,
) {
  const { error } = await admin
    .from("template_versions")
    .update({
      review_status: "Unreviewed",
      reviewed_at: null,
      reviewed_by: null,
    })
    .eq("id", versionId)
    .eq("is_active", false);
  if (error) throw new Error(error.message);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createAdminClient();

  try {
    const access = await requireBuilderUser(req, admin);

    const body = await req.json() as Body;
    const versionId = normalizeNullable(body.versionId);
    const nodeId = normalizeNullable(body.nodeId);

    if (!versionId) throw new Error("versionId is required");
    if (!nodeId) throw new Error("nodeId is required");
    await assertVersionAccess(admin, access, versionId);

    const { data: node, error: nodeError } = await admin
      .from("nodes")
      .select("id, version_id, node_type, name, prompt_config, default_asset_id")
      .eq("id", nodeId)
      .eq("version_id", versionId)
      .single();
    if (nodeError || !node) throw new Error(nodeError?.message ?? "Node not found");

    const nextPromptConfig = {
      ...(node.prompt_config ?? {}),
    } as Record<string, unknown>;

    if ("displayLabel" in body) {
      nextPromptConfig.editor_label = normalizeNullable(body.displayLabel);
    }

    if ("prompt" in body) {
      nextPromptConfig.prompt = normalizeNullable(body.prompt);
      if (node.node_type === "prompt") nextPromptConfig.text = nextPromptConfig.prompt;
    }

    if ("expected" in body) {
      const nextExpected = normalizeNullable(body.expected);
      nextPromptConfig.editor_expected = nextExpected;
      nextPromptConfig.expected = nextExpected;
    }

    if ("editorMode" in body && node.node_type === "user_input") {
      const nextMode = body.editorMode === "upload" || body.editorMode === "reference"
        ? body.editorMode
        : null;
      nextPromptConfig.editor_mode = nextMode;
    }

    if ("slotKey" in body && node.node_type === "user_input") {
      nextPromptConfig.editor_slot_key = normalizeNullable(body.slotKey);
    }

    if ("required" in body && node.node_type === "user_input") {
      nextPromptConfig.required = typeof body.required === "boolean" ? body.required : true;
    }

    if ("sampleUrl" in body && node.node_type === "user_input") {
      nextPromptConfig.sample_url = normalizeNullable(body.sampleUrl);
    }

    if ("outputExposed" in body && (node.node_type === "image_gen" || node.node_type === "video_gen")) {
      nextPromptConfig.output_exposed = typeof body.outputExposed === "boolean" ? body.outputExposed : null;
    }

    if (node.node_type === "video_gen") {
      if ("videoModel" in body) {
        nextPromptConfig.video_model = normalizeVideoModel(body.videoModel);
      }

      const modelKey = normalizeVideoModel(nextPromptConfig.video_model);
      const isSeedance = modelKey.startsWith("seedance");
      const isKling3 = modelKey.startsWith("kling-3.0");
      const isSourceVideoEdit = modelKey === "kling-o3-pro-video-edit";

      if (isSourceVideoEdit) {
        // The route derives length and framing from the source clip, so no
        // duration / resolution / aspect / generate_audio value is stored.
        // Shared, pure helper so this behaviour is directly testable.
        const applied = applySourceVideoEditConfig(nextPromptConfig, {
          modelKey,
          keepSourceAudio: body.keepSourceAudio,
          hasKeepSourceAudio: "keepSourceAudio" in body,
          sourceVideo: body.sourceVideo,
          hasSourceVideo: "sourceVideo" in body,
        });
        for (const key of Object.keys(nextPromptConfig)) delete nextPromptConfig[key];
        Object.assign(nextPromptConfig, applied);
      } else if (isKling3) {
        nextPromptConfig.video_model = modelKey;
        nextPromptConfig.duration = "duration" in body
          ? clampKling3Duration(body.duration)
          : clampKling3Duration(nextPromptConfig.duration);

        if ("generateAudio" in body) {
          nextPromptConfig.generate_audio = body.generateAudio !== false;
        } else if (typeof nextPromptConfig.generate_audio !== "boolean") {
          nextPromptConfig.generate_audio = true;
        }

        delete nextPromptConfig.resolution;
        delete nextPromptConfig.aspect_ratio;
      } else if (isSeedance) {
        nextPromptConfig.video_model = modelKey;

        if ("duration" in body) {
          nextPromptConfig.duration = clampSeedanceDuration(body.duration);
        } else {
          nextPromptConfig.duration = clampSeedanceDuration(nextPromptConfig.duration);
        }

        if ("resolution" in body) {
          nextPromptConfig.resolution = SEEDANCE_RESOLUTIONS.includes(String(body.resolution))
            ? String(body.resolution)
            : "720p";
        } else if (!SEEDANCE_RESOLUTIONS.includes(String(nextPromptConfig.resolution))) {
          nextPromptConfig.resolution = "720p";
        }

        if ("aspectRatio" in body) {
          nextPromptConfig.aspect_ratio = SEEDANCE_ASPECT_RATIOS.includes(String(body.aspectRatio))
            ? String(body.aspectRatio)
            : VERTICAL_VIDEO_ASPECT_RATIO;
        } else if (!SEEDANCE_ASPECT_RATIOS.includes(String(nextPromptConfig.aspect_ratio))) {
          nextPromptConfig.aspect_ratio = VERTICAL_VIDEO_ASPECT_RATIO;
        }

        if ("generateAudio" in body) {
          nextPromptConfig.generate_audio = body.generateAudio !== false;
        } else if (typeof nextPromptConfig.generate_audio !== "boolean") {
          nextPromptConfig.generate_audio = true;
        }
      } else {
        // Kling (default): keep the locked vertical 5s behaviour exactly as before.
        nextPromptConfig.video_model = "kling-2.5";
        nextPromptConfig.aspect_ratio = VERTICAL_VIDEO_ASPECT_RATIO;
        nextPromptConfig.duration = normalizeDuration(nextPromptConfig.duration);
        delete nextPromptConfig.resolution;
        delete nextPromptConfig.generate_audio;
      }
    }

    let nextDefaultAssetId = node.default_asset_id;

    let uploadedAsset = null;

    if (body.referenceFile?.dataUrl) {
      if (node.node_type !== "user_input") {
        throw new Error("Reference assets can only be attached to input nodes");
      }

      const { data: version, error: versionError } = await admin
        .from("template_versions")
        .select("template_id")
        .eq("id", versionId)
        .single();
      if (versionError || !version) throw new Error(versionError?.message ?? "Version not found");

      uploadedAsset = await uploadTemplateReferenceAsset({
        admin,
        file: body.referenceFile,
        templateId: version.template_id,
        versionId,
        nodeId: node.id,
        label: normalizeNullable(body.displayLabel) ?? normalizeNullable(body.slotKey) ?? node.name,
      });

      nextDefaultAssetId = uploadedAsset.id;
      // keepEditorMode lets an authored "upload" input keep its mode while
      // carrying a default fallback asset (used by optional inputs).
      if (body.keepEditorMode !== true) {
        nextPromptConfig.editor_mode = "reference";
      }
      nextPromptConfig.weavy_exposed = false;
      delete nextPromptConfig.sample_url;
    }

    if (body.detachAsset === true) {
      delete nextPromptConfig.sample_url;
      nextPromptConfig.weavy_exposed = false;

      if (node.node_type === "user_input" && nextPromptConfig.editor_mode !== "upload") {
        nextPromptConfig.editor_mode = "reference";
      }

      nextDefaultAssetId = null;
    }

    const nodeUpdate: Record<string, unknown> = {
      prompt_config: nextPromptConfig,
      default_asset_id: nextDefaultAssetId,
    };

    // Narrowly scoped rename: on the source-clip edit route only, the chosen
    // display label also becomes the node's stored name, so execution outputs
    // stop reporting a stale model name. Every other node type keeps its name.
    if (
      node.node_type === "video_gen" &&
      nextPromptConfig.video_mode === "source_video_edit" &&
      "displayLabel" in body
    ) {
      const label = normalizeNullable(body.displayLabel);
      if (label) nodeUpdate.name = label;
    }

    const { error: updateError } = await admin
      .from("nodes")
      .update(nodeUpdate)
      .eq("id", node.id);
    if (updateError) throw new Error(updateError.message);
    await markVersionNeedsReview(admin, versionId);

    return json({
      ok: true,
      nodeId: node.id,
      versionId,
      promptConfig: nextPromptConfig,
      asset: uploadedAsset,
    });
  } catch (error) {
    const message = errorMessage(error);
    return json({ error: message }, message === FORBIDDEN_TEMPLATE_MESSAGE ? 403 : 400);
  }
});
