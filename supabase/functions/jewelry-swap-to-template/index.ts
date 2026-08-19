import "jsr:@supabase/functions-js/edge-runtime.d.ts";
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Serializes a completed Jewelry Swap run into a REAL, editable template using
 * the existing data model (fuse_templates + template_versions + nodes + edges).
 * Sibling of outfit-swap-to-template — same schema, jewelry prompts.
 */

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  logAuditEvent,
  requireBuilderUser,
} from "../_shared/supabase-admin.ts";

const MAX_INPUT_SLOTS = 9; // Seedance reference-to-video accepts up to 9 images.
const MAX_PIECES = 6;

const UNIVERSAL_JEWELRY_PROMPT =
  `Use {{SOURCE_FRAME}} (image 1) as the exact identity, pose, camera, lighting, body, skin, hair, clothing and environment reference. This is a precision jewelry replacement, not a redesign or reinterpretation.\n\n` +
  `Modify ONLY the jewelry pieces supplied through the jewelry reference inputs. Every unrelated detail from {{SOURCE_FRAME}} must be preserved exactly.\n\n` +
  `The supplied jewelry reference images are the STRICT visual authority for each piece's design. Preserve exactly: silhouette, proportions, dimensions, thickness, metal and metal color, surface finish, gemstone count, gemstone placement, gemstone size relationships, gemstone cuts, setting types, borders, prongs, bezels, channels, bail, attachment points, chain structure, engravings, lettering, logos, raised and recessed relief, and structural layers.\n\n` +
  `Do NOT redesign or simplify the jewelry. Do NOT invent, add, remove, or resize stones. Do NOT change stone shapes or randomize stone placement. Do NOT modify any jewelry that was not supplied. Round stones stay round and individually seated; baguettes keep their long rectangular orientation; marquise keep pointed ends; princess stay square; emerald cuts keep the stepped rectangular form. Preserve mosaic / reverse-mosaic setting patterns — never flatten them into generic pavé.\n\n` +
  `If a piece is a pendant only, replace only the pendant and keep the existing chain. If a chain only, replace only the chain and keep the existing pendant. If it is a pendant and chain, replace both.\n\n` +
  `Integrate each piece naturally onto the subject with physically correct scale, perspective, gravity, contact, contact shadows, reflections, occlusion and skin/clothing interaction. Respect layering: hands, hair, sleeves and clothing that were in front stay in front. Match the source lighting.\n\n` +
  `The final result must look like the EXACT original photograph, except the subject was genuinely wearing the supplied jewelry during the original shoot — a real manufactured piece, not an AI approximation. No fake glow, no random glitter, no melted or warped metal, no floating jewelry.`;

const CAD_AUTHORITY_PROMPT =
  `CAD AUTHORITY ACTIVE for the CAD-flagged reference(s). Treat the CAD as the ABSOLUTE authority for geometry: silhouette, dimensions, depth, thickness, stone count, stone layout, setting geometry, bail structure, borders, open/negative spaces and relief. Do not reinterpret the shape. Convert the CAD into a physically manufactured, manufacturable real-world piece, preserving every structural feature. If a real jewelry photo is also supplied for that piece, use it only as the material/finish/scintillation authority — geometry still comes from the CAD.`;

const UNIVERSAL_RECONSTRUCTION_PROMPT =
  `Use the supplied reference images as the strict appearance authority for the jewelry. Maintain ONE physically identical jewelry piece throughout the entire video. Do not change metal, stone count, stone placement, stone cuts, bail, chain, setting, dimensions, proportions, lettering, logos or structural design. Preserve the source subject, movement, camera, lighting, environment and timing as closely as possible. Jewelry must stay temporally consistent — no flicker, morphing, stone drift, or redesign.`;

const KLING_CLIP_PROMPT =
  `Slow realistic dolly in toward the jewelry and subject. Preserve the exact subject identity and the exact jewelry design — identical metal, gemstones, stone placement, setting geometry, chain, bail, logos and proportions. Natural subtle body movement only. Realistic independent diamond scintillation and physically plausible reflections. No jewelry morphing, no changing stone layout, no changing metal, no extra or disappearing stones, no camera orbit, no scene change.`;

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
type PieceDraft = {
  url: string;
  type?: string | null;
  label?: string | null;
  person?: string | null;
  metal?: string | null;
  stone?: string | null;
  quality?: string | null;
  cad?: boolean;
  notes?: string | null;
};

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

