/**
 * FT3 — Reusable, generic upload guidance per asset type.
 *
 * Purely data. No per-template logic: everything keys off the FT2
 * `assetType` metadata with a safe generic fallback.
 */

import type { TemplateAssetType } from "@/lib/templateAssetRequirements";

export interface UploadGuideEntry {
  title: string;
  summary: string;
  /** One-liner used on empty cards when the template has no shortInstruction. */
  bestResults: string;
  good: string[];
  avoid: string[];
}

const GENERIC_GUIDE: UploadGuideEntry = {
  title: "Reference upload",
  summary: "Clean, well-lit, uncluttered references give the engine the most to work with.",
  bestResults: "Sharp, well-lit photo with the subject filling most of the frame.",
  good: [
    "Even, diffused lighting with no harsh glare",
    "Subject centred and filling most of the frame",
    "Plain or simple background",
    "Highest resolution you have (1024px+ on the short side)",
  ],
  avoid: [
    "Screenshots of screenshots or heavily compressed images",
    "Watermarks, text overlays or stickers",
    "Motion blur or very low light",
    "Multiple competing subjects in one frame",
  ],
};

export const UPLOAD_GUIDES: Partial<Record<TemplateAssetType, UploadGuideEntry>> = {
  "garment-front": {
    title: "Garment — front",
    summary: "Flat-lay or ghost-mannequin front view so the print and cut stay accurate.",
    bestResults: "Flat, straight-on front view of the garment on a plain background.",
    good: [
      "Straight-on, flat-lay or hanger shot with no perspective tilt",
      "Garment fully in frame, shoulders to hem",
      "Fabric smoothed out — no folds hiding the print",
      "Neutral background (white, grey or black)",
    ],
    avoid: [
      "Worn-on-body shots at an angle",
      "Cropped sleeves, collar or hem",
      "Strong colour casts from coloured lighting",
      "Hangers, hands or props covering the artwork",
    ],
  },
  "garment-back": {
    title: "Garment — back",
    summary: "Matching back view, shot the same way as the front.",
    bestResults: "Straight-on back view, same lighting and distance as the front shot.",
    good: [
      "Same framing, distance and lighting as the front image",
      "Back print fully visible and unobstructed",
      "Fabric flat and wrinkle-free",
    ],
    avoid: [
      "Different lighting or background than the front shot",
      "Angled or three-quarter views",
      "Folded or bunched fabric across the print",
    ],
  },
  logo: {
    title: "Logo / brand mark",
    summary: "Vector-quality mark with a transparent background composites cleanest.",
    bestResults: "High-resolution PNG with a transparent background and tight cropping.",
    good: [
      "Transparent PNG (or pure white background)",
      "Tightly cropped to the mark itself",
      "Crisp edges — exported at 1000px+ wide",
      "Single colourway per upload",
    ],
    avoid: [
      "Logos screenshotted off a website or social post",
      "JPEG artefacts or grey halos around the edges",
      "Logo sitting inside a photo or mockup",
      "Drop shadows baked into the file",
    ],
  },
  product: {
    title: "Product",
    summary: "Studio-style product shot with the item cleanly separated from the background.",
    bestResults: "Studio-lit product on a plain background, no props or hands.",
    good: [
      "Plain seamless background",
      "Whole product in frame with a little breathing room",
      "Soft, even light showing true material colour",
      "Shot at the angle you want the campaign to feature",
    ],
    avoid: [
      "Busy lifestyle backgrounds",
      "Hands, mannequins or props partly covering the product",
      "Heavy filters or colour grading",
      "Reflections of the room or photographer",
    ],
  },
  jewelry: {
    title: "Jewelry",
    summary: "Close, sharp macro references so stones, settings and metal read correctly.",
    bestResults: "Sharp macro shot with true metal colour and visible stone detail.",
    good: [
      "Macro focus — individual stones and settings visible",
      "Multiple angles if the slot accepts more than one file",
      "Neutral light so gold vs white gold reads correctly",
      "Dark or plain surface underneath",
    ],
    avoid: [
      "Phone flash blowing out the stones",
      "Heavy sparkle filters or beauty apps",
      "Distant shots where the piece is tiny in frame",
      "Mixed colour lighting (neon, LED strips)",
    ],
  },
  packaging: {
    title: "Packaging",
    summary: "Box, label or bag references with all printed faces legible.",
    bestResults: "Straight-on shot with labels and print sharp and readable.",
    good: [
      "All key printed faces readable",
      "Square-on framing to keep type undistorted",
      "Even lighting across the whole surface",
    ],
    avoid: [
      "Crushed or dented packaging",
      "Extreme angles that skew logos and type",
      "Glare across glossy laminate",
    ],
  },
  avatar: {
    title: "Person / face reference",
    summary: "Clear portrait references so identity and features stay consistent.",
    bestResults: "Well-lit, straight-on portrait with the face unobstructed.",
    good: [
      "Face fills a good portion of the frame",
      "Soft, even light on the face",
      "Neutral expression, eyes open, facing camera",
      "Nothing covering the face",
    ],
    avoid: [
      "Sunglasses, masks or heavy shadow across the face",
      "Group photos",
      "Extreme wide-angle selfie distortion",
      "Heavy beauty filters",
    ],
  },
  reference: {
    title: "Style reference",
    summary: "Mood or style references guide look and feel, not exact product detail.",
    bestResults: "A single image that clearly represents the look you want.",
    good: [
      "One clear visual idea per reference",
      "Lighting and colour mood you actually want",
      "Reasonable resolution so detail survives",
    ],
    avoid: [
      "Collages or mood boards with many competing looks",
      "Text-heavy graphics",
      "Screenshots with UI chrome visible",
    ],
  },
};

export function getUploadGuide(assetType?: TemplateAssetType | null): UploadGuideEntry {
  if (!assetType) return GENERIC_GUIDE;
  return UPLOAD_GUIDES[assetType] ?? GENERIC_GUIDE;
}
