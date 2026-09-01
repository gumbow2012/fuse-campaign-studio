import "jsr:@supabase/functions-js/edge-runtime.d.ts";
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Serializes a completed Outfit Swap run into a REAL, editable template using the
 * existing data model (fuse_templates + template_versions + nodes + edges).
 * No second engine: the graph it writes is exactly what the normal editor and
 * runner already understand.
 */

import { signDeepDisplayUrls } from "../_shared/asset-access.ts";
import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  logAuditEvent,
  requireBuilderUser,
} from "../_shared/supabase-admin.ts";

const MAX_INPUT_SLOTS = 9; // Seedance reference-to-video accepts up to 9 images.
const MAX_PRODUCTS = 6;

const UNIVERSAL_SWAP_PROMPT =
  `Use {{SOURCE_FRAME}} as the exact primary image. Replace ONLY the clothing categories supplied through the product reference images.\n\n` +
  `PRESERVE EXACTLY: the person's identity, face, skin tone, hair, body proportions, pose, hands, expression, camera angle, focal length, composition, perspective, background, environment, lighting, shadows, and every garment, footwear, jewelry or accessory that is not being replaced.\n\n` +
  `The product references are the strict authority for the replacement garments: design, graphics, logos, typography, colors, material, texture, fit, silhouette and construction must match them faithfully.\n\n` +
  `Conform the replacement garments to the subject's pose, perspective, lighting, fabric folds and occlusion so they sit naturally on the body.\n\n` +
  `This is a precise garment replacement, not a redesign. Do not restyle, reframe, beautify or alter anything else in the image.`;

const UNIVERSAL_RECONSTRUCTION_PROMPT =
  `Recreate the source video's subject, motion, timing, camera movement, environment and lighting as closely as the model allows, using the supplied reference images as the visual authority.\n\n` +
  `The subject wears exactly the replacement wardrobe shown in the references, consistently across every frame — logos, graphics, colors, materials and construction must stay identical throughout.\n\n` +
  `Change only the intended wardrobe. Identity, pose progression, background, lighting and camera behaviour stay faithful to the source.`;

const KLING_CLIP_PROMPT =
  `Slow cinematic dolly-in on the subject. Keep the wardrobe, identity, lighting and background exactly as in the reference image. Natural micro-motion only, no restyling.`;

function cleanText(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim() || fallback;
}

function nullableText(value: unknown) {
  const next = cleanText(value);
  return next || null;
}

function slugParam(value: string, fallback: string) {
  const next = value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return next || fallback;
}

type FrameDraft = { url: string; label?: string | null };
type ProductDraft = { url: string; type?: string | null; label?: string | null; person?: string | null };

function readFrames(value: unknown): FrameDraft[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const url = cleanText(record.url ?? item);
      return url ? { url, label: nullableText(record.label) } : null;
    })
    .filter((item): item is FrameDraft => !!item)
    .slice(0, MAX_INPUT_SLOTS);
}

function readProducts(value: unknown): ProductDraft[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const url = cleanText(record.url);
      if (!url) return null;
      return {
        url,
        type: nullableText(record.type),
        label: nullableText(record.label ?? record.name),
        person: nullableText(record.person),
      };
    })
    .filter((item): item is ProductDraft => !!item)
    .slice(0, MAX_PRODUCTS);
}

