import type { DirectorProduct, DirectorProject, DirectorShot, DirectorWorld } from "./types";

/**
 * Compiles one shot into ONE provider request.
 *
 * Reference priority (highest first), mirrored from the production brief:
 *   1. master character references   -> identity, proportions, render style
 *   2. product / artist references   -> artwork, name, flavor (ONLY this shot's)
 *   3. style + reflective references -> lighting, camera, world quality
 *   4. the shot description          -> location, pose, action only
 * A shot description may never override identity or product artwork.
 */

export const MAX_CHARACTER_REFS = 2;
export const MAX_STYLE_REFS = 1;
export const MAX_REFLECTIVE_REFS = 1;

export interface CompiledImageRequest {
  prompt: string;
  /** Ordered image URLs. Index i is "Reference i+1" in the prompt. */
  referenceUrls: string[];
  /** Same order as referenceUrls, for the UI. */
  referenceLabels: string[];
}

function productLine(product: DirectorProduct): string {
  const parts = [product.flavor && `flavor "${product.flavor}"`, product.artist && `artist ${product.artist}`, product.collab && `collab ${product.collab}`].filter(Boolean);
  return `${product.name}${parts.length ? ` (${parts.join(", ")})` : ""}`;
}

export function compileImageRequest(shot: DirectorShot, project: DirectorProject): CompiledImageRequest {
  const { world, products, artistMasters } = project;
  const urls: string[] = [];
  const labels: string[] = [];
  const lines: string[] = [];

  const add = (url: string, label: string) => {
    urls.push(url);
    labels.push(label);
    return urls.length;
  };

  // 1. Character masters.
  const characterRefs = world.characters.slice(0, MAX_CHARACTER_REFS);
  const characterNumbers = characterRefs.map((ref) => add(ref.url, `Character master: ${ref.label || "reference"}`));

  // 2. Exactly this shot's products. Never the whole ledger.
  const shotProducts = shot.productIds
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is DirectorProduct => Boolean(p));
  const productNumbers = new Map<string, number>();
  for (const product of shotProducts) {
    productNumbers.set(product.id, add(product.imageUrl, `Product: ${product.name}`));
  }

  // Artist appearing as a separate character: use the locked master render if there is one.
  const artistNumbers: { product: DirectorProduct; ref: number; fromMaster: boolean }[] = [];
  for (const id of shot.artistProductIds) {
    const product = products.find((p) => p.id === id);
    if (!product) continue;
    const master = artistMasters[id];
    if (master) {
      artistNumbers.push({ product, ref: add(master, `Artist master: ${product.artist || product.name}`), fromMaster: true });
    } else if (productNumbers.has(id)) {
      artistNumbers.push({ product, ref: productNumbers.get(id)!, fromMaster: false });
    } else {
      artistNumbers.push({ product, ref: add(product.imageUrl, `Artist identity: ${product.artist || product.name}`), fromMaster: false });
    }
  }

  // 3. Style + reflective.
  const styleNumbers = world.styleRefs.slice(0, MAX_STYLE_REFS).map((ref) => add(ref.url, `Style: ${ref.label || "approved frame"}`));
  const reflectiveNumbers = shot.reflective
    ? world.reflectiveRefs.slice(0, MAX_REFLECTIVE_REFS).map((ref) => add(ref.url, `Reflective look: ${ref.label || "reference"}`))
    : [];

  const refList = (nums: number[]) => nums.map((n) => `Reference ${n}`).join(" and ");

  lines.push(
    `One single frozen cinematic moment, ${world.aspectRatio} frame. ${world.styleLock}`,
  );

  if (characterNumbers.length) {
    lines.push(
      `${refList(characterNumbers)} are the MASTER REFERENCES of ${world.characterName}. ${world.characterLock} ${world.scaleRule} ` +
        `Copy the character from the references, do not invent him from text. The shot description below has no permission to change his identity.`,
    );
  } else {
    lines.push(`${world.characterName}: ${world.characterLock} ${world.scaleRule}`);
  }

  for (const product of shotProducts) {
    const n = productNumbers.get(product.id)!;
    lines.push(
      `Reference ${n} is the exact front artwork of the product "${productLine(product)}". ${world.productSpec} ` +
        `Show ONLY this design for ${product.name}; no other product artwork appears in this image.`,
    );
  }

  for (const { product, ref, fromMaster } of artistNumbers) {
    lines.push(
      fromMaster
        ? `Reference ${ref} is the approved 3D render of the artist ${product.artist || product.name}. Keep this artist's face, hair, build and style identical. They are a separate physical character from ${world.characterName}.`
        : `The artist ${product.artist || product.name} appears as a SEPARATE physical 3D character, translated from how the artist is drawn on Reference ${ref} into the same animated-film look. Not a poster, not a screen, not artwork pasted into the scene.`,
    );
  }

  if (styleNumbers.length) {
    lines.push(`${refList(styleNumbers)} shows the approved look of this world (render quality, lighting and world finish). Match it. Do not copy its characters or products.`);
  }
  if (reflectiveNumbers.length) {
    lines.push(`${refList(reflectiveNumbers)} shows the reflective-environment treatment. ${world.reflectiveLook}`);
  } else if (shot.reflective) {
    lines.push(world.reflectiveLook);
  }

  lines.push(
    `CAMERA: ${shot.camera}. SETTING: ${shot.setting}. MOMENT: ${shot.action}.` +
      (shot.supporting ? ` ALSO IN FRAME: ${shot.supporting}.` : "") +
      (shot.lighting ? ` LIGHTING: ${shot.lighting}.` : ""),
  );

  lines.push(
    "Clean anatomy, visible hands, readable faces, clear foreground and background separation, logical pose, no overlapping or fused limbs, so the frame can be animated later.",
  );
  lines.push(`AVOID: ${world.avoid}`);
  lines.push("No on-screen text except what is printed on the product artwork.");

  const prompt = shot.promptOverride.trim() ? shot.promptOverride.trim() : lines.join("\n\n");
  return { prompt, referenceUrls: urls, referenceLabels: labels };
}

