import type { DirectorBrief, DirectorProject, DirectorWorld } from "./types";

/**
 * Locks that carry across every campaign in a world. They are TEXT on top of the
 * master reference images, never instead of them: the images are the authority.
 */

export const DEFAULT_CHARACTER_LOCK =
  "The recurring protagonist must be EXACTLY the character in the master references: same face shape, " +
  "skin tone, eyebrows, eyes, nose, mouth, ears, afro hair volume, black fedora with black band, black " +
  "suit, black shirt and tie, thin gold chain, hand proportions and expression language. No aging or " +
  "de-aging, no skin-tone change, no hairstyle change, no beard or mustache, no new accessories, and he " +
  "is never replaced by, merged with, or turned into another character.";

export const DEFAULT_SCALE_RULE =
  "Keep his height and body proportions identical in every shot, exactly as in the master references. " +
  "When other people are in frame, the top of his hat sits at the same height relative to them as in the " +
  "references. He never shrinks, never grows, and is never drawn as a toddler or as a full-grown adult " +
  "unless the references show that.";

export const DEFAULT_STYLE_LOCK =
  "Premium cinematic stylized 3D animated-feature-film render: dimensional facial forms, soft subsurface " +
  "skin response, real fabric folds, believable materials, cinematic global illumination, volumetric " +
  "light, rich shadows, shallow depth of field when apt, expressive characters, polished movie-quality " +
  "finish. It is NOT flat comic art, anime, photography, generic CGI, or plastic toy rendering. Style " +
  "must not drift from shot to shot.";

export const DEFAULT_PRODUCT_SPEC =
  "Every product is the SAME real physical flat stand-up mylar pouch: identical dimensions, heat-sealed " +
  "top and side seams of equal width, flexible foil film with a soft glossy sheen, mild crinkles, visible " +
  "thickness at the bottom, a realistic contact shadow and environment reflections. The supplied design " +
  "is printed exactly on the FRONT: every word, the artist graphics, the flavor name, the branding, the " +
  "colors and the layout stay unchanged. Do not redraw, translate, crop, restyle or add text to it.";

export const DEFAULT_REFLECTIVE_LOOK =
  "REFLECTIVE-ENVIRONMENT TREATMENT (match the reflective reference): the scene's dominant colored light " +
  "(fire, neon, sunset, screens) must visibly reflect across the foil pouch surface, the character's skin " +
  "highlights and fabric edges. Add atmosphere that fits the place (sparks, dust, haze, rain). The pouch " +
  "shows glossy colored highlights and a believable reflection, never a flat sticker look.";

export const DEFAULT_AVOID =
  "No portals, multiverse, director's chairs, film sets, movie-studio hallways, galleries of posters, " +
  "collages, or flat posters/screens standing in for characters. No old or invented product artwork, no " +
  "extra text, no duplicate flavors, no products crowding every frame.";

export function createEmptyWorld(name = "New world"): DirectorWorld {
  return {
    name,
    characterName: "the recurring protagonist",
    characterLock: DEFAULT_CHARACTER_LOCK,
    scaleRule: DEFAULT_SCALE_RULE,
    styleLock: DEFAULT_STYLE_LOCK,
    productSpec: DEFAULT_PRODUCT_SPEC,
    reflectiveLook: DEFAULT_REFLECTIVE_LOOK,
    avoid: DEFAULT_AVOID,
    characters: [],
    styleRefs: [],
    reflectiveRefs: [],
    aspectRatio: "9:16",
    imageResolution: "2K",
    videoModel: "kling-3.0-pro",
    clipSeconds: 3,
  };
}

export function createEmptyBrief(): DirectorBrief {
  return { theme: "", notes: "", shotCount: 20 };
}

export function createEmptyProject(): DirectorProject {
  return {
    version: 1,
    world: createEmptyWorld(),
    products: [],
    brief: createEmptyBrief(),
    shots: [],
    artistMasters: {},
  };
}
