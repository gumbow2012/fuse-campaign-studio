// FUSE CINEMA — preview-media batch generation (CINEMA ONLY).
//
// Purpose: produce ONE canonical-scene still per Cinema preset so PresetPreview
// (CV1/CV10) serves real media instead of the gradient fallback.
//
// RULES honoured here:
//   * NOTHING runs automatically — every action is invoked by an explicit admin
//     click in the Cinema preview batch panel.
//   * ../_shared/fal.ts is imported READ-ONLY (runImageEdit) and never modified.
//     The text-to-image base call uses the fal sync REST endpoint directly so no
//     shared helper has to change.
//   * Storage: canonical base at `system/cinema/canonical/<scene>.png`, previews
//     at `system/cinema/previews/<category>/<presetId>.png` in `fuse-assets`.
//   * Registration reuses the CV10 table `cinema_preview_assets` (shared rows,
//     user_id = null). No schema change, no other table touched.
//   * Consistency is the point: the same canonical base image is edited for
//     every preset in a scene, so ONLY the tested variable changes.

import { runImageEdit, TEXT_IMAGE_MODEL } from "../_shared/fal.ts";
import { createAdminClient, errorMessage, json } from "../_shared/supabase-admin.ts";

const BUCKET = "fuse-assets";
/** Preview URLs must outlive a browsing session by a wide margin. */
const SIGNED_URL_TTL = 60 * 60 * 24 * 365;

type CanonicalScene = "PORTRAIT" | "PRODUCT" | "ENVIRONMENT" | "JEWELRY";

const SCENE_PROMPTS: Record<CanonicalScene, string> = {
  PORTRAIT:
    "Neutral studio portrait test frame: one calm adult model, medium shot from the waist up, " +
    "centred, straight-on eye-level camera, plain mid-grey seamless backdrop, plain neutral " +
    "charcoal crew-neck top, hair pulled back, no jewellery, no props, no text. " +
    "Even soft key light, clean natural skin tones, neutral white balance, no colour grade, " +
    "sharp focus, natural depth of field. This is a reference plate: absolutely flat and neutral.",
  PRODUCT:
    "Neutral studio product test frame: one plain matte white cylindrical bottle centred on a " +
    "seamless mid-grey sweep, straight-on eye-level camera, soft even light, neutral white " +
    "balance, no branding, no text, no props. Flat neutral reference plate.",
  ENVIRONMENT:
    "Neutral environment test plate: an empty urban side street at overcast midday, straight-on " +
    "eye-level camera, no people, no vehicles, no text, neutral white balance, no colour grade. " +
    "Flat neutral reference plate.",
  JEWELRY:
    "Neutral macro test plate: one plain polished silver ring on a matte mid-grey stand, " +
    "straight-on macro camera, soft even light, neutral white balance, no text. " +
    "Flat neutral reference plate.",
};

const SCENES: CanonicalScene[] = ["PORTRAIT", "PRODUCT", "ENVIRONMENT", "JEWELRY"];

function normalizeScene(value: unknown): CanonicalScene {
  const raw = String(value ?? "PORTRAIT").trim().toUpperCase();
  return (SCENES as string[]).includes(raw) ? (raw as CanonicalScene) : "PORTRAIT";
}

function safeSegment(value: string, fallback: string) {
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 80) || fallback;
}

/* ------------------------------------------------------------------ */
/* Storage helpers                                                     */
/* ------------------------------------------------------------------ */

type AdminClient = ReturnType<typeof createAdminClient>;

async function objectExists(admin: AdminClient, path: string) {
  const slash = path.lastIndexOf("/");
  const dir = slash === -1 ? "" : path.slice(0, slash);
  const name = slash === -1 ? path : path.slice(slash + 1);
  const { data, error } = await admin.storage.from(BUCKET).list(dir, { search: name, limit: 100 });
  if (error || !data) return false;
  return data.some((entry) => entry.name === name);
}

async function signPath(admin: AdminClient, path: string) {
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? `Could not link stored preview ${path}`);
  }
  return data.signedUrl;
}