export interface CompiledVideoRequest {
  prompt: string;
  imageUrl: string;
  seconds: number;
}

/**
 * ONE primary movement per clip. The still is the composition authority; the
 * model animates the existing world, never invents a new scene.
 */
export function compileVideoRequest(shot: DirectorShot, world: DirectorWorld): CompiledVideoRequest {
  const productVisible = shot.productIds.length > 0;
  const heroProduct = shot.productRole === "hero";
  const lines: string[] = [
    `One continuous ${world.clipSeconds}-second shot, no cuts. Animate exactly the world in the starting frame; do not invent a new scene.`,
    `PRIMARY MOTION (only this): ${shot.motion || "subtle natural movement"}.`,
    `${world.characterName} keeps the identical face, skin tone, hat, outfit and height from start to end.`,
  ];
  if (productVisible) {
    lines.push(
      "The product pouch is LOCKED: its printed artwork, text, colors and shape must not morph, melt, swap or change flavor. " +
        (heroProduct
          ? "Camera movement is subtle only: a slow 3 percent push-in, a tiny tilt, moving light across the foil."
          : "Keep the pouch steady in the hand."),
    );
  }
  if (shot.artistProductIds.length > 0) {
    lines.push("The artist character is alive: small performance gestures, head and body rhythm, natural movement, never frozen like a poster.");
  }
  lines.push("Cinematic stylized 3D animated-film look, steady camera, natural motion, no morphing, no added text.");
  return { prompt: lines.join(" "), imageUrl: shot.image.url, seconds: world.clipSeconds };
}

export function isShotReadyForImage(shot: DirectorShot, project: DirectorProject): string | null {
  if (project.world.characters.length === 0) return "Add at least one master character reference first.";
  if (!shot.action.trim() && !shot.promptOverride.trim()) return "This shot has no action.";
  for (const id of shot.productIds) {
    if (!project.products.some((p) => p.id === id)) return "This shot points at a product that no longer exists.";
  }
  return null;
}
