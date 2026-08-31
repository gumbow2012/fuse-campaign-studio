import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Check,
  ChevronDown,

  Download,
  Film,
  ImageIcon,
  Layers,
  Loader2,
  Maximize2,
  Plus,
  RefreshCw,
  Gem,
  Sparkles,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import JSZip from "jszip";

import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { IMAGE_FLAT_USD, costPreview, creditsFromUsd, resolutionMultiplier } from "@/lib/costEstimate";
import {
  createOutfitSwapFolder,
  uploadToStorage,
  uploadWithConcurrency,
} from "@/services/storageUpload";


import {
  buildMasterProductLock,
  masterLockSummary,
  masterLockVersionOf,
  rememberMasterLock,
  resolveMasterLockForVersion,
  type MasterLockRegistry,
  type MasterProductLock,
} from "@/lib/masterProductLock";

import {
  buildConnectedAssetModel,
  isConnectedAssetModelCurrent,
  type ConnectedAssetModel,
} from "@/lib/connectedAssets";
import {
  deriveMaterialAppearanceAuthority,
  materialAuthorityLabel,
  type MaterialAppearanceAuthority,
} from "@/lib/materialAuthority";
import { buildFidelityAudit, MASTER_DIMENSIONS, type FidelityAudit } from "@/lib/fidelityAudit";
import {
  analyzeCampaignPhotography,
  photographySetVersion,
  type CampaignPhotographyProfile,
} from "@/services/campaignPhotography";
import {
  type CanonicalMaster,
  type CanonicalMasterPlanEntry,
  isMasterValidated,
  planCanonicalMasterViews,
  planCanonicalComponentMasters,
  type CanonicalComponentPlanEntry,
} from "@/lib/canonicalMasterViews";
import {
  canonicalMasterPlanFromCoverage,
  missingCanonicalMasterViews,
  planShotCoverage,
  type ShotCoveragePlan,
} from "@/lib/shotCoveragePlanner";
import CanonicalMastersPanel from "@/components/jewelry/CanonicalMastersPanel";
import CampaignModePanel, {
  type JewelryWorkspaceMode,
} from "@/components/jewelry/CampaignModePanel";
import CampaignBatchPanel from "@/components/jewelry/CampaignBatchPanel";
import {
  approveCampaignBatch,
  batchBlockedReason,
  recordBatchMaster,
  startCampaignBatch,
  type CampaignBatch,
} from "@/lib/campaignBatches";
import { MatchedPairPanel } from "@/components/jewelry/MatchedPairPanel";
import {
  matchedPairBlockedReason,
  matchedPairKey,
  oppositeManufacturingStage,
  planMatchedPairSources,
  type ManufacturingStage,
  type MatchedPair,
} from "@/lib/matchedPairs";

import CampaignPhotographyPanel, {

  type PhotographyStatus,
} from "@/components/jewelry/CampaignPhotographyPanel";
import FidelityPanel from "@/components/jewelry/FidelityPanel";

import DiamondOpticsPanel from "@/components/jewelry/DiamondOpticsPanel";
import { SeedanceDirectionPanel } from "@/components/jewelry/SeedanceDirectionPanel";
import {
  promptInputFingerprint,
  type DirectorPromptRecord,
} from "@/lib/promptFingerprint";
import {
  analyzeDiamondOptics,
  previewReconstructionPrompt,
  type SeedanceDirectorPreview,
  analyzeJewelryFrames,
  analyzeJewelryIntake,
  recordJewelryTiming,
  submitWithConcurrency,
  AUTO_OPTICS_CONTROLS,
  type DiamondOpticsControls,
  type DiamondOpticsProfile,
  type JewelryIntake,
  type DetectedField,
  type ProductKnowledgeMap,
  type UserConfirmedFact,

  type JewelryVideoReferenceInput,




  animateJewelryFrame,
  callJewelrySwap,
  generateCanonicalMaster,
  generateMatchedPair,
  createTemplateFromJewelrySwap,
  listAssets,
  invalidateAssetCache,

  persistTemplateLayout,
  CAMERA_DIRECTIONS,
  MOTION_PRESETS,
  DEFAULT_MOTION_PRESET,
  ANIMATE_DURATION_OPTIONS,
  DEFAULT_ANIMATE_DURATION,

  type JewelryFrameAnalysis,
  type JewelryGeneration,
  type JewelryImageModel,
  type JewelryProjectAnalysis,
  type JewelrySwapTemplateResult,
  type LibraryAsset,
  type SwapGeneration,
  validateAgainstKnowledgeMap,

} from "@/services/jewelrySwap";

import {
  extractFrames,
  formatDuration,
  frameTimestamps,
  isVideoAsset,
  loadVideo,
  readMeta,
  readVideoFileMeta,
  type VideoMeta,
} from "@/lib/videoFrames";

import { compressImageFile } from "@/lib/imageCompress";
import { conditionAnimateInput } from "@/services/animateInput";
import ProjectPicker, { type ProjectSaveStatus } from "@/components/jewelry/ProjectPicker";
import {
  JEWELRY_PROJECT_STATE_VERSION,
  createJewelryProject,
  duplicateJewelryProject,
  listJewelryProjects,
  loadJewelryProject,
  saveJewelryProject,
  type JewelryProjectState,
  type JewelryProjectSummary,
} from "@/services/jewelryProjects";


const JEWELRY_TYPES = [
  "Pendant",
  "Chain",
  "Pendant + Chain",
  "Ring",
  "Bracelet",
  "Cuban Bracelet",
  "Tennis Bracelet",
  "Watch",
  "Earrings",
  "Stud Earrings",
  "Hoop Earrings",
  "Grillz",
  "Necklace",
  "Choker",
  "Anklet",
  "Brooch",
  "Custom Piece",
  "Other",
];

const AUTO_METAL = "Auto from reference";
const METAL_OPTIONS = [
  AUTO_METAL,
  "10K Gold",
  "14K Gold",
  "18K Gold",
  "22K Gold",
  "White Gold",
  "Yellow Gold",
  "Rose Gold",
  "Platinum",
  "Sterling Silver",
  "Stainless Steel",
  "Titanium",
  "Black Rhodium",
  "Two-Tone",
  "Three-Tone",
  "Other",
];

const AUTO_STONE = "Auto from reference";
const STONE_OPTIONS = [
  AUTO_STONE,
  "Diamond",
  "Natural Diamond",
  "Lab Diamond",
  "Moissanite",
  "CZ",
  "Ruby",
  "Sapphire",
  "Emerald",
  "Onyx",
  "Black Diamond",
  "Colored Diamond",
  "Mixed Stones",
  "Gemstone",
  "No Stones",
  "Other/Custom",
];

/** Stone body color — deliberately independent of clarity/quality. */
const AUTO_STONE_COLOR = "Auto from reference";
const STONE_COLOR_OPTIONS = [
  AUTO_STONE_COLOR,
  "Colorless D–F",
  "Near Colorless G–J",
  "White/Colorless",
  "Black",
  "Fancy Yellow",
  "Fancy Pink",
  "Fancy Blue",
  "Fancy Green",
  "Champagne",
  "Cognac",
  "Mixed Colors",
  "Custom",
];

const AUTO_QUALITY = "Auto from reference";
const QUALITY_OPTIONS = [AUTO_QUALITY, "FL/IF", "VVS", "VS", "SI", "I", "Custom"];

/** Stone-setting construction types — a piece can carry several by region. */
const AUTO_SETTING = "Auto from reference";
const SETTING_TYPE_OPTIONS = [
  AUTO_SETTING,
  // Stone-field topology terms compose with retention terms ("Galaxy Mosaic").
  "Galaxy",
  "Galaxy Mosaic",
  "Mosaic",
  "Reverse Mosaic",

  "Micro Pavé",
  "Pavé",
  "Bead Set",
  "Prong Set",
  "Shared Prong",
  "Channel Set",
  "Baguette Channel",
  "Invisible Set",
  "Bezel Set",
  "Flush/Burnish Set",
  "Cluster",
  "Tennis/Shared",
  "Mixed/Multiple",
  "Custom",
];

/** Setting regions are TYPE-aware — a bracelet has no bail, a ring has no dial. */
const TYPE_SETTING_REGIONS: Record<string, string[]> = {
  bracelet: ["Links", "Clasp", "Side Profile", "Underside", "Entire Piece", "Custom"],
  pendant: ["Main Face", "Border", "Lettering", "Bail", "Sidewall", "Back", "Custom"],
  ring: ["Center", "Halo", "Shank", "Side", "Gallery", "Custom"],
  watch: ["Bezel", "Dial", "Case", "Bracelet", "Clasp", "Custom"],
  generic: ["Entire Piece", "Custom"],
};

function settingRegionsForType(type: string | null | undefined): string[] {
  const text = String(type ?? "").toLowerCase();
  if (/bracelet|anklet/.test(text)) return TYPE_SETTING_REGIONS.bracelet;
  if (/pendant|necklace|choker|chain|charm|brooch/.test(text)) return TYPE_SETTING_REGIONS.pendant;
  if (/ring/.test(text)) return TYPE_SETTING_REGIONS.ring;
  if (/watch/.test(text)) return TYPE_SETTING_REGIONS.watch;
  return TYPE_SETTING_REGIONS.generic;
}


/**
 * A single physical piece only ever goes on ONE person, so the target is a
 * positional label ("Main subject" or left/right) — never "Everyone".
 * V1 has no real subject detection, so we never fabricate numbered people.
 */
const APPLY_TO_OPTIONS = ["Main subject", "Person on the left", "Person on the right"];
const DEFAULT_APPLY_TO = APPLY_TO_OPTIONS[0];

/**
 * Optional role label for each reference angle. The model does the matching from
 * SOURCE_FRAME + these labels — there is no external vision classifier.
 */
/** How much of the source may be replaced. Narrowest scope is the default. */
const SCOPE_OPTIONS = [
  { value: "piece", label: "Jewelry piece only" },
  { value: "piece_chain", label: "Jewelry piece + attached chain/bracelet" },
];
const DEFAULT_SCOPE = SCOPE_OPTIONS[0].value;

/** "REF_3" → index 2, as emitted by the analysis. */
function referenceIdToIndex(referenceId?: string) {
  return Number(String(referenceId ?? "").replace(/\D+/g, "")) - 1;
}

/**
 * A card is a PHYSICAL PIECE, so its name is a plain product name — never an
 * asset/render title like "Two-Tone Inverted Cuban Chain/Bracelet Render".
 */
function cleanCaseName(raw?: string | null) {
  return String(raw ?? "")
    .replace(/\.(png|jpe?g|webp|mp4|mov)$/i, "")
    .replace(/\b(render(ing)?s?|mockups?|designs?|previews?|studies?|concepts?|3d|cad|untitled|final|v\d+)\b/gi, " ")
    .replace(/[_\-]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s/,.-]+|[\s/,.-]+$/g, "")
    .slice(0, 48)
    .trim();
}



const ANGLE_ROLE_OPTIONS = [
  "",
  "Front",
  "Back",
  "Left Side",
  "Right Side",
  "3/4 Front",
  "3/4 Rear",
  "Top",
  "Bottom",
  "Bail",
  "Connector/Hinge",
  "Macro Detail",
  "CAD Front",
  "CAD Back",
  "CAD Side",
  "CAD 3/4",
  "Other",
];

/**
 * Product-TYPE-aware reference labels — the routing in the function keys off these
 * labels, so a bracelet never offers "Bail" and a ring never offers "Clasp".
 */
const TYPE_ROLE_OPTIONS: Record<string, string[]> = {
  bracelet: ["Front", "Back", "Left Side", "Right Side", "Clasp", "Link Detail", "Macro Detail", "Side Profile", "CAD Front", "CAD Back", "CAD Side", "Other"],
  pendant: ["Front", "Back", "Side", "Bail", "Connector/Hinge", "Macro Detail", "CAD Front", "CAD Back", "CAD Side", "CAD 3/4", "Other"],
  ring: ["Face/Crown", "Side", "Shank", "Under-gallery", "Setting", "Macro Detail", "CAD Front", "CAD Side", "Other"],
  watch: ["Dial", "Bezel", "Case", "Side", "Crown", "Bracelet", "Clasp", "Caseback", "Macro Detail", "CAD Front", "CAD Side", "Other"],
  earrings: ["Front", "Back", "Side", "Macro Detail", "CAD Front", "CAD Side", "Other"],
  generic: ["Front", "Back", "Side", "Macro Detail", "CAD Front", "CAD Side", "Other"],
};

/** Reference role options for a piece type (always includes the blank option). */
function roleOptionsForType(type: string | null | undefined): string[] {
  const text = String(type ?? "").toLowerCase();
  let key = "generic";
  if (/bracelet|anklet/.test(text)) key = "bracelet";
  else if (/pendant|necklace|choker|chain|charm|brooch/.test(text)) key = "pendant";
  else if (/ring/.test(text)) key = "ring";
  else if (/watch/.test(text)) key = "watch";
  else if (/earring|stud|hoop/.test(text)) key = "earrings";
  else if (/grill/.test(text)) key = "earrings";
  return ["", ...TYPE_ROLE_OPTIONS[key]];
}


/** Per-frame replacement strategy. Auto lets the model self-classify the frame. */
const REPLACEMENT_MODES = [
  { value: "auto", label: "Auto" },
  { value: "standard", label: "Standard" },
  { value: "macro", label: "Macro" },
] as const;

type ReplacementMode = (typeof REPLACEMENT_MODES)[number]["value"];

/** Framing / COVERAGE override — a second classification, independent of Mode. */
const COVERAGE_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "full", label: "Full Product" },
  { value: "partial", label: "Partial Product" },
  { value: "macro", label: "Macro Detail" },
] as const;

type Coverage = (typeof COVERAGE_OPTIONS)[number]["value"];

/** Optional regenerate reasons — each appends a targeted corrective sentence. */
const FAILURE_REASONS = [
  "Wrong angle",
  "Wrong crop / zoom",
  "Replacement cut off",
  "Possible reference context leak",
  "Incomplete replacement",
  "Original jewelry still visible",
  "Hybrid old + new",
  "Wrong jewelry geometry",
  "Wrong bail / connector",
  "Wrong stones / setting",
  "Wrong setting",
  "Wrong stone color",
  "Wrong stone shape",
  "Wrong stone size/layout",

  "Wrong lettering / logo",
  "Wrong scale",
  "Wrong rotation",
  "Wrong front / back / side",
  "Macro detail incorrect",
  "Reference background leaked in",
  "Hallucinated detail",
  "Wrong chain interaction",
  "Other",
];


const IMAGE_MODEL_LABELS: Record<JewelryImageModel, string> = {
  pro: "Nano Banana Pro",
  nb2: "Nano Banana 2",
};

/**
 * Nano Banana Pro image quality. The Pro edit endpoint natively accepts
 * `resolution: "1K" | "2K" | "4K"`; the alternate nb2 endpoint does NOT, so this
 * control only ever affects the Pro path. Resolution travels in the API request,
 * never in the prompt.
 */
const NANO_QUALITY_OPTIONS = [
  { value: "2k" as const, label: "2K", hint: "Fast", resolution: "2K" },
  { value: "4k" as const, label: "4K", hint: "Max detail", resolution: "4K" },
];

type NanoQuality = (typeof NANO_QUALITY_OPTIONS)[number]["value"];

/**
 * The backend prices this image endpoint per request (fal unit price × 1), so the
 * real estimate does not change between 2K and 4K — no multiplier is applied.
 */
const NANO_COST_MULTIPLIER = 1;

function resolutionForQuality(quality: NanoQuality) {
  return NANO_QUALITY_OPTIONS.find((option) => option.value === quality)?.resolution ?? "2K";
}

/** Reads back the resolution a generation actually ran at, if it was persisted. */
function qualityFromGeneration(
  generation?: { resolution?: string | null; nanoQuality?: string | null } | null,
): NanoQuality | null {
  const raw = String(generation?.nanoQuality ?? generation?.resolution ?? "").toLowerCase();
  if (raw.includes("4k")) return "4k";
  if (raw.includes("2k")) return "2k";
  return null;
}


/**
 * §F2 — RESOLUTION TRUTHFULNESS. `resolutions` are exactly the values the live
 * fal OpenAPI schema for each model's reference-to-video endpoint accepts
 * (verified 2026-08-21). Only these are offered, so the resolution the user
 * picks is always the resolution submitted — never a silent downgrade.
 */
const VIDEO_MODELS = [
  {
    key: "seedance-2.0",
    label: "Seedance 2.0",
    usdPerSecond: 0.3024,
    resolutions: ["480p", "720p", "1080p", "4k"],
  },
  {
    key: "seedance-2.0-fast",
    label: "Seedance 2.0 Fast",
    usdPerSecond: 0.2419,
    resolutions: ["480p", "720p"],
  },
];

const DEFAULT_VIDEO_RESOLUTION = "720p";

function supportedResolutionsFor(modelKey: string) {
  return (
    VIDEO_MODELS.find((entry) => entry.key === modelKey)?.resolutions ?? ["480p", "720p"]
  );
}


type Frame = { time: number; url: string };

/** One structured stone-setting entry. Stone/color/quality are optional overrides. */
type PieceSetting = {
  type: string;
  region: string;
  stone: string;
  color: string;
  quality: string;
};

const EMPTY_SETTING: PieceSetting = {
  type: AUTO_SETTING,
  region: "",
  stone: "",
  color: "",
  quality: "",
};

/** One card = ONE physical piece, described by one or more reference angles. */
type Piece = {
  urls: string[];
  /** Optional role label per angle, aligned by index with `urls`. */
  roles: string[];
  name: string;
  type: string;
  metal: string;
  stone: string;
  /** Stone body color, independent of quality/clarity. */
  stoneColor: string;
  quality: string;
  /** Structured settings; blank stone/color/quality inherit the piece-level values. */
  settings: PieceSetting[];
  width: string;
  height: string;
  depth: string;
  weight: string;
  /** Geometry-authority override per angle. null = auto (from the role label). */
  cads: (boolean | null)[];
  person: string;
  notes: string;
  /** "piece" (default) or "piece_chain". */
  scope: string;
  /**
   * Set when this card came from a REPLACEMENT product VIDEO. The COMPLETE clip
   * is stored and analysed directly by Gemini — it is never reduced to keyframe
   * image references, and it never reaches the image renderer. Such a card has
   * NO `urls`: a video contributes analysis authority, not reference images.
   * Never a source-video asset.
   */
  video?: {
    videoReferenceId: string;
    name: string;
    duration: number;
    aspectRatio?: string | null;
    /** Storage URL of the actual stored clip (analysis input only). */
    videoUrl: string;
  } | null;

  /** Full structured controls open? Collapsed summary by default. */
  expanded?: boolean;

  /**
   * Values the intake analysis detected. Sent to the backend so a field left on
   * "Auto" resolves to the detected value; a user choice is never overwritten.
   */
  detected?: {
    type?: string | null;
    metal?: string | null;
    stone?: string | null;
    stoneColor?: string | null;
    quality?: string | null;
    settings?: {
      type: string;
      region: string | null;
      /** The classifier declined to name a canonical setting for this region. */
      needsConfirmation?: boolean;
      /** Its evidence statement, produced before the enum choice. */
      reason?: string | null;
      /** Compositional wording from the fused map, e.g. "Galaxy Mosaic". */
      label?: string | null;
    }[];

    /** Where a clarity grade was actually read from (visual_only → review). */
    qualityEvidenceSource?: string | null;
  } | null;
  /** Provenance per field: user_override | gemini_detected | unknown. */
  sources?: Record<string, string>;
  /** Fields the analysis was unsure about — surfaced for a quick review. */
  needsConfirmation?: string[];
};

/** Analysis field names → the control keys they highlight in the piece card. */
const REVIEW_FIELD_CONTROLS: Record<string, string> = {
  jewelryType: "type",
  metal: "metal",
  stoneType: "stone",
  stoneColor: "stoneColor",
  stoneQuality: "quality",
  settings: "settings",
  dimensions: "dimensions",
  weight: "weight",
};

/** The control keys on this piece that still need user confirmation. */
function reviewControls(piece: Piece): Set<string> {
  const set = new Set<string>();
  for (const field of piece.needsConfirmation ?? []) {
    const control = REVIEW_FIELD_CONTROLS[field];
    if (control) set.add(control);
    // A user override resolves the concern, whatever the analysis thought.
    if (control && piece.sources?.[control] === "user_override") set.delete(control);
  }
  return set;
}

/** Material product-spec concerns still open across every piece. */
function reviewCount(pieces: Piece[]): number {
  return pieces.reduce((total, piece) => total + reviewControls(piece).size, 0);
}

/** Amber outline for a control the user still has to confirm. */
const REVIEW_RING = " border-amber-300/50 ring-1 ring-amber-300/25";


const INTAKE_STAGES = [
  "Reading references",
  "Identifying jewelry",
  "Organizing angles",
  "Reading CAD",
  "Detecting stones & settings",
];

/**
 * The reference set must SETTLE before it is analyzed: a bulk upload of six
 * files is one call, not six. Every change restarts this timer.
 */
const INTAKE_DEBOUNCE_MS = 1800;
/** Provider job submissions kept in flight at once (avoids rate limits). */
const SWAP_SUBMIT_CONCURRENCY = 3;
/** Clip (video) submissions kept in flight at once. */
const CLIP_SUBMIT_CONCURRENCY = 2;
/** Adaptive status-poll window: tight right after submit, widens when idle. */
const POLL_MIN_MS = 2000;
const POLL_MAX_MS = 8000;



/**
 * Any manual edit is PERMANENT: it stamps `user_override` on that field so a
 * later reanalysis can flag a conflict but never silently overwrites it.
 */
function withOverride<T extends { sources?: Record<string, string> }>(
  item: T,
  field: string,
  patch: Partial<T>,
): T {
  return { ...item, ...patch, sources: { ...(item.sources ?? {}), [field]: "user_override" } };
}

/** Small "Detected" marker so a resolved value never looks hand-picked. */
function detectedTag(sources: Record<string, string> | undefined, field: string) {
  const source = sources?.[field];
  if (source === "gemini_detected") return " · Detected";
  if (source === "gemini_suggested") return " · Suggested";
  return "";
}



/** Non-Auto user value wins; otherwise fall back to the detected value. */
function effectiveValue(userValue: string, autoValue: string, detected?: string | null) {
  if (userValue && userValue !== autoValue) return userValue;
  const value = String(detected ?? "").trim();
  return value || null;
}

function detectedProductLine(piece: Piece) {
  const parts = [
    effectiveValue(piece.type, "", piece.detected?.type) ?? "Type not detected",
    effectiveValue(piece.metal, AUTO_METAL, piece.detected?.metal),
    effectiveValue(piece.stone, AUTO_STONE, piece.detected?.stone),
    effectiveValue(piece.stoneColor, AUTO_STONE_COLOR, piece.detected?.stoneColor),
    effectiveValue(piece.quality, AUTO_QUALITY, piece.detected?.quality),
  ].filter(Boolean) as string[];
  return parts.join(" · ");
}

function detectedSettingsLine(piece: Piece) {
  const user = realSettings(piece).map((setting) =>
    setting.region ? `${setting.region} · ${setting.type}` : setting.type,
  );
  if (user.length) return user.join(" | ");
  const detected = (piece.detected?.settings ?? []).map((setting) => {
    // The fused compositional wording is preferred; declined regions read
    // honestly instead of borrowing a common name.
    const value = setting.label
      ? setting.label
      : setting.needsConfirmation || !setting.type
        ? "Needs confirmation"
        : setting.type;
    return setting.region ? `${setting.region} · ${value}` : value;
  });

  return detected.length ? detected.join(" | ") : "Not detected";

}


/** Structured settings, dropping the Auto/blank rows the function ignores anyway. */
function realSettings(piece: Piece): PieceSetting[] {
  return (piece.settings ?? []).filter(
    (setting) => setting.type && setting.type !== AUTO_SETTING,
  );
}


/** Geometry authority is auto-on for CAD-labeled angles, overridable per image. */
function isGeometryAuthority(piece: Piece, angleIndex: number) {
  const override = piece.cads?.[angleIndex];
  if (override === true || override === false) return override;
  return /^CAD/i.test(piece.roles[angleIndex] ?? "");
}

function authorityCount(piece: Piece) {
  return piece.urls.filter((_, index) => isGeometryAuthority(piece, index)).length;
}

/** Compact, factual config line — never a fabricated accuracy score. */
function pieceSummary(piece: Piece, frameCount: number) {
  const parts = [
    `${piece.type.toUpperCase()} REPLACEMENT`,
    // Authority is assigned automatically by FUSE and is not surfaced here.
    `Metal: ${piece.metal === AUTO_METAL ? "Auto" : piece.metal}`,

    `Stone: ${piece.stone === AUTO_STONE ? "Auto" : piece.stone}`,
  ];
  if (piece.stoneColor && piece.stoneColor !== AUTO_STONE_COLOR) {
    parts.push(`Color: ${piece.stoneColor}`);
  }
  if (piece.quality && piece.quality !== AUTO_QUALITY) parts.push(`Quality: ${piece.quality}`);
  const settings = realSettings(piece);
  if (settings.length) {
    parts.push(
      `Setting: ${settings
        .map((setting) => (setting.region ? `${setting.region}: ${setting.type}` : setting.type))
        .join(" / ")}`,
    );
  }
  parts.push(`References: ${piece.urls.length}`);

  parts.push(`Source Frames: ${frameCount}`);
  parts.push(piece.urls.length && frameCount ? "Ready to generate" : "Waiting on inputs");
  return parts.join(" · ");
}

const SELECT_CLASS =
  "w-full rounded-lg border border-white/12 bg-black/40 px-2.5 py-1.5 text-xs text-foreground outline-none transition-colors hover:border-cyan-200/40 focus:border-cyan-200/60";

/** SELECT_CLASS, outlined in amber when this control still needs confirming. */
function selectClass(piece: Piece, control: string) {
  return reviewControls(piece).has(control) ? SELECT_CLASS + REVIEW_RING : SELECT_CLASS;
}

/** " · Needs confirmation" suffix for a label the user must resolve. */
function reviewTag(piece: Piece, control: string) {
  return reviewControls(piece).has(control) ? " · Needs confirmation" : "";
}


function SectionCard({
  step,
  title,
  hint,
  children,
}: {
  step: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl sm:p-5">
      <header className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-cyan-200/40 bg-cyan-400/10 text-[11px] font-semibold text-cyan-100">
          {step}
        </span>
        <div className="min-w-0">
          <h2 className="font-heading text-sm font-semibold text-foreground sm:text-base">{title}</h2>
          {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

function StatusPill({ generation }: { generation?: SwapGeneration }) {
  if (!generation) return <span className="text-[11px] text-muted-foreground">Not generated</span>;
  const label = generation.status === "complete"
    ? "Ready"
    : generation.status === "failed"
    ? "Failed"
    : generation.status === "canceled"
    ? "Canceled"
    : generation.status === "running"
    ? "Generating"
    : "Queued";
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]",
        generation.status === "complete"
          ? "border-cyan-200/50 bg-cyan-400/10 text-cyan-100"
          : generation.status === "failed"
          ? "border-red-400/50 bg-red-500/10 text-red-300"
          : "border-white/15 bg-white/5 text-foreground/70",
      )}
    >
      {label}
    </span>
  );
}

const PHASE_MESSAGES = [
  "Preparing your references…",
  "Reconstructing the motion…",
  "Rendering the new jewelry…",
  "Matching metal, stones & reflections…",
  "Stabilizing frames…",
  "Finalizing the clip…",
];

/**
 * The provider does not report granular progress, so we ease a simulated meter
 * toward ~95% and only snap to 100% when the job actually finishes. Elapsed time
 * is derived from the record's created_at so a page refresh keeps counting.
 */
