/**
 * Hat Brand Film — draft graph definition (pure). Rows for fuse_templates /
 * template_versions / nodes / edges, using fixed ids so seeding is idempotent.
 * Prompts and image routing are compiled per run from the recipe; the node
 * prompts below are only labels so a node is never mistaken for blank.
 */
import { HAT_FILM_CLIP_SECONDS, HAT_FILM_FIELDS, HAT_FILM_RECIPE_ID, HAT_FILM_SHOTS, HAT_FILM_VIBE_PLACEHOLDER } from "./hat-film-recipe.ts";

export const HAT_FILM_TEMPLATE_ID = "6a7f2c10-4b1e-4c3a-9d55-1f0e8a2b7c01";
export const HAT_FILM_VERSION_ID = "6a7f2c10-4b1e-4c3a-9d55-1f0e8a2b7c02";
export const HAT_FILM_VIDEO_MODEL = "kling-3.0-pro";
/** Production nodes.name column is character varying(100). */
export const NODE_NAME_MAX = 100;
/** Shortens at a word boundary with an ellipsis so names stay readable within `max`. */
export function fitName(text: string, max: number) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s;,·-]+$/, "")}…`;
}

/** Deterministic UUIDv4-shaped id from a stable label. */
function stableId(label: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193, h3 = 0x9e3779b9, h4 = 0x7f4a7c15;
  for (let i = 0; i < label.length; i += 1) {
    const c = label.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519);
    h3 = Math.imul(h3 ^ c, 3266489917); h4 = Math.imul(h4 ^ c, 668265263);
  }
  const hex = [h1, h2, h3, h4].map((h) => (h >>> 0).toString(16).padStart(8, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const hatFilmNodeId = (key: string) => stableId(`hat_brand_film@1:${key}`);

export function buildHatFilmGraph(versionId = HAT_FILM_VERSION_ID) {
  const nodes: Array<Record<string, any>> = [];
  const edges: Array<Record<string, any>> = [];
  const edge = (from: string, to: string, param: string, order: number) =>
    edges.push({ id: hatFilmNodeId(`edge:${from}->${to}:${param}`), version_id: versionId, source_node_id: hatFilmNodeId(from), target_node_id: hatFilmNodeId(to), mapping_logic: { target_param: param, edge_order: order }, condition_logic: null });

  HAT_FILM_FIELDS.forEach((field, index) => {
    nodes.push({
      id: hatFilmNodeId(`input:${field.key}`), version_id: versionId, node_type: "user_input", model_id: null, default_asset_id: null,
      name: field.label,
      prompt_config: {
        editor_mode: "upload", editor_slot_key: field.key, editor_label: field.label, editor_hint: field.helper,
        editor_expected: field.key === "brand_vibe" ? "prompt" : field.type,
        asset_type: field.type === "image" ? "image" : undefined,
        short_instruction: field.helper, transparency_recommended: field.key === "logo" ? true : undefined,
        required: field.required, optional: !field.required, sort_order: index + 1,
        hat_film_slot: field.key, recipe: HAT_FILM_RECIPE_ID,
        ...(field.key === "brand_vibe" ? { editor_placeholder: HAT_FILM_VIBE_PLACEHOLDER, multiline: true } : {}),
      },
    });
  });

  for (const shot of HAT_FILM_SHOTS) {
    // nodes.name is varchar(100) in production; keep every name inside it.
    const label = fitName(`${String(shot.index).padStart(2, "0")} · ${shot.content}`, NODE_NAME_MAX);
    const stillKey = `still:${shot.id}`;
    nodes.push({
      id: hatFilmNodeId(stillKey), version_id: versionId, node_type: "image_gen", model_id: null, default_asset_id: null,
      name: `${fitName(label, NODE_NAME_MAX - 8)} (still)`,
      prompt_config: {
        prompt: `Hat Brand Film ${shot.id} still — compiled at run time.`, aspect_ratio: "9:16", resolution: "2K",
        output_exposed: shot.kind === "logo_hold", hat_film_shot: shot.id, hat_film_stage: "still", recipe: HAT_FILM_RECIPE_ID,
      },
    });
    // Dependency edges: product inputs for hat shots, earlier world still for world shots, vibe for all.
    let order = 1;
    if (shot.worldFrom) edge(`still:shot_${String(shot.worldFrom).padStart(2, "0")}`, stillKey, "image_1", order++);
    for (const ref of shot.primary) if (ref !== "world") edge(`input:${ref}`, stillKey, `image_${order}`, order++);
    edge("input:brand_vibe", stillKey, "text_context", order++);

    if (shot.kind === "logo_hold") continue;
    const clipKey = `clip:${shot.id}`;
    nodes.push({
      id: hatFilmNodeId(clipKey), version_id: versionId, node_type: "video_gen", model_id: null, default_asset_id: null,
      name: label,
      prompt_config: {
        prompt: `Hat Brand Film ${shot.id} motion — compiled at run time.`, video_model: HAT_FILM_VIDEO_MODEL,
        duration: HAT_FILM_CLIP_SECONDS, aspect_ratio: "9:16", generate_audio: false,
        output_exposed: true, hat_film_shot: shot.id, hat_film_stage: "clip", recipe: HAT_FILM_RECIPE_ID,
      },
    });
    edge(stillKey, clipKey, "init_image", 1);
  }

  return {
    template: { id: HAT_FILM_TEMPLATE_ID, name: "Hat Brand Film", description: "Upload one hat from five angles plus your logo, describe your world, and get 12 shots and a 21.5-second vertical brand film." },
    version: { id: versionId, template_id: HAT_FILM_TEMPLATE_ID, version_number: 1, is_active: false, review_status: "Unreviewed" },
    nodes, edges,
  };
}