/** Clean staged layout matching the canvas coordinate space. */
const STAGE_X = { input: 80, product: 80, image: 620, video: 1180, kling: 1180 };
const ROW_GAP = 240;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createAdminClient();

  try {
    const access = await requireBuilderUser(req, admin);
    const user = access.user;
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;

    const frames = readFrames(body.frames);
    const products = readProducts(body.products);
    if (!frames.length) throw new Error("At least one approved swapped frame is required");
    if (!products.length) throw new Error("At least one product reference is required");

    const name = cleanText(body.name, `Outfit Swap – ${new Date().toISOString().slice(0, 10)}`);
    const description = cleanText(
      body.description,
      "Reusable outfit replacement workflow generated from Outfit Swap.",
    );
    const includeAnimation = body.includeAnimation === true;
    const previewUrl = nullableText(body.previewUrl) ?? frames[0].url;
    const videoModel = cleanText(body.videoModel, "seedance-2.0").startsWith("seedance")
      ? cleanText(body.videoModel, "seedance-2.0")
      : "seedance-2.0";
    const duration = Math.min(15, Math.max(4, Math.round(Number(body.duration ?? 5) || 5)));
    const resolution = ["480p", "720p", "1080p", "4k"].includes(cleanText(body.resolution))
      ? cleanText(body.resolution)
      : "1080p";
    const aspectRatio = ["9:16", "16:9", "1:1", "4:3", "3:4", "21:9"].includes(cleanText(body.aspectRatio))
      ? cleanText(body.aspectRatio)
      : "9:16";

    const { data: template, error: templateError } = await admin
      .from("fuse_templates")
      .insert({
        name,
        description,
        created_by: user.id,
        preview_url: previewUrl,
        preview_asset_type: "image",
      })
      .select("id, name, description, preview_url")
      .single();
    if (templateError || !template) throw new Error(templateError?.message ?? "Template create failed");

    const versionId = crypto.randomUUID();
    const { error: versionError } = await admin
      .from("template_versions")
      .insert({
        id: versionId,
        template_id: template.id,
        version_number: 1,
        is_active: false,
        review_status: "Unreviewed",
      });
    if (versionError) throw new Error(versionError.message);

    const nodes: Record<string, unknown>[] = [];
    const edges: Record<string, unknown>[] = [];
    const positions: Record<string, { x: number; y: number }> = {};

    // --- Persist each product image as a locked template asset ---
    const { data: productAssets, error: productAssetsError } = await admin
      .from("assets")
      .insert(
        products.map((product, index) => ({
          supabase_storage_url: product.url,
          asset_type: "image",
          metadata: {
            source: "outfit_swap_product_reference",
            templateId: template.id,
            versionId,
            productIndex: index,
            productType: product.type ?? "Product",
          },
        })),
      )
      .select("id");
    if (productAssetsError) throw new Error(productAssetsError.message);
    if (!productAssets || productAssets.length !== products.length) {
      throw new Error("Failed to persist product references");
    }
    const productAssetIds = productAssets.map((asset: { id: string }) => String(asset.id));

    // --- Product reference inputs (hidden locked references) ---
    const productNodes = products.map((product, index) => {
      const id = crypto.randomUUID();
      const typeLabel = product.type ?? "Product";
      const label = `Product Reference ${String(index + 1).padStart(2, "0")} · ${typeLabel}`;
      const slotKey = slugParam(`product_${index + 1}_${typeLabel}`, `product_${index + 1}`);
      nodes.push({
        id,
        version_id: versionId,
        node_type: "user_input",
        model_id: null,
        prompt_config: {
          editor_mode: "reference",
          locked: true,
          editor_slot_key: slotKey,
          editor_label: label,
          editor_expected: "image",
          sample_url: product.url,
          sort_order: frames.length + index + 1,
          outfit_swap_role: "product_reference",
          outfit_swap_product_type: typeLabel,
          outfit_swap_apply_to: product.person ?? "Main Subject",
        },
        default_asset_id: productAssetIds[index],
        name: label,
      });
      return { id, index, slotKey };
    });


    // --- Persist each approved swapped frame as a locked template asset ---
    const { data: frameAssets, error: frameAssetsError } = await admin
      .from("assets")
      .insert(
        frames.map((frame, index) => ({
          supabase_storage_url: frame.url,
          asset_type: "image",
          metadata: {
            source: "outfit_swap_approved_frame",
            templateId: template.id,
            versionId,
            frameIndex: index,
            label: frame.label ?? null,
          },
        })),
      )
      .select("id");
    if (frameAssetsError) throw new Error(frameAssetsError.message);
    if (!frameAssets || frameAssets.length !== frames.length) {
      throw new Error("Failed to persist approved swap frames");
    }
    const frameAssetIds = frameAssets.map((asset: { id: string }) => String(asset.id));

    // --- One HIDDEN LOCKED reference per approved swapped frame ---
    const frameNodes = frames.map((frame, index) => {
      const inputId = crypto.randomUUID();
      const imageId = crypto.randomUUID();
      const suffix = String(index + 1).padStart(2, "0");
      nodes.push({
        id: inputId,
        version_id: versionId,
        node_type: "user_input",
        model_id: null,
        prompt_config: {
          editor_mode: "reference",
          editor_label: `Approved Swap Frame ${suffix}`,
          editor_expected: "image",
          sample_url: frame.url,
          sort_order: index + 1,
          locked: true,
          outfit_swap_role: "approved_swap_reference",
        },
        default_asset_id: frameAssetIds[index],
        name: `Approved Swap Frame ${suffix}`,
      });

      nodes.push({
        id: imageId,
        version_id: versionId,
        node_type: "image_gen",
        model_id: null,
        prompt_config: {
          prompt: UNIVERSAL_SWAP_PROMPT,
          aspect_ratio: aspectRatio,
          output_exposed: true,
          outfit_swap_role: "swap",
        },
        default_asset_id: null,
        name: `Nano Banana ${suffix} · Swapped Ref ${suffix}`,
      });

      positions[inputId] = { x: STAGE_X.input, y: 80 + index * ROW_GAP };
      positions[imageId] = { x: STAGE_X.image, y: 80 + index * ROW_GAP };

      // Input slot → Nano Banana (primary image).
      edges.push({
        id: crypto.randomUUID(),
        version_id: versionId,
        source_node_id: inputId,
        target_node_id: imageId,
        mapping_logic: { target_param: "image_1", edge_order: 1 },
        condition_logic: null,
      });
      // All product references → the same Nano Banana node.
      productNodes.forEach((product, productIndex) => {
        edges.push({
          id: crypto.randomUUID(),
          version_id: versionId,
          source_node_id: product.id,
          target_node_id: imageId,
          mapping_logic: {
            target_param: `image_${productIndex + 2}`,
            edge_order: productIndex + 2,
          },
          condition_logic: null,
        });
      });

      return { inputId, imageId, index, suffix };
    });

    productNodes.forEach((product, index) => {
      positions[product.id] = {
        x: STAGE_X.product,
        y: 80 + (frames.length + index) * ROW_GAP,
      };
    });

    // --- One Seedance multi-reference node fed by every Nano Banana output ---
    const seedanceId = crypto.randomUUID();
    nodes.push({
      id: seedanceId,
      version_id: versionId,
      node_type: "video_gen",
      model_id: null,
      prompt_config: {
        prompt: UNIVERSAL_RECONSTRUCTION_PROMPT,
        video_model: videoModel,
        video_mode: "multi_reference",
        duration,
        resolution,
        aspect_ratio: aspectRatio,
        generate_audio: true,
        output_exposed: true,
        outfit_swap_role: "reconstruction",
      },
      default_asset_id: null,
      name: "Seedance 2.0 · Final Video",
    });
    positions[seedanceId] = {
      x: STAGE_X.video,
      y: 80 + Math.max(0, (frames.length - 1) / 2) * ROW_GAP,
    };
    frameNodes.forEach((frame, index) => {
      edges.push({
        id: crypto.randomUUID(),
        version_id: versionId,
        source_node_id: frame.imageId,
        target_node_id: seedanceId,
        mapping_logic: {
          target_param: index === 0 ? "start_frame_image" : `reference_image_${index + 1}`,
          edge_order: index + 1,
        },
        condition_logic: null,
      });
    });

    // --- Optional separate Kling 3.0 clip branch ---
    const klingNodeIds: string[] = [];
    if (includeAnimation) {
      frameNodes.forEach((frame, index) => {
        const klingId = crypto.randomUUID();
        klingNodeIds.push(klingId);
        nodes.push({
          id: klingId,
          version_id: versionId,
          node_type: "video_gen",
          model_id: null,
          prompt_config: {
            prompt: KLING_CLIP_PROMPT,
            video_model: "kling-3.0-pro",
            duration: 3,
            aspect_ratio: aspectRatio,
            generate_audio: false,
            output_exposed: true,
            outfit_swap_role: "frame_animation",
          },
          default_asset_id: null,
          name: `Kling 3.0 Clip ${frame.suffix}`,
        });
        positions[klingId] = {
          x: STAGE_X.kling + 560,
          y: 80 + index * ROW_GAP,
        };
        edges.push({
          id: crypto.randomUUID(),
          version_id: versionId,
          source_node_id: frame.imageId,
          target_node_id: klingId,
          mapping_logic: { target_param: "start_frame_image", edge_order: 1 },
          condition_logic: null,
        });
      });
    }

    const { error: nodesError } = await admin.from("nodes").insert(nodes);
    if (nodesError) throw new Error(nodesError.message);
    const { error: edgesError } = await admin.from("edges").insert(edges);
    if (edgesError) throw new Error(edgesError.message);

    await logAuditEvent({
      eventType: "template_created",
      message: `Outfit Swap serialized into template ${name}`,
      source: "outfit-swap-to-template",
      templateId: template.id,
      versionId,
      metadata: {
        adminUserId: user.id,
        inputSlots: frames.length,
        productReferences: products.length,
        includeAnimation,
        nodeCount: nodes.length,
        edgeCount: edges.length,
      },
    }, admin).catch(() => null);

    return json(await signDeepDisplayUrls(admin, {
      templateId: template.id,
      templateName: template.name,
      versionId,
      versionNumber: 1,
      previewUrl: template.preview_url ?? null,
      inputSlotCount: frames.length,
      productReferenceCount: products.length,
      klingClipCount: klingNodeIds.length,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      positions,
    }));
  } catch (error) {
    const message = errorMessage(error);
    const forbidden = message === "Builder access required";
    return json({ error: message }, forbidden ? 403 : 400);
  }
});