function VideoProgress({
  startedAt,
  onCancel,
  compact,
}: {
  startedAt?: string | null;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const started = useMemo(() => {
    const parsed = startedAt ? Date.parse(startedAt) : NaN;
    return Number.isFinite(parsed) ? parsed : Date.now();
  }, [startedAt]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  const elapsed = Math.max(0, (now - started) / 1000);
  // Exponential ease: fast early, asymptotic toward 95%.
  const percent = Math.min(95, Math.round(95 * (1 - Math.exp(-elapsed / 55))));
  const phase = PHASE_MESSAGES[Math.min(PHASE_MESSAGES.length - 1, Math.floor(elapsed / 6))];
  const minutes = Math.floor(elapsed / 60);
  const seconds = Math.floor(elapsed % 60);

  return (
    <div
      className={cn(
        "space-y-2.5 rounded-2xl border border-white/10 bg-black/30",
        compact ? "p-3" : "p-4",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-cyan-200/70">
          <Video size={14} className="shrink-0" /> <span className="truncate">{phase}</span>
        </span>
        <span className="font-heading text-sm font-semibold text-cyan-100">{percent}%</span>
      </div>
      <Progress value={percent} className="h-1.5" />
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-muted-foreground">
          Elapsed {minutes}:{String(seconds).padStart(2, "0")}
        </span>
        {onCancel ? (
          <Button
            size="sm"
            variant="outline"
            onClick={onCancel}
            className="rounded-lg border-white/15 bg-transparent text-[11px] hover:border-red-400/60 hover:text-red-300"
          >
            <X size={12} /> Cancel generation
          </Button>
        ) : null}
      </div>
    </div>
  );
}



export default function JewelrySwap() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);

  const [frames, setFrames] = useState<Frame[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);
  const [selectedFrames, setSelectedFrames] = useState<Set<number>>(new Set());

  const [pieces, setPieces] = useState<Piece[]>([]);
  const [uploadingPiece, setUploadingPiece] = useState(false);
  /** Live progress while a replacement VIDEO is stored for full-clip analysis. */
  const [videoWork, setVideoWork] = useState<{ name: string } | null>(null);

  /** The fused engineering understanding from the last intake pass. */
  const [knowledgeMap, setKnowledgeMap] = useState<ProductKnowledgeMap | null>(null);
  /**
   * MASTER PRODUCT LOCK (§2): the project's single authoritative product
   * identity, DERIVED from the active PKM. Recomputed only when the reference
   * set actually changes; every generation in the project inherits this lock.
   */
  const [masterProductLock, setMasterProductLock] = useState<MasterProductLock | null>(null);
  /**
   * §E5 — LOCK VERSION PROVENANCE. `masterLockRegistry` keeps every lock version
   * this project has generated with, and `generationLockVersion` records which
   * version drove each generation, so the EXISTING validate path can compare a
   * generation against the lock that actually produced it (legacy generations
   * without a stamp fall back to the current lock).
   */
  const [masterLockRegistry, setMasterLockRegistry] = useState<MasterLockRegistry>({});
  const [generationLockVersion, setGenerationLockVersion] = useState<Record<string, string>>({});
  const masterLockRegistryRef = useRef<MasterLockRegistry>({});
  masterLockRegistryRef.current = masterLockRegistry;
  const generationLockVersionRef = useRef<Record<string, string>>({});
  generationLockVersionRef.current = generationLockVersion;
  const masterLockVersion = useMemo(
    () => masterLockVersionOf(masterProductLock),
    [masterProductLock],
  );
  // Registers the ACTIVE lock version once; never recomputes the lock itself.
  useEffect(() => {
    if (!masterProductLock) return;
    setMasterLockRegistry((prev) => rememberMasterLock(prev, masterProductLock));
  }, [masterProductLock]);
  const stampGeneration = useCallback((id: string | null | undefined) => {
    const stamp = masterLockVersionOf(masterProductLock);
    if (!id || !stamp) return;
    setGenerationLockVersion((prev) => (prev[id] === stamp ? prev : { ...prev, [id]: stamp }));
  }, [masterProductLock]);

  /**
   * §E1 — the ACTIVE project id, readable from generation callbacks declared
   * before the project state exists. Sent with every Nano generation so the
   * backend can INHERIT the project's persisted Master Product Lock.
   */
  const activeProjectIdRef = useRef<string | null>(null);
  /**
   * CONNECTED PRODUCT SYSTEMS (§30). Physical relationships between connected
   * parts of THIS product, derived from the lock's own component topology.
   * Data only in this commit — recomputed solely when the lock/topology changes.
   */
  const [connectedAssetModel, setConnectedAssetModel] = useState<ConnectedAssetModel | null>(null);
  useEffect(() => {
    if (!masterProductLock) {
      setConnectedAssetModel(null);
      return;
    }
    setConnectedAssetModel((current) =>
      isConnectedAssetModelCurrent(current, masterProductLock)
        ? current
        : buildConnectedAssetModel(masterProductLock),
    );
  }, [masterProductLock]);
  /**
   * WORKSPACE MODE (§26). "swap" is the default and leaves the existing flow
   * untouched. "campaign" hides the source-cinematography steps and builds
   * product photography from scratch — SAME lock, photography profile, coverage
   * planner, Nano master path and validation, no second intelligence stack.
   */
  const [workspaceMode, setWorkspaceMode] = useState<JewelryWorkspaceMode>("swap");
  const isSwapMode = workspaceMode === "swap";
  /**
   * MATERIAL APPEARANCE AUTHORITY (§31) — manual override, advanced only.
   * Empty = FUSE derives it automatically from the existing evidence strengths.
   */
  const [materialAuthorityOverride, setMaterialAuthorityOverride] = useState<string | null>(null);
  /**
   * CAMPAIGN PHOTOGRAPHY PROFILE (§20): HOW the product is photographed. These
   * references are PHOTOGRAPHY authority only — zero product geometry/identity.
   * Analysis only in this commit; nothing feeds a generation prompt yet.
   */
  const [photographyRefs, setPhotographyRefs] = useState<string[]>([]);
  const [campaignPhotographyProfile, setCampaignPhotographyProfile] =
    useState<CampaignPhotographyProfile | null>(null);
  const [photographyStatus, setPhotographyStatus] = useState<PhotographyStatus>("idle");
  const [photographyError, setPhotographyError] = useState<string | null>(null);
  /** The reference set the stored profile was analysed from (recompute guard). */
  const photographyVersion = useRef<string | null>(null);
  /**
   * CANONICAL MASTER REFERENCE SET (§22): clean neutral masters of the active
   * product, keyed by plan key. User-triggered only — generating them spends
   * credits on the EXISTING Nano path, so nothing here runs automatically.
   */
  const [canonicalMasters, setCanonicalMasters] = useState<Record<string, CanonicalMaster>>({});
  /** Latest masters, so validation reads current state without re-binding. */
  const canonicalMastersRef = useRef<Record<string, CanonicalMaster>>({});
  useEffect(() => {
    canonicalMastersRef.current = canonicalMasters;
  }, [canonicalMasters]);
  /**
   * §E3 — the analysis profiles the Nano prompt reads. Kept in refs so every
   * generation sends the CURRENT model without re-binding the callbacks.
   */
  const connectedAssetsRef = useRef<ConnectedAssetModel | null>(null);
  useEffect(() => {
    connectedAssetsRef.current = connectedAssetModel;
  }, [connectedAssetModel]);
  const campaignPhotographyProfileRef = useRef<CampaignPhotographyProfile | null>(null);
  useEffect(() => {
    campaignPhotographyProfileRef.current = campaignPhotographyProfile;
  }, [campaignPhotographyProfile]);

  /**
   * MATCHED-PAIR MANUFACTURING (§29). Counterpart plates of approved masters in
   * the OTHER manufacturing state, keyed `${sourceId}:${targetStage}`. Each pair
   * is one explicit paid Nano run — nothing here ever fires automatically.
   */
  const [matchedPairs, setMatchedPairs] = useState<Record<string, MatchedPair>>({});
  const [matchedPairBusyKey, setMatchedPairBusyKey] = useState<string | null>(null);
  /**
   * BATCH CONTINUATION (§28). Batches are lineage records ONLY: a new batch
   * inherits the established Master Product Lock, campaign look, optics profile
   * and approved plates, so the product is never rediscovered between batches.
   * Starting/approving a batch generates nothing.
   */
  const [batches, setBatches] = useState<CampaignBatch[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  /** Read inside generation callbacks without re-binding them. */
  const activeBatchIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeBatchIdRef.current = activeBatchId;
  }, [activeBatchId]);
  /** Tag a freshly rendered plate with the open batch (no generation here). */
  const tagBatchMaster = useCallback((masterKey: string) => {
    const batchId = activeBatchIdRef.current;
    if (!batchId) return;
    setBatches((prev) => recordBatchMaster(prev, batchId, masterKey));
  }, []);
  const [mastersBusy, setMastersBusy] = useState(false);

  const [engineeringOpen, setEngineeringOpen] = useState(false);
  /**
   * A PROPOSAL only. FUSE never splits a card by itself — the user answers this
   * question, and only their answer creates a second piece.
   */
  const [splitSuggestion, setSplitSuggestion] = useState<{
    question: string;
    groups: { label: string; urls: string[] }[];
  } | null>(null);

  /**
   * Facts the USER settled (answers to genuine conflicts). These are sent as
   * USER_CONFIRMED and the analysis may never override them.
   */
  const [userLocks, setUserLocks] = useState<UserConfirmedFact[]>([]);

  /**
   * DIAMOND OPTICS (additive). The SOURCE clip is analysed ONCE for lighting and
   * optical response; a selected frame gets a lightweight refinement. Both are
   * cached server-side, so the Sparkle / Rainbow-Fire sliders only re-synthesise
   * the prompt — they never trigger a new analysis.
   */
  const [opticsProfile, setOpticsProfile] = useState<DiamondOpticsProfile | null>(null);
  const [frameOptics, setFrameOptics] = useState<Record<number, DiamondOpticsProfile>>({});
  const [opticsControls, setOpticsControls] = useState<DiamondOpticsControls>({
    ...AUTO_OPTICS_CONTROLS,
  });
  const [opticsStatus, setOpticsStatus] = useState<"idle" | "analyzing" | "ready" | "error">(
    "idle",
  );


  const [dropActive, setDropActive] = useState(false);
  // Reference intake (recognition / grouping / extraction). Never blocking:
  // the manual fields stay usable and a failure just falls back to them.
  const [intake, setIntake] = useState<{
    status: "idle" | "collecting" | "running" | "ready" | "stale" | "failed";
    stage: number;
    productCount: number;
    referenceCount: number;
    error?: string | null;
  }>({ status: "idle", stage: 0, productCount: 0, referenceCount: 0 });
  const intakeAbort = useRef<AbortController | null>(null);
  const intakeToken = useRef(0);
  /**
   * The persisted intake (fingerprint + exact reference set) the shot analysis
   * can reuse. Cleared implicitly whenever a new intake overwrites it.
   */
  const intakeProvenance = useRef<{
    fingerprint: string | null;
    references: { url: string; role?: string | null; cad?: boolean }[];
  }>({ fingerprint: null, references: [] });

  /**
   * STALE GUARD: the version of the reference set (urls + roles + authority
   * flags) that the UI is currently showing. A response whose version differs
   * from this is stale by definition and is discarded.
   */
  const intakeSetVersion = useRef<string>("");
  /** Set by applyIntake so its own writes never retrigger the analysis. */
  const intakeJustApplied = useRef(false);
  /** Bumped by "Analyze now" to bypass the debounce for the current set. */
  const [intakeNow, setIntakeNow] = useState(0);


  const [extraPrompt, setExtraPrompt] = useState("");

  // STAGE A — still-image shot analysis. Advisory: the deterministic selector
  // and every manual choice still decide. Recomputed ONLY when its inputs
  // change (references/roles/CAD, specs, selected frames) — never on reload,
  // modal open or approve.
  const [analysis, setAnalysis] = useState<JewelryProjectAnalysis | null>(null);
  const [analysisKey, setAnalysisKey] = useState<string | null>(null);
  const [analysisState, setAnalysisState] = useState<"idle" | "running" | "ready" | "failed">(
    "idle",
  );


  // REVISION HISTORY (§36): every image generation a frame has ever produced,
  // append-only. Regenerating adds a revision; nothing is ever overwritten.
  const [frameGenerations, setFrameGenerations] = useState<Record<number, JewelryGeneration[]>>({});
  /** Which revision of each frame's history is currently on screen. */
  const [frameRevision, setFrameRevision] = useState<Record<number, number>>({});
  /** APPROVAL BY ID (§37): the exact revision approved for each frame. */
  const [approvedGenerationId, setApprovedGenerationId] = useState<Record<number, string>>({});
  /** Latest history, readable inside setState updaters. */
  const frameGenerationsRef = useRef<Record<number, JewelryGeneration[]>>({});
  frameGenerationsRef.current = frameGenerations;



  // Nano Banana Pro results (the default) and the opt-in Nano Banana 2 runs live
  // side by side so a frame can be compared before one is approved. Both are
  // DERIVED views of the displayed revision — the history above is the truth.
  const [swaps, setSwaps] = useState<Record<number, JewelryGeneration>>({});
  const [altSwaps, setAltSwaps] = useState<Record<number, JewelryGeneration>>({});
  const [chosenModel, setChosenModel] = useState<Record<number, JewelryImageModel>>({});

  const [framePreferredRole, setFramePreferredRole] = useState<Record<number, string>>({});
  const [frameReason, setFrameReason] = useState<Record<number, string>>({});
  /** Per-frame replacement mode — persists so later regenerations reuse it. */
  const [frameMode, setFrameMode] = useState<Record<number, ReplacementMode>>({});
  /** Per-frame COVERAGE (framing) override — persists across regenerations. */
  const [frameCoverage, setFrameCoverage] = useState<Record<number, Coverage>>({});
  /** Manual, user-set review flags only — no automatic similarity detection. */
  // Which frame's Regenerate menu is expanded, and which frame is being compared
  // against the opt-in alternate model.
  const [regenMenu, setRegenMenu] = useState<number | null>(null);
  /** Batch-level Nano Banana Pro quality. Always defaults to 2K — never auto-4K. */
  const [nanoQuality, setNanoQuality] = useState<NanoQuality>("2k");
  /** Per-frame Regenerate quality, defaulting to that frame's previous value. */
  const [frameQuality, setFrameQuality] = useState<Record<number, NanoQuality>>({});

  const [compareIndex, setCompareIndex] = useState<number | null>(null);

  /** Derived from the approval ids — a frame is approved when one is bound. */
  const approved = useMemo(
    () => new Set(Object.keys(approvedGenerationId).map(Number)),
    [approvedGenerationId],
  );

  const [swapping, setSwapping] = useState(false);

  const [videoModel, setVideoModel] = useState("seedance-2.0");
  const [preserveAudio, setPreserveAudio] = useState(true);
  const [resolution, setResolution] = useState(DEFAULT_VIDEO_RESOLUTION);
  const videoResolutionOptions = supportedResolutionsFor(videoModel);
  // §F2 — if a stored/previous pick is not supported by the selected model, fix
  // the selection VISIBLY (the dropdown updates + the user is told) so the UI can
  // never show one resolution while another is submitted.
  useEffect(() => {
    if (videoResolutionOptions.includes(resolution)) return;
    const label = VIDEO_MODELS.find((entry) => entry.key === videoModel)?.label ?? "This model";
    setResolution(DEFAULT_VIDEO_RESOLUTION);
    toast.info(
      `${label} does not support ${resolution.toUpperCase()} — switched to ${DEFAULT_VIDEO_RESOLUTION.toUpperCase()}`,
    );
  }, [videoModel, resolution, videoResolutionOptions]);
  // Every Jewelry Swap video the user has started — newest first. Jobs live
  // server-side, so refreshing simply re-attaches to the running ones.
  const [videos, setVideos] = useState<JewelryGeneration[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [reconstructing, setReconstructing] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);

  // Which reviewed frame is open in the comparison lightbox.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // Which library video is open in the player lightbox.
  const [videoLightboxId, setVideoLightboxId] = useState<string | null>(null);



  const videoInputRef = useRef<HTMLInputElement>(null);
  const pieceInputRef = useRef<HTMLInputElement>(null);
  const angleInputRef = useRef<HTMLInputElement>(null);
  // Which piece card an "+ Angle" upload belongs to.
  const [angleTarget, setAngleTarget] = useState<number | null>(null);

  /* ---------------------------- 1. Source video ---------------------------- */

  const handleVideoFile = useCallback(async (file: File) => {
    const objectUrl = URL.createObjectURL(file);
    setVideoPreview(objectUrl);
    setFrames([]);
    setSwaps({});
    setAltSwaps({});
    setFrameGenerations({});
    setFrameRevision({});
    setChosenModel({});
    setFramePreferredRole({});
    setFrameReason({});
    setApprovedGenerationId({});

    setSelectedFrames(new Set());
    // The video library is intentionally preserved across new source clips.

    try {
      const element = await loadVideo(objectUrl);
      const nextMeta = readMeta(element);
      setMeta(nextMeta);

      const folder = await createOutfitSwapFolder();

      setUploadingVideo(true);
      const uploadedVideo = await uploadToStorage(folder, file, file.name);
      setVideoUrl(uploadedVideo.url);

      // Extract ~1 frame/second plus the final frame, then upload each frame.
      setExtracting(true);
      setExtractProgress(0);
      const times = frameTimestamps(nextMeta.duration);
      const captured = await extractFrames(element, times, (done, total) =>
        setExtractProgress(Math.round((done / total) * 50)),
      );

      const uploaded = await uploadWithConcurrency(
        captured,
        3,
        async (frame) => {
          const stored = await uploadToStorage(folder, frame.file, frame.file.name);
          return { time: frame.time, url: stored.url } as Frame;
        },
        (done, total) => setExtractProgress(50 + Math.round((done / total) * 50)),
      );
      setFrames(uploaded);
      // Offer a spread of frames by default; the user can change the selection.
      const spread = uploaded
        .map((_, index) => index)
        .filter((index) => index % Math.max(1, Math.ceil(uploaded.length / 4)) === 0);
      setSelectedFrames(new Set(spread));
      toast.success(`${uploaded.length} source frames extracted`);

    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not process that video");
    } finally {
      setUploadingVideo(false);
      setExtracting(false);
    }
  }, []);

  /* ------------------- Library picker (already-made assets) ----------------- */

  type PickerTarget =
    | { kind: "source" }
    | { kind: "piece" }
    | { kind: "angle"; index: number };

  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);
  const [assetSearch, setAssetSearch] = useState("");
  const [assetTypeFilter, setAssetTypeFilter] = useState<"all" | "image" | "video">("all");
  const [pickerLimit, setPickerLimit] = useState(24);
  const [sourceNotice, setSourceNotice] = useState<string | null>(null);

  const loadAssets = useCallback(async (type: "all" | "image" | "video") => {
    setAssetsLoading(true);
    setAssetsError(null);
    try {
      const rows = await listAssets(type);
      setAssets(rows);
    } catch (error) {
      setAssets([]);
      setAssetsError(error instanceof Error ? error.message : "Could not load your library");
    } finally {
      setAssetsLoading(false);
    }
  }, []);

  const openPicker = useCallback(
    (target: PickerTarget) => {
      const type = target.kind === "source" ? "all" : "image";
      setPickerTarget(target);
      setAssetSearch("");
      setAssetTypeFilter(type);
      setPickerLimit(24);
      void loadAssets(type);
    },
    [loadAssets],
  );

  const resetSourceState = useCallback(() => {
    setFrames([]);
    setSwaps({});
    setAltSwaps({});
    setFrameGenerations({});
    setFrameRevision({});
    setChosenModel({});
    setFramePreferredRole({});
    setFrameReason({});
    setFrameMode({});
    setApprovedGenerationId({});

    setSelectedFrames(new Set());
    setSourceNotice(null);
  }, []);

  /** Use a completed library asset as the source (image = single frame, video = extract). */
  const useLibrarySource = useCallback(
    async (asset: LibraryAsset) => {
      resetSourceState();

      if (asset.outputType === "image") {
        setVideoPreview(null);
        setVideoUrl(null);
        setMeta(null);
        setFrames([{ time: 0, url: asset.outputUrl }]);
        setSelectedFrames(new Set([0]));
        toast.success("Library image loaded as the source frame");
        return;
      }

      setVideoPreview(asset.outputUrl);
      setVideoUrl(asset.outputUrl);

      let objectUrl: string | null = null;
      try {
        // Never draw a remote video straight to canvas — fetch the bytes first.
        setUploadingVideo(true);
        const response = await fetch(asset.outputUrl);
        if (!response.ok) throw new Error(`Fetch failed (${response.status})`);
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
      } catch {
        setUploadingVideo(false);
        setSourceNotice(
          "Couldn't load that video for frame extraction — try uploading the file instead.",
        );
        return;
      }

      try {
        const element = await loadVideo(objectUrl);
        const nextMeta = readMeta(element);
        setMeta(nextMeta);

        const folder = await createOutfitSwapFolder();
        setUploadingVideo(false);
        setExtracting(true);
        setExtractProgress(0);

        const times = frameTimestamps(nextMeta.duration);
        const captured = await extractFrames(element, times, (done, total) =>
          setExtractProgress(Math.round((done / total) * 50)),
        );

        const uploaded = await uploadWithConcurrency(
          captured,
          3,
          async (frame) => {
            const stored = await uploadToStorage(folder, frame.file, frame.file.name);
            return { time: frame.time, url: stored.url } as Frame;
          },
          (done, total) => setExtractProgress(50 + Math.round((done / total) * 50)),
        );
        setFrames(uploaded);
        const spread = uploaded
          .map((_, index) => index)
          .filter((index) => index % Math.max(1, Math.ceil(uploaded.length / 4)) === 0);
        setSelectedFrames(new Set(spread));
        toast.success(`${uploaded.length} source frames extracted`);
      } catch {
        setSourceNotice(
          "Couldn't load that video for frame extraction — try uploading the file instead.",
        );
      } finally {
        setUploadingVideo(false);
        setExtracting(false);
      }
    },
    [resetSourceState],
  );

  /** A library image becomes a new piece card. */
  const addPieceFromLibrary = useCallback((url: string) => {
    setPieces((prev) =>
      [
        ...prev,
        {
          urls: [url],
          roles: [""],
          name: "Library asset",
          type: JEWELRY_TYPES[0],
          metal: AUTO_METAL,
          stone: AUTO_STONE,
          stoneColor: AUTO_STONE_COLOR,
          quality: AUTO_QUALITY,
          settings: [{ ...EMPTY_SETTING }],

          width: "",
          height: "",
          depth: "",
          weight: "",
          cads: [null],
          person: DEFAULT_APPLY_TO,
          notes: "",
          scope: DEFAULT_SCOPE,
        } as Piece,
      ].slice(0, 8),
    );
  }, []);

  /** A library image becomes another angle of an existing piece. */
  const addAngleFromLibrary = useCallback((index: number, url: string) => {
    setPieces((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              urls: [...item.urls, url].slice(0, 6),
              roles: [...item.roles, ""].slice(0, 6),
              cads: [...(item.cads ?? []), null].slice(0, 6),
            }
          : item,
      ),
    );
  }, []);

  const handlePick = useCallback(
    (asset: LibraryAsset) => {
      const target = pickerTarget;
      setPickerTarget(null);
      if (!target) return;
      if (target.kind === "source") {
        void useLibrarySource(asset);
        return;
      }
      if (target.kind === "piece") {
        addPieceFromLibrary(asset.outputUrl);
        return;
      }
      addAngleFromLibrary(target.index, asset.outputUrl);
    },
    [addAngleFromLibrary, addPieceFromLibrary, pickerTarget, useLibrarySource],
  );

  const visibleAssets = useMemo(() => {
    const query = assetSearch.trim().toLowerCase();
    return assets.filter((asset) => {
      if (assetTypeFilter !== "all" && asset.outputType !== assetTypeFilter) return false;
      if (!query) return true;
      return `${asset.feature ?? ""} ${asset.prompt ?? ""}`.toLowerCase().includes(query);
    });
  }, [assetSearch, assetTypeFilter, assets]);

  // Only mount a page of tiles at a time — full-res fal media freezes the modal.
  const pagedAssets = useMemo(() => visibleAssets.slice(0, pickerLimit), [visibleAssets, pickerLimit]);

  // Any change to the filters restarts paging at the first page.
  useEffect(() => {
    setPickerLimit(24);
  }, [assetSearch, assetTypeFilter]);



  /* -------------------------- 3. Piece references ------------------------- */

  /**
   * Each selected asset becomes its own piece card. The zone is mixed-media:
   * images upload as stills; replacement VIDEOS are stored whole and sent to
   * Gemini's multimodal video path as complete clips — never split into
   * keyframe image references. FUSE types every asset itself.
   */

  const addPieces = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setUploadingPiece(true);
    try {
      const folder = await createOutfitSwapFolder();
      const uploaded: Piece[] = [];

      const blank = (name: string): Piece => ({
        urls: [],
        roles: [],
        name,
        type: JEWELRY_TYPES[0],
        metal: AUTO_METAL,
        stone: AUTO_STONE,
        stoneColor: AUTO_STONE_COLOR,
        quality: AUTO_QUALITY,
        settings: [{ ...EMPTY_SETTING }],
        width: "",
        height: "",
        depth: "",
        weight: "",
        cads: [],
        person: DEFAULT_APPLY_TO,
        notes: "",
        scope: DEFAULT_SCOPE,
      });

      for (const file of files) {
        if (isVideoAsset(file)) {
          // The ACTUAL clip is stored and analysed end-to-end by Gemini. No
          // keyframes are extracted and no image reference is created from it.
          setVideoWork({ name: file.name });
          const meta = await readVideoFileMeta(file).catch(() => null);
          const stored = await uploadToStorage(folder, file, file.name);
          setVideoWork(null);
          uploaded.push({
            ...blank(file.name),
            urls: [],
            roles: [],
            cads: [],
            video: {
              videoReferenceId: `vid-${crypto.randomUUID().slice(0, 8)}`,
              name: file.name,
              duration: meta?.duration ?? 0,
              aspectRatio: meta?.aspectRatio ?? null,
              videoUrl: stored.url,
            },
          });
          continue;
        }

        const compressed = await compressImageFile(file);
        const stored = await uploadToStorage(folder, compressed, compressed.name);
        uploaded.push({
          ...blank(file.name),
          urls: [stored.url],
          roles: [""],
          cads: [null],
        });
      }

      setPieces((prev) => [...prev, ...uploaded].slice(0, 8));
      invalidateAssetCache(); // new uploads must appear next time the picker opens

    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload that reference");
    } finally {
      setVideoWork(null);
      setUploadingPiece(false);
    }
  }, []);



  /** Extra angles of the SAME physical piece land on the targeted card. */
  const addAngles = useCallback(
    async (files: File[]) => {
      const target = angleTarget;
      if (!files.length || target === null) return;
      setUploadingPiece(true);
      try {
        const folder = await createOutfitSwapFolder();
        const urls: string[] = [];
        for (const file of files) {
          const compressed = await compressImageFile(file);
          const stored = await uploadToStorage(folder, compressed, compressed.name);
          urls.push(stored.url);
        }
        setPieces((prev) =>
          prev.map((item, index) =>
            index === target
              ? {
                  ...item,
                  urls: [...item.urls, ...urls].slice(0, 6),
                  roles: [...item.roles, ...urls.map(() => "")].slice(0, 6),
                  cads: [...(item.cads ?? []), ...urls.map(() => null)].slice(0, 6),
                }
              : item,
          ),
        );
        invalidateAssetCache(); // new uploads must appear next time the picker opens
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not upload that angle");

      } finally {
        setUploadingPiece(false);
        setAngleTarget(null);
      }
    },
    [angleTarget],
  );

  /* ---------------------- Reference intake (auto-organize) ------------------ */

  const referenceKey = pieces.flatMap((piece) => piece.urls).join("|");
  /**
   * The reference-set VERSION: every url plus the role and authority flag the
   * user has attached to it. This single string is both the debounce trigger and
   * the stale guard — anything that materially changes the analysis changes it.
   */
  const referenceSetVersion = useMemo(
    () =>
      JSON.stringify([
        pieces.map((piece) => [
          piece.urls.map((url, angleIndex) => [
            url,
            piece.roles?.[angleIndex] ?? "",
            piece.cads?.[angleIndex] ?? null,
          ]),
          // A replacement clip is part of the analysed set even though it
          // contributes no image references.
          piece.video?.videoUrl ?? "",
        ]),
        // A newly locked fact must re-run the analysis with that fact enforced.
        userLocks.map((lock) => [lock.attribute, lock.value, lock.appliesTo ?? ""]),
      ]),
    [pieces, userLocks],
  );


  const referenceCount = pieces.reduce((total, piece) => total + piece.urls.length, 0);
  /** Unresolved product-spec concerns across all pieces (user overrides clear them). */
  const uncertainCount = reviewCount(pieces);

  /** One plain sentence describing the fused understanding. */
  const understoodSummary = useMemo(() => {
    if (!knowledgeMap) return "";
    const metal = knowledgeMap.materialRegions?.[0]?.metalColor ?? null;
    // REAL stones, not per-view observations (the same stone appears in many refs).
    const stoneCount = knowledgeMap.physicalStones?.length ?? knowledgeMap.stones?.length ?? 0;
    const parts = [
      knowledgeMap.productType || "Jewelry piece",
      metal || null,
      stoneCount ? `${stoneCount} stone${stoneCount === 1 ? "" : "s"} mapped` : null,
      knowledgeMap.repeatedModules?.length
        ? `${knowledgeMap.repeatedModules.length} repeating module${
            knowledgeMap.repeatedModules.length === 1 ? "" : "s"
          }`
        : null,
    ].filter(Boolean);
    return parts.join(" · ");
  }, [knowledgeMap]);

  /** Coverage read-out, one badge per area of the piece. */
  const coverageBadges = useMemo(() => {
    const coverage = knowledgeMap?.coverage ?? {};
    return [
      { label: "Geometry", level: coverage.geometry || "Unknown" },
      { label: "Stone layout", level: coverage.stoneLayout || "Unknown" },
      { label: "Setting", level: coverage.setting || "Unknown" },
      { label: "Clasp", level: coverage.clasp || "Unknown" },
    ];
  }, [knowledgeMap]);

  /**
   * Plain-language read-out of HOW the piece was reconstructed: cross-view
   * agreement, recovered master modules, and physical vs apparent stone size.
   */
  const reconstructionNotes = useMemo(() => {
    if (!knowledgeMap) return [] as string[];
    const notes: string[] = [];

    const confirmed = (knowledgeMap.physicalStones ?? []).filter(
      (stone) => (stone.agreementCount ?? 0) > 1,
    ).length;
    if (confirmed) notes.push(`${confirmed} stone${confirmed === 1 ? "" : "s"} confirmed across multiple views`);

    const master = (knowledgeMap.repeatedModules ?? []).filter((module) => module.masterModuleId).length;
    if (master) {
      notes.push(
        `${master} master module${master === 1 ? "" : "s"} reconstructed and applied to every matching link`,
      );
    }

    const uniform = (knowledgeMap.stoneGroups ?? []).filter(
      (group) => group.sizeUniformity === "uniform",
    ).length;
    const mixed = (knowledgeMap.stoneGroups ?? []).filter(
      (group) => group.sizeUniformity === "mixed",
    ).length;
    if (uniform) notes.push(`${uniform} stone field${uniform === 1 ? "" : "s"} physically uniform in size`);
    if (mixed) notes.push(`${mixed} stone field${mixed === 1 ? "" : "s"} genuinely mixed in size`);

    const perspective = (knowledgeMap.stoneGroups ?? []).filter(
      (group) => group.apparentSizeDifference,
    ).length;
    if (perspective) notes.push("Size differences caused by camera angle were discounted");

    const primarySetting = knowledgeMap.settings?.[0];
    const setting = primarySetting?.detectedSetting || primarySetting?.ontologyMatch?.canonicalName;
    if (setting) {
      notes.push(
        primarySetting?.userConfirmedTerm
          ? `Your terminology kept: ${setting}`
          : `Construction matched to ${setting}`,
      );
    }


    const locked = knowledgeMap.userConfirmedFacts?.length ?? 0;
    if (locked) notes.push(`${locked} detail${locked === 1 ? "" : "s"} you confirmed are locked`);

    return notes;
  }, [knowledgeMap]);

  /** What still needs a real answer — evidence first, a new photo only last. */
  const evidenceRequests = useMemo(() => {
    return (knowledgeMap?.evidenceGaps ?? [])
      .filter((gap) => !gap.resolvedFromExistingEvidence && gap.requestedUserReference)
      .map((gap) => gap.requestedUserReference as string)
      .slice(0, 3);
  }, [knowledgeMap]);

  /**
   * REF handle per url — the analysis numbers references in the SAME flattened
   * order the intake payload is built in, so the map can be read back per image.
   */
  const refIdByUrl = useMemo(() => {
    const map = new Map<string, string>();
    pieces.flatMap((piece) => piece.urls).forEach((url, index) => map.set(url, `REF_${index + 1}`));
    return map;
  }, [pieces]);

  /**
   * MATERIAL APPEARANCE AUTHORITY (§31) — the reference that is strongest for
   * MATERIAL REALISM (metal finish, polish, microtexture, brilliance, fire).
   * Reuses the attribute-specific authority already in the knowledge map
   * (evidenceStrength + authorityFor); it grants no geometry authority at all.
   */
  const materialAuthority: MaterialAppearanceAuthority | null = useMemo(
    () =>
      deriveMaterialAppearanceAuthority({
        knowledgeMap,
        references: pieces.flatMap((piece) =>
          piece.urls.map((url, angleIndex) => ({ url, role: piece.roles?.[angleIndex] ?? null })),
        ),
        override: materialAuthorityOverride,
      }),
    [knowledgeMap, pieces, materialAuthorityOverride],
  );

  /* ------------------- Campaign photography profile (§20) ------------------ */

  /** Look references upload to the same storage pattern as product references. */
  const addPhotographyRefs = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setPhotographyStatus("uploading");
    setPhotographyError(null);
    try {
      const folder = await createOutfitSwapFolder();
      const urls: string[] = [];
      for (const file of files.slice(0, 6)) {
        const compressed = await compressImageFile(file);
        const stored = await uploadToStorage(folder, compressed, compressed.name);
        urls.push(stored.url);
      }
      setPhotographyRefs((prev) => [...prev, ...urls].slice(0, 6));
      setPhotographyStatus((prev) => (prev === "uploading" ? "idle" : prev));
    } catch (error) {
      setPhotographyStatus("error");
      setPhotographyError(
        error instanceof Error ? error.message : "Could not upload that look reference",
      );
    }
  }, []);

  const removePhotographyRef = useCallback((url: string) => {
    setPhotographyRefs((prev) => prev.filter((entry) => entry !== url));
  }, []);

  /**
   * Analysis only (Gemini, cached server-side by the reference set). It runs on
   * request and re-runs only when the look references actually change.
   */
  const analyzePhotography = useCallback(async () => {
    if (!photographyRefs.length) return;
    const version = photographySetVersion(photographyRefs);
    setPhotographyStatus("analyzing");
    setPhotographyError(null);
    try {
      const result = await analyzeCampaignPhotography({ referenceUrls: photographyRefs });
      setCampaignPhotographyProfile(result.profile ?? null);
      photographyVersion.current = version;
      setPhotographyStatus(result.profile ? "ready" : "idle");
    } catch (error) {
      setPhotographyStatus("error");
      setPhotographyError(
        error instanceof Error ? error.message : "Could not read the campaign look",
      );
    }
  }, [photographyRefs]);

  /** A changed look reference set marks the stored profile stale — never auto-reruns. */
  useEffect(() => {
    if (!campaignPhotographyProfile) return;
    const version = photographySetVersion(photographyRefs);
    setPhotographyStatus(version === photographyVersion.current ? "ready" : "stale");
  }, [photographyRefs, campaignPhotographyProfile]);

  /**
   * The EVIDENCE ROLE of one thumbnail (CAD FRONT / MACRO / SIDE / CLASP …).
   * Deliberately never a product name: a thumbnail is an observation, not a piece.
   */
  const evidenceRoleByUrl = useMemo(() => {
    const roles = new Map<string, string>();
    for (const entry of knowledgeMap?.perReferenceObservations ?? []) {
      const id = String(entry?.referenceId ?? "").trim();
      const role = String(entry?.evidenceRole ?? "").trim();
      if (id && role) roles.set(id, role.toUpperCase().slice(0, 18));
    }
    return roles;
  }, [knowledgeMap]);

  const evidenceRoleFor = useCallback(
    (url: string) => evidenceRoleByUrl.get(refIdByUrl.get(url) ?? "") ?? "",
    [evidenceRoleByUrl, refIdByUrl],
  );


  /**
   * AUTO authority labels. The user assigns nothing: we read the attribute-level
   * authority FUSE already computed (authorityFor + evidenceStrength) and show at
   * most one plain badge per reference. No score, no checkbox, and nothing at all
   * when the reference has no clearly useful specialty.
   */
  const autoAuthorityLabelByUrl = useMemo(() => {
    const labels = new Map<string, string>();

    const catalog = knowledgeMap?.referenceCatalog ?? [];
    if (!catalog.length) return labels;

    // Attribute → plain-language badge. Order = which specialty wins the badge.
    const BADGES: { keys: string[]; label: string }[] = [
      { keys: ["overallGeometry", "componentGeometry", "silhouette", "componentTopology"], label: "Best for geometry" },
      { keys: ["stoneSize", "stoneCut", "stonePlacement", "stoneSeatLayout"], label: "Best for stone detail" },
      { keys: ["settingMechanics", "prongConstruction"], label: "Best for setting detail" },
      { keys: ["thicknessDepth"], label: "Best for side profile" },
      { keys: ["claspBailConnector"], label: "Best for clasp" },
      { keys: ["dimensions"], label: "Best for proportions" },
      { keys: ["materialAppearance", "metalColor", "manufacturedFinish", "manufacturedAppearance"], label: "Best for finish" },
    ];

    const byId = new Map(catalog.map((entry) => [String(entry.referenceId ?? "").trim(), entry]));
    // A badge is only useful if this reference is the STRONGEST for that group.
    const bestFor = new Map<string, string>();
    for (const badge of BADGES) {
      let winner: { id: string; score: number } | null = null;
      for (const entry of catalog) {
        const strength = entry.evidenceStrength ?? {};
        const claimed = new Set((entry.authorityFor ?? []).map((value) => String(value).toLowerCase()));
        const score = Math.max(
          ...badge.keys.map((key) => {
            const numeric = Number((strength as Record<string, number | undefined>)[key] ?? 0);
            const boost = claimed.has(key.toLowerCase()) ? 0.15 : 0;
            return (Number.isFinite(numeric) ? numeric : 0) + boost;
          }),
        );
        const id = String(entry.referenceId ?? "").trim();
        if (!id) continue;
        if (!winner || score > winner.score) winner = { id, score };
      }
      // Hide the badge unless the winner is genuinely strong for that attribute.
      if (winner && winner.score >= 0.6 && !bestFor.has(winner.id)) bestFor.set(winner.id, badge.label);
    }

    for (const [url, refId] of refIdByUrl) {
      if (!byId.has(refId)) continue;
      const label = bestFor.get(refId);
      if (label) labels.set(url, label);
    }
    return labels;
  }, [knowledgeMap, refIdByUrl]);

  /**
   * Only GENUINE high-confidence conflicts become a question. Everything weaker
   * is resolved by attribute authority inside the analysis and never surfaced.
   */
  const authorityQuestions = useMemo(() => {
    return (knowledgeMap?.constructionConflicts ?? [])
      .filter((conflict) => conflict.needsUserDecision === true && conflict.question)
      .map((conflict, index) => ({
        id: `${conflict.attribute ?? conflict.topic ?? "conflict"}-${index}`,
        attribute: conflict.attribute || conflict.topic || "detail",
        question: conflict.question as string,
        options: (conflict.options ?? [conflict.cadClaim, conflict.photoClaim].filter(Boolean) as string[])
          .filter(Boolean)
          .slice(0, 3),
      }))
      .filter((question) => question.options.length > 0)
      .slice(0, 3);
  }, [knowledgeMap]);


  /** The app's canonical vocabularies, handed to the analysis every call. */
  const intakeOptions = useMemo(
    () => ({
      jewelryTypes: JEWELRY_TYPES,
      metals: METAL_OPTIONS.filter((option) => option !== AUTO_METAL),
      stones: STONE_OPTIONS.filter((option) => option !== AUTO_STONE),
      stoneColors: STONE_COLOR_OPTIONS.filter((option) => option !== AUTO_STONE_COLOR),
      qualities: QUALITY_OPTIONS.filter((option) => option !== AUTO_QUALITY),
      settingTypes: SETTING_TYPE_OPTIONS.filter((option) => option !== AUTO_SETTING),
      settingRegions: TYPE_SETTING_REGIONS,
    }),
    [],
  );

  /**
   * One DEBOUNCED batch pass over ALL current references: recognition, grouping,
   * role + design-authority proposals and spec extraction. A 6-file bulk upload
   * is one call, because every change to the set restarts the timer. Any user
   * override is preserved; on failure the manual reference UI stays functional.
   */
  useEffect(() => {
    // The analysis writing back roles/grouping is not a user change.
    if (intakeJustApplied.current) {
      intakeJustApplied.current = false;
      intakeSetVersion.current = referenceSetVersion;
      return;
    }

    const urls = pieces.flatMap((piece) => piece.urls);
    // A video-only set still has something to analyse (the complete clip).
    const clipCount = pieces.filter((piece) => piece.video?.videoUrl).length;
    intakeSetVersion.current = referenceSetVersion;
    // Any in-flight request now answers an older set — drop it.
    intakeAbort.current?.abort();
    intakeToken.current += 1;
    const token = intakeToken.current;

    if (!urls.length && !clipCount) {
      setIntake({ status: "idle", stage: 0, productCount: 0, referenceCount: 0 });
      return;
    }


    // While the set is still settling we never apply conclusions.
    setIntake((prev) => ({
      status: prev.status === "ready" ? "stale" : "collecting",
      stage: 0,
      productCount: prev.productCount,
      referenceCount: urls.length,
    }));

    const version = referenceSetVersion;
    let ticker: number | undefined;

    const start = window.setTimeout(() => {
      const controller = new AbortController();
      intakeAbort.current = controller;
      setIntake({
        status: "running",
        stage: 0,
        productCount: 0,
        referenceCount: urls.length,
      });
      ticker = window.setInterval(() => {
        setIntake((prev) =>
          prev.status === "running"
            ? { ...prev, stage: Math.min(prev.stage + 1, INTAKE_STAGES.length - 1) }
            : prev,
        );
      }, 1200);

      const run = async (attempt: number): Promise<void> => {
        const intakeReferences = pieces.flatMap((piece) =>
          piece.urls.map((url, angleIndex) => ({
            url,
            role: piece.roles?.[angleIndex] || null,
            cad: isGeometryAuthority(piece, angleIndex),
            // Explicit purpose typing — the source video can never be mixed in.
            assetPurpose: "REPLACEMENT_PRODUCT_REFERENCE" as const,
            kind: isGeometryAuthority(piece, angleIndex)
              ? ("cad" as const)
              : ("photographic_still" as const),
          })),
        );
        // The COMPLETE clips — analysed directly, never keyframed, never rendered.
        const videoReferences: JewelryVideoReferenceInput[] = pieces
          .filter((piece) => piece.video?.videoUrl)
          .map((piece) => ({
            videoReferenceId: piece.video!.videoReferenceId,
            videoUrl: piece.video!.videoUrl,
            name: piece.video!.name,
            duration: piece.video!.duration,
            aspectRatio: piece.video!.aspectRatio ?? null,
          }));

        const clientStarted = performance.now();
        try {
          const result = await analyzeJewelryIntake(
            {
              jewelryReferences: intakeReferences,
              videoReferences,
              roleVocabulary: Array.from(
                new Set(pieces.flatMap((piece) => roleOptionsForType(piece.type))),
              ).filter(Boolean),
              options: intakeOptions,
              setVersion: version,
              requestId: token,
              // USER_CONFIRMED layer — analysis can never override these.
              userConfirmedFacts: userLocks,

            },
            controller.signal,
          );

          // STALE GUARD — both the monotonic request id and the set version must
          // still match the set on screen, otherwise this answer is discarded.
          if (token !== intakeToken.current) return;
          if (version !== intakeSetVersion.current) return;
          if (result.setVersion && result.setVersion !== intakeSetVersion.current) return;
          // Remember WHICH reference set this intake understood, so the shot
          // analysis can reuse the Product Knowledge Map instead of re-reading
          // every reference image.
          intakeProvenance.current = {
            fingerprint: result.fingerprint ?? null,
            references: intakeReferences,
          };
          recordJewelryTiming("intake", performance.now() - clientStarted, {
            cached: result.cached,
            server: result.timings,
          });
          applyIntake(urls, result.intake);
          setKnowledgeMap(result.intake?.knowledgeMap ?? null);
          // Derived once per reference set — never per frame, never per generation.
          setMasterProductLock(
            buildMasterProductLock({
              knowledgeMap: result.intake?.knowledgeMap ?? null,
              resolvedSpec: result.intake?.resolvedJewelrySpec ?? null,
              referenceSetVersion: version,
            }),
          );
          setIntake({
            status: "ready",

            stage: INTAKE_STAGES.length,
            productCount: result.intake?.products?.length ?? 1,
            referenceCount: urls.length,
          });

        } catch (error) {
          if (controller.signal.aborted || token !== intakeToken.current) return;
          if (version !== intakeSetVersion.current) return;
          if (attempt === 0) return run(1); // one retry max
          setIntake({
            status: "failed",
            stage: 0,
            productCount: 0,
            referenceCount: urls.length,
            error: error instanceof Error ? error.message : "Analysis failed",
          });
        }
      };

      void run(0).finally(() => {
        if (ticker) clearInterval(ticker);
      });
    }, INTAKE_DEBOUNCE_MS);

    return () => {
      clearTimeout(start);
      if (ticker) clearInterval(ticker);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceSetVersion, intakeNow]);

  /**
   * Applies the intake result: regroups the references into one card per
   * detected physical piece, RESOLVES every "Auto from reference" field to the
   * detected canonical value, and NEVER overwrites a user_override.
   */

  const applyIntake = useCallback((urls: string[], result: JewelryIntake | null) => {
    const products = Array.isArray(result?.products) ? result!.products : [];
    if (!products.length) return;
    const knowledgeMap = result?.knowledgeMap;
    /**
     * THE visible setting authority: complete reference set + complete product
     * video -> PKM -> terminology ontology -> resolvedJewelrySpec. The old
     * first-image classifier (`product.settings`) is PRELIMINARY evidence only.
     */
    const resolvedSpec = result?.resolvedJewelrySpec ?? null;
    const resolvedSettingRows = (resolvedSpec?.settings ?? []).filter(
      (setting) => setting.displayLabel || setting.setting || setting.region,
    );


    /**
     * ONE CARD = ONE PHYSICAL PIECE. A card is only ever created by the user
     * ("Add jewelry piece") or by the user answering a split question — the
     * analysis may propose, never split. When the analysis reports more products
     * than there are cards, the extra interpretations are FUSED into the card
     * that owns those references and the proposal is surfaced as a question.
     */
    const suggestion =
      knowledgeMap?.separatePieceSuggestion?.suspected === true
        ? knowledgeMap.separatePieceSuggestion
        : null;
    setSplitSuggestion(
      suggestion
        ? {
            question:
              String(suggestion.question ?? "").trim() ||
              "These files may contain more than one piece. Separate them?",
            groups: (suggestion.groups ?? [])
              .map((group) => ({
                label: String(group.label ?? "").trim() || "Piece",
                urls: (group.referenceIds ?? [])
                  .map((id) => urls[referenceIdToIndex(id)])
                  .filter((url): url is string => Boolean(url)),
              }))
              .filter((group) => group.urls.length),
          }
        : null,
    );

    setPieces((prev) => {
      // Flat view of the references exactly as they were sent.
      const flat = urls.map((url) => {
        for (const piece of prev) {
          const angleIndex = piece.urls.indexOf(url);
          if (angleIndex !== -1) return { url, piece, angleIndex };
        }
        return { url, piece: null as Piece | null, angleIndex: -1 };
      });

      /**
       * Groups are the USER'S cards — not the analysis's product count. Every
       * reference stays on the card it was uploaded to, and the analysis result
       * that best matches those references is fused into that one card.
       */
      const groups: { refIndices: number[]; base: Piece | null }[] = [];
      prev.forEach((piece) => {
        const refIndices = flat
          .map((entry, index) => (entry.piece === piece ? index : -1))
          .filter((index) => index !== -1);
        if (refIndices.length) groups.push({ refIndices, base: piece });
      });
      const orphans = flat
        .map((entry, index) => (entry.piece ? -1 : index))
        .filter((index) => index !== -1);
      if (!groups.length && orphans.length) groups.push({ refIndices: [], base: prev[0] ?? null });
      if (groups.length) groups[0].refIndices.push(...orphans);
      if (!groups.length) return prev;

      const next: Piece[] = [];

      groups.forEach((group, productIndex) => {
        const refIndices = group.refIndices;
        /**
         * All of this card's product interpretations, merged: the analysis never
         * gets to hand back two products for one physical piece.
         */
        const matches = products
          .map((entry) => ({
            entry,
            refs: (entry.references ?? []).filter(
              (ref) => Number.isInteger(ref.referenceIndex) && refIndices.includes(ref.referenceIndex!),
            ),
          }))
          .filter((candidate) => candidate.refs.length)
          .sort((a, b) => b.refs.length - a.refs.length);
        if (!matches.length) {
          if (group.base) next.push(group.base);
          return;
        }
        const product = matches[0].entry;
        // Reference rows for THIS card, in upload order, deduplicated.
        const refs = refIndices
          .map((index) => {
            const ref = matches
              .flatMap((candidate) => candidate.refs)
              .find((candidate) => candidate.referenceIndex === index);
            return { referenceIndex: index, ...(ref ?? {}) };
          });
        const base = group.base;

        const baseSources = base?.sources ?? {};
        /**
         * "Auto from reference" is a user MODE, not the spec. When the analysis
         * resolved a canonical value we write that real value into the control —
         * unless the user set the field themselves (user_override is permanent).
         */
        const resolve = (
          field: string,
          current: string | undefined,
          autoValue: string,
          detected?: DetectedField | null,
        ): { value: string; source: string } => {
          const userValue = String(current ?? "").trim();
          const isUserSet =
            baseSources[field] === "user_override" && userValue && userValue !== autoValue;
          if (isUserSet) return { value: userValue, source: "user_override" };
          const canonical = String(detected?.resolvedValue ?? "").trim();
          const tier = detected?.confidenceTier ?? "low";
          if (canonical && (tier === "high" || tier === "medium")) {
            return { value: canonical, source: tier === "high" ? "gemini_detected" : "gemini_suggested" };
          }
          return { value: userValue || autoValue, source: "unknown" };
        };

        const resolvedType = resolve("type", base?.type, JEWELRY_TYPES[0], product.jewelryType);
        const resolvedMetal = resolve("metal", base?.metal, AUTO_METAL, product.metal);
        const resolvedStone = resolve("stone", base?.stone, AUTO_STONE, product.stoneType);
        const resolvedColor = resolve("stoneColor", base?.stoneColor, AUTO_STONE_COLOR, product.stoneColor);
        const resolvedQuality = resolve("quality", base?.quality, AUTO_QUALITY, product.stoneQuality);

        // Canonical, per-region settings — the existing multi-setting rows are
        // auto-populated without the user pressing "+ Add setting". A region the
        // analysis declined is kept (type "") so it can be surfaced for review.
        // The FUSED spec wins; the preliminary per-image classifier is ignored
        // for the visible field and only fills the region list as a fallback.
        const useResolved = productIndex === 0 && resolvedSettingRows.length > 0;
        const detectedSettings = useResolved
          ? resolvedSettingRows.map((setting) => ({
            type: String(setting.setting ?? "").trim(),
            region: String(setting.region ?? "").trim() || null,
            tier: (Number(setting.confidence ?? 0) >= 0.7
              ? "high"
              : Number(setting.confidence ?? 0) >= 0.45
                ? "medium"
                : "low") as "high" | "medium" | "low",
            needsConfirmation:
              setting.needsConfirmation === true || !String(setting.setting ?? "").trim(),
            reason: String(setting.reason ?? "").trim() || null,
            // Compositional wording ("Galaxy Mosaic") shown as-is, even when it
            // is not one of the canonical dropdown values.
            label: String(setting.displayLabel ?? "").trim() || null,
          }))
          : (product.settings ?? [])
            .map((setting) => ({
              type: "",
              region: String(setting.resolvedRegion ?? setting.region ?? "").trim() || null,
              tier: "low" as const,
              // Preliminary observations always await the fused result.
              needsConfirmation: true,
              reason: String(setting.settingClassificationReason ?? "").trim() || null,
              label: null as string | null,
            }))
            .filter((setting) => setting.region);

        const userSetSettings =
          baseSources.settings === "user_override" &&
          realSettings(base ?? ({ settings: [] } as unknown as Piece)).length > 0;
        const autoSettings = detectedSettings
          .filter((setting) => setting.type || setting.region)
          .map((setting) => ({
            ...EMPTY_SETTING,
            // A declined / low-confidence region stays on Auto for the user.
            type: setting.needsConfirmation || setting.tier === "low" ? "" : setting.type,

            region: setting.region ?? "",
          }));

        const settings = userSetSettings
          ? base!.settings
          : autoSettings.length
            ? autoSettings.slice(0, 6)
            : base?.settings?.length
              ? base.settings
              : [{ ...EMPTY_SETTING }];

        next.push({
          urls: refs.map((ref) => flat[ref.referenceIndex!].url).slice(0, 6),
          roles: refs
            .map((ref) => {
              const source = flat[ref.referenceIndex!];
              const userRole = source.piece?.roles?.[source.angleIndex] ?? "";
              // A role the user picked is never replaced by a proposal.
              return userRole || String(ref.role ?? "").trim();
            })
            .slice(0, 6),
          cads: refs
            .map((ref) => {
              const source = flat[ref.referenceIndex!];
              const override = source.piece?.cads?.[source.angleIndex];
              if (override === true || override === false) return override;
              // Preselect authority only when the proposal is high-confidence.
              return ref.designAuthorityLikely === true &&
                Number(ref.designAuthorityConfidence ?? 0) >= 0.75
                ? true
                : null;
            })
            .slice(0, 6),
          // The CARD is named once, AFTER fusion — never per asset, and never
          // with AI-render language ("… Chain/Bracelet Render").
          name:
            productIndex === 0 && cleanCaseName(knowledgeMap?.productCaseName)
              ? cleanCaseName(knowledgeMap?.productCaseName)
              : cleanCaseName(product.label) || base?.name || `Piece ${productIndex + 1}`,

          type: resolvedType.value,
          metal: resolvedMetal.value,
          stone: resolvedStone.value,
          stoneColor: resolvedColor.value,
          quality: resolvedQuality.value,
          settings,
          width: base?.width ?? "",
          height: base?.height ?? "",
          depth: base?.depth ?? "",
          weight: base?.weight ?? "",
          person: base?.person ?? DEFAULT_APPLY_TO,
          notes: base?.notes ?? "",
          scope: base?.scope ?? DEFAULT_SCOPE,
          expanded: base?.expanded ?? false,
          // Kept for the summary line and for any field still left on Auto.
          detected: {
            type: product.jewelryType?.resolvedValue ?? product.jewelryType?.value ?? null,
            metal: product.metal?.resolvedValue ?? product.metal?.value ?? null,
            stone: product.stoneType?.resolvedValue ?? product.stoneType?.value ?? null,
            stoneColor: product.stoneColor?.resolvedValue ?? product.stoneColor?.value ?? null,
            // A photo-only clarity read is never treated as a detected grade.
            quality: product.stoneQuality?.resolvedValue ?? null,
            qualityEvidenceSource: product.stoneQuality?.qualityEvidenceSource ?? null,
            settings: detectedSettings.map((setting) => ({
              type: setting.type,
              region: setting.region,
              needsConfirmation: setting.needsConfirmation,
              reason: setting.reason,
              // Compositional terminology from the fused map, when available.
              label: setting.label ?? null,
            })),

          },
          sources: {
            ...baseSources,
            type: resolvedType.source,
            metal: resolvedMetal.source,
            stone: resolvedStone.source,
            stoneColor: resolvedColor.source,
            quality: resolvedQuality.source,
            settings: userSetSettings
              ? "user_override"
              : autoSettings.some((setting) => setting.type)
                ? "gemini_detected"
                : "unknown",
          },
          needsConfirmation: Array.isArray(product.needsConfirmation) ? product.needsConfirmation : [],

        });
      });

      // Cards are never added or removed here: the count can only stay the same.
      if (!next.length || next.length > prev.length) return prev;


      // These writes come from the analysis itself — they must not retrigger it.
      intakeJustApplied.current = true;
      return next.slice(0, 8);
    });
  }, []);



  /**
   * The ONLY automatic path to a second card, and it runs on the USER'S answer:
   * each suggested group's references move onto their own piece.
   */
  const separateSuggestedPieces = useCallback(() => {
    const groups = splitSuggestion?.groups ?? [];
    setSplitSuggestion(null);
    if (groups.length < 2) return;

    setPieces((prev) => {
      if (!prev.length) return prev;
      const byUrl = new Map<string, { piece: Piece; angleIndex: number }>();
      prev.forEach((piece) =>
        piece.urls.forEach((url, angleIndex) => byUrl.set(url, { piece, angleIndex })),
      );

      const assigned = new Set<string>();
      const next: Piece[] = [];
      groups.forEach((group, groupIndex) => {
        const urls = group.urls.filter((url) => byUrl.has(url) && !assigned.has(url));
        if (!urls.length) return;
        urls.forEach((url) => assigned.add(url));
        const base = byUrl.get(urls[0])!.piece;
        next.push({
          ...base,
          urls,
          roles: urls.map((url) => byUrl.get(url)!.piece.roles?.[byUrl.get(url)!.angleIndex] ?? ""),
          cads: urls.map((url) => byUrl.get(url)!.piece.cads?.[byUrl.get(url)!.angleIndex] ?? null),
          name: cleanCaseName(group.label) || `Piece ${groupIndex + 1}`,
          // A fresh piece is re-analysed from scratch, not handed old verdicts.
          detected: undefined,
          expanded: false,
        });
      });
      // Anything the split did not mention keeps its own card untouched.
      prev.forEach((piece) => {
        const rest = piece.urls.filter((url) => !assigned.has(url));
        if (!rest.length) return;
        if (rest.length === piece.urls.length && !piece.urls.some((url) => assigned.has(url))) {
          next.push(piece);
          return;
        }
        next.push({
          ...piece,
          urls: rest,
          roles: rest.map((url) => piece.roles?.[piece.urls.indexOf(url)] ?? ""),
          cads: rest.map((url) => piece.cads?.[piece.urls.indexOf(url)] ?? null),
        });
      });
      return next.length ? next.slice(0, 8) : prev;
    });
  }, [splitSuggestion]);


  /* ------------------------------ 4. Frame swaps ---------------------------- */


  /**
   * REVISION HISTORY (§36): append a brand-new generation, or update an
   * existing revision in place while it progresses. Nothing is ever removed,
   * so a regeneration can never destroy an earlier result.
   */
  const recordFrameGeneration = useCallback((generation: JewelryGeneration) => {
    if (generation.frameIndex === null || generation.frameIndex === undefined) return;
    const index = generation.frameIndex as number;
    setFrameGenerations((prev) => {
      const list = prev[index] ?? [];
      const at = list.findIndex((entry) => entry.id === generation.id);
      if (at !== -1) {
        const next = [...list];
        next[at] = generation;
        return { ...prev, [index]: next };
      }
      const appended = [...list, generation];
      // A fresh revision becomes the one on screen; approval stays where it is.
      setFrameRevision((rev) => ({ ...rev, [index]: appended.length - 1 }));
      return { ...prev, [index]: appended };
    });
  }, []);

  /** Merge a fresh generation record into whichever collection owns it. */
  const applyGeneration = useCallback(
    (generation: JewelryGeneration) => {
      if (generation.kind === "video") {
        setVideos((prev) => {
          const index = prev.findIndex((entry) => entry.id === generation.id);
          if (index === -1) return [generation, ...prev];
          const next = [...prev];
          next[index] = generation;
          return next;
        });
        return;
      }
      // CANONICAL MASTERS are not frame revisions — they update their own slot.
      if (generation.stage === "canonical_master") {
        setCanonicalMasters((prev) => {
          const key = Object.keys(prev).find(
            (entry) => prev[entry].generationId === generation.id,
          );
          if (!key) return prev;
          return {
            ...prev,
            [key]: {
              ...prev[key],
              status: generation.status,
              outputUrl: generation.outputUrl ?? prev[key].outputUrl,
              error: generation.error ?? null,
            },
          };
        });
        return;
      }
      // MATCHED PAIRS (§29) own their own slot too — a pair is a counterpart
      // plate of an approved master, not a new revision of a source frame.
      if (generation.stage === "matched_pair") {
        setMatchedPairs((prev) => {
          const key = Object.keys(prev).find(
            (entry) => prev[entry].generationId === generation.id,
          );
          if (!key) return prev;
          return {
            ...prev,
            [key]: {
              ...prev[key],
              status: generation.status,
              outputUrl: generation.outputUrl ?? prev[key].outputUrl,
              error: generation.error ?? null,
            },
          };
        });
        return;
      }
      recordFrameGeneration(generation);

    },
    [recordFrameGeneration],
  );

  /**
   * The displayed revision drives the legacy `swaps` / `altSwaps` views the
   * review UI reads, so stepping through revisions updates the whole card.
   */
  useEffect(() => {
    const nextSwaps: Record<number, JewelryGeneration> = {};
    const nextAlt: Record<number, JewelryGeneration> = {};
    for (const key of Object.keys(frameGenerations)) {
      const index = Number(key);
      const list = frameGenerations[index] ?? [];
      if (!list.length) continue;
      const at = Math.min(Math.max(frameRevision[index] ?? list.length - 1, 0), list.length - 1);
      const shown = list[at];
      const upto = list.slice(0, at + 1);
      const pro =
        shown.imageModel !== "nb2"
          ? shown
          : [...upto].reverse().find((entry) => entry.imageModel !== "nb2") ??
            list.find((entry) => entry.imageModel !== "nb2");
      const alt =
        shown.imageModel === "nb2"
          ? shown
          : [...upto].reverse().find((entry) => entry.imageModel === "nb2");
      if (pro) nextSwaps[index] = pro;
      if (alt) nextAlt[index] = alt;
    }
    setSwaps(nextSwaps);
    setAltSwaps(nextAlt);
  }, [frameGenerations, frameRevision]);

  /** Step to another revision of one frame (‹ / › in the review card). */
  const stepRevision = useCallback((index: number, delta: number) => {
    setFrameRevision((prev) => {
      const list = frameGenerationsRef.current[index] ?? [];
      if (list.length < 2) return prev;
      const current = Math.min(Math.max(prev[index] ?? list.length - 1, 0), list.length - 1);
      const next = Math.min(Math.max(current + delta, 0), list.length - 1);
      if (next === current) return prev;
      return { ...prev, [index]: next };
    });
  }, []);



  // Re-attach to anything the backend still has in flight (refresh-safe).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await callJewelrySwap<{ generations: SwapGeneration[] }>({
          action: "list",
          limit: 24,
        });
        if (cancelled) return;
        setVideos(data.generations ?? []);
      } catch {
        // The library simply stays empty; generating still works.
      } finally {
        if (!cancelled) setLibraryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const inFlightIds = useMemo(() => {
    const ids = [...Object.values(swaps), ...Object.values(altSwaps)]
      .filter((swap) => swap.status === "queued" || swap.status === "running")
      .map((swap) => swap.id);
    for (const video of videos) {
      if (video.status === "queued" || video.status === "running") ids.push(video.id);
    }
    for (const master of Object.values(canonicalMasters)) {
      if (master.generationId && (master.status === "queued" || master.status === "running")) {
        ids.push(master.generationId);
      }
    }
    for (const pair of Object.values(matchedPairs)) {
      if (pair.generationId && (pair.status === "queued" || pair.status === "running")) {
        ids.push(pair.generationId);
      }
    }
    return ids;
  }, [swaps, altSwaps, videos, canonicalMasters, matchedPairs]);

  /**
   * Adaptive status polling. A flat 5s tick meant a finished job could sit
   * invisible for the full interval; polling every second instead would just
   * add DB load for a spinner. So the interval starts tight right after
   * submission, widens as the job keeps running, resets whenever something
   * actually changes, and pauses entirely while the tab is hidden.
   */
  useEffect(() => {
    if (!inFlightIds.length) return;
    let cancelled = false;
    let timer: number | undefined;
    let delay = POLL_MIN_MS;

    const poll = async () => {
      if (document.hidden) {
        // Tab in the background: idle instead of hammering the backend.
        schedule(POLL_MAX_MS);
        return;
      }
      let changed = false;
      try {
        const data = await callJewelrySwap<{ generations: JewelryGeneration[] }>({
          action: "status",
          generationIds: inFlightIds,
        });
        if (cancelled) return;
        for (const generation of data.generations ?? []) {
          // Anything that is no longer running means state moved on screen.
          if (generation.status !== "queued" && generation.status !== "running") {
            changed = true;
          }
          applyGeneration(generation);
        }

      } catch {
        // transient — the next tick retries
      }
      if (cancelled) return;
      // Something moved → stay responsive. Nothing moved → back off gently.
      delay = changed ? POLL_MIN_MS : Math.min(Math.round(delay * 1.4), POLL_MAX_MS);
      schedule(delay);
    };

    function schedule(ms: number) {
      if (cancelled) return;
      timer = window.setTimeout(poll, ms);
    }

    const onVisible = () => {
      // Coming back to the tab should show current state immediately.
      if (document.hidden || cancelled) return;
      if (timer) clearTimeout(timer);
      delay = POLL_MIN_MS;
      void poll();
    };
    document.addEventListener("visibilitychange", onVisible);

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [inFlightIds.join(",")]);


  /** Labeled references for the function: {url, role, cad} per angle. */
  const piecePayload = useCallback(
    () =>
      pieces.map((piece) => ({
        urls: piece.urls,
        references: piece.urls.map((url, angleIndex) => ({
          url,
          role: piece.roles[angleIndex] || null,
          // Geometry authority is decided PER reference image (auto for CAD
          // labels, overridable per image).
          cad: isGeometryAuthority(piece, angleIndex),
          // Explicit backend typing — these are replacement-product references,
          // never source cinematography.
          assetPurpose: "REPLACEMENT_PRODUCT_REFERENCE" as const,
          // Only IMAGE references ever reach generation — a replacement video is
          // analysis authority and is never sent to the image renderer.
          kind: isGeometryAuthority(piece, angleIndex)
            ? ("cad" as const)
            : ("photographic_still" as const),

        })),

        type: piece.type,
        metal: piece.metal === AUTO_METAL ? null : piece.metal,
        stone: piece.stone === AUTO_STONE ? null : piece.stone,
        stoneColor: piece.stoneColor === AUTO_STONE_COLOR ? null : piece.stoneColor || null,
        quality: !piece.quality || piece.quality === AUTO_QUALITY ? null : piece.quality,
        // Structured stone-setting construction — hard product constraints.
        settings: realSettings(piece).map((setting) => ({
          type: setting.type,
          region: setting.region || null,
          stone: setting.stone || null,
          color: setting.color || null,
          quality: setting.quality || null,
        })),

        dimensions: {
          width: piece.width || null,
          height: piece.height || null,
          depth: piece.depth || null,
          weight: piece.weight || null,
        },
        cad: authorityCount(piece) > 0,
        person: piece.person,
        notes: piece.notes || null,
        scope: piece.scope || DEFAULT_SCOPE,
        // Detected values — used ONLY to resolve fields left on "Auto" so the
        // prompt never carries the literal word "Auto".
        detected: piece.detected ?? null,
        // Field provenance — lets the backend tell a CONFIRMED value apart from
        // an untouched control default when it resolves the target spec.
        sources: piece.sources ?? null,


      })),
    [pieces],
  );

  /* -------------------- Canonical master reference set (§22) ---------------- */

  /**
   * The master view set is DERIVED from the locked product topology — no
   * per-product-type list exists anywhere. Different products therefore ask for
   * different masters purely from their own evidence.
   */
  /**
   * SHOT COVERAGE PLAN (§25). Planning/logic only — it never generates anything.
   * The shot set is computed from the locked topology, then each planned shot is
   * marked COVERED (an existing master or a matching uploaded reference already
   * documents it) or MISSING. Recomputed whenever the lock, the reference set or
   * the master set changes.
   */
  const shotCoveragePlan: ShotCoveragePlan | null = useMemo(() => {
    if (!masterProductLock) return null;
    return planShotCoverage({
      lock: masterProductLock,
      masters: canonicalMasters,
      referenceLabels: pieces.flatMap((piece) => [
        piece.name,
        ...(piece.roles ?? []),
      ]).filter(Boolean) as string[],
    });
  }, [masterProductLock, canonicalMasters, pieces]);

  /**
   * D1's view selection now comes from the coverage planner (it replaces the
   * old basic topology default). `planCanonicalMasterViews` remains the
   * fallback when no coverage plan could be computed.
   */
  const canonicalMasterPlan: CanonicalMasterPlanEntry[] = useMemo(() => {
    if (shotCoveragePlan) return canonicalMasterPlanFromCoverage(shotCoveragePlan);
    return masterProductLock ? planCanonicalMasterViews(masterProductLock) : [];
  }, [shotCoveragePlan, masterProductLock]);

  /** Only the MISSING views are worth rendering when the user presses Generate. */
  const canonicalMasterTargets: CanonicalMasterPlanEntry[] = useMemo(
    () =>
      shotCoveragePlan ? missingCanonicalMasterViews(shotCoveragePlan) : canonicalMasterPlan,
    [shotCoveragePlan, canonicalMasterPlan],
  );

  const canonicalMastersDisabledReason = useMemo(() => {
    if (!masterProductLock) return "Confirm the product to lock its identity first.";
    if (!pieces.length) return "Add at least one product reference first.";
    return null;
  }, [masterProductLock, pieces.length]);

  /**
   * BATCH CONTINUATION (§28). Approved (QC-passed) plates are what a later batch
   * inherits — no product understanding is recomputed for a new batch.
   */
  const approvedMasterKeys = useMemo(
    () =>
      Object.values(canonicalMasters)
        .filter((master) => master.validated || isMasterValidated(master.validation))
        .map((master) => master.key),
    [canonicalMasters],
  );

  const batchBlocked = useMemo(
    () => batchBlockedReason({ batches, hasLock: Boolean(masterProductLock) }),
    [batches, masterProductLock],
  );

  /** Records lineage only — generation still happens via the Generate buttons. */
  const startNextBatch = useCallback(() => {
    if (batchBlocked) return;
    const batch = startCampaignBatch({
      batches,
      lockVersion: masterLockVersion,
      photographySetVersion: photographyVersion.current,
      hasOpticsProfile: Boolean(opticsProfile),
      approvedMasterKeys,
    });
    setBatches((prev) => [...prev, batch]);
    setActiveBatchId(batch.id);
  }, [batchBlocked, batches, masterProductLock, opticsProfile, approvedMasterKeys]);

  const approveBatch = useCallback((batchId: string) => {
    setBatches((prev) => approveCampaignBatch(prev, batchId));
    setActiveBatchId((current) => (current === batchId ? null : current));
  }, []);



  /**
   * EXPLICIT USER ACTION ONLY. Each planned view is one paid run on the existing
   * Nano path (same endpoint, pricing and bookkeeping as a frame swap), so this
   * is never called from analysis, restore, autosave or any effect.
   */
  const generateCanonicalMasters = useCallback(async () => {
    if (canonicalMastersDisabledReason || !canonicalMasterTargets.length) return;
    setMastersBusy(true);
    try {
      const payload = piecePayload();
      await submitWithConcurrency(
        canonicalMasterTargets,
        2,
        async (entry, index) => {
          try {
            const generation = await generateCanonicalMaster({
              view: entry.view,
              componentLabel: entry.componentLabel,
              pieces: payload,
              aspectRatio: "1:1",
              resolution: resolutionForQuality(nanoQuality),
              imageModel: "pro",
              masterProductLock,
              projectId: activeProjectIdRef.current,
              materialAuthority,
              // §E3 — attachment rules + (campaign mode only) the photography look.
              connectedAssets: connectedAssetsRef.current,
              campaignPhotography: isSwapMode ? null : campaignPhotographyProfileRef.current,
              setIndex: index,
              setSize: canonicalMasterTargets.length,
            });
            setCanonicalMasters((prev) => ({
              ...prev,
              [entry.key]: {
                key: entry.key,
                view: entry.view,
                label: entry.label,
                componentLabel: entry.componentLabel,
                generationId: generation.id,
                status: generation.status,
                outputUrl: generation.outputUrl ?? null,
                error: generation.error ?? null,
                lockVersion: masterLockVersion,
                createdAt: generation.createdAt ?? null,
                // A fresh render is never trusted: validation must run again.
                validated: false,
                validation: null,
                validationState: "idle",
                validationError: null,
              },
            }));
            // BATCH CONTINUATION (§28) — record which batch produced this plate.
            tagBatchMaster(entry.key);

          } catch (error) {
            setCanonicalMasters((prev) => ({
              ...prev,
              [entry.key]: {
                key: entry.key,
                view: entry.view,
                label: entry.label,
                componentLabel: entry.componentLabel,
                generationId: prev[entry.key]?.generationId ?? "",
                status: "failed",
                outputUrl: null,
                error: error instanceof Error ? error.message : "Could not start this master",
                lockVersion: masterLockVersion,
                createdAt: null,
                validated: false,
                validation: null,
                validationState: "idle",
                validationError: null,
              },
            }));
          }
          return null;
        },
      );
    } finally {
      setMastersBusy(false);
    }
  }, [
    canonicalMasterTargets,
    canonicalMastersDisabledReason,
    piecePayload,
    nanoQuality,
    masterProductLock,
    materialAuthority,
    tagBatchMaster,
  ]);


  /**
   * CANONICAL COMPONENT MASTERS (§24). The eligible components come purely from
   * what the Master Product Lock recorded for THIS product — no per-product-type
   * list exists, so a chain surfaces links + clasp and a pendant surfaces bail +
   * center setting from their own locked topology alone.
   */
  const canonicalComponentPlan: CanonicalComponentPlanEntry[] = useMemo(
    () => (masterProductLock ? planCanonicalComponentMasters(masterProductLock) : []),
    [masterProductLock],
  );

  /**
   * EXPLICIT USER ACTION ONLY — one component master is one paid run on the same
   * Nano path used by the D1 view masters. Never called from an effect, restore
   * or autosave, and never auto-retried.
   */
  const generateComponentMaster = useCallback(
    async (componentId: string) => {
      if (canonicalMastersDisabledReason) return;
      const entry = canonicalComponentPlan.find((item) => item.componentId === componentId);
      if (!entry) return;
      setMastersBusy(true);
      try {
        const generation = await generateCanonicalMaster({
          view: "component",
          componentLabel: entry.label,
          extraPrompt: `Isolate ONLY this component of the locked product: ${entry.geometry}. Reproduce its construction exactly as locked; show how it joins the body, and include nothing else.`,
          pieces: piecePayload(),
          aspectRatio: "1:1",
          resolution: resolutionForQuality(nanoQuality),
          imageModel: "pro",
          masterProductLock,
          projectId: activeProjectIdRef.current,
          materialAuthority,
          // §E3 — attachment rules + (campaign mode only) the photography look.
          connectedAssets: connectedAssetsRef.current,
          campaignPhotography: isSwapMode ? null : campaignPhotographyProfileRef.current,
        });
        setCanonicalMasters((prev) => ({
          ...prev,
          [entry.key]: {
            key: entry.key,
            componentId: entry.componentId,
            view: "component",
            label: entry.label,
            componentLabel: entry.label,
            generationId: generation.id,
            status: generation.status,
            outputUrl: generation.outputUrl ?? null,
            error: generation.error ?? null,
            lockVersion: masterLockVersion,
            createdAt: generation.createdAt ?? null,
            // A fresh render is never trusted — validation (§23) must run again.
            validated: false,
            validation: null,
            validationState: "idle",
            validationError: null,
          },
        }));
        tagBatchMaster(entry.key);

      } catch (error) {
        setCanonicalMasters((prev) => ({
          ...prev,
          [entry.key]: {
            key: entry.key,
            componentId: entry.componentId,
            view: "component",
            label: entry.label,
            componentLabel: entry.label,
            generationId: prev[entry.key]?.generationId ?? "",
            status: "failed",
            outputUrl: null,
            error: error instanceof Error ? error.message : "Could not start this component master",
            lockVersion: masterLockVersion,
            createdAt: null,
            validated: false,
            validation: null,
            validationState: "idle",
            validationError: null,
          },
        }));
      } finally {
        setMastersBusy(false);
      }
    },
    [
      canonicalComponentPlan,
      canonicalMastersDisabledReason,
      piecePayload,
      nanoQuality,
      masterProductLock,
      materialAuthority,
      tagBatchMaster,
    ],
  );

  /* ---------------- Matched-pair manufacturing (§29) ------------------------ */

  /**
   * Pairable plates: approved canonical masters only. Availability comes from
   * the LOCK (does this product actually have stones?) — never from a product
   * name — so any stone-bearing piece qualifies and stone-free pieces do not.
   */
  const matchedPairSources = useMemo(
    () => planMatchedPairSources({ masters: canonicalMasters }),
    [canonicalMasters],
  );

  const matchedPairsDisabledReason = useMemo(
    () => matchedPairBlockedReason({ lock: masterProductLock, sources: matchedPairSources }),
    [masterProductLock, matchedPairSources],
  );

  /**
   * EXPLICIT USER ACTION ONLY — one matched pair is ONE paid run on the same
   * Nano path used by frame swaps and canonical masters. The prompt holds
   * camera, crop, composition, lighting, orientation, scale and background
   * identical to the source plate and changes ONLY the manufacturing stage.
   */
  const generateMatchedPairFor = useCallback(
    async (sourceId: string) => {
      if (matchedPairsDisabledReason) return;
      const source = matchedPairSources.find((entry) => entry.id === sourceId);
      if (!source) return;
      const targetStage: ManufacturingStage = oppositeManufacturingStage(source.stage);
      const key = matchedPairKey(source.id, targetStage);
      setMatchedPairBusyKey(key);
      try {
        const generation = await generateMatchedPair({
          sourceImageUrl: source.url,
          sourceId: source.id,
          sourceLabel: source.label,
          sourceStage: source.stage,
          targetStage,
          pieces: piecePayload(),
          resolution: resolutionForQuality(nanoQuality),
          imageModel: "pro",
          masterProductLock,
          projectId: activeProjectIdRef.current,
          materialAuthority,
        });
        setMatchedPairs((prev) => ({
          ...prev,
          [key]: {
            key,
            sourceId: source.id,
            sourceLabel: source.label,
            sourceUrl: source.url,
            sourceStage: source.stage,
            targetStage,
            generationId: generation.id,
            status: generation.status,
            outputUrl: generation.outputUrl ?? null,
            error: generation.error ?? null,
            lockVersion: masterLockVersion,
            createdAt: generation.createdAt ?? null,
          },
        }));
      } catch (error) {
        setMatchedPairs((prev) => ({
          ...prev,
          [key]: {
            key,
            sourceId: source.id,
            sourceLabel: source.label,
            sourceUrl: source.url,
            sourceStage: source.stage,
            targetStage,
            generationId: prev[key]?.generationId ?? "",
            status: "failed",
            outputUrl: null,
            error:
              error instanceof Error ? error.message : "Could not start this matched pair",
            lockVersion: masterLockVersion,
            createdAt: null,
          },
        }));
      } finally {
        setMatchedPairBusyKey(null);
      }
    },
    [
      matchedPairSources,
      matchedPairsDisabledReason,
      piecePayload,
      nanoQuality,
      masterProductLock,
      materialAuthority,
    ],
  );



  /** Stable id for a selected frame — used to match analysis back to frames. */
  const frameIdFor = useCallback(
    (index: number) => `frame-${index}-${(frames[index]?.time ?? 0).toFixed(3)}`,
    [frames],
  );

  /** The analysis INPUTS, serialized. A change here (and only here) invalidates. */
  const analysisInputKey = useCallback(
    (indices: number[]) =>
      JSON.stringify({
        frames: indices.map((index) => frames[index]?.url ?? "").filter(Boolean).sort(),
        specs: piecePayload().map((piece: any) => ({
          references: piece.references,
          type: piece.type,
          metal: piece.metal,
          stone: piece.stone,
          stoneColor: piece.stoneColor,
          quality: piece.quality,
          settings: piece.settings,
          dimensions: piece.dimensions,
          notes: piece.notes,
        })),
      }),
    [frames, piecePayload],
  );

  /**
   * Runs the still analysis at most once per input fingerprint, with a single
   * automatic retry. Failure is never fatal — the deterministic selector and
   * the existing strict prompt take over untouched.
   */
  const ensureAnalysis = useCallback(
    async (indices: number[]): Promise<JewelryProjectAnalysis | null> => {
      const specs = piecePayload();
      const references = specs.flatMap((piece: any) => piece.references ?? []);
      if (!indices.length || !references.length) return null;

      const key = analysisInputKey(indices);
      if (analysisKey === key && analysis) return analysis;

      const sourceFrames = indices
        .map((index) => ({
          frameId: frameIdFor(index),
          timestamp: frames[index]?.time ?? 0,
          imageUrl: frames[index]?.url ?? "",
        }))
        .filter((frame) => frame.imageUrl);

      setAnalysisState("running");
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const clientStarted = performance.now();
        try {
          const result = await analyzeJewelryFrames({
            sourceFrames,
            jewelryReferences: references,
            jewelrySpecs: specs as any,
            // Lets the backend skip re-analysing the reference IMAGES when the
            // intake already understood this exact set.
            intakeFingerprint: intakeProvenance.current.fingerprint,
            intakeReferences: intakeProvenance.current.references,
          });
          recordJewelryTiming("shot-analysis", performance.now() - clientStarted, {
            cached: result.cached,
            frames: sourceFrames.length,
            server: result.timings,
          });
          setAnalysis(result.analysis);
          setAnalysisKey(key);
          setAnalysisState("ready");
          return result.analysis;
        } catch {
          if (attempt === 1) {
            setAnalysisState("failed");
            setAnalysis(null);
            setAnalysisKey(null);
          }
        }
      }

      return null;
    },
    [analysis, analysisKey, analysisInputKey, frameIdFor, frames, piecePayload],
  );

  /** This frame's advisory analysis, if the current analysis covers it. */
  const frameAnalysisFor = useCallback(
    (frameIndex: number): JewelryFrameAnalysis | null =>
      analysis?.frames?.find((entry) => entry.frameId === frameIdFor(frameIndex)) ?? null,
    [analysis, frameIdFor],
  );

  /* ---------------- DIAMOND OPTICS: analysis (cached, never per-slider) --------------- */

  /** Target stone character — WHAT reacts to the analysed source light. */
  const opticsStoneContext = useCallback(() => {
    const piece = pieces[0];
    const stoneColor = String(piece?.stoneColor ?? "").trim();
    return {
      productType: String(piece?.type ?? "").trim() || null,
      stoneType: String(piece?.stone ?? "").trim() || null,
      stoneColor: stoneColor || null,
      colorless: /colorless|d-?f|white/i.test(`${stoneColor} ${piece?.quality ?? ""}`),
      settingSummary:
        (piece?.settings ?? [])
          .map((setting) => [setting.type, setting.region].filter(Boolean).join(" ").trim())
          .filter(Boolean)
          .join("; ") || null,
    };
  }, [pieces]);

  const opticsSourceKey = videoUrl ?? frames[0]?.url ?? null;
  const opticsRequestedFor = useRef<string | null>(null);

  const runOpticsAnalysis = useCallback(async () => {
    if (!opticsSourceKey) return;
    setOpticsStatus("analyzing");
    try {
      const result = await analyzeDiamondOptics({
        mode: "global",
        sourceVideoUrl: videoUrl,
        // Fallback when the clip itself is not reachable: a few source frames
        // still carry the scene's lighting behaviour.
        sourceFrameUrls: videoUrl ? [] : frames.slice(0, 3).map((frame) => frame.url),
        stoneContext: opticsStoneContext(),
      });
      setOpticsProfile(result.profile ?? null);
      setFrameOptics({});
      setOpticsStatus(result.profile ? "ready" : "error");
    } catch {
      setOpticsStatus("error");
    }
  }, [opticsSourceKey, videoUrl, frames, opticsStoneContext]);

  useEffect(() => {
    if (!opticsSourceKey) {
      opticsRequestedFor.current = null;
      setOpticsProfile(null);
      setFrameOptics({});
      setOpticsStatus("idle");
      return;
    }
    if (opticsRequestedFor.current === opticsSourceKey) return;
    opticsRequestedFor.current = opticsSourceKey;
    void runOpticsAnalysis();
  }, [opticsSourceKey, runOpticsAnalysis]);

  /** Lightweight per-frame refinement of the global profile (cached server-side). */
  const ensureFrameOptics = useCallback(
    async (frameIndex: number): Promise<DiamondOpticsProfile | null> => {
      const cached = frameOptics[frameIndex];
      if (cached) return cached;
      const frame = frames[frameIndex];
      if (!frame || !opticsProfile) return null;
      try {
        const result = await analyzeDiamondOptics({
          mode: "frame",
          frameUrl: frame.url,
          globalProfile: opticsProfile,
          stoneContext: opticsStoneContext(),
        });
        if (result.profile) {
          setFrameOptics((prev) => ({ ...prev, [frameIndex]: result.profile! }));
          return result.profile;
        }
      } catch {
        // Refinement is advisory — the global profile still drives the prompt.
      }
      return null;
    },
    [frameOptics, frames, opticsProfile, opticsStoneContext],
  );


  const swapFrame = useCallback(
    async (
      frameIndex: number,
      options?: {
        imageModel?: JewelryImageModel;
        quality?: NanoQuality;
        preferredRole?: string | null;
        failureReason?: string | null;
        mode?: ReplacementMode;
        coverage?: Coverage;
        frameAnalysis?: JewelryFrameAnalysis | null;
        productAnalysis?: unknown;
      },
    ) => {
      const frame = frames[frameIndex];
      if (!frame) return;
      const imageModel: JewelryImageModel = options?.imageModel ?? "pro";
      const mode: ReplacementMode = options?.mode ?? frameMode[frameIndex] ?? "auto";
      const coverage: Coverage = options?.coverage ?? frameCoverage[frameIndex] ?? "auto";
      const quality: NanoQuality = options?.quality ?? nanoQuality;
      // Cached optics: the global source profile plus this frame's refinement.
      const frameOpticsProfile = opticsProfile ? await ensureFrameOptics(frameIndex) : null;
      const data = await callJewelrySwap<{ generation: JewelryGeneration }>({
        action: "swap_frame",
        sourceFrameUrl: frame.url,
        // Reference order is preserved: the source frame is image 1, then each
        // piece's angles in card order.
        pieces: piecePayload(),
        frameIndex,
        frameTime: frame.time,
        aspectRatio: meta?.aspectRatio,
        extraPrompt,
        // Pro-only API parameter — the nb2 endpoint 422s on `resolution`.
        resolution: imageModel === "pro" ? resolutionForQuality(quality) : undefined,
        imageModel,

        preferredRole:
          options?.preferredRole !== undefined
            ? options.preferredRole
            : framePreferredRole[frameIndex] || null,
        failureReason: options?.failureReason ?? null,
        mode,
        coverage,
        // Back-compat with the previous per-frame Macro toggle.
        macro: mode === "macro",
        // Stage-A advice for THIS frame — advisory only, and only if we already
        // have it. Never triggers a fresh analysis call.
        frameAnalysis:
          options?.frameAnalysis !== undefined
            ? options.frameAnalysis
            : frameAnalysisFor(frameIndex),
        productAnalysis:
          options?.productAnalysis !== undefined
            ? options.productAnalysis
            : analysis?.productAnalysis ?? null,
        // DIAMOND OPTICS — analysed source optics + user controls (no rerun).
        opticsProfile,
        frameOpticsProfile,
        opticsControls,
        // MASTER PRODUCT LOCK — the product identity every frame inherits.
        masterProductLock,
        projectId: activeProjectIdRef.current,
        // §E2 — VALIDATED canonical/component masters are extra reference
        // candidates (below the originals and CAD). Unvalidated ones are ignored.
        canonicalMasters: canonicalMastersRef.current,
        // MATERIAL APPEARANCE AUTHORITY — material realism only, zero geometry.
        materialAuthority,
        // §E3 — CONNECTED PRODUCT SYSTEMS: connected parts stay attached. Swap
        // mode keeps the SOURCE cinematography, so no photography profile here.
        connectedAssets: connectedAssetsRef.current,
      });
      // A regeneration APPENDS a revision (§36) and never unapproves the
      // revision the user already approved (§37).
      recordFrameGeneration(data.generation);
      // §E5 — remember WHICH lock version produced this generation.
      stampGeneration(data.generation?.id);

      if (imageModel !== "nb2") {
        // Remember the quality this frame actually ran at so Regenerate defaults to it.
        setFrameQuality((prev) => ({ ...prev, [frameIndex]: quality }));
      }

    },
    [
      frames,
      piecePayload,
      meta,
      extraPrompt,
      framePreferredRole,
      frameMode,
      frameCoverage,
      frameAnalysisFor,
      analysis,
      nanoQuality,
      opticsProfile,
      opticsControls,
      masterProductLock,
      materialAuthority,
      ensureFrameOptics,
      recordFrameGeneration,

    ],


  );

  /**
   * Opt-in only: runs the alternate image model WITHOUT touching the Pro result,
   * then opens the comparison modal so one of them can be approved.
   */
  const tryAlternateModel = useCallback(
    async (frameIndex: number) => {
      try {
        await swapFrame(frameIndex, { imageModel: "nb2" });
        setCompareIndex(frameIndex);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not start the alternate model");
      }
    },
    [swapFrame],
  );


  const runSelectedSwaps = useCallback(async () => {
    if (!pieces.length) {
      toast.error("Add at least one jewelry reference");
      return;
    }
    const indices = [...selectedFrames].sort((a, b) => a - b);
    if (!indices.length) {
      toast.error("Select the frames you want to swap");
      return;
    }
    setSwapping(true);
    try {
      // STAGE A runs once here — after frames are selected and references exist,
      // and before the first swap. Never per frame, per refresh or per approve.
      const project = await ensureAnalysis(indices);
      if (project) toast.success("Shot analysis ready");
      // Submissions go out a few at a time instead of strictly one-by-one, so
      // the user is not waiting on a serial chain. One failed submission is
      // isolated and never blocks the remaining frames.
      const submitStarted = performance.now();
      const outcomes = await submitWithConcurrency(indices, SWAP_SUBMIT_CONCURRENCY, (index) =>
        // Initial generation is always Nano Banana Pro only — never two models.
        swapFrame(index, {
          imageModel: "pro",
          frameAnalysis:
            project?.frames?.find((entry) => entry.frameId === frameIdFor(index)) ?? null,
          productAnalysis: project?.productAnalysis ?? null,
        }),
      );
      const failed = outcomes.filter((outcome) => !outcome.ok);
      recordJewelryTiming("swap-submit", performance.now() - submitStarted, {
        frames: indices.length,
        failed: failed.length,
        concurrency: SWAP_SUBMIT_CONCURRENCY,
      });
      const queued = indices.length - failed.length;
      if (queued) toast.success(`${queued} frame swap(s) queued`);
      if (failed.length) {
        toast.error(
          failed.length === indices.length
            ? "Could not queue the swaps"
            : `${failed.length} frame(s) could not be queued`,
        );
      }

    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue the swaps");
    } finally {
      setSwapping(false);
    }
  }, [selectedFrames, pieces, swapFrame, ensureAnalysis, frameIdFor]);



  const removeSwap = useCallback(async (frameIndex: number) => {
    const ids = (frameGenerationsRef.current[frameIndex] ?? []).map((entry) => entry.id);
    setFrameGenerations((prev) => {
      const next = { ...prev };
      delete next[frameIndex];
      return next;
    });
    setFrameRevision((prev) => {
      const next = { ...prev };
      delete next[frameIndex];
      return next;
    });
    setApprovedGenerationId((prev) => {
      const next = { ...prev };
      delete next[frameIndex];
      return next;
    });
    if (ids.length) {
      await callJewelrySwap({ action: "delete", generationIds: ids }).catch(() => null);
    }
  }, []);

  /** The result the user picked (defaults to Nano Banana Pro). */
  const selectedSwap = useCallback(
    (index: number) =>
      (chosenModel[index] === "nb2" ? altSwaps[index] : swaps[index]) ?? swaps[index] ?? null,
    [chosenModel, swaps, altSwaps],
  );

  /**
   * APPROVAL BY ID (§37): the exact revision the user approved — this, not
   * "the latest", is what animate and the Seedance rebuild consume.
   */
  const approvedSwap = useCallback(
    (index: number) => {
      const id = approvedGenerationId[index];
      if (!id) return null;
      return (frameGenerations[index] ?? []).find((entry) => entry.id === id) ?? null;
    },
    [approvedGenerationId, frameGenerations],
  );


  /* ---------------------------- 5. Reconstruction --------------------------- */

  const approvedUrls = useMemo(
    () =>
      [...approved]
        .sort((a, b) => a - b)
        .map((index) => (approvedSwap(index) ?? selectedSwap(index))?.outputUrl)
        .filter((url): url is string => !!url),
    [approved, approvedSwap, selectedSwap],
  );



  /** Seedance 2.0 supported clip lengths (model range 4–15s). */
  const DURATION_OPTIONS = [4, 6, 8, 10, 12, 15];

  const [videoDuration, setVideoDuration] = useState(15);
  const [durationTouched, setDurationTouched] = useState(false);

  // Default to the source clip length, snapped into the model's supported set.
  useEffect(() => {
    if (durationTouched || !meta?.duration) return;
    const clamped = Math.min(15, Math.max(4, meta.duration));
    const nearest = DURATION_OPTIONS.reduce((best, option) =>
      Math.abs(option - clamped) < Math.abs(best - clamped) ? option : best,
    );
    setVideoDuration(nearest);
  }, [meta, durationTouched]);


  /* ------------------------- Live dollar/credit preview --------------------- */

  /**
   * REAL estimate only. The backend prices this endpoint per image (fal pricing
   * unit price × 1), so the figure is resolution-independent — 2K and 4K show
   * the same true number rather than an invented multiplier.
   */
  const swapCostPerFrameUsd = IMAGE_FLAT_USD * NANO_COST_MULTIPLIER;
  const swapCostUsd = useMemo(
    () => swapCostPerFrameUsd * Math.max(0, selectedFrames.size),
    [selectedFrames, swapCostPerFrameUsd],
  );

  /**
   * Macro hint only: a macro-mode/coverage frame or a Gemini
   * `highDetailRecommended` flag surfaces a suggestion. Analysis never controls
   * or auto-switches the resolution.
   */
  const macroQualityHint = useMemo(() => {
    const indices = [...selectedFrames];
    return indices.some((index) => {
      if (frameMode[index] === "macro" || frameCoverage[index] === "macro") return true;
      const advice = frameAnalysisFor(index) as (JewelryFrameAnalysis & {
        highDetailRecommended?: boolean | null;
      }) | null;
      return advice?.highDetailRecommended === true || advice?.coverage === "macro_detail";
    });
  }, [selectedFrames, frameMode, frameCoverage, frameAnalysisFor]);



  const videoCostUsd = useMemo(() => {
    const perSecond = VIDEO_MODELS.find((entry) => entry.key === videoModel)?.usdPerSecond ?? 0;
    return perSecond * videoDuration * resolutionMultiplier(resolution);
  }, [videoModel, videoDuration, resolution]);

  /* --------------- Seedance director prompt preview + direct editor --------- */

  const [promptPreview, setPromptPreview] = useState<SeedanceDirectorPreview | null>(null);
  const [promptStatus, setPromptStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [promptMode, setPromptMode] = useState<"auto" | "manual">("auto");
  const [promptDraft, setPromptDraft] = useState("");
  const [promptStale, setPromptStale] = useState(false);
  const promptFingerprintRef = useRef<string | null>(null);
  /**
   * §F1 — per-generation prompt provenance: the builder output (`auto`), the
   * EXACT submitted string (`final`), whether the user edited it, and the
   * fingerprint of the inputs that produced `auto`.
   */
  const [directorPrompts, setDirectorPrompts] = useState<Record<string, DirectorPromptRecord>>({});

  /** Everything that changes the auto prompt — drives preview refresh/staleness. */
  const promptFingerprint = useMemo(
    () =>
      promptInputFingerprint({
        frames: approvedUrls,
        model: videoModel,
        duration: videoDuration,
        resolution,
        aspectRatio: meta?.aspectRatio ?? null,
        extraPrompt,
        optics: opticsProfile
          ? { scope: opticsProfile.scope ?? null, controls: opticsControls }
          : null,
      }),
    [
      approvedUrls,
      videoModel,
      videoDuration,
      resolution,
      meta,
      extraPrompt,
      opticsProfile,
      opticsControls,
    ],
  );

  const promptMaxChars = promptPreview?.maxCharacters ?? 2400;
  const promptValue = promptMode === "manual" ? promptDraft : promptPreview?.prompt ?? "";
  const promptOverLimit = promptValue.length > promptMaxChars;

  /** Non-paid: rebuilds the FUSE prompt through the backend director. */
  const refreshPromptPreview = useCallback(
    async (options?: { resetManual?: boolean }) => {
      if (!approvedUrls.length) {
        setPromptPreview(null);
        setPromptStatus("idle");
        return;
      }
      setPromptStatus("loading");
      try {
        const preview = await previewReconstructionPrompt({
          frameUrls: approvedUrls,
          model: videoModel,
          duration: videoDuration,
          resolution,
          aspectRatio: meta?.aspectRatio,
          extraPrompt,
          opticsProfile,
          opticsControls,
          masterProductLock,
          materialAuthority,
        });
        setPromptPreview(preview);
        setPromptStatus("ready");
        setPromptStale(false);
        if (options?.resetManual) {
          setPromptMode("auto");
          setPromptDraft("");
        }
      } catch {
        setPromptStatus("error");
      }
    },
    [
      approvedUrls,
      videoModel,
      videoDuration,
      resolution,
      meta,
      extraPrompt,
      opticsProfile,
      opticsControls,
      masterProductLock,
      materialAuthority,
    ],
  );

  // AUTO prompts follow the inputs; a MANUAL draft is never overwritten.
  useEffect(() => {
    if (promptFingerprintRef.current === promptFingerprint) return;
    const first = promptFingerprintRef.current === null;
    promptFingerprintRef.current = promptFingerprint;
    if (promptMode === "manual" && !first) {
      setPromptStale(true);
      return;
    }
    void refreshPromptPreview();
  }, [promptFingerprint, promptMode, refreshPromptPreview]);


  const reconstruct = useCallback(async () => {
    if (!approvedUrls.length) {
      toast.error("Approve at least one swapped frame first");
      return;
    }
    if (promptMode === "manual" && promptDraft.length > promptMaxChars) {
      toast.error(`Your prompt is over the ${promptMaxChars.toLocaleString()}-character limit`);
      return;
    }
    // §F2 — never submit a resolution the model cannot render.
    if (!supportedResolutionsFor(videoModel).includes(resolution)) {
      toast.error(
        `${resolution.toUpperCase()} is not available for this model — pick ${
          supportedResolutionsFor(videoModel).map((value) => value.toUpperCase()).join(" or ")
        }`,
      );
      return;
    }
    setReconstructing(true);
    try {
      const data = await callJewelrySwap<{ generation: SwapGeneration }>({
        action: "reconstruct",
        frameUrls: approvedUrls,
        pieces: piecePayload(),
        model: videoModel,
        duration: videoDuration,
        resolution,
        aspectRatio: meta?.aspectRatio,
        // Keeps the uploaded clip's own audio on the rebuilt video.
        preserveAudio,
        generateAudio: preserveAudio,
        extraPrompt,
        // DIAMOND OPTICS: one consistent optical character across the rebuild.
        opticsProfile,
        opticsControls,
        // MASTER PRODUCT LOCK — same identity as the approved frames.
        masterProductLock,
        // MATERIAL APPEARANCE AUTHORITY — same material reference, zero geometry.
        materialAuthority,
        // The editor owns the COMPLETE final Seedance prompt when manual.
        promptOverride: promptMode === "manual" ? promptDraft : null,
        promptInputFingerprint: promptFingerprint,
      });
      // §F1 — record exactly WHAT was submitted for this generation.
      const submitted = promptMode === "manual" ? promptDraft : promptPreview?.prompt ?? "";
      if (data.generation?.id) {
        setDirectorPrompts((prev) => ({
          ...prev,
          [data.generation.id]: {
            director_prompt_auto: promptPreview?.prompt ?? null,
            director_prompt_final: submitted,
            director_prompt_user_edited: promptMode === "manual",
            input_fingerprint: promptFingerprint,
            createdAt: new Date().toISOString(),
          },
        }));
      }
      // Non-blocking: each click is its own record, so several can run at once.
      setVideos((prev) => [data.generation, ...prev]);
      toast.success("Video queued — you can start another while this runs");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the video");
    } finally {
      setReconstructing(false);
    }
  }, [
    approvedUrls,
    piecePayload,
    videoModel,
    resolution,
    preserveAudio,
    meta,
    extraPrompt,
    videoDuration,
    opticsProfile,
    opticsControls,
    masterProductLock,
    materialAuthority,
    promptMode,
    promptDraft,
    promptMaxChars,
    promptFingerprint,
    promptPreview,
  ]);

  /** Stops tracking and frees the UI, even if the provider job keeps running. */
  const cancelVideo = useCallback(async () => {
    const id = cancelTarget;
    setCancelTarget(null);
    if (!id) return;
    setVideos((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, status: "canceled" } : entry)),
    );
    try {
      await callJewelrySwap({ action: "cancel", generationIds: [id] });
    } catch {
      // The record may already be terminal; the UI is free either way.
    }
    toast.success("Video generation canceled");
  }, [cancelTarget]);

  const deleteVideo = useCallback(async (id: string) => {
    setVideos((prev) => prev.filter((entry) => entry.id !== id));
    setVideoLightboxId((current) => (current === id ? null : current));
    await callJewelrySwap({ action: "delete", generationIds: [id] }).catch(() => null);
  }, []);


  /* --------------------- Optional: animate swapped frames ------------------- */

  // Kling clips live in the same records but carry stage="frame_animation", so
  // they never mix with the Seedance rebuilds and stay refresh-safe.
  const reconstructions = useMemo(
    () => videos.filter((entry) => entry.stage !== "frame_animation"),
    [videos],
  );
  const clips = useMemo(
    () => videos.filter((entry) => entry.stage === "frame_animation"),
    [videos],
  );
  const clipsRunning = useMemo(
    () => clips.filter((clip) => clip.status === "queued" || clip.status === "running").length,
    [clips],
  );

  const approvedFrames = useMemo(
    () =>
      [...approved]
        .sort((a, b) => a - b)
        .map((index) => ({
          index,
          url: (approvedSwap(index) ?? selectedSwap(index))?.outputUrl ?? null,
          time: frames[index]?.time ?? 0,
        }))
        .filter((entry): entry is { index: number; url: string; time: number } => !!entry.url),
    [approved, approvedSwap, selectedSwap, frames],

  );

  // Kling 3.0 without audio: $0.112 per second.
  const [animateDuration, setAnimateDuration] = useState<number>(DEFAULT_ANIMATE_DURATION);

  const [animating, setAnimating] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [cameraDirection, setCameraDirection] = useState<string>("auto");
  const [customCameraPrompt, setCustomCameraPrompt] = useState("");
  /**
   * §F6/§F7/§F8 — motion + duration resolve as: per-clip override → global
   * default → shipped default. Apply-to-all is a bulk-set (not a lock), so a
   * later per-clip change still wins.
   *
   * §F8 — overrides are keyed by the STABLE frame index, not the approved image
   * URL: approving a new revision (or a re-signed storage URL after reopen)
   * changes the URL and used to silently drop the user's per-clip setting.
   * Legacy URL-keyed entries are still read as a fallback so older projects
   * restore exactly as saved.
   */
  const [clipMotions, setClipMotions] = useState<Record<string, string>>({});
  const [clipDurations, setClipDurations] = useState<Record<string, number>>({});
  const [globalMotion, setGlobalMotion] = useState<string>(DEFAULT_MOTION_PRESET);
  type ClipRef = { index: number; url: string };
  const motionForFrame = useCallback(
    (frame: ClipRef) =>
      clipMotions[String(frame.index)] ?? clipMotions[frame.url] ?? globalMotion,
    [clipMotions, globalMotion],
  );
  const durationForFrame = useCallback(
    (frame: ClipRef) =>
      clipDurations[String(frame.index)] ?? clipDurations[frame.url] ?? animateDuration,
    [clipDurations, animateDuration],
  );
  const clipIsOverridden = useCallback(
    (frame: ClipRef) =>
      clipMotions[String(frame.index)] !== undefined ||
      clipMotions[frame.url] !== undefined ||
      clipDurations[String(frame.index)] !== undefined ||
      clipDurations[frame.url] !== undefined,
    [clipMotions, clipDurations],
  );
  /** §F8 — write the override on the stable key and retire any legacy URL key. */
  const setClipMotion = useCallback((frame: ClipRef, value: string) => {
    setClipMotions((prev) => {
      const next = { ...prev, [String(frame.index)]: value };
      delete next[frame.url];
      return next;
    });
  }, []);
  const setClipDuration = useCallback((frame: ClipRef, seconds: number) => {
    setClipDurations((prev) => {
      const next = { ...prev, [String(frame.index)]: seconds };
      delete next[frame.url];
      return next;
    });
  }, []);
  /** §F7 — bulk-set duration + motion on every approved clip (no fake quality). */
  const applySettingsToAllClips = useCallback(() => {
    setClipMotions({});
    setClipDurations({});
    toast.success(
      `Applied ${animateDuration} sec · ${
        MOTION_PRESETS.find((option) => option.value === globalMotion)?.label ?? globalMotion
      } to all clips`,
    );
  }, [animateDuration, globalMotion]);

  // Kling 3.0 without audio: $0.112 per second — summed over each clip's own length.
  const animateCostUsd = useMemo(
    () =>
      approvedFrames.reduce((total, frame) => total + 0.112 * durationForFrame(frame), 0),
    [approvedFrames, durationForFrame],
  );




  const pieceTypes = useMemo(
    () => pieces.map((piece) => piece.type).filter(Boolean),
    [pieces],
  );

  const animateFrame = useCallback(
    async (
      frame: { index: number; url: string; time: number },
      position: {
        setIndex: number;
        setSize: number;
        direction?: string;
        motionPreset?: string;
        durationSeconds?: number;
      },

    ) => {

      // Condition the animate input in the browser so the edge worker never
      // decodes a 4K image (that OOM was the HTTP 546). The approved 4K asset
      // itself is untouched — this only creates a temporary animation input.
      const conditioned = await conditionAnimateInput(frame.url);
      console.info("[jewelry-swap] animate input conditioned", {
        originalUrl: conditioned.originalUrl,
        originalBytes: conditioned.originalBytes,
        originalDimensions: conditioned.originalDimensions,
        conditionedUrl: conditioned.url,
        conditionedBytes: conditioned.conditionedBytes,
        conditionedDimensions: conditioned.conditionedDimensions,
        conditioned: conditioned.conditioned,
        note: conditioned.note ?? null,
      });
      const generation = await animateJewelryFrame({
        imageUrl: frame.url,
        animateInputUrl: conditioned.conditioned ? conditioned.url : null,
        // §F4/§F7 — per-clip override wins over the global default; submitted as-is.
        durationSeconds: position.durationSeconds ?? durationForFrame(frame),
        frameIndex: frame.index,
        frameTime: frame.time,
        cameraDirection: position.direction ?? cameraDirection,
        customPrompt: customCameraPrompt.trim() || null,
        // §F6 — this clip's own motion preset ("auto" reproduces prior output).
        motionPreset: position.motionPreset ?? motionForFrame(frame),
        setIndex: position.setIndex,
        setSize: position.setSize,
        pieceTypes,
      });

      setVideos((prev) => [generation, ...prev]);
    },
    [cameraDirection, customCameraPrompt, durationForFrame, motionForFrame, pieceTypes],


  );

  const animateApproved = useCallback(async () => {
    if (!approvedFrames.length) {
      toast.error("Approve at least one swapped frame first");
      return;
    }
    if (cameraDirection === "custom" && !customCameraPrompt.trim()) {
      toast.error("Describe the camera move, or switch back to Auto");
      return;
    }
    setAnimating(true);
    try {
      // Bounded concurrency instead of a serial chain. setIndex stays the
      // frame's own position in the approved set, so clip ordering/continuity
      // is unchanged regardless of which submission finishes first.
      const submitStarted = performance.now();
      const outcomes = await submitWithConcurrency(
        approvedFrames,
        CLIP_SUBMIT_CONCURRENCY,
        (frame, index) =>
          animateFrame(frame, { setIndex: index, setSize: approvedFrames.length }),
      );
      const failed = outcomes.filter((outcome) => !outcome.ok);
      recordJewelryTiming("clip-submit", performance.now() - submitStarted, {
        clips: approvedFrames.length,
        failed: failed.length,
        concurrency: CLIP_SUBMIT_CONCURRENCY,
      });
      const queued = approvedFrames.length - failed.length;
      if (queued) toast.success(`${queued} clip${queued === 1 ? "" : "s"} queued`);
      if (failed.length) {
        toast.error(
          failed.length === approvedFrames.length
            ? "Could not start the clips"
            : `${failed.length} clip${failed.length === 1 ? "" : "s"} could not be started`,
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the clips");
    } finally {
      setAnimating(false);
    }
  }, [approvedFrames, animateFrame, cameraDirection, customCameraPrompt]);


  const regenerateClip = useCallback(
    async (clip: JewelryGeneration) => {
      if (!clip.sourceFrameUrl) {
        toast.error("That clip has no source frame to reuse");
        return;
      }
      try {
        const position = approvedFrames.findIndex((frame) => frame.url === clip.sourceFrameUrl);
        await animateFrame(
          {
            index: clip.frameIndex ?? 0,
            url: clip.sourceFrameUrl,
            time: clip.frameTime ?? 0,
          },
          {
            setIndex: position >= 0 ? position : 0,
            setSize: Math.max(1, approvedFrames.length),
            direction: clip.cameraDirection ?? undefined,
            // §F6 — a regenerated clip keeps its own motion preset.
            motionPreset: clip.motionPreset ?? undefined,
            // §F7 — and its own length, not the current global default.
            durationSeconds: clip.durationSeconds ?? undefined,


          },
        );
        setVideos((prev) => prev.filter((entry) => entry.id !== clip.id));
        await callJewelrySwap({ action: "delete", generationIds: [clip.id] }).catch(() => null);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not regenerate that clip");
      }
    },
    [animateFrame, approvedFrames],
  );


  /** Zip every finished clip client-side so one click gets the whole set. */
  const downloadAllClips = useCallback(async () => {
    const ready = clips.filter((clip) => clip.status === "complete" && clip.outputUrl);
    if (!ready.length) {
      toast.error("No finished clips yet");
      return;
    }
    setZipping(true);
    try {
      const zip = new JSZip();
      const ordered = [...ready].sort((a, b) => (a.frameTime ?? 0) - (b.frameTime ?? 0));
      let position = 0;
      for (const clip of ordered) {
        position += 1;
        const response = await fetch(clip.outputUrl as string);
        if (!response.ok) continue;
        const blob = await response.blob();
        const name = `clip-${String(position).padStart(2, "0")}-${(clip.frameTime ?? 0).toFixed(1)}s.mp4`;
        zip.file(name, blob);
      }
      const archive = await zip.generateAsync({ type: "blob" });
      const href = URL.createObjectURL(archive);
      const link = document.createElement("a");
      link.href = href;
      link.download = "fuse-jewelry-swap-clips.zip";
      link.click();
      URL.revokeObjectURL(href);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not build the zip");
    } finally {
      setZipping(false);
    }
  }, [clips]);

  /**
   * Approval binds to the generation ON SCREEN (§37). Approving a different
   * revision moves the binding; clicking the already-approved revision clears it.
   */
  const toggleApproved = useCallback(
    (index: number) => {
      const shown = selectedSwap(index);
      if (!shown) return;
      setApprovedGenerationId((prev) => {
        const next = { ...prev };
        if (next[index] === shown.id) delete next[index];
        else next[index] = shown.id;
        return next;
      });
    },
    [selectedSwap],
  );



  const revisionInfo = useCallback(

    (index: number) => {
      const total = (frameGenerations[index] ?? []).length;
      const current = Math.min(frameRevision[index] ?? total - 1, Math.max(total - 1, 0));
      return { total, position: total ? current + 1 : 0, current };
    },
    [frameGenerations, frameRevision],
  );

  /* --------------- PRODUCT FIDELITY (§35) — analysis only ------------------- *
   * Compares a finished generation to the ACTIVE Master Product Lock through
   * the EXISTING `mode: "validate"` path. It never regenerates and never
   * spends generation credits — the user decides what to do with a WARNING.
   */
  const [fidelityAudits, setFidelityAudits] = useState<Record<string, FidelityAudit>>({});
  const [fidelityState, setFidelityState] = useState<
    Record<string, "checking" | "done" | "failed" | "skipped">
  >({});
  const [fidelityError, setFidelityError] = useState<Record<string, string>>({});

  const runFidelityCheck = useCallback(
    async (generation: JewelryGeneration | null | undefined) => {
      if (!generation?.outputUrl || generation.status !== "complete") return;
      const id = generation.id;
      // §E5 — validate against the lock version that DROVE this generation.
      // Legacy generations (no stamp) fall back to the current lock.
      const drivingStamp = generationLockVersionRef.current[id] ?? null;
      const drivingLock = resolveMasterLockForVersion(
        masterLockRegistryRef.current,
        drivingStamp,
        masterProductLock,
      );
      if (!knowledgeMap && !drivingLock) {
        setFidelityState((prev) => ({ ...prev, [id]: "skipped" }));
        return;
      }
      setFidelityState((prev) => ({ ...prev, [id]: "checking" }));
      try {
        const report = await validateAgainstKnowledgeMap({
          imageUrl: generation.outputUrl,
          knowledgeMap: (knowledgeMap ?? {}) as ProductKnowledgeMap,
          masterProductLock: drivingLock,
        });
        if (!report) {
          setFidelityState((prev) => ({ ...prev, [id]: "skipped" }));
          return;
        }
        setFidelityAudits((prev) => ({
          ...prev,
          [id]: buildFidelityAudit({
            report,
            lockVersion: masterLockVersionOf(drivingLock) ?? drivingStamp,
          }),
        }));
        setFidelityState((prev) => ({ ...prev, [id]: "done" }));
      } catch (error) {
        setFidelityError((prev) => ({
          ...prev,
          [id]: error instanceof Error ? error.message : "Fidelity check failed",
        }));
        setFidelityState((prev) => ({ ...prev, [id]: "failed" }));
      }
    },
    [knowledgeMap, masterProductLock],
  );


  /* ------- CANONICAL MASTER VALIDATION (§23) — analysis only --------------- *
   * Reuses the SAME `mode: "validate"` path as the frame fidelity audit above
   * (no second validation system). Authority order is unchanged and enforced
   * server-side: USER_CONFIRMED > original direct evidence > CAD > PKM /
   * Master Product Lock > validated canonical master. A master only becomes
   * `validated: true` when the read-out contains no FAIL; a rejected master is
   * surfaced and NEVER auto-regenerated (no generation credits are spent).
   */
  const validateCanonicalMaster = useCallback(
    async (key: string) => {
      const master = canonicalMastersRef.current[key];
      if (!master?.outputUrl || master.status !== "complete") return;
      // §E5 — a master carries the lock version it was generated with; validate
      // against THAT lock (legacy masters fall back to the current one).
      const drivingStamp = (master as { lockVersion?: string | null }).lockVersion ?? null;
      const drivingLock = resolveMasterLockForVersion(
        masterLockRegistryRef.current,
        drivingStamp,
        masterProductLock,
      );
      if (!knowledgeMap && !drivingLock) {
        setCanonicalMasters((prev) =>
          prev[key] ? { ...prev, [key]: { ...prev[key], validationState: "skipped" } } : prev,
        );
        return;
      }
      setCanonicalMasters((prev) =>
        prev[key]
          ? { ...prev, [key]: { ...prev[key], validationState: "checking", validationError: null } }
          : prev,
      );
      try {
        const report = await validateAgainstKnowledgeMap({
          imageUrl: master.outputUrl,
          knowledgeMap: (knowledgeMap ?? {}) as ProductKnowledgeMap,
          masterProductLock: drivingLock,
        });

        if (!report) {
          setCanonicalMasters((prev) =>
            prev[key] ? { ...prev, [key]: { ...prev[key], validationState: "skipped" } } : prev,
          );
          return;
        }
        const audit = buildFidelityAudit({
          report,
          lockVersion: masterLockVersionOf(drivingLock) ?? drivingStamp,
          dimensions: MASTER_DIMENSIONS,
        });

        setCanonicalMasters((prev) =>
          prev[key]
            ? {
                ...prev,
                [key]: {
                  ...prev[key],
                  validation: audit,
                  validated: isMasterValidated(audit),
                  validationState: "done",
                  validationError: null,
                },
              }
            : prev,
        );
      } catch (error) {
        setCanonicalMasters((prev) =>
          prev[key]
            ? {
                ...prev,
                [key]: {
                  ...prev[key],
                  validationState: "failed",
                  validationError:
                    error instanceof Error ? error.message : "Validation failed",
                },
              }
            : prev,
        );
      }
    },
    [knowledgeMap, masterProductLock],
  );


  const swapEntries = useMemo(
    () =>
      Object.keys(frameGenerations)
        .map(Number)
        .filter((index) => (frameGenerations[index] ?? []).length > 0)
        .sort((a, b) => a - b),
    [frameGenerations],
  );


  /* ------------------- Serialize this run into a real template -------------- */

  const canMakeTemplate = frames.length > 0 && pieces.length > 0 && approvedFrames.length > 0;
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState(
    "Reusable jewelry replacement workflow generated from Jewelry Swap.",
  );
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [createdTemplate, setCreatedTemplate] = useState<JewelrySwapTemplateResult | null>(null);

  const openTemplateModal = useCallback(() => {
    setCreatedTemplate(null);
    setTemplateName(
      `Jewelry Swap – ${new Date().toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })}`,
    );
    setTemplateDescription("Reusable jewelry replacement workflow generated from Jewelry Swap.");
    setTemplateOpen(true);
  }, []);

  const createTemplate = useCallback(async () => {
    if (!canMakeTemplate) return;
    setCreatingTemplate(true);
    try {
      const result = await createTemplateFromJewelrySwap({
        name: templateName,
        description: templateDescription,
        // Approved swapped frames define the STRUCTURE — each becomes a
        // replaceable input slot with the swapped frame as its example.
        frames: approvedFrames.map((frame, index) => ({
          url: frame.url,
          label: `Input Image ${String(index + 1).padStart(2, "0")}`,
        })),
        products: pieces.map((piece) => ({
          url: piece.urls[0],
          type: piece.type,
          label: piece.name,
          person: piece.person,
          metal: piece.metal === AUTO_METAL ? null : piece.metal,
          stone: piece.stone === AUTO_STONE ? null : piece.stone,
          quality: !piece.quality || piece.quality === AUTO_QUALITY ? null : piece.quality,
          cad: authorityCount(piece) > 0,
          notes: piece.notes || null,
        })),
        includeAnimation: clips.length > 0,
        previewUrl: approvedFrames[0]?.url ?? null,
        videoModel,
        duration: videoDuration,
        resolution,
        aspectRatio: meta?.aspectRatio,
      });
      persistTemplateLayout(result.versionId, result.positions ?? {});
      setCreatedTemplate(result);
      toast.success("Template created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the template");
    } finally {
      setCreatingTemplate(false);
    }
  }, [
    canMakeTemplate,
    templateName,
    templateDescription,
    approvedFrames,
    pieces,
    clips.length,
    videoModel,
    videoDuration,
    resolution,
    meta,
  ]);

  /* ------------------------- PROJECT PERSISTENCE (additive) ------------------------- */

  const [projects, setProjects] = useState<JewelryProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  useEffect(() => {
    activeProjectIdRef.current = projectId;
  }, [projectId]);
  const [projectName, setProjectName] = useState("Untitled project");
  const [saveStatus, setSaveStatus] = useState<ProjectSaveStatus>("idle");
  /** True while a restore is writing state, so the autosave never echoes it back. */
  const restoringProject = useRef(false);
  const lastSavedSnapshot = useRef<string | null>(null);

  const refreshProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      setProjects(await listJewelryProjects());
    } catch {
      // Projects are additive — a listing failure never blocks the workspace.
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  /** The full workspace snapshot stored in `project_state`. */
  const projectState = useMemo<JewelryProjectState>(
    () => ({
      version: JEWELRY_PROJECT_STATE_VERSION,
      // WORKSPACE MODE (§26) — the project remembers whether it is a swap or a campaign.
      mode: workspaceMode,
      videoUrl,
      videoPreview: videoUrl,
      meta,
      frames,
      selectedFrames: Array.from(selectedFrames),
      pieces,
      knowledgeMap,
      masterProductLock,
      // §E5 — lock-version provenance so a reopened project still validates a
      // generation against the lock version that actually produced it.
      masterLockRegistry,
      generationLockVersion,
      // CAMPAIGN PHOTOGRAPHY PROFILE — look only, stored so reopen never re-reads.
      photographyReferenceUrls: photographyRefs,
      campaignPhotographyProfile,
      photographySetVersion: photographyVersion.current,
      // CANONICAL MASTERS — stored per project, tagged with their view.
      canonicalMasters,
      // SHOT COVERAGE PLAN — planning read-out, recomputed on input change.
      shotCoveragePlan,
      // BATCH CONTINUATION (§28) — lineage only; survives reopen.
      batches,
      activeBatchId,
      // MATCHED PAIRS (§29) — counterpart plates linked to their source plate.
      matchedPairs: matchedPairs as unknown as Record<string, unknown>,
      // CONNECTED PRODUCT SYSTEMS (§30) — derived relationship model, data only.
      connectedAssets: connectedAssetModel as unknown as unknown | null,
      userLocks,
      analysis,
      analysisKey,
      referenceSetVersion,
      intakeFingerprint: intakeProvenance.current.fingerprint,
      intakeReferences: intakeProvenance.current.references,
      intakeSummary: intake,
      opticsProfile,
      frameOptics: frameOptics as unknown as Record<string, unknown>,
      opticsControls,
      nanoQuality,
      frameQuality: frameQuality as unknown as Record<string, unknown>,
      swaps: swaps as unknown as Record<string, unknown>,
      altSwaps: altSwaps as unknown as Record<string, unknown>,
      frameGenerations: frameGenerations as unknown as Record<string, unknown[]>,
      frameRevision: frameRevision as unknown as Record<string, number>,
      approvedGenerationId: approvedGenerationId as unknown as Record<string, string>,
      chosenModel: chosenModel as unknown as Record<string, unknown>,
      framePreferredRole: framePreferredRole as unknown as Record<string, unknown>,
      frameReason: frameReason as unknown as Record<string, unknown>,
      frameMode: frameMode as unknown as Record<string, unknown>,
      frameCoverage: frameCoverage as unknown as Record<string, unknown>,
      approved: Array.from(approved),

      extraPrompt,
      videoModel,
      resolution,
      preserveAudio,
      videoDuration,
      durationTouched,
      promptMode,
      promptDraft,
      // §F1 — prompt provenance per generation (auto / final / edited / inputs).
      directorPrompts,
      cameraDirection,
      customCameraPrompt,
      animateDuration,
      // §F6/§F7 — global motion default + per-clip overrides keyed by frame URL.
      globalMotion,
      clipMotions,
      clipDurations,


      videos,
    }),
    [
      videoUrl,
      meta,
      frames,
      selectedFrames,
      pieces,
      knowledgeMap,
      masterProductLock,
      masterLockRegistry,
      generationLockVersion,
      workspaceMode,
      photographyRefs,
      campaignPhotographyProfile,
      canonicalMasters,
      matchedPairs,
      connectedAssetModel,
      shotCoveragePlan,
      batches,
      activeBatchId,
      userLocks,
      analysis,
      analysisKey,
      referenceSetVersion,
      intake,
      opticsProfile,
      frameOptics,
      opticsControls,
      nanoQuality,
      frameQuality,
      swaps,
      altSwaps,
      chosenModel,
      frameGenerations,
      frameRevision,
      approvedGenerationId,

      framePreferredRole,
      frameReason,
      frameMode,
      frameCoverage,
      approved,
      extraPrompt,
      videoModel,
      resolution,
      preserveAudio,
      videoDuration,
      durationTouched,
      promptMode,
      promptDraft,
      // §F1 — prompt provenance per generation (auto / final / edited / inputs).
      directorPrompts,
      cameraDirection,
      customCameraPrompt,
      animateDuration,
      clipMotions,
      clipDurations,
      globalMotion,


      videos,
    ],
  );

  /**
   * AUTOSAVE: debounced ~1.5s after the workspace settles — never per keystroke.
   * A session with nothing in it (and no project yet) writes nothing at all.
   */
  useEffect(() => {
    if (restoringProject.current) return;
    const serialized = JSON.stringify(projectState);
    if (lastSavedSnapshot.current === serialized) return;
    const hasContent = Boolean(videoUrl) || frames.length > 0 || pieces.length > 0;
    if (!projectId && !hasContent) return;

    const timer = window.setTimeout(async () => {
      setSaveStatus("saving");
      try {
        if (projectId) {
          await saveJewelryProject({ id: projectId, sourceVideoUrl: videoUrl, projectState });
        } else {
          const created = await createJewelryProject({
            name: projectName,
            sourceVideoUrl: videoUrl,
            projectState,
          });
          setProjectId(created.id);
          setProjectName(created.name);
        }
        lastSavedSnapshot.current = serialized;
        setSaveStatus("saved");
        void refreshProjects();
      } catch {
        setSaveStatus("error");
      }
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [projectState, projectId, projectName, videoUrl, frames.length, pieces.length, refreshProjects]);

  /**
   * RESTORE: rebuilds the workspace from `project_state`. `intakeJustApplied`
   * is set so the reference-intake effect only records the restored
   * fingerprint — Gemini is NOT re-run unless the references actually change.
   */
  const openProject = useCallback(async (id: string) => {
    try {
      const project = await loadJewelryProject(id);
      const state = project.projectState;
      restoringProject.current = true;
      intakeJustApplied.current = true;

      setVideoUrl(state?.videoUrl ?? null);
      setVideoPreview(state?.videoPreview ?? state?.videoUrl ?? null);
      setMeta((state?.meta ?? null) as VideoMeta | null);
      setFrames((state?.frames ?? []) as Frame[]);
      setSelectedFrames(new Set((state?.selectedFrames ?? []) as number[]));
      setPieces((state?.pieces ?? []) as Piece[]);

      setKnowledgeMap((state?.knowledgeMap ?? null) as ProductKnowledgeMap | null);
      // Reuse the stored lock — reopening never recomputes or re-runs Gemini.
      setMasterProductLock((state?.masterProductLock ?? null) as MasterProductLock | null);
      // §E5 — restore the lock-version registry + per-generation stamps.
      setMasterLockRegistry((state?.masterLockRegistry ?? {}) as MasterLockRegistry);
      setGenerationLockVersion(
        (state?.generationLockVersion ?? {}) as Record<string, string>,
      );
      // Pre-campaign projects have no marker and stay on the unchanged Swap surface.
      setWorkspaceMode(state?.mode === "campaign" ? "campaign" : "swap");
      // Reuse the stored photography profile — reopening never re-reads the look.
      setPhotographyRefs((state?.photographyReferenceUrls ?? []) as string[]);
      const storedPhotography = (state?.campaignPhotographyProfile ??
        null) as CampaignPhotographyProfile | null;
      setCampaignPhotographyProfile(storedPhotography);
      photographyVersion.current = state?.photographySetVersion ?? null;
      setPhotographyStatus(storedPhotography ? "ready" : "idle");
      setCanonicalMasters(
        (state?.canonicalMasters ?? {}) as Record<string, CanonicalMaster>,
      );
      // MATCHED PAIRS (§29) — restored as-is; reopening re-renders nothing.
      setMatchedPairs((state?.matchedPairs ?? {}) as Record<string, MatchedPair>);
      // CONNECTED PRODUCT SYSTEMS (§30) — restored; rebuilt only if the lock moved.
      setConnectedAssetModel((state?.connectedAssets ?? null) as ConnectedAssetModel | null);
      // BATCH CONTINUATION (§28) — restored as-is; no batch re-runs anything.
      const storedBatches = (state?.batches ?? []) as CampaignBatch[];
      setBatches(storedBatches);
      setActiveBatchId(
        storedBatches.find((batch) => batch.id === state?.activeBatchId)?.id ??
          storedBatches.find((batch) => batch.status === "open")?.id ??
          null,
      );

      setPhotographyError(null);
      setUserLocks((state?.userLocks ?? []) as UserConfirmedFact[]);
      setAnalysis((state?.analysis ?? null) as JewelryProjectAnalysis | null);
      setAnalysisKey(state?.analysisKey ?? null);
      setAnalysisState(state?.analysis ? "ready" : "idle");
      intakeProvenance.current = {
        fingerprint: state?.intakeFingerprint ?? null,
        references: (state?.intakeReferences ?? []) as {
          url: string;
          role?: string | null;
          cad?: boolean;
        }[],
      };
      if (state?.referenceSetVersion) intakeSetVersion.current = state.referenceSetVersion;
      setIntake(
        (state?.intakeSummary as typeof intake) ?? {
          status: "idle",
          stage: 0,
          productCount: 0,
          referenceCount: 0,
        },
      );

      setOpticsProfile((state?.opticsProfile ?? null) as DiamondOpticsProfile | null);
      setFrameOptics((state?.frameOptics ?? {}) as Record<number, DiamondOpticsProfile>);
      setOpticsControls((state?.opticsControls as DiamondOpticsControls) ?? {
        ...AUTO_OPTICS_CONTROLS,
      });
      setOpticsStatus(state?.opticsProfile ? "ready" : "idle");

      setNanoQuality((state?.nanoQuality ?? "2k") as NanoQuality);
      setFrameQuality((state?.frameQuality ?? {}) as Record<number, NanoQuality>);
      // REVISION HISTORY: restore the history when present, otherwise migrate a
      // legacy single-generation project into 1-element revision lists.
      const legacySwaps = (state?.swaps ?? {}) as Record<string, JewelryGeneration>;
      const legacyAlt = (state?.altSwaps ?? {}) as Record<string, JewelryGeneration>;
      const savedHistory = (state?.frameGenerations ?? null) as Record<
        string,
        JewelryGeneration[]
      > | null;
      const history: Record<number, JewelryGeneration[]> = {};
      if (savedHistory && Object.keys(savedHistory).length) {
        for (const key of Object.keys(savedHistory)) {
          history[Number(key)] = (savedHistory[key] ?? []).filter(Boolean);
        }
      } else {
        for (const key of Object.keys(legacySwaps)) {
          const list = [legacySwaps[key], legacyAlt[key]].filter(Boolean) as JewelryGeneration[];
          if (list.length) history[Number(key)] = list;
        }
      }
      setFrameGenerations(history);
      const revisions: Record<number, number> = {};
      const savedRevisions = (state?.frameRevision ?? {}) as Record<string, number>;
      for (const key of Object.keys(history)) {
        const index = Number(key);
        const saved = savedRevisions[key] ?? savedRevisions[String(index)];
        revisions[index] =
          typeof saved === "number"
            ? Math.min(Math.max(saved, 0), history[index].length - 1)
            : history[index].length - 1;
      }
      setFrameRevision(revisions);

      // APPROVAL BY ID: restored directly, or bound to the legacy approved frame.
      const savedApproval = (state?.approvedGenerationId ?? {}) as Record<string, string>;
      const approvals: Record<number, string> = {};
      if (Object.keys(savedApproval).length) {
        for (const key of Object.keys(savedApproval)) {
          const id = savedApproval[key];
          if (id) approvals[Number(key)] = id;
        }
      } else {
        for (const index of (state?.approved ?? []) as number[]) {
          const picked =
            ((state?.chosenModel ?? {}) as Record<string, string>)[String(index)] === "nb2"
              ? legacyAlt[String(index)]
              : legacySwaps[String(index)];
          const fallback = picked ?? legacySwaps[String(index)];
          if (fallback?.id) approvals[index] = fallback.id;
        }
      }
      setApprovedGenerationId(approvals);
      setChosenModel((state?.chosenModel ?? {}) as Record<number, JewelryImageModel>);
      setFramePreferredRole((state?.framePreferredRole ?? {}) as Record<number, string>);
      setFrameReason((state?.frameReason ?? {}) as Record<number, string>);
      setFrameMode((state?.frameMode ?? {}) as Record<number, ReplacementMode>);
      setFrameCoverage((state?.frameCoverage ?? {}) as Record<number, Coverage>);

      setExtraPrompt(state?.extraPrompt ?? "");

      setVideoModel(state?.videoModel ?? "seedance-2.0");
      setResolution(state?.resolution ?? DEFAULT_VIDEO_RESOLUTION);
      setPreserveAudio(state?.preserveAudio ?? true);
      setVideoDuration(state?.videoDuration ?? 15);
      setDurationTouched(Boolean(state?.durationTouched));
      setPromptMode((state?.promptMode ?? "auto") as "auto" | "manual");
      setPromptDraft(state?.promptDraft ?? "");
      // §F1 — restore the per-generation prompt provenance.
      setDirectorPrompts(
        (state?.directorPrompts ?? {}) as Record<string, DirectorPromptRecord>,
      );
      setCameraDirection(state?.cameraDirection ?? "auto");
      setCustomCameraPrompt(state?.customCameraPrompt ?? "");
      setAnimateDuration(
        ANIMATE_DURATION_OPTIONS.includes(
          (state?.animateDuration ?? DEFAULT_ANIMATE_DURATION) as 3,
        )
          ? Number(state?.animateDuration)
          : DEFAULT_ANIMATE_DURATION,
      );
      // §F6 — restore per-clip motion, dropping any preset no longer supported.
      setClipMotions(() => {
        const raw = (state?.clipMotions ?? {}) as Record<string, unknown>;
        const valid: Record<string, string> = {};
        for (const [url, value] of Object.entries(raw)) {
          const preset = String(value ?? "");
          if (MOTION_PRESETS.some((option) => option.value === preset)) valid[url] = preset;
        }
        return valid;
      });
      // §F7 — restore the global motion default and per-clip duration overrides,
      // dropping anything outside the provider-supported sets.
      setGlobalMotion(
        MOTION_PRESETS.some((option) => option.value === state?.globalMotion)
          ? String(state?.globalMotion)
          : DEFAULT_MOTION_PRESET,
      );
      setClipDurations(() => {
        const raw = (state?.clipDurations ?? {}) as Record<string, unknown>;
        const valid: Record<string, number> = {};
        for (const [url, value] of Object.entries(raw)) {
          const seconds = Number(value);
          if (ANIMATE_DURATION_OPTIONS.includes(seconds as 3)) valid[url] = seconds;
        }
        return valid;
      });




      setProjectId(project.id);
      setProjectName(project.name);
      setSaveStatus("saved");
      toast.success(`Opened “${project.name}”`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open that project");
    } finally {
      window.setTimeout(() => {
        restoringProject.current = false;
      }, 0);
    }
  }, []);

  /** NEW PROJECT: a clean workspace; the row is created on the first save. */
  const startNewProject = useCallback(() => {
    restoringProject.current = true;
    intakeJustApplied.current = true;

    setVideoUrl(null);
    setVideoPreview(null);
    setMeta(null);
    setFrames([]);
    setSelectedFrames(new Set());
    setPieces([]);
    setKnowledgeMap(null);
    setMasterProductLock(null);
    setPhotographyRefs([]);
    setCampaignPhotographyProfile(null);
    photographyVersion.current = null;
    setPhotographyStatus("idle");
    setPhotographyError(null);
    setCanonicalMasters({});
    setBatches([]);
    setActiveBatchId(null);
    setMatchedPairs({});

    setUserLocks([]);
    setAnalysis(null);
    setAnalysisKey(null);
    setAnalysisState("idle");
    intakeProvenance.current = { fingerprint: null, references: [] };
    setIntake({ status: "idle", stage: 0, productCount: 0, referenceCount: 0 });
    setOpticsProfile(null);
    setFrameOptics({});
    setOpticsControls({ ...AUTO_OPTICS_CONTROLS });
    setOpticsStatus("idle");
    setNanoQuality("2k");
    setFrameQuality({});
    setSwaps({});
    setAltSwaps({});
    setFrameGenerations({});
    setFrameRevision({});
    setChosenModel({});
    setFramePreferredRole({});
    setFrameReason({});
    setFrameMode({});
    setFrameCoverage({});
    setApprovedGenerationId({});

    setExtraPrompt("");
    setPromptMode("auto");
    setPromptDraft("");
    setCameraDirection("auto");
    setCustomCameraPrompt("");

    setProjectId(null);
    setProjectName(`Jewelry project ${new Date().toLocaleDateString()}`);
    lastSavedSnapshot.current = null;
    setSaveStatus("idle");
    window.setTimeout(() => {
      restoringProject.current = false;
    }, 0);
  }, []);

  /** DUPLICATE: same references / PKM / specs in a new row, ready for another clip. */
  const duplicateProject = useCallback(async () => {
    try {
      const copy = await duplicateJewelryProject({
        name: `Copy of ${projectName}`,
        sourceVideoUrl: videoUrl,
        projectState,
      });
      setProjectId(copy.id);
      setProjectName(copy.name);
      lastSavedSnapshot.current = JSON.stringify(projectState);
      setSaveStatus("saved");
      await refreshProjects();
      toast.success(`Duplicated as “${copy.name}”`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not duplicate that project");
    }
  }, [projectName, projectState, videoUrl, refreshProjects]);


  return (

    <SiteShell>
      <PageMeta
        title="Jewelry Swap | FUSE"
        description="Swap the jewelry in any clip: extract source frames, replace the pieces, and rebuild the video."
        path="/app/lab/jewelry-swap"
      />

      <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6">
        <header className="mb-6 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/70">FUSE Lab</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">
              {isSwapMode ? "Jewelry Swap" : "Jewelry Campaign"}
            </h1>
            {/* MODE SWITCH (§26) — same intelligence stack, two surfaces. */}
            <div className="flex items-center gap-1 rounded-xl border border-white/12 bg-black/40 p-1">
              {(["swap", "campaign"] as JewelryWorkspaceMode[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setWorkspaceMode(option)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-[11px] font-medium capitalize transition-colors",
                    workspaceMode === option
                      ? "bg-cyan-400/15 text-cyan-100"
                      : "text-foreground/55 hover:text-foreground/80",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
            <ProjectPicker
              projects={projects}
              currentId={projectId}
              currentName={projectId ? projectName : "Unsaved session"}
              status={saveStatus}
              loading={projectsLoading}
              onSelect={(id) => void openProject(id)}
              onNew={startNewProject}
              onDuplicate={() => void duplicateProject()}
            />
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {isSwapMode
              ? "Upload a clip, replace the jewelry in the frames you pick with your references, then rebuild the same video with the new pieces."
              : "No clip needed — add your product references and FUSE builds clean campaign photography of the same locked piece across the shots it needs."}
          </p>

        </header>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          {/* LEFT: inputs */}
          <div className="space-y-5">
            {/* SWAP ONLY — campaign mode has no source cinematography. */}
            {isSwapMode ? (
            <SectionCard step={1} title="Source video" hint="MP4 or MOV, up to 60 MB.">
              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4,video/quicktime,.mp4,.mov"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void handleVideoFile(file);
                }}
              />
              {videoPreview ? (
                <div className="space-y-3">
                  <video
                    src={videoPreview}
                    controls
                    playsInline
                    className="w-full rounded-2xl border border-white/10 bg-black"
                  />
                  {meta ? (
                    <dl className="grid grid-cols-3 gap-2 text-center text-[11px]">
                      {[
                        ["Duration", `${meta.duration}s`],
                        ["Resolution", `${meta.width}×${meta.height}`],
                        ["Aspect", meta.aspectRatio],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-white/10 bg-black/30 px-2 py-2">
                          <dt className="uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
                          <dd className="mt-0.5 text-xs font-medium text-foreground">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => videoInputRef.current?.click()}
                      className="w-full rounded-xl border-white/15 bg-transparent text-xs"
                    >
                      <RefreshCw size={13} /> Replace video
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openPicker({ kind: "source" })}
                      className="w-full rounded-xl border-white/15 bg-transparent text-xs"
                    >
                      <ImageIcon size={13} /> Choose from library
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-white/15 bg-black/25 px-4 py-10 text-center transition-colors hover:border-cyan-200/50"
                  >
                    {uploadingVideo ? (
                      <Loader2 size={18} className="animate-spin text-cyan-200" />
                    ) : (
                      <Upload size={18} className="text-cyan-200" />
                    )}
                    <span className="text-sm font-medium text-foreground">Upload a clip</span>
                    <span className="text-xs text-muted-foreground">.mp4 or .mov</span>
                  </button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openPicker({ kind: "source" })}
                    className="w-full rounded-xl border-white/15 bg-transparent text-xs"
                  >
                    <ImageIcon size={13} /> Choose from library
                  </Button>
                </div>
              )}
              {sourceNotice ? (
                <p className="mt-3 rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-[11px] text-amber-100">
                  {sourceNotice}
                </p>
              ) : null}
              {extracting ? (
                <div className="mt-3 space-y-1.5">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-cyan-200/70">
                    Extracting source frames
                  </p>
                  <Progress value={extractProgress} className="h-1.5" />
                </div>
              ) : null}

            </SectionCard>
            ) : null}

            <SectionCard
              step={3}
              title="Jewelry references"
              hint="Drop everything for the piece at once — FUSE reads the references and organizes them."
            >
              <input
                ref={pieceInputRef}
                type="file"
                accept="image/*,video/mp4,video/quicktime,.mp4,.mov"
                multiple
                className="hidden"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  void addPieces(files);
                }}
              />

              <input
                ref={angleInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  void addAngles(files);
                }}
              />

              {/* ONE multi-file drop zone — no slot picking before uploading. */}
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDropActive(true);
                }}
                onDragLeave={() => setDropActive(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDropActive(false);
                  const files = Array.from(event.dataTransfer.files ?? []).filter(
                    (file) =>
                      file.type.startsWith("image/") ||
                      file.type.startsWith("video/") ||
                      /\.(mp4|mov|m4v|webm)$/i.test(file.name),
                  );
                  if (files.length) void addPieces(files);
                }}
                className={cn(
                  "mb-2.5 rounded-2xl border border-dashed bg-black/25 px-4 py-6 text-center transition-colors",
                  dropActive ? "border-cyan-200/70 bg-cyan-200/5" : "border-white/15",
                )}
              >
                <p className="text-xs text-foreground/85">
                  Upload jewelry references — drag &amp; drop product photos, CAD, video of the piece,
                  front/back/side, macro &amp; close-ups together; FUSE organizes them.
                </p>

                <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => pieceInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-black/40 px-3 py-1.5 text-[11px] text-foreground/85 transition-colors hover:border-cyan-200/50"
                  >
                    {uploadingPiece ? (
                      <Loader2 size={12} className="animate-spin text-cyan-200" />
                    ) : (
                      <Plus size={12} className="text-cyan-200" />
                    )}
                    Browse files
                  </button>
                  <button
                    type="button"
                    onClick={() => openPicker({ kind: "piece" })}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 bg-black/40 px-3 py-1.5 text-[11px] text-foreground/85 transition-colors hover:border-cyan-200/50"
                  >
                    <ImageIcon size={12} className="text-cyan-200" />
                    Library
                  </button>
                </div>
              </div>

              {/* Replacement VIDEO → stored whole for full-clip understanding. */}
              {videoWork ? (
                <div className="mb-2.5 rounded-2xl border border-white/10 bg-black/30 px-3 py-2.5 text-[11px] text-foreground/85">
                  <p className="flex items-center gap-2 font-medium">
                    <Loader2 size={12} className="animate-spin text-cyan-200" />
                    Adding your video reference…
                  </p>
                  <p className="mt-1 text-[10px] text-foreground/60">{videoWork.name}</p>
                </div>
              ) : null}




              {/* Compact analysis card — real progress only, never a fake delay. */}
              {intake.status !== "idle" ? (
                <div
                  className={cn(
                    "mb-2.5 rounded-2xl border px-3 py-2.5 text-[11px]",
                    intake.status === "failed"
                      ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
                      : "border-white/10 bg-black/30 text-foreground/85",
                  )}
                >
                  <p className="flex items-center gap-2 font-medium">
                    {intake.status === "running" ? (
                      <Loader2 size={12} className="animate-spin text-cyan-200" />
                    ) : null}
                    {intake.status === "collecting"
                      ? `${intake.referenceCount} reference${intake.referenceCount === 1 ? "" : "s"} ready`
                      : intake.status === "running"
                        ? "Understanding your jewelry…"
                        : intake.status === "stale"
                          ? "References changed"
                          : intake.status === "ready"
                            ? "Analysis ready"
                            : "Analysis unavailable — the manual reference fields below still work"}
                  </p>
                  {intake.status === "collecting" || intake.status === "stale" ? (
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-[10px] text-foreground/60">
                        Waiting for the set to settle — all references are read in one pass.
                      </span>
                      <button
                        type="button"
                        onClick={() => setIntakeNow((value) => value + 1)}
                        className="text-[10px] uppercase tracking-[0.14em] text-cyan-200 transition-opacity hover:opacity-80"
                      >
                        {intake.status === "stale" ? "Reanalyze" : "Analyze now"}
                      </button>
                    </div>
                  ) : null}
                  {intake.status === "running" ? (
                    <>
                      <ul className="mt-1.5 space-y-0.5 text-[10px] text-foreground/70">
                        {INTAKE_STAGES.map((stage, stageIndex) => (
                          <li key={stage} className="flex items-center gap-1.5">
                            <span className={stageIndex <= intake.stage ? "text-cyan-200" : "text-white/25"}>
                              {stageIndex < intake.stage ? "✓" : "•"}
                            </span>
                            {stage}
                          </li>
                        ))}
                      </ul>
                      {/* File management stays live during analysis — this only
                          drops the pending result, never the uploads. */}
                      <button
                        type="button"
                        onClick={() => {
                          intakeToken.current += 1;
                          intakeAbort.current?.abort();
                          setIntake({ status: "idle", stage: 0, productCount: 0, referenceCount: 0 });
                        }}
                        className="mt-1.5 text-[10px] uppercase tracking-[0.14em] text-foreground/60 transition-colors hover:text-foreground"
                      >
                        Cancel analysis
                      </button>
                    </>
                  ) : null}

                  {intake.status === "failed" && intake.error ? (
                    <p className="mt-1 text-[10px] opacity-80">{intake.error}</p>
                  ) : null}
                  {intake.status === "ready" ? (
                    <div className="mt-1.5 space-y-1">
                      {intake.productCount > 1 ? (
                        <p className="text-[10px] text-cyan-100/85">
                          We found {intake.productCount} products — confirm the grouping below, or reassign a
                          reference from a card's "Edit analysis".
                        </p>
                      ) : null}
                      {uncertainCount > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setPieces((prev) =>
                              prev.map((item) =>
                                reviewControls(item).size ? { ...item, expanded: true } : item,
                              ),
                            )
                          }
                          className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100"
                        >
                          Review {uncertainCount} detail{uncertainCount === 1 ? "" : "s"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setIntake((prev) => ({ ...prev, status: "idle" }))}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-200/40 bg-cyan-200/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100"
                        >
                          <Check size={11} />
                          Looks right — Continue
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* What FUSE understood — plain summary, engineering detail opt-in. */}
              {knowledgeMap ? (
                <div className="mb-2.5 rounded-2xl border border-cyan-200/25 bg-cyan-200/5 px-3 py-2.5 text-[11px]">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">
                    FUSE understood
                  </p>
                  <p className="mt-1 text-foreground/85">{understoodSummary}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {coverageBadges.map((badge) => (
                      <span
                        key={badge.label}
                        className="rounded-full border border-white/12 bg-black/40 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-foreground/70"
                      >
                        {badge.label}: {badge.level}
                      </span>
                    ))}
                  </div>
                  {reconstructionNotes.length ? (
                    <ul className="mt-1.5 space-y-0.5 text-[10px] text-foreground/70">
                      {reconstructionNotes.map((note) => (
                        <li key={note}>· {note}</li>
                      ))}
                    </ul>
                  ) : null}
                  {(knowledgeMap.styleDescriptors?.length ?? 0) > 0 ? (
                    <p className="mt-1.5 text-[10px] text-foreground/55">
                      Style read: {knowledgeMap.styleDescriptors!.slice(0, 4).join(", ")}
                    </p>
                  ) : null}
                  {evidenceRequests.length ? (
                    <ul className="mt-1.5 space-y-0.5 text-[10px] text-amber-100/85">
                      {evidenceRequests.map((request) => (
                        <li key={request}>· {request}</li>
                      ))}
                    </ul>
                  ) : null}
                  {(knowledgeMap.unresolvedFeatures?.length ?? 0) > 0 ? (
                    <p className="mt-1.5 text-[10px] text-amber-100/85">
                      {knowledgeMap.unresolvedFeatures!.length} detail
                      {knowledgeMap.unresolvedFeatures!.length === 1 ? "" : "s"} need confirmation
                    </p>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => setEngineeringOpen((open) => !open)}
                    className="mt-1.5 text-[10px] uppercase tracking-[0.14em] text-foreground/55 transition-colors hover:text-foreground"
                  >
                    {engineeringOpen ? "Hide engineering details" : "Engineering details"}
                  </button>
                  {engineeringOpen ? (
                    <div className="mt-1.5 space-y-2">
                      {/* MANUAL override — advanced only. The normal UI has no
                          authority control at all; FUSE assigns it per attribute. */}
                      <div className="rounded-xl border border-white/10 bg-black/40 p-2">
                        <p className="text-[9px] uppercase tracking-[0.14em] text-cyan-200/70">
                          Manual geometry-authority override
                        </p>
                        <p className="mb-1 text-[9px] text-foreground/50">
                          Only for exceptional cases — leave alone to let FUSE decide.
                        </p>
                        <div className="space-y-1">
                          {pieces.map((piece, pieceIndex) =>
                            piece.urls.map((url, angleIndex) => (
                              <label
                                key={`override-${url}-${angleIndex}`}
                                className="flex items-center gap-1.5 text-[9px] text-foreground/70"
                              >
                                <input
                                  type="checkbox"
                                  checked={isGeometryAuthority(piece, angleIndex)}
                                  onChange={(event) =>
                                    setPieces((prev) =>
                                      prev.map((item, i) =>
                                        i === pieceIndex
                                          ? {
                                              ...item,
                                              cads: item.urls.map((_, a) =>
                                                a === angleIndex
                                                  ? event.target.checked
                                                  : item.cads?.[a] ?? null,
                                              ),
                                            }
                                          : item,
                                      ),
                                    )
                                  }
                                  className="h-2.5 w-2.5 accent-cyan-300"
                                />
                                {refIdByUrl.get(url) ?? `REF ${angleIndex + 1}`} ·{" "}
                                {piece.roles?.[angleIndex] || "unlabeled"}
                                {autoAuthorityLabelByUrl.get(url)
                                  ? ` · auto: ${autoAuthorityLabelByUrl.get(url)}`
                                  : ""}
                              </label>
                            )),
                          )}
                        </div>
                      </div>
                      {/* MATERIAL APPEARANCE AUTHORITY — material realism only.
                          Auto-derived; this override exists for rare cases. */}
                      <div className="rounded-xl border border-white/10 bg-black/40 p-2">
                        <p className="text-[9px] uppercase tracking-[0.14em] text-cyan-200/70">
                          Material-appearance authority
                        </p>
                        <p className="mb-1 text-[9px] text-foreground/50">
                          Drives metal finish, polish, microtexture, brilliance and fire realism only
                          — it contributes no geometry, stone layout, setting or product identity.
                        </p>
                        <p className="mb-1 text-[9px] text-foreground/70">
                          {materialAuthority
                            ? `${materialAuthorityLabel(materialAuthority)} · ${
                              materialAuthority.source === "user" ? "manual" : "auto"
                            }`
                            : "No reference is clearly strongest for material yet."}
                        </p>
                        <select
                          value={materialAuthorityOverride ?? ""}
                          onChange={(event) =>
                            setMaterialAuthorityOverride(event.target.value || null)
                          }
                          className="w-full rounded-lg border border-white/12 bg-black/50 px-2 py-1 text-[9px] text-foreground/80"
                        >
                          <option value="">Auto (FUSE decides)</option>
                          {pieces.flatMap((piece) =>
                            piece.urls.map((url, angleIndex) => {
                              const refId = refIdByUrl.get(url) ?? `REF_${angleIndex + 1}`;
                              return (
                                <option key={`material-${url}-${angleIndex}`} value={refId}>
                                  {refId} · {piece.roles?.[angleIndex] || "unlabeled"}
                                </option>
                              );
                            }),
                          )}
                        </select>
                      </div>
                      {/* CANONICAL MASTERS (§22) — user-triggered paid Nano runs. */}
                      <CanonicalMastersPanel
                        plan={canonicalMasterPlan}
                        componentPlan={canonicalComponentPlan}
                        coverageSummary={
                          shotCoveragePlan
                            ? `Coverage — ${shotCoveragePlan.coveredCount} of ${shotCoveragePlan.entries.length} planned shots covered, ${shotCoveragePlan.missingCount} still missing.`
                            : null
                        }
                        masters={canonicalMasters}
                        busy={mastersBusy}
                        disabledReason={canonicalMastersDisabledReason}
                        onGenerate={() => void generateCanonicalMasters()}
                        onGenerateComponent={(componentId) =>
                          void generateComponentMaster(componentId)
                        }
                        onValidate={(key) => void validateCanonicalMaster(key)}
                      />
                      {/* MATCHED PAIRS (§29) — user-triggered paid Nano runs. */}
                      <MatchedPairPanel
                        sources={matchedPairSources}
                        pairs={matchedPairs}
                        busyKey={matchedPairBusyKey}
                        disabledReason={matchedPairsDisabledReason}
                        onGenerate={(sourceId) => void generateMatchedPairFor(sourceId)}
                      />
                      {/* CAMPAIGN PHOTOGRAPHY PROFILE (§20) — look only, no geometry. */}
                      <CampaignPhotographyPanel
                        referenceUrls={photographyRefs}
                        profile={campaignPhotographyProfile}
                        status={photographyStatus}
                        error={photographyError}
                        onAdd={(files) => void addPhotographyRefs(files)}
                        onRemove={removePhotographyRef}
                        onAnalyze={() => void analyzePhotography()}
                      />
                      <pre className="max-h-64 overflow-auto rounded-xl border border-white/10 bg-black/50 p-2 text-[9px] leading-relaxed text-foreground/70">
                        {JSON.stringify({ knowledgeMap, userConfirmedFacts: userLocks }, null, 2)}
                      </pre>
                    </div>
                  ) : null}
                  {/* GENUINE conflicts only — one plain question, answer becomes USER_CONFIRMED. */}
                  {authorityQuestions.length ? (
                    <div className="mt-2 space-y-2">
                      {authorityQuestions.map((question) => (
                        <div
                          key={question.id}
                          className="rounded-xl border border-amber-300/40 bg-amber-300/5 p-2"
                        >
                          <p className="text-[10px] text-amber-100/90">{question.question}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {question.options.map((option) => (
                              <button
                                key={option}
                                type="button"
                                onClick={() =>
                                  setUserLocks((prev) => [
                                    ...prev.filter((lock) => lock.attribute !== question.attribute),
                                    { attribute: question.attribute, value: option },
                                  ])
                                }
                                className="rounded-lg border border-amber-300/40 bg-black/40 px-2 py-1 text-[10px] text-amber-100 transition-colors hover:border-amber-200 hover:text-amber-50"
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {userLocks.length ? (
                    <p className="mt-1.5 text-[9px] text-foreground/55">
                      {userLocks.length} detail{userLocks.length === 1 ? "" : "s"} locked by you
                    </p>
                  ) : null}

                </div>
              ) : null}


              {/* A QUESTION, never an action: FUSE never splits a card itself. */}
              {splitSuggestion && splitSuggestion.groups.length > 1 ? (
                <div className="mb-2.5 rounded-2xl border border-amber-200/40 bg-amber-200/[0.06] p-3">
                  <p className="text-[11px] text-foreground/85">{splitSuggestion.question}</p>
                  <p className="mt-1 text-[10px] text-foreground/55">
                    {splitSuggestion.groups
                      .map((group) => `${group.label} (${group.urls.length})`)
                      .join(" · ")}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={separateSuggestedPieces}
                      className="rounded-lg border border-amber-200/50 bg-amber-200/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-100"
                    >
                      Separate them
                    </button>
                    <button
                      type="button"
                      onClick={() => setSplitSuggestion(null)}
                      className="rounded-lg border border-white/15 bg-black/40 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground/70"
                    >
                      Keep as one piece
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="space-y-2.5">

                {pieces.map((piece, index) => (

                  <div
                    key={`${piece.urls[0] ?? index}-${index}`}
                    className={cn(
                      "rounded-2xl border bg-black/25 p-2.5",
                      authorityCount(piece) > 0 ? "border-cyan-200/50" : "border-white/10",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <p className="truncate text-[11px] font-medium text-foreground" title={piece.name}>
                          {piece.name || `Piece ${index + 1}`}
                        </p>
                        {/* ONE physical piece, described by several observations. */}
                        <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-foreground/45">
                          One product ·{" "}
                          {piece.urls.length + (piece.video ? 1 : 0)}{" "}
                          {piece.urls.length + (piece.video ? 1 : 0) === 1 ? "reference" : "references"}
                          {piece.urls.length + (piece.video ? 1 : 0) > 1 ? " combined" : ""}
                        </p>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">

                        {piece.video ? (
                          <span className="rounded-full border border-cyan-200/40 bg-cyan-200/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-cyan-100">
                            Video reference · {formatDuration(piece.video.duration)} · full clip
                            analysed
                          </span>
                        ) : null}


                        {/* No authority read-out in the normal UI — FUSE assigns it.
                            The full ranking lives in Engineering details. */}

                        <button
                          type="button"
                          aria-label="Remove piece"
                          onClick={() => setPieces((prev) => prev.filter((_, i) => i !== index))}
                          className="rounded-lg border border-white/15 bg-black/50 p-1.5 text-foreground/70 transition-colors hover:border-red-400/60 hover:text-red-300"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    </div>

                    {/* Every image on this card describes the SAME physical piece. */}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {piece.urls.map((url, angleIndex) => (
                        <div key={`${url}-${angleIndex}`} className="w-20 space-y-1">
                          <div className="relative h-16 w-20 overflow-hidden rounded-lg border border-white/10 bg-black/50">
                            <img src={url} alt={`Angle ${angleIndex + 1}`} className="h-full w-full object-cover" />
                            {piece.urls.length > 1 ? (
                              <button
                                type="button"
                                aria-label="Remove angle"
                                onClick={() =>
                                  setPieces((prev) =>
                                    prev.map((item, i) =>
                                      i === index
                                        ? {
                                            ...item,
                                            urls: item.urls.filter((_, a) => a !== angleIndex),
                                            roles: item.roles.filter((_, a) => a !== angleIndex),
                                            cads: item.urls
                                              .map((_, a) => item.cads?.[a] ?? null)
                                              .filter((_, a) => a !== angleIndex),
                                          }
                                        : item,
                                    ),
                                  )
                                }
                                className="absolute right-0.5 top-0.5 rounded bg-black/80 p-0.5 text-foreground/80 hover:text-red-300"
                              >
                                <X size={9} />
                              </button>
                            ) : null}
                            {/* EVIDENCE ROLE only — never a per-asset product name. */}
                            {evidenceRoleFor(url) ? (
                              <span className="absolute bottom-0.5 left-0.5 max-w-[72px] truncate rounded bg-black/75 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-[0.1em] text-foreground/75">
                                {evidenceRoleFor(url)}
                              </span>
                            ) : null}
                          </div>

                          {/* Optional role label — helps the model match the source view. */}
                          <select
                            aria-label={`Role for angle ${angleIndex + 1}`}
                            value={piece.roles[angleIndex] ?? ""}
                            onChange={(event) =>
                              setPieces((prev) =>
                                prev.map((item, i) =>
                                  i === index
                                    ? {
                                        ...item,
                                        roles: item.urls.map((_, a) =>
                                          a === angleIndex ? event.target.value : item.roles[a] ?? "",
                                        ),
                                      }
                                    : item,
                                ),
                              )
                            }
                            className="w-full rounded-md border border-white/12 bg-black/40 px-1 py-1 text-[9px] text-foreground outline-none transition-colors hover:border-cyan-200/40 focus:border-cyan-200/60"
                          >
                            {Array.from(
                              new Set([
                                ...roleOptionsForType(piece.type),
                                piece.roles[angleIndex] ?? "",
                              ]),
                            ).map((option) => (
                              <option key={option || "unlabeled"} value={option}>
                                {option || "Role (optional)"}
                              </option>
                            ))}
                          </select>
                          {/* AUTO label only — authority is assigned by FUSE, never by
                              the user. Hidden entirely when it wouldn't be useful. */}
                          {autoAuthorityLabelByUrl.get(url) ? (
                            <p className="truncate text-[8px] font-semibold uppercase tracking-[0.12em] text-cyan-200/80">
                              {autoAuthorityLabelByUrl.get(url)}
                            </p>
                          ) : null}

                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setAngleTarget(index);
                          angleInputRef.current?.click();
                        }}
                        className="flex h-16 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/15 bg-black/25 text-[9px] text-foreground/75 transition-colors hover:border-cyan-200/50"
                      >
                        <Plus size={12} className="text-cyan-200" />
                        Angle
                      </button>
                      <button
                        type="button"
                        onClick={() => openPicker({ kind: "angle", index })}
                        className="flex h-16 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-white/12 bg-black/25 text-[9px] text-foreground/75 transition-colors hover:border-cyan-200/50"
                      >
                        <ImageIcon size={12} className="text-cyan-200" />
                        Library
                      </button>

                    </div>

                    {/* Collapsed summary — Gemini's detected product, settings and
                        authority. The full structured controls live behind
                        "Edit analysis" and no field was removed. */}
                    <div className="mt-2 space-y-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                      <p className="text-[9px] uppercase tracking-[0.14em] text-cyan-200/70">Detected product</p>
                      <p className="text-[11px] text-foreground/85">{detectedProductLine(piece)}</p>
                      <p className="text-[9px] uppercase tracking-[0.14em] text-cyan-200/70">Settings</p>
                      <p className="text-[11px] text-foreground/85">{detectedSettingsLine(piece)}</p>
                      {/* Authority is automatic and intentionally not shown here. */}

                      {reviewControls(piece).size ? (
                        <p className="text-[10px] text-amber-200/90">
                          Review {reviewControls(piece).size} detail
                          {reviewControls(piece).size === 1 ? "" : "s"}:{" "}
                          {[...reviewControls(piece)].join(", ")}
                        </p>
                      ) : null}
                      {piece.detected?.qualityEvidenceSource === "visual_only" ? (
                        <p className="text-[10px] text-foreground/60">
                          Stone quality can't be graded from photography — confirm it yourself.
                        </p>
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          setPieces((prev) =>
                            prev.map((item, i) => (i === index ? { ...item, expanded: !item.expanded } : item)),
                          )
                        }
                        className="mt-1 text-[10px] uppercase tracking-[0.14em] text-cyan-200/80 transition-colors hover:text-cyan-100"
                      >
                        {piece.expanded
                          ? "Hide analysis"
                          : reviewControls(piece).size
                            ? `Review ${reviewControls(piece).size} details`
                            : "Edit analysis"}
                      </button>

                    </div>

                    {piece.expanded === true ? (
                      <>
                    <div className="mt-2.5 grid gap-2 sm:grid-cols-2">

                      <div>
                        <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
                          Type{detectedTag(piece.sources, "type")}{reviewTag(piece, "type")}
                        </label>
                        <select
                          value={piece.type}
                          onChange={(event) =>
                            setPieces((prev) =>
                              prev.map((item, i) =>
                                i === index ? withOverride(item, "type", { type: event.target.value }) : item,
                              ),
                            )
                          }

                          className={selectClass(piece, "type")}
                        >
                          {JEWELRY_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
                          Metal{detectedTag(piece.sources, "metal")}{reviewTag(piece, "metal")}
                        </label>
                        <select
                          value={piece.metal}
                          onChange={(event) =>
                            setPieces((prev) =>
                              prev.map((item, i) =>
                                i === index ? withOverride(item, "metal", { metal: event.target.value }) : item,
                              ),
                            )
                          }

                          className={selectClass(piece, "metal")}
                        >
                          {METAL_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
                          Stone{detectedTag(piece.sources, "stone")}{reviewTag(piece, "stone")}
                        </label>
                        <select
                          value={piece.stone}
                          onChange={(event) =>
                            setPieces((prev) =>
                              prev.map((item, i) =>
                                i === index ? withOverride(item, "stone", { stone: event.target.value }) : item,
                              ),
                            )
                          }
                          className={selectClass(piece, "stone")}
                        >
                          {STONE_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
                          Stone color{detectedTag(piece.sources, "stoneColor")}{reviewTag(piece, "stoneColor")}
                        </label>
                        <select
                          value={piece.stoneColor || AUTO_STONE_COLOR}
                          onChange={(event) =>
                            setPieces((prev) =>
                              prev.map((item, i) =>
                                i === index
                                  ? withOverride(item, "stoneColor", { stoneColor: event.target.value })
                                  : item,
                              ),
                            )
                          }
                          className={selectClass(piece, "stoneColor")}
                        >
                          {STONE_COLOR_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
                          Quality{detectedTag(piece.sources, "quality")}{reviewTag(piece, "quality")}
                        </label>
                        <select
                          value={piece.quality || AUTO_QUALITY}
                          onChange={(event) =>
                            setPieces((prev) =>
                              prev.map((item, i) =>
                                i === index ? withOverride(item, "quality", { quality: event.target.value }) : item,
                              ),
                            )
                          }

                          className={selectClass(piece, "quality")}
                        >
                          {QUALITY_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Structured setting construction. Region mapping only appears
                        once a second setting exists — one setting needs no region. */}
                    <div className="mt-2 space-y-1.5">
                      {(piece.settings?.length ? piece.settings : [EMPTY_SETTING]).map(
                        (setting, settingIndex) => {
                          const multiple = (piece.settings?.length ?? 1) > 1;
                          return (
                            <div key={settingIndex} className="grid gap-1.5 sm:grid-cols-2">
                              <div>
                                {settingIndex === 0 ? (
                                  <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
                                    Setting{detectedTag(piece.sources, "settings")}{reviewTag(piece, "settings")}
                                  </label>
                                ) : null}
                                <select
                                  value={setting.type || AUTO_SETTING}
                                  onChange={(event) =>
                                    setPieces((prev) =>
                                      prev.map((item, i) =>
                                        i === index
                                          ? withOverride(item, "settings", {
                                            settings: (item.settings?.length
                                              ? item.settings
                                              : [{ ...EMPTY_SETTING }]
                                            ).map((entry, j) =>
                                              j === settingIndex
                                                ? { ...entry, type: event.target.value }
                                                : entry,
                                            ),
                                          })
                                          : item,
                                      ),
                                    )
                                  }
                                  className={selectClass(piece, "settings")}
                                >
                                  {SETTING_TYPE_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              {multiple ? (
                                <div className="flex items-end gap-1.5">
                                  <select
                                    value={setting.region || ""}
                                    onChange={(event) =>
                                      setPieces((prev) =>
                                        prev.map((item, i) =>
                                          i === index
                                            ? withOverride(item, "settings", {
                                              settings: (item.settings ?? []).map((entry, j) =>
                                                j === settingIndex
                                                  ? { ...entry, region: event.target.value }
                                                  : entry,
                                              ),
                                            })
                                            : item,
                                        ),
                                      )
                                    }

                                    className={SELECT_CLASS}
                                  >
                                    <option value="">Region…</option>
                                    {settingRegionsForType(piece.type).map((option) => (
                                      <option key={option} value={option}>
                                        {option}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPieces((prev) =>
                                        prev.map((item, i) =>
                                          i === index
                                            ? {
                                              ...item,
                                              settings: (item.settings ?? []).filter(
                                                (_, j) => j !== settingIndex,
                                              ),
                                            }
                                            : item,
                                        ),
                                      )
                                    }
                                    className="h-8 shrink-0 rounded-lg border border-white/12 px-2 text-[10px] uppercase tracking-[0.14em] text-white/45 transition-colors hover:border-white/25 hover:text-white/80"
                                  >
                                    Remove
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          );
                        },
                      )}
                      {/* Why the classifier landed where it did, per region —
                          shown so a declined region is reviewable, not guessed. */}
                      {(piece.detected?.settings ?? [])
                        .filter((entry) => entry.reason)
                        .map((entry, entryIndex) => (
                          <p
                            key={`reason-${entryIndex}`}
                            className={cn(
                              "text-[10px] leading-snug",
                              entry.needsConfirmation ? "text-amber-200/85" : "text-foreground/55",
                            )}
                          >
                            <span className="uppercase tracking-[0.14em]">
                              {entry.region || "Region"}
                            </span>{" "}
                            — {entry.label
                              ? `${entry.label}. `
                              : entry.needsConfirmation
                                ? "Needs confirmation. "
                                : `${entry.type}. `}

                            {entry.reason}
                          </p>
                        ))}
                      <button
                        type="button"
                        onClick={() =>
                          setPieces((prev) =>
                            prev.map((item, i) =>
                              i === index
                                ? {
                                  ...item,
                                  settings: [
                                    ...(item.settings?.length ? item.settings : [{ ...EMPTY_SETTING }]),
                                    { ...EMPTY_SETTING },
                                  ].slice(0, 6),
                                }
                                : item,
                            ),
                          )
                        }
                        className="text-[10px] uppercase tracking-[0.14em] text-cyan-200/70 transition-colors hover:text-cyan-100"
                      >
                        + Add setting
                      </button>
                    </div>



                    <div className="mt-2 grid grid-cols-4 gap-1.5">
                      {(
                        [
                          ["width", "W mm"],
                          ["height", "H mm"],
                          ["depth", "D mm"],
                          ["weight", "g"],
                        ] as const
                      ).map(([field, label]) => (
                        <Input
                          key={field}
                          value={piece[field]}
                          inputMode="decimal"
                          onChange={(event) =>
                            setPieces((prev) =>
                              prev.map((item, i) =>
                                i === index ? { ...item, [field]: event.target.value } : item,
                              ),
                            )
                          }
                          placeholder={label}
                          className="h-8 rounded-lg border-white/12 bg-black/40 text-center text-[11px]"
                        />
                      ))}
                    </div>

                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
                          Apply to
                        </label>
                        <select
                          value={piece.person}
                          onChange={(event) =>
                            setPieces((prev) =>
                              prev.map((item, i) => (i === index ? { ...item, person: event.target.value } : item)),
                            )
                          }
                          className={SELECT_CLASS}
                        >
                          {APPLY_TO_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
                          Notes
                        </label>
                        <Input
                          value={piece.notes}
                          onChange={(event) =>
                            setPieces((prev) =>
                              prev.map((item, i) => (i === index ? { ...item, notes: event.target.value } : item)),
                            )
                          }
                          placeholder="Optional"
                          className="h-8 rounded-lg border-white/12 bg-black/40 text-xs"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
                          Replacement includes
                        </label>
                        <select
                          value={piece.scope || DEFAULT_SCOPE}
                          onChange={(event) =>
                            setPieces((prev) =>
                              prev.map((item, i) => (i === index ? { ...item, scope: event.target.value } : item)),
                            )
                          }
                          className={SELECT_CLASS}
                        >
                          {SCOPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                      </>
                    ) : null}

                  </div>

                ))}
                <button
                  type="button"
                  onClick={() => pieceInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-black/25 py-4 text-xs text-foreground/80 transition-colors hover:border-cyan-200/50"
                >
                  {uploadingPiece ? (
                    <Loader2 size={14} className="animate-spin text-cyan-200" />
                  ) : (
                    <Plus size={14} className="text-cyan-200" />
                  )}
                  Add more references
                </button>

                <button
                  type="button"
                  onClick={() => openPicker({ kind: "piece" })}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/12 bg-black/25 py-3 text-xs text-foreground/80 transition-colors hover:border-cyan-200/50"
                >
                  <ImageIcon size={13} className="text-cyan-200" />
                  Choose from library
                </button>

              </div>

              {/* Config summary — real settings only, never a fake accuracy score. */}
              {pieces.length ? (
                <ul className="mt-3 space-y-1.5">
                  {pieces.map((piece, index) => (
                    <li
                      key={`summary-${index}`}
                      className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-foreground/80"
                    >
                      {pieceSummary(piece, frames.length)}
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-cyan-200/30 bg-cyan-400/10 px-3 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">
                  Geometry fidelity: Strict
                </span>
                <span className="text-[10px] text-cyan-100/70">
                  Replacement geometry locked · source camera &amp; composition locked
                </span>
              </div>

              <p className="mt-2 text-[10px] text-muted-foreground">
                Every swap generates with Nano Banana Pro. An alternate model is available
                per frame after review.
              </p>



              <div className="mt-4">
                <Textarea
                  value={extraPrompt}
                  onChange={(event) => setExtraPrompt(event.target.value)}
                  placeholder="Optional extra direction (how the piece sits, layering, styling notes)"
                  className="min-h-[70px] rounded-xl border-white/12 bg-black/40 text-xs"
                />
              </div>

              <DiamondOpticsPanel
                controls={opticsControls}
                onChange={setOpticsControls}
                profile={opticsProfile}
                status={opticsStatus}
                onAnalyze={runOpticsAnalysis}
              />


            </SectionCard>

            {/* SWAP ONLY — the rebuilt-video step needs the source clip. */}
            {isSwapMode ? (
            <SectionCard step={5} title="Video generation" hint="Your clip, rebuilt with the new jewelry.">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-cyan-200/70">
                      Model
                    </label>
                    <select
                      value={videoModel}
                      onChange={(event) => setVideoModel(event.target.value)}
                      className={SELECT_CLASS}
                    >
                      {VIDEO_MODELS.map((model) => (
                        <option key={model.key} value={model.key}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-cyan-200/70">
                      Resolution
                    </label>
                    <select
                      value={resolution}
                      onChange={(event) => setResolution(event.target.value)}
                      className={SELECT_CLASS}
                    >
                      {videoResolutionOptions.map((option) => (
                        <option key={option} value={option}>
                          {option.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-cyan-200/70">
                    Duration
                  </label>
                  <select
                    value={videoDuration}
                    onChange={(event) => {
                      setDurationTouched(true);
                      setVideoDuration(Number(event.target.value));
                    }}
                    className={SELECT_CLASS}
                  >
                    {DURATION_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option} seconds
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={preserveAudio}
                  onClick={() => setPreserveAudio((prev) => !prev)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-xs font-medium transition-colors",
                    preserveAudio
                      ? "border-cyan-200/60 bg-cyan-400/15 text-cyan-100"
                      : "border-white/12 bg-white/[0.03] text-foreground/70 hover:border-cyan-200/40",
                  )}
                >
                  <span>Preserve original audio</span>
                  <span
                    className={cn(
                      "relative h-4 w-8 shrink-0 rounded-full transition-colors",
                      preserveAudio ? "bg-cyan-300/80" : "bg-white/15",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 h-3 w-3 rounded-full bg-black transition-all",
                        preserveAudio ? "left-[18px]" : "left-0.5",
                      )}
                    />
                  </span>
                </button>

                <dl className="grid grid-cols-3 gap-2 text-center text-[10px]">
                  {[
                    ["Aspect", meta?.aspectRatio ?? "—"],
                    ["Duration", meta ? `${videoDuration}s` : "—"],
                    ["Approved", `${approvedUrls.length}`],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-white/10 bg-black/30 px-2 py-1.5">
                      <dt className="uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
                      <dd className="mt-0.5 text-xs font-medium text-foreground">{value}</dd>
                    </div>
                  ))}
                </dl>

                <p className="text-[11px] font-medium text-cyan-100">
                  {costPreview(creditsFromUsd(videoCostUsd), videoCostUsd)}
                </p>

                {/* Provider caps reference-to-video at 9 images — inform, never block. */}
                {approvedUrls.length > 9 ? (
                  <p className="rounded-xl border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-[10px] text-amber-100">
                    Seedance uses up to 9 reference frames — 9 evenly-spaced approved frames will be
                    used.
                  </p>
                ) : null}

                <SeedanceDirectionPanel
                  preview={promptPreview}
                  status={promptStatus}
                  value={promptValue}
                  mode={promptMode}
                  stale={promptStale}
                  maxCharacters={promptMaxChars}
                  onChange={(text) => {
                    setPromptMode("manual");
                    setPromptDraft(text);
                  }}
                  onReset={() => {
                    setPromptMode("auto");
                    setPromptDraft("");
                    setPromptStale(false);
                    void refreshPromptPreview({ resetManual: true });
                  }}
                  onKeepManual={() => setPromptStale(false)}
                  onRebuild={() => {
                    setPromptMode("auto");
                    setPromptDraft("");
                    void refreshPromptPreview({ resetManual: true });
                  }}
                  onRefresh={() => void refreshPromptPreview()}
                />

                <Button
                  onClick={reconstruct}
                  disabled={reconstructing || !approvedUrls.length || promptOverLimit}
                  className="w-full rounded-xl bg-[hsl(var(--primary))] py-5 font-semibold text-primary-foreground hover:bg-[hsl(var(--primary))]/90"
                >
                  {reconstructing ? <Loader2 size={15} className="animate-spin" /> : <Film size={15} />}
                  {approvedUrls.length
                    ? `Generate video · ${approvedUrls.length} approved frame${
                        approvedUrls.length === 1 ? "" : "s"
                      }`
                    : "Generate video"}
                </Button>
                {approvedUrls.length ? (
                  <p className="text-[11px] text-muted-foreground">
                    Each click queues its own clip — you can run several at once, and closing or
                    refreshing the page won't cancel them. They land in the Library below.
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Approve at least one swapped frame to continue.
                  </p>
                )}

                <Button
                  variant="outline"
                  onClick={openTemplateModal}
                  disabled={!canMakeTemplate}
                  className="w-full rounded-xl border-white/15 bg-transparent text-xs font-semibold hover:border-cyan-200/60 hover:text-cyan-100"
                >
                  <Layers size={14} /> Make into template
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  {canMakeTemplate
                    ? "Saves this run's structure as a real, editable template — future runs use new images and new jewelry references."
                    : "Needs source frames, at least one jewelry reference and one approved swapped frame."}
                </p>



              </div>
            </SectionCard>
            ) : null}
          </div>

          {/* RIGHT: frames, review, result */}
          <div className="space-y-5">
            {/* CAMPAIGN MODE (§26) — reuses the lock, look profile, coverage plan,
                Nano master path and validation already built for Swap. */}
            {!isSwapMode ? (
              <SectionCard
                step={1}
                title="Campaign photography"
                hint="Clean product plates built from the locked product — no source clip involved."
              >
                <CampaignModePanel
                  hasLock={Boolean(masterProductLock)}
                  lockSummary={masterProductLock ? masterLockSummary(masterProductLock)[0] ?? null : null}
                  referenceCount={pieces.reduce((total, piece) => total + piece.urls.length, 0)}
                  hasPhotographyProfile={Boolean(campaignPhotographyProfile)}
                  coveragePlan={shotCoveragePlan}
                  masterCount={Object.keys(canonicalMasters).length}
                  validatedMasterCount={
                    Object.values(canonicalMasters).filter((master) => master.validated).length
                  }
                  batchesSlot={
                    <CampaignBatchPanel
                      batches={batches}
                      activeBatchId={activeBatchId}
                      blockedReason={batchBlocked}
                      onStartBatch={startNextBatch}
                      onApproveBatch={approveBatch}
                    />
                  }
                  mastersSlot={
                    <CanonicalMastersPanel
                      plan={canonicalMasterPlan}
                      componentPlan={canonicalComponentPlan}
                      coverageSummary={
                        shotCoveragePlan
                          ? `Coverage — ${shotCoveragePlan.coveredCount} of ${shotCoveragePlan.entries.length} planned shots covered, ${shotCoveragePlan.missingCount} still missing.`
                          : null
                      }
                      masters={canonicalMasters}
                      busy={mastersBusy}
                      disabledReason={canonicalMastersDisabledReason}
                      onGenerate={() => void generateCanonicalMasters()}
                      onGenerateComponent={(componentId) =>
                        void generateComponentMaster(componentId)
                      }
                      onValidate={(key) => void validateCanonicalMaster(key)}
                    />
                  }
                  matchedPairsSlot={
                    <MatchedPairPanel
                      sources={matchedPairSources}
                      pairs={matchedPairs}
                      busyKey={matchedPairBusyKey}
                      disabledReason={matchedPairsDisabledReason}
                      onGenerate={(sourceId) => void generateMatchedPairFor(sourceId)}
                    />
                  }
                  photographySlot={
                    <CampaignPhotographyPanel
                      referenceUrls={photographyRefs}
                      profile={campaignPhotographyProfile}
                      status={photographyStatus}
                      error={photographyError}
                      onAdd={(files) => void addPhotographyRefs(files)}
                      onRemove={removePhotographyRef}
                      onAnalyze={() => void analyzePhotography()}
                    />
                  }
                />
              </SectionCard>
            ) : null}
            {/* SWAP ONLY — source frames come from the clip. */}
            {isSwapMode ? (
            <SectionCard
              step={2}
              title="Source references"
              hint={
                frames.length
                  ? `${frames.length} frames · ~1 per second, including the final frame. Pick the ones to swap.`
                  : "Frames appear here once a clip is processed."
              }
            >
              {frames.length ? (
                <>
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {frames.map((frame, index) => {
                      const isSelected = selectedFrames.has(index);
                      return (
                        <button
                          key={frame.url}
                          type="button"
                          onClick={() =>
                            setSelectedFrames((prev) => {
                              const next = new Set(prev);
                              next.has(index) ? next.delete(index) : next.add(index);
                              return next;
                            })
                          }
                          className={cn(
                            "relative w-24 shrink-0 overflow-hidden rounded-xl border transition-colors",
                            isSelected ? "border-cyan-200/70" : "border-white/10 hover:border-cyan-200/40",
                          )}
                        >
                          <img src={frame.url} alt={`Frame at ${frame.time}s`} className="h-28 w-full object-cover" />
                          <span className="absolute bottom-1 left-1 rounded bg-black/80 px-1 text-[9px] text-cyan-100">
                            {frame.time.toFixed(2)}s
                          </span>
                          {isSelected ? (
                            <span className="absolute right-1 top-1 rounded bg-cyan-400/90 p-0.5 text-black">
                              <Check size={10} />
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>

                  {/* Nano Banana Pro quality — batch level, never per frame. */}
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/70">
                      Image quality
                    </span>
                    <span className="text-[10px] text-foreground/45">
                      Pro only · Nano Banana 2 has no quality setting
                    </span>
                    <div className="inline-flex rounded-xl border border-white/12 bg-black/40 p-0.5">
                      {NANO_QUALITY_OPTIONS.map((option) => {
                        const active = nanoQuality === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setNanoQuality(option.value)}
                            className={cn(
                              "rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all duration-200",
                              active
                                ? "border border-cyan-200/50 bg-cyan-200/12 text-cyan-100 shadow-[0_0_14px_-4px_hsl(190_90%_60%/0.55)]"
                                : "border border-transparent text-foreground/60 hover:text-foreground",
                            )}
                          >
                            {option.label}
                            <span className="ml-1.5 font-normal opacity-70">· {option.hint}</span>
                          </button>
                        );
                      })}
                    </div>
                    {/* Non-blocking hint only — quality is never auto-switched. */}
                    {macroQualityHint && nanoQuality === "2k" ? (
                      <span className="text-[10px] text-amber-200/85">4K recommended for macro detail</span>
                    ) : null}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedFrames(new Set(frames.map((_, index) => index)))}
                      className="rounded-xl border-white/15 bg-transparent text-xs"
                    >
                      Select all
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedFrames(new Set())}
                      className="rounded-xl border-white/15 bg-transparent text-xs"
                    >
                      Clear
                    </Button>
                    <Button
                      size="sm"
                      onClick={runSelectedSwaps}
                      disabled={swapping}
                      className="ml-auto rounded-xl bg-[hsl(var(--primary))] text-xs font-semibold text-primary-foreground hover:bg-[hsl(var(--primary))]/90"
                    >
                      {swapping ? <Loader2 size={13} className="animate-spin" /> : <Gem size={13} />}
                      {swapping && analysisState === "running"
                        ? "Analyzing jewelry shots…"
                        : `Swap ${selectedFrames.size} frame(s)`}
                    </Button>
                  </div>
                  {analysisState === "ready" ? (
                    <p className="mt-2 text-[11px] font-medium text-emerald-200/90">
                      Shot analysis ready
                    </p>
                  ) : analysisState === "failed" ? (
                    <p className="mt-2 text-[11px] text-amber-200/90">
                      Shot analysis unavailable — continuing with the standard reference rules.
                    </p>
                  ) : null}
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Only the frames you pick become generations — extraction itself is free.
                    {selectedFrames.size ? (
                      <span className="ml-1 font-medium text-cyan-100">
                        {costPreview(creditsFromUsd(swapCostUsd), swapCostUsd)}
                      </span>
                    ) : null}
                  </p>
                </>
              ) : (
                <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-4 py-8 text-xs text-muted-foreground">
                  <ImageIcon size={14} /> Upload a clip to extract source frames.
                </div>
              )}
            </SectionCard>
            ) : null}

            {/* SWAP ONLY — frame review belongs to the replacement pipeline. */}
            {isSwapMode ? (
            <SectionCard step={4} title="Review swaps" hint="Approve the frames that will drive the rebuild.">
              {swapEntries.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {swapEntries.map((index) => {
                    const swap = swaps[index];
                    const alt = altSwaps[index];
                    const frame = frames[index];
                    const picked = chosenModel[index] === "nb2" && alt ? "nb2" : "pro";
                    const active = picked === "nb2" ? alt : swap;
                    const revision = revisionInfo(index);
                    const isApproved = !!active && approvedGenerationId[index] === active.id;
                    const approvedElsewhere = !!approvedGenerationId[index] && !isApproved;
                    return (
                      <article
                        key={`frame-${index}`}
                        className={cn(
                          "group/card space-y-2 rounded-2xl border bg-black/25 p-2.5",

                          isApproved ? "border-cyan-200/50" : "border-white/10",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-muted-foreground">
                            {frame ? `${frame.time.toFixed(2)}s` : `Frame ${index + 1}`}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="text-[10px] text-cyan-200/70">
                              {swap ? costPreview(swap.estimatedCredits, swap.estimatedCostUsd) : "Processing…"}
                            </span>
                            <StatusPill generation={active ?? swap} />
                            {/* Remove is hover-only — it isn't part of the normal flow. */}
                            <button
                              type="button"
                              title="Remove frame"
                              aria-label="Remove frame"
                              onClick={() => void removeSwap(index)}
                              className="rounded-md border border-white/10 p-1 text-foreground/60 opacity-0 transition-opacity hover:border-red-400/60 hover:text-red-300 focus-visible:opacity-100 group-hover/card:opacity-100"
                            >
                              <Trash2 size={11} />
                            </button>
                          </span>
                        </div>
                        {/* Default review: Original ↔ the approved (Pro by default) result. */}
                        <button
                          type="button"
                          onClick={() => setLightboxIndex(index)}
                          className="group grid w-full grid-cols-2 gap-2 text-left"
                          aria-label="Open full-size comparison"
                        >
                          <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
                            {frame ? (
                              <img src={frame.url} alt="Original frame" className="h-32 w-full object-cover" />
                            ) : null}
                            <p className="px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                              Original
                            </p>
                          </div>
                          <div className="relative overflow-hidden rounded-xl border border-cyan-200/40 bg-black/40">
                            {active?.status === "complete" && active.outputUrl ? (
                              <img
                                src={active.outputUrl}
                                alt="Swapped result"
                                className="h-32 w-full object-cover"
                              />
                            ) : active?.status === "failed" || active?.status === "canceled" ? (
                              <p className="flex h-32 items-center justify-center px-2 text-center text-[10px] text-red-300">
                                Generation failed
                              </p>
                            ) : (
                              <div className="flex h-32 items-center justify-center">
                                <Loader2 size={16} className="animate-spin text-cyan-200" />
                              </div>
                            )}
                            <span className="absolute right-1.5 top-1.5 rounded-lg border border-white/15 bg-black/70 p-1 text-cyan-100 opacity-0 transition-opacity group-hover:opacity-100">
                              <Maximize2 size={11} />
                            </span>
                            <p className="px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
                              Swapped — {IMAGE_MODEL_LABELS[picked]}
                            </p>
                          </div>
                        </button>

                        {/* Per-frame replacement mode — persists for regenerations. */}
                        <select
                          aria-label="Replacement mode"
                          value={frameMode[index] ?? "auto"}
                          onChange={(event) =>
                            setFrameMode((prev) => ({
                              ...prev,
                              [index]: event.target.value as ReplacementMode,
                            }))
                          }
                          className="w-full rounded-lg border border-white/12 bg-black/40 px-2 py-1.5 text-[10px] text-foreground outline-none focus:border-cyan-200/60"
                        >
                          {REPLACEMENT_MODES.map((option) => (
                            <option key={option.value} value={option.value}>
                              Mode: {option.label}
                            </option>
                          ))}
                        </select>



                        {/* REVISION HISTORY (§36): regenerating appends, never overwrites. */}
                        {revision.total > 1 && (
                          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-2 py-1">
                            <button
                              type="button"
                              onClick={() => stepRevision(index, -1)}
                              disabled={revision.current === 0}
                              className="rounded px-1.5 text-white/70 disabled:opacity-30"
                              aria-label="Previous version"
                            >
                              ‹
                            </button>
                            <span className="text-[10px] uppercase tracking-[0.18em] text-white/55">
                              Version {revision.position} / {revision.total}
                            </span>
                            <button
                              type="button"
                              onClick={() => stepRevision(index, 1)}
                              disabled={revision.current >= revision.total - 1}
                              className="rounded px-1.5 text-white/70 disabled:opacity-30"
                              aria-label="Next version"
                            >
                              ›
                            </button>
                          </div>
                        )}

                        {approvedElsewhere && (
                          <p className="text-[10px] text-cyan-200/70">
                            A different version of this frame is approved.
                          </p>
                        )}

                        {/* PRODUCT FIDELITY (§35) — on demand, never regenerates. */}
                        {active?.status === "complete" && active.outputUrl ? (
                          <FidelityPanel
                            audit={fidelityAudits[active.id] ?? null}
                            state={fidelityState[active.id] ?? "idle"}
                            error={fidelityError[active.id] ?? null}
                            onCheck={() => void runFidelityCheck(active)}
                          />
                        ) : null}


                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant={isApproved ? "default" : "outline"}
                            disabled={active?.status !== "complete"}
                            onClick={() => toggleApproved(index)}
                            className={cn(
                              "flex-1 rounded-lg text-[11px]",
                              isApproved
                                ? "bg-cyan-400/20 text-cyan-100 hover:bg-cyan-400/30"
                                : "border-white/15 bg-transparent",
                            )}
                          >
                            <Check size={12} /> {isApproved ? "Approved" : "Approve"}
                          </Button>


                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setRegenMenu((prev) => (prev === index ? null : index))}
                            className="rounded-lg border-white/15 bg-transparent text-[11px]"
                          >
                            <RefreshCw size={12} /> Regenerate
                            <ChevronDown
                              size={11}
                              className={cn("transition-transform", regenMenu === index && "rotate-180")}
                            />
                          </Button>
                          {active?.outputUrl ? (
                            <a
                              href={active.outputUrl}
                              download
                              target="_blank"
                              rel="noreferrer"
                              title="Download"
                              className="flex h-8 items-center rounded-lg border border-white/15 px-2 text-foreground/80 transition-colors hover:border-cyan-200/50 hover:text-cyan-100"
                            >
                              <Download size={12} />
                            </a>
                          ) : null}
                        </div>

                        {/* Regenerate panel — advanced controls live here only. */}
                        {regenMenu === index ? (
                          <div className="space-y-2 rounded-xl border border-white/12 bg-black/40 p-2">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200/70">
                              Regenerate with Nano Banana Pro
                            </p>
                            <select
                              aria-label="Reason"
                              value={frameReason[index] ?? ""}
                              onChange={(event) =>
                                setFrameReason((prev) => ({ ...prev, [index]: event.target.value }))
                              }
                              className="w-full rounded-lg border border-white/12 bg-black/50 px-2 py-1.5 text-[10px] text-foreground outline-none focus:border-cyan-200/60"
                            >
                              <option value="">Choose reason (optional)</option>
                              {FAILURE_REASONS.map((reason) => (
                                <option key={reason} value={reason}>
                                  {reason}
                                </option>
                              ))}
                            </select>
                            <select
                              aria-label="Replacement mode for regeneration"
                              value={frameMode[index] ?? "auto"}
                              onChange={(event) =>
                                setFrameMode((prev) => ({
                                  ...prev,
                                  [index]: event.target.value as ReplacementMode,
                                }))
                              }
                              className="w-full rounded-lg border border-white/12 bg-black/50 px-2 py-1.5 text-[10px] text-foreground outline-none focus:border-cyan-200/60"
                            >
                              {REPLACEMENT_MODES.map((option) => (
                                <option key={option.value} value={option.value}>
                                  Mode: {option.label}
                                </option>
                              ))}
                            </select>
                            {/* Defaults to the quality this frame last ran at. */}
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                                Quality
                              </span>
                              <div className="inline-flex rounded-lg border border-white/12 bg-black/50 p-0.5">
                                {NANO_QUALITY_OPTIONS.map((option) => {
                                  const current =
                                    frameQuality[index] ?? qualityFromGeneration(swap) ?? nanoQuality;
                                  const active = current === option.value;
                                  return (
                                    <button
                                      key={option.value}
                                      type="button"
                                      onClick={() =>
                                        setFrameQuality((prev) => ({ ...prev, [index]: option.value }))
                                      }
                                      className={cn(
                                        "rounded-md px-2 py-1 text-[10px] font-semibold transition-all",
                                        active
                                          ? "border border-cyan-200/50 bg-cyan-200/12 text-cyan-100 shadow-[0_0_12px_-4px_hsl(190_90%_60%/0.55)]"
                                          : "border border-transparent text-foreground/60 hover:text-foreground",
                                      )}
                                    >
                                      {option.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <details className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5">
                              <summary className="cursor-pointer text-[10px] text-muted-foreground">
                                Advanced
                              </summary>
                              <select
                                aria-label="Preferred reference angle"
                                value={framePreferredRole[index] ?? ""}
                                onChange={(event) =>
                                  setFramePreferredRole((prev) => ({
                                    ...prev,
                                    [index]: event.target.value,
                                  }))
                                }
                                className="mt-2 w-full rounded-lg border border-white/12 bg-black/50 px-2 py-1.5 text-[10px] text-foreground outline-none focus:border-cyan-200/60"
                              >
                                <option value="">Preferred reference: Auto</option>
                                {Array.from(
                                  new Set(
                                    pieces.flatMap((item) => [
                                      ...item.roles.filter(Boolean),
                                      ...roleOptionsForType(item.type),
                                    ]),
                                  ),
                                )
                                  .filter(Boolean)
                                  .map((role) => (
                                  <option key={role} value={role}>
                                    Preferred reference: {role}
                                  </option>
                                ))}
                              </select>
                              <select
                                aria-label="Framing"
                                value={frameCoverage[index] ?? "auto"}
                                onChange={(event) =>
                                  setFrameCoverage((prev) => ({
                                    ...prev,
                                    [index]: event.target.value as Coverage,
                                  }))
                                }
                                className="mt-2 w-full rounded-lg border border-white/12 bg-black/50 px-2 py-1.5 text-[10px] text-foreground outline-none focus:border-cyan-200/60"
                              >
                                {COVERAGE_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    Framing: {option.label}
                                  </option>
                                ))}
                              </select>
                            </details>
                            <Button
                              size="sm"
                              onClick={() => {
                                setRegenMenu(null);
                                void swapFrame(index, {
                                  imageModel: "pro",
                                  failureReason: frameReason[index] || null,
                                  quality:
                                    frameQuality[index] ?? qualityFromGeneration(swap) ?? nanoQuality,
                                });
                              }}
                              className="w-full rounded-lg bg-[hsl(var(--primary))] text-[11px] text-primary-foreground hover:bg-[hsl(var(--primary))]/90"
                            >
                              Regenerate
                            </Button>
                            <details className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5">
                              <summary className="cursor-pointer text-[10px] text-muted-foreground">
                                More options
                              </summary>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={swap?.status !== "complete"}
                                onClick={() => {
                                  setRegenMenu(null);
                                  void tryAlternateModel(index);
                                }}
                                className="mt-2 w-full rounded-lg border-white/15 bg-transparent text-[10px]"
                              >
                                Try Nano Banana 2
                              </Button>
                              <p className="mt-1 text-[9px] text-muted-foreground">
                                Alternative model — keeps the Pro result and opens a comparison.
                              </p>
                            </details>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}

                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-4 py-8 text-xs text-muted-foreground">
                  <Gem size={14} /> Swapped frames land here for review.
                </div>
              )}
            </SectionCard>
            ) : null}

            {/* SWAP ONLY — animation runs off approved swapped frames. */}
            {isSwapMode ? (
            <SectionCard
              step={6}
              title="Animate swapped frames"
              hint="Optional — turn each approved swapped frame into a short Kling clip. Separate from the rebuilt video."
            >
              <div className="space-y-3">
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ["Model", "Kling 3.0"],
                    // §F5 — the provider schema exposes no resolution/quality input;
                    // output resolution is provider-fixed, so this stays read-only info.
                    ["Output", "Provider-fixed (not selectable)"],

                    [
                      "Duration",
                      Object.keys(clipDurations).length
                        ? `${animateDuration} sec default · per-clip overrides`
                        : `${animateDuration} sec`,
                    ],

                    [
                      "Motion",
                      CAMERA_DIRECTIONS.find((option) => option.value === cameraDirection)?.label ??
                        "Auto — Jewelry Cinematic",
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-xl border border-white/10 bg-black/25 px-3 py-2"
                    >
                      <dt className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        {label}
                      </dt>
                      <dd className="mt-0.5 text-xs font-semibold text-foreground">{value}</dd>
                    </div>
                  ))}
                </dl>

                {/* §F7 — bulk defaults for the only two truly-configurable Kling
                    inputs: duration and motion. No quality/resolution control —
                    §F5 confirmed the provider exposes none. */}
                <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                  <p className="mb-2 text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
                    All clips
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        Clip length
                      </label>
                      <select
                        value={String(animateDuration)}
                        onChange={(event) => setAnimateDuration(Number(event.target.value))}
                        className={SELECT_CLASS}
                      >
                        {ANIMATE_DURATION_OPTIONS.map((seconds) => (
                          <option key={seconds} value={seconds}>
                            {seconds} sec
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        Motion
                      </label>
                      <select
                        value={globalMotion}
                        onChange={(event) => setGlobalMotion(event.target.value)}
                        className={SELECT_CLASS}
                      >
                        {MOTION_PRESETS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={applySettingsToAllClips}
                    disabled={!approvedFrames.length}
                    className="mt-2 w-full rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Apply to all clips
                  </button>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Only lengths and motion presets Kling 3.0 Pro actually accepts. Output quality is
                    provider-fixed and not selectable. You can still override any single clip below.
                  </p>
                </div>

                {/* §F6/§F7 — per-clip overrides win over the "All clips" defaults. */}
                {approvedFrames.length ? (
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
                      Per-clip overrides
                    </label>
                    <div className="space-y-1.5">
                      {approvedFrames.map((frame, index) => {
                        const overridden = clipIsOverridden(frame);
                        return (
                          <div
                            key={frame.url}
                            className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2"
                          >
                            <span className="w-16 shrink-0 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                              Clip {index + 1}
                            </span>
                            <select
                              value={String(durationForFrame(frame))}
                              onChange={(event) =>
                                setClipDuration(frame, Number(event.target.value))
                              }
                              className={`${SELECT_CLASS} w-24 shrink-0`}
                            >
                              {ANIMATE_DURATION_OPTIONS.map((seconds) => (
                                <option key={seconds} value={seconds}>
                                  {seconds} sec
                                </option>
                              ))}
                            </select>
                            <select
                              value={motionForFrame(frame)}
                              onChange={(event) => setClipMotion(frame, event.target.value)}
                              className={`${SELECT_CLASS} min-w-[9rem] flex-1`}
                            >
                              {MOTION_PRESETS.map((option) => (

                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            {overridden ? (
                              <span className="text-[9px] uppercase tracking-[0.14em] text-cyan-300/80">
                                Custom
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Auto motion keeps the current cinematic planning. Motion is written into the
                      clip direction — Kling has no separate camera-motion setting.
                    </p>
                  </div>
                ) : null}




                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
                    Camera direction
                  </label>
                  <select
                    value={cameraDirection}
                    onChange={(event) => setCameraDirection(event.target.value)}
                    className={SELECT_CLASS}
                  >
                    {CAMERA_DIRECTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Auto plans the whole approved set as one varied shot pack — the jewelry stays
                    locked, only the camera, focus and lights move.
                  </p>
                </div>

                {cameraDirection === "custom" ? (
                  <Textarea
                    value={customCameraPrompt}
                    onChange={(event) => setCustomCameraPrompt(event.target.value)}
                    placeholder="Describe the camera move, focus and lighting (the jewelry always stays locked)."
                    className="min-h-[70px] rounded-xl border-white/12 bg-black/40 text-xs"
                  />
                ) : null}


                <Button
                  disabled={animating || !approvedFrames.length}
                  onClick={() => void animateApproved()}
                  className="w-full rounded-xl bg-[hsl(var(--primary))] text-xs font-semibold text-primary-foreground hover:bg-[hsl(var(--primary))]/90"
                >
                  {animating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {approvedFrames.length
                    ? `Animate ${approvedFrames.length} approved frame${
                        approvedFrames.length === 1 ? "" : "s"
                      }`
                    : "Approve frames to animate"}
                </Button>
                {approvedFrames.length ? (
                  <p className="text-center text-[11px] text-cyan-200/70">
                    Est. {costPreview(creditsFromUsd(animateCostUsd), animateCostUsd)} ·{" "}
                    {approvedFrames.length} clip{approvedFrames.length === 1 ? "" : "s"}
                  </p>
                ) : null}

                {clipsRunning ? (
                  <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-200/70">
                    Animating clips · {clips.length - clipsRunning} / {clips.length}
                  </p>
                ) : null}

                {clips.length ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {clips.map((clip) => {
                        const running = clip.status === "queued" || clip.status === "running";
                        return (
                          <article
                            key={clip.id}
                            className={cn(
                              "space-y-2.5 rounded-2xl border bg-black/25 p-2.5",
                              clip.status === "complete" ? "border-cyan-200/40" : "border-white/10",
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] text-muted-foreground">
                                {(clip.frameTime ?? 0).toFixed(2)}s
                              </span>
                              <StatusPill generation={clip} />
                            </div>

                            {clip.status === "complete" && clip.outputUrl ? (
                              <button
                                type="button"
                                onClick={() => setVideoLightboxId(clip.id)}
                                className="group relative block w-full overflow-hidden rounded-xl border border-white/10 bg-black"
                                aria-label="Open clip"
                              >
                                <video
                                  src={clip.outputUrl}
                                  muted
                                  playsInline
                                  preload="metadata"
                                  className="h-40 w-full object-cover"
                                />
                                <span className="absolute right-1.5 top-1.5 rounded-lg border border-white/15 bg-black/70 p-1 text-cyan-100 opacity-0 transition-opacity group-hover:opacity-100">
                                  <Maximize2 size={11} />
                                </span>
                              </button>
                            ) : running ? (
                              <VideoProgress compact startedAt={clip.createdAt} />
                            ) : (
                              <div className="space-y-1.5 rounded-xl border border-red-400/30 bg-red-500/5 p-2">
                                <p className="text-[10px] text-red-300">
                                  Animation failed — try Regenerate
                                </p>
                                {clip.error ? (
                                  <details>
                                    <summary className="cursor-pointer list-none text-[10px] uppercase tracking-[0.14em] text-red-200/60">
                                      Technical details
                                    </summary>
                                    <p className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-[10px] leading-snug text-muted-foreground">
                                      {clip.error}
                                    </p>
                                  </details>
                                ) : null}
                              </div>
                            )}


                            <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
                              {`Kling 3.0 · ${clip.durationSeconds ?? animateDuration} sec`}
                              {clip.shotLabel ? ` · ${clip.shotLabel}` : ""}
                            </p>

                            {clip.directionSummary || clip.animationPrompt ? (
                              <details className="rounded-xl border border-white/10 bg-black/30 px-2.5 py-1.5">
                                <summary className="cursor-pointer list-none text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
                                  View animation direction
                                </summary>
                                <dl className="mt-2 space-y-1">
                                  {([
                                    ["Shot", clip.directionSummary?.shot],
                                    ["Camera", clip.directionSummary?.camera],
                                    ["Focus", clip.directionSummary?.focus],
                                    ["Light", clip.directionSummary?.light],
                                    ["End", clip.directionSummary?.end],
                                  ] as [string, string | undefined][])
                                    .filter(([, value]) => !!value)
                                    .map(([label, value]) => (
                                      <div key={label} className="text-[10px] leading-snug">
                                        <dt className="inline uppercase tracking-[0.14em] text-muted-foreground">
                                          {label}:{" "}
                                        </dt>
                                        <dd className="inline text-foreground/85">{value}</dd>
                                      </div>
                                    ))}
                                </dl>
                                {clip.animationPrompt ? (
                                  <details className="mt-2">
                                    <summary className="cursor-pointer list-none text-[10px] uppercase tracking-[0.14em] text-cyan-200/60">
                                      View full prompt
                                    </summary>
                                    <p className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap text-[10px] leading-snug text-muted-foreground">
                                      {clip.animationPrompt}
                                    </p>
                                  </details>
                                ) : null}
                              </details>
                            ) : null}


                            <div className="flex items-center gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void regenerateClip(clip)}
                                className="flex-1 rounded-lg border-white/15 bg-transparent text-[11px]"
                              >
                                <RefreshCw size={12} /> Regenerate
                              </Button>
                              {clip.outputUrl ? (
                                <a
                                  href={clip.outputUrl}
                                  download
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-black/40 px-2.5 py-1.5 text-[11px] text-foreground/85 transition-colors hover:border-cyan-200/50 hover:text-cyan-100"
                                >
                                  <Download size={12} />
                                </a>
                              ) : null}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void deleteVideo(clip.id)}
                                className="rounded-lg border-white/15 bg-transparent text-[11px] hover:border-red-400/60 hover:text-red-300"
                              >
                                <Trash2 size={12} />
                              </Button>
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    <Button
                      disabled={zipping}
                      onClick={() => void downloadAllClips()}
                      variant="outline"
                      className="w-full rounded-xl border-cyan-200/40 bg-cyan-400/10 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/20"
                    >
                      {zipping ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                      Download all clips
                    </Button>
                  </>
                ) : (
                  <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-4 py-8 text-xs text-muted-foreground">
                    <Film size={14} /> Animated clips land here.
                  </div>
                )}
              </div>
            </SectionCard>
            ) : null}

            <SectionCard
              step={7}
              title="Library"
              hint="Every clip you've rebuilt. Generations keep running on our servers — closing or refreshing this page won't cancel them."
            >
              {libraryLoading ? (
                <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-4 py-8 text-xs text-muted-foreground">
                  <Loader2 size={14} className="animate-spin text-cyan-200" /> Loading your clips…
                </div>
              ) : reconstructions.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {reconstructions.map((video) => {
                    const running = video.status === "queued" || video.status === "running";
                    return (
                      <article
                        key={video.id}
                        className={cn(
                          "space-y-2.5 rounded-2xl border bg-black/25 p-2.5",
                          video.status === "complete" ? "border-cyan-200/40" : "border-white/10",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <StatusPill generation={video} />
                          <span className="text-[10px] text-cyan-200/70">
                            {costPreview(video.estimatedCredits, video.estimatedCostUsd)}
                          </span>
                        </div>

                        {video.status === "complete" && video.outputUrl ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setVideoLightboxId(video.id)}
                              className="group relative block w-full overflow-hidden rounded-xl border border-white/10 bg-black"
                              aria-label="Open clip"
                            >
                              <video
                                src={video.outputUrl}
                                muted
                                playsInline
                                preload="metadata"
                                className="h-40 w-full object-cover"
                              />
                              <span className="absolute right-1.5 top-1.5 rounded-lg border border-white/15 bg-black/70 p-1 text-cyan-100 opacity-0 transition-opacity group-hover:opacity-100">
                                <Maximize2 size={11} />
                              </span>
                            </button>
                            <div className="flex items-center gap-1.5">
                              <a
                                href={video.outputUrl}
                                download
                                target="_blank"
                                rel="noreferrer"
                                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/15 bg-black/40 py-1.5 text-[11px] text-foreground/85 transition-colors hover:border-cyan-200/50 hover:text-cyan-100"
                              >
                                <Download size={12} /> Download
                              </a>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void deleteVideo(video.id)}
                                className="rounded-lg border-white/15 bg-transparent text-[11px] hover:border-red-400/60 hover:text-red-300"
                              >
                                <Trash2 size={12} />
                              </Button>
                            </div>
                            {video.prompt ? (
                              <details className="rounded-lg border border-white/10 bg-black/30 p-2">
                                <summary className="cursor-pointer font-orbitron text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
                                  View prompt
                                  {(video as { inputPayload?: Record<string, unknown> })
                                    .inputPayload?.director_prompt_user_edited === true
                                    ? " · manual"
                                    : ""}
                                </summary>
                                <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-[10px] leading-relaxed text-white/60">
                                  {video.prompt}
                                </p>
                              </details>
                            ) : null}
                          </>

                        ) : running ? (
                          <div className="space-y-2">
                            {/* §F3 — provider lookup is temporarily unavailable, but the
                                paid job keeps running and is still being tracked. */}
                            {video.providerTransient ? (
                              <p className="rounded-xl border border-amber-300/30 bg-amber-400/10 p-2.5 text-[11px] text-amber-200">
                                Provider temporarily unavailable — still tracking your clip. Nothing
                                was re-submitted and you won't be charged twice.
                              </p>
                            ) : null}
                            <VideoProgress
                              compact
                              startedAt={video.createdAt}
                              onCancel={() => setCancelTarget(video.id)}
                            />
                          </div>

                        ) : (
                          <div className="space-y-2">
                            <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-2.5 text-[11px] text-red-300">
                              {video.status === "canceled" ? (
                                "Canceled — start a new video whenever you're ready."
                              ) : (
                                <>
                                  <p>Rebuild failed — try generating again.</p>
                                  {video.error ? (
                                    <details className="mt-1">
                                      <summary className="cursor-pointer text-[10px] text-red-200/70">
                                        Technical details
                                      </summary>
                                      <p className="mt-1 break-words text-[10px] text-red-200/70">
                                        {video.error}
                                      </p>
                                    </details>
                                  ) : null}
                                </>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void deleteVideo(video.id)}
                              className="w-full rounded-lg border-white/15 bg-transparent text-[11px] hover:border-red-400/60 hover:text-red-300"
                            >
                              <Trash2 size={12} /> Remove
                            </Button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-4 py-8 text-xs text-muted-foreground">
                  <Film size={14} /> Your rebuilt clips will collect here.
                </div>
              )}
            </SectionCard>

          </div>
        </div>
      </div>

      {/* Full-size original ↔ swapped comparison */}
      <Dialog
        open={lightboxIndex !== null}
        onOpenChange={(open) => !open && setLightboxIndex(null)}
      >
        <DialogContent className="max-w-6xl border-white/10 bg-[#05070f]/95 backdrop-blur-xl">
          {(() => {
            if (lightboxIndex === null) return null;
            const index = lightboxIndex;
            const swap = swaps[index];
            const alt = altSwaps[index];
            const frame = frames[index];
            if (!swap) return null;
            const picked = chosenModel[index] === "nb2" && alt ? "nb2" : "pro";
            const active = (picked === "nb2" ? alt : swap)!;
            const revision = revisionInfo(index);
            const isApproved = approvedGenerationId[index] === active?.id;

            return (
              <>
                <DialogHeader>
                  <DialogTitle className="font-heading text-base text-foreground">
                    {frame ? `Frame at ${frame.time.toFixed(2)}s` : `Frame ${index + 1}`}
                  </DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <figure className="overflow-hidden rounded-2xl border border-white/10 bg-black/50">
                      {frame ? (
                        <img src={frame.url} alt="Original frame" className="max-h-[62vh] w-full object-contain" />
                      ) : null}
                      <figcaption className="px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        Original
                      </figcaption>
                    </figure>
                    <figure className="overflow-hidden rounded-2xl border-2 border-cyan-200/50 bg-black/50">
                      {active.status === "complete" && active.outputUrl ? (
                        <img
                          src={active.outputUrl}
                          alt={`${IMAGE_MODEL_LABELS[picked]} result`}
                          className="max-h-[62vh] w-full object-contain"
                        />
                      ) : active.status === "failed" || active.status === "canceled" ? (
                        <p className="p-3 text-xs text-red-300">Generation failed</p>
                      ) : (
                        <div className="flex h-48 items-center justify-center">
                          <Loader2 size={18} className="animate-spin text-cyan-200" />
                        </div>
                      )}
                      <figcaption className="px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
                        Swapped — {IMAGE_MODEL_LABELS[picked]}
                      </figcaption>
                    </figure>
                  </div>

                  <aside className="space-y-3">
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                      <StatusPill generation={active} />
                      <span className="text-[11px] text-cyan-200/70">
                        {costPreview(swap.estimatedCredits, swap.estimatedCostUsd)}
                      </span>
                    </div>
                    {revision.total > 1 && (
                      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-3 py-1.5">
                        <button
                          type="button"
                          onClick={() => stepRevision(index, -1)}
                          disabled={revision.current === 0}
                          className="px-1 text-white/70 disabled:opacity-30"
                          aria-label="Previous version"
                        >
                          ‹
                        </button>
                        <span className="text-[10px] uppercase tracking-[0.18em] text-white/55">
                          Version {revision.position} / {revision.total}
                        </span>
                        <button
                          type="button"
                          onClick={() => stepRevision(index, 1)}
                          disabled={revision.current >= revision.total - 1}
                          className="px-1 text-white/70 disabled:opacity-30"
                          aria-label="Next version"
                        >
                          ›
                        </button>
                      </div>
                    )}
                    <Button

                      disabled={active.status !== "complete"}
                      onClick={() => toggleApproved(index)}
                      className={cn(
                        "w-full rounded-xl text-xs font-semibold",
                        isApproved
                          ? "bg-cyan-400/20 text-cyan-100 hover:bg-cyan-400/30"
                          : "bg-[hsl(var(--primary))] text-primary-foreground hover:bg-[hsl(var(--primary))]/90",
                      )}
                    >
                      <Check size={13} /> {isApproved ? "Approved" : "Approve"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        void swapFrame(index, {
                          imageModel: "pro",
                          failureReason: frameReason[index] || null,
                        })
                      }
                      className="w-full rounded-xl border-white/15 bg-transparent text-xs"
                    >
                      <RefreshCw size={13} /> Regenerate with Pro
                    </Button>
                    {alt ? (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setLightboxIndex(null);
                          setCompareIndex(index);
                        }}
                        className="w-full rounded-xl border-white/15 bg-transparent text-xs"
                      >
                        Compare alternate model
                      </Button>
                    ) : null}

                    {active.outputUrl ? (
                      <a
                        href={active.outputUrl}
                        download
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-black/40 py-2 text-xs text-foreground/85 transition-colors hover:border-cyan-200/50 hover:text-cyan-100"
                      >
                        <Download size={13} /> Download
                      </a>
                    ) : null}
                    <Button
                      variant="outline"
                      onClick={() => {
                        setLightboxIndex(null);
                        void removeSwap(index);
                      }}
                      className="w-full rounded-xl border-white/15 bg-transparent text-xs hover:border-red-400/60 hover:text-red-300"
                    >
                      <Trash2 size={13} /> Remove
                    </Button>
                  </aside>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Opt-in alternate-model comparison — Pro stays untouched until a pick is made. */}
      <Dialog
        open={compareIndex !== null}
        onOpenChange={(open) => !open && setCompareIndex(null)}
      >
        <DialogContent className="max-w-5xl border-white/10 bg-[#05070f]/95 backdrop-blur-xl">
          {(() => {
            if (compareIndex === null) return null;
            const index = compareIndex;
            const swap = swaps[index];
            const alt = altSwaps[index];
            const frame = frames[index];
            if (!swap) return null;
            const altFailed = alt?.status === "failed" || alt?.status === "canceled";
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="font-heading text-base text-foreground">
                    Compare models{frame ? ` · frame at ${frame.time.toFixed(2)}s` : ""}
                  </DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 sm:grid-cols-3">
                  <figure className="overflow-hidden rounded-2xl border border-white/10 bg-black/50">
                    {frame ? (
                      <img src={frame.url} alt="Original frame" className="max-h-[50vh] w-full object-contain" />
                    ) : null}
                    <figcaption className="px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      Original
                    </figcaption>
                  </figure>
                  <figure className="overflow-hidden rounded-2xl border border-white/10 bg-black/50">
                    {swap.status === "complete" && swap.outputUrl ? (
                      <img src={swap.outputUrl} alt="Nano Banana Pro result" className="max-h-[50vh] w-full object-contain" />
                    ) : (
                      <div className="flex h-40 items-center justify-center">
                        <Loader2 size={18} className="animate-spin text-cyan-200" />
                      </div>
                    )}
                    <figcaption className="px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
                      Nano Banana Pro
                    </figcaption>
                  </figure>
                  <figure className="overflow-hidden rounded-2xl border border-white/10 bg-black/50">
                    {alt?.status === "complete" && alt.outputUrl ? (
                      <img src={alt.outputUrl} alt="Alternate model result" className="max-h-[50vh] w-full object-contain" />
                    ) : altFailed ? (
                      <div className="space-y-2 p-3">
                        <p className="text-[11px] text-foreground/85">Alternate generation failed</p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void tryAlternateModel(index)}
                          className="rounded-lg border-white/15 bg-transparent text-[11px]"
                        >
                          Try again
                        </Button>
                        <details className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5">
                          <summary className="cursor-pointer text-[10px] text-muted-foreground">
                            Technical details
                          </summary>
                          <p className="mt-1 break-words text-[10px] text-muted-foreground">
                            {alt?.error ?? "No details available"}
                          </p>
                        </details>
                      </div>
                    ) : (
                      <div className="flex h-40 items-center justify-center">
                        <Loader2 size={18} className="animate-spin text-cyan-200" />
                      </div>
                    )}
                    <figcaption className="px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
                      {IMAGE_MODEL_LABELS.nb2}
                    </figcaption>
                  </figure>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={() => {
                      setChosenModel((prev) => ({ ...prev, [index]: "pro" }));
                      setCompareIndex(null);
                    }}
                    className="rounded-xl bg-[hsl(var(--primary))] text-xs text-primary-foreground hover:bg-[hsl(var(--primary))]/90"
                  >
                    Keep Pro
                  </Button>
                  <Button
                    variant="outline"
                    disabled={alt?.status !== "complete"}
                    onClick={() => {
                      setChosenModel((prev) => ({ ...prev, [index]: "nb2" }));
                      setCompareIndex(null);
                    }}
                    className="rounded-xl border-white/15 bg-transparent text-xs"
                  >
                    Use alternate
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Library video player */}

      <Dialog
        open={videoLightboxId !== null}
        onOpenChange={(open) => !open && setVideoLightboxId(null)}
      >
        <DialogContent className="max-w-4xl border-white/10 bg-[#05070f]/95 backdrop-blur-xl">
          {(() => {
            const video = videos.find((entry) => entry.id === videoLightboxId);
            if (!video) return null;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="font-heading text-base text-foreground">
                    {video.stage === "frame_animation" ? "Animated clip" : "Rebuilt clip"}
                    {video.createdAt ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {new Date(video.createdAt).toLocaleString()}
                      </span>
                    ) : null}
                  </DialogTitle>
                </DialogHeader>
                {video.outputUrl ? (
                  <video
                    src={video.outputUrl}
                    controls
                    autoPlay
                    playsInline
                    className="max-h-[70vh] w-full rounded-2xl border border-white/10 bg-black"
                  />
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-cyan-200/70">
                    {costPreview(video.estimatedCredits, video.estimatedCostUsd)}
                  </span>
                  <div className="flex items-center gap-2">
                    {video.outputUrl ? (
                      <a
                        href={video.outputUrl}
                        download
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-xs text-foreground/85 transition-colors hover:border-cyan-200/50 hover:text-cyan-100"
                      >
                        <Download size={13} /> Download
                      </a>
                    ) : null}
                    <Button
                      variant="outline"
                      onClick={() => void deleteVideo(video.id)}
                      className="rounded-xl border-white/15 bg-transparent text-xs hover:border-red-400/60 hover:text-red-300"
                    >
                      <Trash2 size={13} /> Remove
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
      >
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">Cancel this video?</AlertDialogTitle>
            <AlertDialogDescription>
              This is the only way to stop a generation — closing or refreshing the page keeps it
              running. Credits already spent on the job may not be refunded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border bg-secondary text-foreground">
              Keep generating
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void cancelVideo()}
              className="bg-red-500/80 text-white hover:bg-red-500"
            >
              Cancel generation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* Serialize this run into a real, editable template */}
      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="max-w-lg border-white/10 bg-card">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {createdTemplate ? "Template created" : "Make into template"}
            </DialogTitle>
          </DialogHeader>

          {createdTemplate ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{createdTemplate.templateName}</span> is
                a normal template — editable, publishable and runnable like any other.
              </p>
              <dl className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                {[
                  ["Input slots", `${createdTemplate.inputSlotCount}`],
                  ["Pieces", `${createdTemplate.productReferenceCount}`],
                  ["Steps", `${createdTemplate.nodeCount}`],
                  ["Clips", `${createdTemplate.klingClipCount}`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-white/10 bg-black/25 px-3 py-2">
                    <dt className="uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
                    <dd className="mt-0.5 text-xs font-semibold text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  asChild
                  className="flex-1 rounded-xl bg-[hsl(var(--primary))] font-semibold text-primary-foreground hover:bg-[hsl(var(--primary))]/90"
                >
                  <Link to={`/app/lab/canvas?versionId=${createdTemplate.versionId}`}>
                    Open template
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setTemplateOpen(false)}
                  className="flex-1 rounded-xl border-white/15 bg-transparent"
                >
                  Stay here
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  Template name
                </label>
                <Input
                  value={templateName}
                  onChange={(event) => setTemplateName(event.target.value)}
                  className="rounded-xl border-white/12 bg-black/40"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  Description
                </label>
                <Textarea
                  value={templateDescription}
                  onChange={(event) => setTemplateDescription(event.target.value)}
                  rows={3}
                  className="rounded-xl border-white/12 bg-black/40"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Creates {approvedFrames.length} replaceable image input{approvedFrames.length === 1 ? "" : "s"},{" "}
                {pieces.length} jewelry reference{pieces.length === 1 ? "" : "s"},{" "}
                {approvedFrames.length} Nano Banana step{approvedFrames.length === 1 ? "" : "s"} and one
                Seedance final video{clips.length ? ", plus an optional Kling clip branch" : ""}. The
                current run's images are examples only.
              </p>
              <Button
                onClick={() => void createTemplate()}
                disabled={creatingTemplate || !templateName.trim()}
                className="w-full rounded-xl bg-[hsl(var(--primary))] py-5 font-semibold text-primary-foreground hover:bg-[hsl(var(--primary))]/90"
              >
                {creatingTemplate ? <Loader2 size={15} className="animate-spin" /> : <Layers size={15} />}
                Create template
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Library picker — reuse an already-generated asset as an input. */}
      <Dialog open={pickerTarget !== null} onOpenChange={(open) => !open && setPickerTarget(null)}>
        <DialogContent
          className="max-w-4xl border-white/10 bg-[#05070f]/95 backdrop-blur-xl"
          onEscapeKeyDown={() => setPickerTarget(null)}
          onPointerDownOutside={() => setPickerTarget(null)}
          onInteractOutside={() => setPickerTarget(null)}
        >
          <DialogHeader className="sticky top-0 z-20 -mx-6 -mt-6 flex-row items-center justify-between gap-3 border-b border-white/10 bg-[#05070f]/95 px-6 py-4 backdrop-blur-xl">
            <DialogTitle className="font-heading text-base text-foreground">
              {pickerTarget?.kind === "source" ? "Choose a source from your library" : "Choose a reference from your library"}
            </DialogTitle>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setPickerTarget(null)}
              className="rounded-lg border border-white/12 bg-black/40 p-1.5 text-muted-foreground transition-colors hover:border-cyan-200/60 hover:text-foreground"
            >
              <X size={15} />
            </button>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={assetSearch}
              onChange={(event) => setAssetSearch(event.target.value)}
              placeholder="Search by prompt or feature"
              className="min-w-[200px] flex-1 rounded-xl border border-white/12 bg-black/40 px-3 py-2 text-xs text-foreground outline-none transition-colors focus:border-cyan-200/60"
            />
            {pickerTarget?.kind === "source" ? (
              <div className="flex gap-1 rounded-xl border border-white/12 bg-black/40 p-1">
                {(["all", "image", "video"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setAssetTypeFilter(option)}
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] transition-colors",
                      assetTypeFilter === option
                        ? "bg-cyan-300/20 text-cyan-100"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {assetsLoading ? (
            <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
              <Loader2 size={16} className="mr-2 animate-spin text-cyan-200" /> Loading your library…
            </div>
          ) : assetsError ? (
            <p className="py-10 text-center text-xs text-amber-100">{assetsError}</p>
          ) : !visibleAssets.length ? (
            <p className="py-10 text-center text-xs text-muted-foreground">
              Nothing here yet — generate something first, or upload a file instead.
            </p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <div className="grid gap-2 sm:grid-cols-3 md:grid-cols-4">
                {pagedAssets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => handlePick(asset)}
                    className="group overflow-hidden rounded-xl border border-white/10 bg-black/40 text-left transition-colors hover:border-cyan-200/60"
                  >
                    {asset.outputType === "video" ? (
                      <video
                        src={asset.outputUrl}
                        muted
                        loop
                        playsInline
                        preload="none"
                        className="aspect-square w-full bg-black/60 object-contain"
                        onMouseEnter={(event) => {
                          // Only play if bytes are already buffered — never trigger a download on hover.
                          if (event.currentTarget.readyState >= 2) {
                            void event.currentTarget.play().catch(() => {});
                          }
                        }}
                        onMouseLeave={(event) => event.currentTarget.pause()}
                      />
                    ) : (
                      <img
                        src={asset.outputUrl}
                        alt={asset.prompt ?? "Library asset"}
                        loading="lazy"
                        decoding="async"
                        className="aspect-square w-full bg-black/60 object-contain"
                      />
                    )}
                    <div className="px-2 py-1.5">
                      <p className="truncate text-[10px] uppercase tracking-[0.12em] text-cyan-200/70">
                        {asset.source === "upload" ? "Uploaded" : "Generated"} · {asset.outputType}
                      </p>

                      <p className="text-[10px] text-muted-foreground">
                        {new Date(asset.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </button>
                ))}
              </div>

              {visibleAssets.length > pagedAssets.length ? (
                <div className="flex justify-center py-4">
                  <button
                    type="button"
                    onClick={() => setPickerLimit((current) => current + 24)}
                    className="rounded-xl border border-white/12 bg-black/40 px-4 py-2 text-[11px] uppercase tracking-[0.12em] text-cyan-100 transition-colors hover:border-cyan-200/60"
                  >
                    Show more ({visibleAssets.length - pagedAssets.length} left)
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SiteShell>

  );
}