async function uploadBytes(admin: AdminClient, path: string, bytes: Uint8Array) {
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: "image/png",
    upsert: true,
  });
  if (error) throw new Error(error.message);
}

async function fetchBytes(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download generated image (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

/* ------------------------------------------------------------------ */
/* Canonical base (text-to-image, ONE per scene, reused everywhere)     */
/* ------------------------------------------------------------------ */

function canonicalPath(scene: CanonicalScene) {
  return `system/cinema/canonical/${scene.toLowerCase()}.png`;
}

async function generateCanonicalBase(prompt: string) {
  const key = Deno.env.get("FAL_API_KEY");
  if (!key) throw new Error("Missing FAL_API_KEY");
  const response = await fetch(`https://fal.run/${TEXT_IMAGE_MODEL}`, {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      aspect_ratio: "9:16",
      output_format: "png",
      resolution: "1K",
      num_images: 1,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `fal text-to-image failed (${response.status}): ${JSON.stringify(payload).slice(0, 400)}`,
    );
  }
  const data = (payload as any)?.data ?? payload;
  const url = data?.images?.[0]?.url ?? data?.image?.url;
  if (!url) throw new Error("fal text-to-image completed without an image URL");
  return String(url);
}

/** Ensures the canonical base still exists; generates it ONCE when missing. */
async function ensureCanonicalBase(scene: CanonicalScene, allowGenerate: boolean) {
  const admin = createAdminClient();
  const path = canonicalPath(scene);

  if (await objectExists(admin, path)) {
    return { scene, path, url: await signPath(admin, path), generated: false };
  }
  if (!allowGenerate) {
    return { scene, path, url: null as string | null, generated: false };
  }

  const generatedUrl = await generateCanonicalBase(SCENE_PROMPTS[scene]);
  await uploadBytes(admin, path, await fetchBytes(generatedUrl));
  return { scene, path, url: await signPath(admin, path), generated: true };
}

export async function handlePreviewBase(body: any) {
  const scene = normalizeScene(body?.scene);
  const allowGenerate = body?.generate === true;
  const base = await ensureCanonicalBase(scene, allowGenerate);
  return json({ base });
}

/* ------------------------------------------------------------------ */
/* Per-preset edit prompt                                              */
/* ------------------------------------------------------------------ */

const CATEGORY_INTENT: Record<string, string> = {
  CAMERA: "Change ONLY the camera body / sensor image character (grain, dynamic range, colour science, sharpness).",
  LENS: "Change ONLY the lens optical character (rendering, distortion, flare, bokeh shape, field curvature).",
  FOCAL_LENGTH: "Change ONLY the apparent focal length (perspective compression and facial rendering).",
  APERTURE: "Change ONLY the depth of field and bokeh from the aperture.",
  LIGHTING: "Change ONLY the lighting setup (key/fill/rim direction, quality, ratio, shadow shape).",
  COLOR: "Change ONLY the colour grade (palette, temperature, contrast, black/highlight behaviour).",
  COMPOSITION: "Change ONLY the framing and composition of the same subject in the same scene.",
  FOCUS: "Change ONLY what is in focus and how the focus falls off.",
  ATMOSPHERE: "Change ONLY the atmosphere in the air (haze, fog, smoke, rain, dust, light shafts).",
  OPTICS: "Change ONLY the optical artefacts (flare, bloom, halation, chromatic aberration, diffusion).",
  MOVEMENT: "Suggest ONLY the motion character of the camera in a single still frame.",
  CHARACTER: "Change ONLY the subject's expression, gaze and performance energy.",
  FULL: "Apply the complete look described below as one coherent image treatment.",
};

const LOCK_LINE =
  "LOCK EVERYTHING ELSE: same person, same face, same wardrobe, same backdrop, same camera " +
  "position, same framing and same crop as the input image. Do not add text, logos, watermarks, " +
  "borders, split screens or extra subjects. Output one single photographic frame.";

export function buildPresetPreviewPrompt(descriptor: {
  presetId: string;
  category: string;
  name?: string;
  presetCategory?: string;
  tags?: string[];
  detail?: string;
}) {
  const category = String(descriptor.category ?? "").toUpperCase();
  const intent = CATEGORY_INTENT[category] ?? CATEGORY_INTENT.FULL;
  const name = (descriptor.name ?? descriptor.presetId).slice(0, 120);
  const tags = (descriptor.tags ?? []).map((tag) => String(tag).slice(0, 32)).slice(0, 10);
  const lines = [
    "Edit this reference plate so it demonstrates ONE cinematography control.",
    intent,
    `Control preset: ${name}${descriptor.presetCategory ? ` (${descriptor.presetCategory})` : ""}.`,
    tags.length ? `Character keywords: ${tags.join(", ")}.` : null,
    descriptor.detail ? `Specifics: ${String(descriptor.detail).slice(0, 400)}.` : null,
    "Push the effect far enough to be obvious at thumbnail size, but keep it photographically real.",
    LOCK_LINE,
  ].filter(Boolean);
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Action: preview-generate (ONE preset per call)                      */
/* ------------------------------------------------------------------ */

export async function handlePreviewGenerate(body: any) {
  const presetId = String(body?.presetId ?? "").trim();
  const category = String(body?.category ?? "").trim().toUpperCase();
  if (!presetId) return json({ error: "presetId is required" }, 400);
  if (!category) return json({ error: "category is required" }, 400);

  const kind = String(body?.kind ?? "still").trim() || "still";
  if (kind !== "still" && kind !== "strip") {
    return json({ error: `Preview kind "${kind}" is not generated by this batch pass` }, 400);
  }

  const admin = createAdminClient();
  const scene = normalizeScene(body?.scene);

  // Resume: an already-registered preset is skipped unless force = true.
  if (body?.force !== true) {
    const { data: existing } = await admin
      .from("cinema_preview_assets")
      .select("src")
      .eq("preset_id", presetId)
      .is("user_id", null)
      .maybeSingle();
    if (existing?.src) return json({ skipped: true, presetId, src: existing.src });
  }

  const base = await ensureCanonicalBase(scene, true);
  if (!base.url) return json({ error: `Canonical ${scene} base is missing` }, 409);

  const prompt = buildPresetPreviewPrompt({
    presetId,
    category,
    name: typeof body?.name === "string" ? body.name : undefined,
    presetCategory: typeof body?.presetCategory === "string" ? body.presetCategory : undefined,
    tags: Array.isArray(body?.tags) ? body.tags : [],
    detail: typeof body?.detail === "string" ? body.detail : undefined,
  });

  const editedUrl = await runImageEdit(prompt, [base.url], "9:16", "1K");
  const path = `system/cinema/previews/${safeSegment(category, "misc")}/${
    safeSegment(presetId, "preset")
  }.png`;
  await uploadBytes(admin, path, await fetchBytes(editedUrl));
  const src = await signPath(admin, path);

  const { error } = await admin.from("cinema_preview_assets").upsert(
    {
      preset_id: presetId,
      category,
      kind,
      src,
      poster: null,
      thumb_src: null,
      sources: [{ src, type: "image/png" }],
      swatches: [],
      user_id: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "preset_id" },
  );
  if (error) throw new Error(error.message);

  return json({ presetId, category, kind, src, path, scene, baseGenerated: base.generated });
}

/* ------------------------------------------------------------------ */
/* Action: preview-inventory (which presets already have media)         */
/* ------------------------------------------------------------------ */

export async function handlePreviewInventory() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cinema_preview_assets")
    .select("preset_id,category,kind,src,updated_at")
    .is("user_id", null);
  if (error) throw new Error(error.message);

  const bases: Record<string, boolean> = {};
  for (const scene of SCENES) {
    bases[scene] = await objectExists(admin, canonicalPath(scene));
  }

  return json({ registered: data ?? [], bases });
}

export function previewErrorResponse(error: unknown) {
  return json({ error: errorMessage(error) }, 500);
}
