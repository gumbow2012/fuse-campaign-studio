import type { MaddenPreset } from "@/lib/madden-media/presetTypes";

/** Curated camera / framing presets for 9:16 short-form. Code-owned, not DB rows. */
export const MADDEN_CINEMATOGRAPHY_PRESETS: MaddenPreset[] = [
  {
    id: "portrait-85mm",
    name: "85mm portrait",
    description: "Tight flattering portrait with creamy background separation.",
    promptFragment:
      "shot on an 85mm lens, chest-up portrait framing, shallow depth of field, compressed features, soft background falloff",
    tags: ["portrait", "close", "shallow"],
  },
  {
    id: "wide-establishing",
    name: "Wide establishing",
    description: "Full body in context, sets the location before the detail work.",
    promptFragment:
      "wide establishing shot, 24mm lens, full body in frame with generous headroom, environment clearly readable",
    tags: ["wide", "environment", "full body"],
  },
  {
    id: "low-angle-hero",
    name: "Low-angle hero",
    description: "Camera below eye line for dominance and scale.",
    promptFragment:
      "low camera angle looking up at the subject, heroic dominant perspective, tall vertical lines, sky or ceiling visible behind",
    tags: ["hero", "low angle", "power"],
  },
  {
    id: "dutch-tilt",
    name: "Dutch tilt",
    description: "Canted horizon for tension and edge.",
    promptFragment:
      "dutch angle with the horizon canted roughly fifteen degrees, kinetic unstable composition",
    tags: ["tilt", "tension", "editorial"],
  },
  {
    id: "macro-detail",
    name: "Macro detail",
    description: "Extreme close on stitching, chain links, texture.",
    promptFragment:
      "macro detail shot, extreme close-up on material texture and hardware, razor-thin depth of field, crisp micro-contrast",
    tags: ["macro", "detail", "texture"],
  },
  {
    id: "over-the-shoulder",
    name: "Over the shoulder",
    description: "Camera behind the subject, following their eye line.",
    promptFragment:
      "over-the-shoulder framing from just behind the subject, back and shoulder in soft foreground, focus beyond them",
    tags: ["pov", "behind", "narrative"],
  },
  {
    id: "tracking-dolly",
    name: "Tracking dolly",
    description: "Smooth lateral move alongside the subject as they walk.",
    promptFragment:
      "smooth tracking dolly move traveling laterally alongside the walking subject, steady locked framing, motion-blurred background",
    tags: ["motion", "dolly", "walk"],
  },
  {
    id: "top-down-flat-lay",
    name: "Top-down flat lay",
    description: "Overhead product-style layout of garments and pieces.",
    promptFragment:
      "top-down overhead flat lay, camera perfectly perpendicular to the surface, items arranged with clean negative space",
    tags: ["flat lay", "overhead", "product"],
  },
  {
    id: "handheld-verite",
    name: "Handheld vérité",
    description: "Documentary looseness, human and unpolished.",
    promptFragment:
      "handheld documentary camera, slight natural sway and reframing, candid vérité energy",
    tags: ["handheld", "documentary", "candid"],
  },
  {
    id: "slow-push-in",
    name: "Slow push-in",
    description: "Creeping dolly toward the subject to build weight.",
    promptFragment:
      "slow deliberate dolly push-in toward the subject, framing tightening over the shot, locked horizon",
    tags: ["motion", "push", "build"],
  },
  {
    id: "orbit-arc",
    name: "Orbit arc",
    description: "Camera arcs around the subject revealing the full look.",
    promptFragment:
      "camera orbits in a smooth arc around the subject, parallax revealing the full silhouette and background",
    tags: ["motion", "orbit", "reveal"],
  },
  {
    id: "mirror-selfie",
    name: "Mirror selfie",
    description: "Phone-in-hand framing shot into a mirror.",
    promptFragment:
      "mirror selfie framing, phone held at chest height, reflection composition with the room visible behind",
    tags: ["ugc", "mirror", "social"],
  },
  {
    id: "profile-side",
    name: "Side profile",
    description: "Hard 90-degree profile for jawline and chain reads.",
    promptFragment:
      "strict side profile at ninety degrees, jawline and neckline in clean silhouette, flat background",
    tags: ["profile", "portrait", "graphic"],
  },
  {
    id: "worms-eye-ground",
    name: "Worm's-eye ground",
    description: "Camera on the deck, footwear-forward.",
    promptFragment:
      "camera placed at ground level, footwear dominant in the foreground, extreme perspective up the legs",
    tags: ["footwear", "ground", "extreme"],
  },
  {
    id: "two-shot-medium",
    name: "Medium two-shot",
    description: "Two subjects balanced in frame at waist height.",
    promptFragment:
      "medium two-shot with both subjects framed from the waist up, balanced negative space between them, 50mm lens",
    tags: ["group", "medium", "balanced"],
  },
];