function readPieces(value: unknown): PieceDraft[] {
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
        metal: nullableText(record.metal),
        stone: nullableText(record.stone),
        quality: nullableText(record.quality),
        cad: record.cad === true,
        notes: nullableText(record.notes),
      };
    })
    .filter((item): item is PieceDraft => !!item)
    .slice(0, MAX_PIECES);
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
    const pieces = readPieces(body.products ?? body.pieces);
    if (!frames.length) throw new Error("At least one approved swapped frame is required");
    if (!pieces.length) throw new Error("At least one jewelry reference is required");

    const name = cleanText(body.name, `Jewelry Swap – ${new Date().toISOString().slice(0, 10)}`);
    const description = cleanText(
      body.description,
      "Reusable jewelry replacement workflow generated from Jewelry Swap.",
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

    const cadUsed = pieces.some((piece) => piece.cad === true);
    const imagePrompt = cadUsed
      ? `${UNIVERSAL_JEWELRY_PROMPT}\n\n${CAD_AUTHORITY_PROMPT}`
      : UNIVERSAL_JEWELRY_PROMPT;

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

    // --- Jewelry reference inputs (replaceable examples) ---
    const pieceNodes = pieces.map((piece, index) => {
      const id = crypto.randomUUID();
      const typeLabel = piece.type ?? "Jewelry";
      const cadSuffix = piece.cad ? " · CAD" : "";
      const label = `Jewelry Reference ${String(index + 1).padStart(2, "0")} · ${typeLabel}${cadSuffix}`;
      const slotKey = slugParam(
        `${piece.cad ? "cad" : "jewelry"}_${index + 1}_${typeLabel}`,
        `jewelry_${index + 1}`,
      );
      nodes.push({
        id,
        version_id: versionId,
        node_type: "user_input",
        model_id: null,
        prompt_config: {
          editor_mode: "upload",
          editor_slot_key: slotKey,
          editor_label: label,
          editor_expected: "image",
          sample_url: piece.url,
          sort_order: frames.length + index + 1,
          jewelry_swap_role: piece.cad ? "cad_reference" : "jewelry_reference",
          jewelry_swap_piece_type: typeLabel,
          jewelry_swap_metal: piece.metal,
          jewelry_swap_stone: piece.stone,
          jewelry_swap_quality: piece.quality,
          jewelry_swap_notes: piece.notes,
          jewelry_swap_cad: piece.cad === true,
          jewelry_swap_apply_to: piece.person ?? "Main subject",
        },
        default_asset_id: null,
        name: label,
      });
      return { id, index, slotKey };
    });

    // --- One replaceable image input slot per approved swapped frame ---
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
          editor_mode: "upload",
          editor_slot_key: `input_image_${suffix}`,
          editor_label: `Input Image ${suffix}`,
          editor_expected: "image",
          sample_url: frame.url,
          sort_order: index + 1,
          jewelry_swap_role: "source_frame",
        },
        default_asset_id: null,
        name: `Input Image ${suffix}`,
      });
      nodes.push({
        id: imageId,
        version_id: versionId,
        node_type: "image_gen",
        model_id: null,
        prompt_config: {
          prompt: imagePrompt,
          aspect_ratio: aspectRatio,
          output_exposed: true,
          jewelry_swap_role: "swap",
          jewelry_swap_cad_authority: cadUsed,
        },
        default_asset_id: null,
        name: `Nano Banana ${suffix} · Jewelry Ref ${suffix}`,
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
      // All jewelry references → the same Nano Banana node.
      pieceNodes.forEach((piece, pieceIndex) => {
        edges.push({
          id: crypto.randomUUID(),
          version_id: versionId,
          source_node_id: piece.id,
          target_node_id: imageId,
          mapping_logic: {
            target_param: `image_${pieceIndex + 2}`,
            edge_order: pieceIndex + 2,
          },
          condition_logic: null,
        });
      });

      return { inputId, imageId, index, suffix };
    });

    pieceNodes.forEach((piece, index) => {
      positions[piece.id] = {
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
        jewelry_swap_role: "reconstruction",
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
            jewelry_swap_role: "frame_animation",
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
      message: `Jewelry Swap serialized into template ${name}`,
      source: "jewelry-swap-to-template",
      templateId: template.id,
      versionId,
      metadata: {
        adminUserId: user.id,
        inputSlots: frames.length,
        jewelryReferences: pieces.length,
        cadAuthority: cadUsed,
        includeAnimation,
        nodeCount: nodes.length,
        edgeCount: edges.length,
      },
    }, admin).catch(() => null);

    return json({
      templateId: template.id,
      templateName: template.name,
      versionId,
      versionNumber: 1,
      previewUrl: template.preview_url ?? null,
      inputSlotCount: frames.length,
      productReferenceCount: pieces.length,
      klingClipCount: klingNodeIds.length,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      positions,
    });
  } catch (error) {
    const message = errorMessage(error);
    const forbidden = message === "Builder access required";
    return json({ error: message }, forbidden ? 403 : 400);
  }
});
