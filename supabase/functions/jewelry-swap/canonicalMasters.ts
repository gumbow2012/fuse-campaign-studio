/**
 * CANONICAL MASTER REFERENCE SET (§22) — prompt building, consumption side.
 *
 * A canonical master is a clean, neutral, consistent studio image of the ACTIVE
 * product, rendered from the MASTER PRODUCT LOCK (the product identity) plus a
 * neutral studio-photography instruction. Its purpose is to turn messy client
 * evidence into a clean master reference library.
 *
 * This module ONLY composes prompt text. It:
 * - never classifies the product (identity comes from the lock),
 * - contains no product-type or setting values of its own,
 * - never touches provider routing (the caller reuses the existing Nano path),
 * - never decides WHEN to generate (that is an explicit user action).
 *
 * Masters are NOT auto-trusted — validation is a later commit.
 */

import { type MasterProductLock, masterLockPromptLines } from "./masterLock.ts";
import {
  type MaterialAppearanceAuthority,
  materialAuthorityPromptLines,
} from "./materialAuthority.ts";
import {
  type ConnectedAssetModel,
  connectedAssetPromptLines,
} from "./connectedAssets.ts";
import {
  type CampaignPhotographyProfile,
  campaignPhotographyPromptLines,
} from "../_shared/campaign-photography.ts";

/** The generic camera views a master can be rendered for. */
export const CANONICAL_MASTER_VIEWS = [
  "front",
  "three_quarter",
  "side",
  "back",
  "macro_setting",
  "component",
] as const;

export type CanonicalMasterView = (typeof CANONICAL_MASTER_VIEWS)[number];

/**
 * Camera framing per view. These are generic photographic instructions — they
 * describe the CAMERA, never the product, so they stay valid for any product
 * type. WHICH views are requested is derived from the lock's topology by the
 * caller (the client planner), not hardcoded here.
 */
const VIEW_FRAMING: Record<CanonicalMasterView, { label: string; framing: string }> = {
  front: {
    label: "Front",
    framing:
      "Straight-on frontal elevation, optical axis perpendicular to the front face, product centered and fully in frame, no tilt, no rotation, no perspective drama.",
  },
  three_quarter: {
    label: "Three-quarter",
    framing:
      "Three-quarter view, product rotated roughly 35-45 degrees from frontal, slightly above the centerline, so the front face and one side plane are both readable in the same image.",
  },
  side: {
    label: "Side / profile",
    framing:
      "True side profile, optical axis parallel to the front face, showing thickness, depth stack and sidewall construction as a clean silhouette.",
  },
  back: {
    label: "Back / underside",
    framing:
      "Rear or underside elevation, straight-on, showing the back architecture and how the piece is constructed from behind.",
  },
  macro_setting: {
    label: "Macro (setting)",
    framing:
      "Macro close-up of the stone-setting construction: fill the frame with a representative region so seats, retention, metal borders and stone edges are individually legible. Sharp across the setting plane.",
  },
  component: {
    label: "Component",
    framing:
      "Isolated close-up of the named mechanical component, framed so its construction and how it joins the body are fully readable.",
  },
};

export function isCanonicalMasterView(value: unknown): value is CanonicalMasterView {
  return CANONICAL_MASTER_VIEWS.includes(String(value ?? "") as CanonicalMasterView);
}

const clean = (value: unknown, max = 120): string | null => {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return null;
  if (/^(auto|unknown|null|n\/a|none)$/i.test(text)) return null;
  return text.slice(0, max);
};

/** Human label for a master, using the caller's component name when present. */
export function canonicalMasterLabel(
  view: CanonicalMasterView,
  componentLabel?: unknown,
): string {
  const component = clean(componentLabel, 60);
  if (view === "component") return component ? `${component} (component)` : "Component";
  return VIEW_FRAMING[view].label;
}

/**
 * The canonical-master prompt: product identity from the Master Product Lock,
 * plus a neutral studio capture brief. Deliberately neutral — a master is a
 * reference plate, not a campaign image.
 */
export function buildCanonicalMasterPrompt(args: {
  view: CanonicalMasterView;
  componentLabel?: unknown;
  masterLock: MasterProductLock | null;
  materialAuthority?: MaterialAppearanceAuthority | null;
  /** CONNECTED PRODUCT SYSTEMS (§30): attachment rules for connected parts. */
  connectedAssets?: ConnectedAssetModel | null;
  /**
   * CAMPAIGN PHOTOGRAPHY PROFILE (§C4). Present ONLY for campaign plates (D5) —
   * a neutral canonical master keeps the neutral capture brief below. Camera and
   * light only; it never contributes product geometry.
   */
  campaignPhotography?: CampaignPhotographyProfile | null;
  extra?: unknown;
}): string {
  const { view } = args;
  const framing = VIEW_FRAMING[view];
  const component = clean(args.componentLabel, 60);
  const lockLines = masterLockPromptLines(args.masterLock, { compact: false });
  const materialLines = materialAuthorityPromptLines(args.materialAuthority ?? null);
  const connectedLines = connectedAssetPromptLines(args.connectedAssets ?? null);
  const photographyLines = campaignPhotographyPromptLines(args.campaignPhotography ?? null);
  const extra = clean(args.extra, 400);

  const sections: (string | null)[] = [
    "TASK — CANONICAL PRODUCT MASTER. Render one clean, neutral, technically accurate studio reference photograph of the single product defined below. This is a master reference plate for a product library: absolute physical accuracy outweighs styling.",

    `VIEW — ${canonicalMasterLabel(view, component)}. ${framing.framing}${
      component ? ` The component in question is: ${component}.` : ""
    }`,

    lockLines.length
      ? lockLines.join("\n")
      : "PRODUCT IDENTITY: reproduce the product in the supplied reference images exactly as constructed. Invent nothing.",

    // Neutral capture brief. Intentionally NOT a campaign look — the campaign
    // photography profile is a separate authority and is not applied here.
    [
      "CAPTURE — neutral product-master studio conditions:",
      "- Seamless neutral mid-grey background, no props, no hands, no models, no environment, no text, no watermark.",
      "- Even, soft, colour-neutral studio lighting; no coloured gels, no dramatic rim light, no lens flare, no bloom.",
      "- Neutral white balance; true metal colour and true stone colour, correctly exposed with highlights unclipped.",
      "- Deep depth of field: the whole product sharp edge to edge, no bokeh, no motion blur.",
      "- Product fills the frame with even margins; upright, level and uncropped.",
      "- Consistency matters: every master of this product must read as the same physical object shot in the same studio session.",
    ].join("\n"),

    materialLines.length ? materialLines.join("\n") : null,

    // CAMPAIGN look (D5 plates only): overrides the neutral capture brief for
    // camera/optics/light/environment — never for construction.
    photographyLines.length ? photographyLines.join("\n") : null,

    // CONNECTED PRODUCT SYSTEMS (§30): connected parts stay physically attached.
    connectedLines.length ? connectedLines.join("\n") : null,

    [
      "HARD RULES:",
      "- ONE product only, exactly as locked. Do not redesign, restyle, simplify, embellish, or change proportions, component count, stone counts, stone sizes, stone placement or setting construction.",
      "- Do not add branding, engraving, chains, packaging or accessories that are not part of the locked product.",
      "- Where the locked identity is silent, follow the supplied reference images rather than inventing.",
    ].join("\n"),

    extra ? `ADDITIONAL DIRECTION: ${extra}` : null,
  ];

  return sections.filter(Boolean).join("\n\n").slice(0, 12000);
}
