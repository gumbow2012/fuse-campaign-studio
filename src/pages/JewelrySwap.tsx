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
  analyzeJewelryFrames,
  analyzeJewelryIntake,
  type JewelryIntake,

  animateJewelryFrame,
  callJewelrySwap,
  createTemplateFromJewelrySwap,
  listAssets,
  persistTemplateLayout,
  CAMERA_DIRECTIONS,
  type JewelryFrameAnalysis,
  type JewelryGeneration,
  type JewelryImageModel,
  type JewelryProjectAnalysis,
  type JewelrySwapTemplateResult,
  type LibraryAsset,
  type SwapGeneration,
} from "@/services/jewelrySwap";

import { extractFrames, frameTimestamps, loadVideo, readMeta, type VideoMeta } from "@/lib/videoFrames";
import { compressImageFile } from "@/lib/imageCompress";

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

const VIDEO_MODELS = [
  { key: "seedance-2.0", label: "Seedance 2.0", usdPerSecond: 0.3024 },
  { key: "seedance-2.0-fast", label: "Seedance 2.0 Fast", usdPerSecond: 0.2419 },
];


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
    settings?: { type: string; region: string | null }[];
  } | null;
  /** Provenance per field: user_override | gemini_detected | unknown. */
  sources?: Record<string, string>;
  /** Fields the analysis was unsure about — surfaced for a quick review. */
  needsConfirmation?: string[];
};

const INTAKE_STAGES = [
  "Reading references",
  "Identifying jewelry",
  "Organizing angles",
  "Reading CAD",
  "Detecting stones & settings",
];

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
  const detected = (piece.detected?.settings ?? []).map((setting) =>
    setting.region ? `${setting.region} · ${setting.type}` : setting.type,
  );
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
  const authority = authorityCount(piece);
  const parts = [
    `${piece.type.toUpperCase()} REPLACEMENT`,
    `Design authority: ${authority ? `${authority} reference${authority === 1 ? "" : "s"}` : "none"}`,
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
  const [dropActive, setDropActive] = useState(false);
  // Reference intake (recognition / grouping / extraction). Never blocking:
  // the manual fields stay usable and a failure just falls back to them.
  const [intake, setIntake] = useState<{
    status: "idle" | "running" | "ready" | "failed";
    stage: number;
    productCount: number;
    error?: string | null;
  }>({ status: "idle", stage: 0, productCount: 0 });
  const intakeAbort = useRef<AbortController | null>(null);
  const intakeToken = useRef(0);

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


  // Nano Banana Pro results (the default) and the opt-in Nano Banana 2 runs live
  // side by side so a frame can be compared before one is approved.
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
  const [compareIndex, setCompareIndex] = useState<number | null>(null);

  const [approved, setApproved] = useState<Set<number>>(new Set());
  const [swapping, setSwapping] = useState(false);

  const [videoModel, setVideoModel] = useState("seedance-2.0");
  const [preserveAudio, setPreserveAudio] = useState(true);
  const [resolution, setResolution] = useState("1080p");
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
    setChosenModel({});
    setFramePreferredRole({});
    setFrameReason({});
    setApproved(new Set());
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
    setChosenModel({});
    setFramePreferredRole({});
    setFrameReason({});
    setFrameMode({});
    setApproved(new Set());
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

  /** Each selected file becomes its own piece card. */
  const addPieces = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setUploadingPiece(true);
    try {
      const folder = await createOutfitSwapFolder();
      const uploaded: Piece[] = [];
      for (const file of files) {
        const compressed = await compressImageFile(file);
        const stored = await uploadToStorage(folder, compressed, compressed.name);
        uploaded.push({
          urls: [stored.url],
          roles: [""],
          name: file.name,
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
        });
      }

      setPieces((prev) => [...prev, ...uploaded].slice(0, 8));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload that reference");
    } finally {
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
  /** Uncertain fields across all pieces — only these are surfaced for review. */
  const uncertainCount = pieces.reduce(
    (total, piece) => total + (piece.needsConfirmation?.length ?? 0),
    0,
  );


  /**
   * One fast batch pass over ALL uploaded references: recognition, grouping,
   * role + design-authority proposals and spec extraction. Any user override is
   * preserved; on failure the manual reference UI stays fully functional.
   */
  useEffect(() => {
    const urls = referenceKey ? referenceKey.split("|").filter(Boolean) : [];
    // References changed → cancel the stale result before re-analyzing.
    intakeAbort.current?.abort();
    intakeToken.current += 1;
    const token = intakeToken.current;
    if (!urls.length) {
      setIntake({ status: "idle", stage: 0, productCount: 0 });
      return;
    }

    const controller = new AbortController();
    intakeAbort.current = controller;
    setIntake({ status: "running", stage: 0, productCount: 0 });
    // Staged ticks reflect the real request; they never delay the result.
    const ticker = setInterval(() => {
      setIntake((prev) =>
        prev.status === "running"
          ? { ...prev, stage: Math.min(prev.stage + 1, INTAKE_STAGES.length - 1) }
          : prev,
      );
    }, 1200);

    const run = async (attempt: number): Promise<void> => {
      try {
        const result = await analyzeJewelryIntake(
          {
            jewelryReferences: urls.map((url) => ({ url })),
            roleVocabulary: Array.from(
              new Set(pieces.flatMap((piece) => roleOptionsForType(piece.type))),
            ).filter(Boolean),
          },
          controller.signal,
        );
        if (token !== intakeToken.current) return;
        applyIntake(urls, result.intake);
        setIntake({
          status: "ready",
          stage: INTAKE_STAGES.length,
          productCount: result.intake?.products?.length ?? 1,
        });
      } catch (error) {
        if (controller.signal.aborted || token !== intakeToken.current) return;
        if (attempt === 0) return run(1); // one retry max
        setIntake({
          status: "failed",
          stage: 0,
          productCount: 0,
          error: error instanceof Error ? error.message : "Analysis failed",
        });
      }
    };

    void run(0).finally(() => clearInterval(ticker));

    return () => {
      clearInterval(ticker);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceKey]);

  /**
   * Applies the intake result: regroups the references into one card per
   * detected physical piece, pre-fills roles / design authority / specs, and
   * NEVER overwrites a value the user set (user_override always wins).
   */
  const applyIntake = useCallback((urls: string[], result: JewelryIntake | null) => {
    const products = Array.isArray(result?.products) ? result!.products : [];
    if (!products.length) return;

    setPieces((prev) => {
      // Flat view of the references exactly as they were sent.
      const flat = urls.map((url) => {
        for (const piece of prev) {
          const angleIndex = piece.urls.indexOf(url);
          if (angleIndex !== -1) return { url, piece, angleIndex };
        }
        return { url, piece: null as Piece | null, angleIndex: -1 };
      });

      const claimed = new Set<number>();
      const next: Piece[] = [];

      products.forEach((product, productIndex) => {
        const refs = (product.references ?? [])
          .filter((ref) => Number.isInteger(ref.referenceIndex) && flat[ref.referenceIndex!])
          .filter((ref) => !claimed.has(ref.referenceIndex!));
        if (!refs.length) return;
        refs.forEach((ref) => claimed.add(ref.referenceIndex!));

        const base = flat[refs[0].referenceIndex!].piece ?? prev[0] ?? null;
        const detectedSettings = (product.settings ?? [])
          .map((setting) => ({
            type: String(setting.setting ?? "").trim(),
            region: String(setting.region ?? "").trim() || null,
          }))
          .filter((setting) => setting.type);

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
          name: String(product.label ?? "").trim() || base?.name || `Piece ${productIndex + 1}`,
          type: base?.type ?? JEWELRY_TYPES[0],
          metal: base?.metal ?? AUTO_METAL,
          stone: base?.stone ?? AUTO_STONE,
          stoneColor: base?.stoneColor ?? AUTO_STONE_COLOR,
          quality: base?.quality ?? AUTO_QUALITY,
          settings: base?.settings?.length ? base.settings : [{ ...EMPTY_SETTING }],
          width: base?.width ?? "",
          height: base?.height ?? "",
          depth: base?.depth ?? "",
          weight: base?.weight ?? "",
          person: base?.person ?? DEFAULT_APPLY_TO,
          notes: base?.notes ?? "",
          scope: base?.scope ?? DEFAULT_SCOPE,
          expanded: base?.expanded ?? false,
          // Detected values only RESOLVE fields left on Auto — see the backend.
          detected: {
            type: product.jewelryType?.value ?? null,
            metal: product.metal?.value ?? null,
            stone: product.stoneType?.value ?? null,
            stoneColor: product.stoneColor?.value ?? null,
            quality: product.stoneQuality?.value ?? null,
            settings: detectedSettings,
          },
          sources: {
            type: base?.type && base.type !== JEWELRY_TYPES[0] ? "user_override" : "gemini_detected",
            metal: base?.metal && base.metal !== AUTO_METAL ? "user_override" : "gemini_detected",
            stone: base?.stone && base.stone !== AUTO_STONE ? "user_override" : "gemini_detected",
            stoneColor:
              base?.stoneColor && base.stoneColor !== AUTO_STONE_COLOR
                ? "user_override"
                : "gemini_detected",
            quality: base?.quality && base.quality !== AUTO_QUALITY ? "user_override" : "gemini_detected",
            settings: realSettings(base ?? ({ settings: [] } as unknown as Piece)).length
              ? "user_override"
              : "gemini_detected",
          },
          needsConfirmation: Array.isArray(product.needsConfirmation) ? product.needsConfirmation : [],
        });
      });

      if (!next.length) return prev;

      // References the analysis did not assign stay with the first card —
      // never silently dropped.
      const leftovers = flat.filter((_, index) => !claimed.has(index));
      for (const item of leftovers) {
        if (next[0].urls.length >= 6) break;
        next[0].urls.push(item.url);
        next[0].roles.push(item.piece?.roles?.[item.angleIndex] ?? "");
        next[0].cads.push(item.piece?.cads?.[item.angleIndex] ?? null);
      }

      return next.slice(0, 8);
    });
  }, []);


  /* ------------------------------ 4. Frame swaps ---------------------------- */

  /** Merge a fresh generation record into whichever collection owns it. */
  const applyGeneration = useCallback((generation: JewelryGeneration) => {
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
    if (generation.frameIndex !== null) {
      const index = generation.frameIndex as number;
      if (generation.imageModel === "nb2") {
        setAltSwaps((prev) => ({ ...prev, [index]: generation }));
        return;
      }
      setSwaps((prev) => ({ ...prev, [index]: generation }));
    }
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
    return ids;
  }, [swaps, altSwaps, videos]);

  useEffect(() => {
    if (!inFlightIds.length) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const data = await callJewelrySwap<{ generations: JewelryGeneration[] }>({
          action: "status",
          generationIds: inFlightIds,
        });
        if (cancelled) return;
        for (const generation of data.generations ?? []) applyGeneration(generation);

      } catch {
        // transient — the next tick retries
      }
    };

    const timer = setInterval(poll, 5000);
    void poll();
    return () => {
      cancelled = true;
      clearInterval(timer);
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

      })),
    [pieces],
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
        try {
          const result = await analyzeJewelryFrames({
            sourceFrames,
            jewelryReferences: references,
            jewelrySpecs: specs as any,
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


  const swapFrame = useCallback(
    async (
      frameIndex: number,
      options?: {
        imageModel?: JewelryImageModel;
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
        resolution: "2K",
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
      });
      if (imageModel === "nb2") {
        setAltSwaps((prev) => ({ ...prev, [frameIndex]: data.generation }));
      } else {
        setSwaps((prev) => ({ ...prev, [frameIndex]: data.generation }));
        setApproved((prev) => {
          const next = new Set(prev);
          next.delete(frameIndex);
          return next;
        });
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
      for (const index of indices) {
        // Initial generation is always Nano Banana Pro only — never two models.
        await swapFrame(index, {
          imageModel: "pro",
          frameAnalysis:
            project?.frames?.find((entry) => entry.frameId === frameIdFor(index)) ?? null,
          productAnalysis: project?.productAnalysis ?? null,
        });
      }
      toast.success(`${indices.length} frame swap(s) queued`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue the swaps");
    } finally {
      setSwapping(false);
    }
  }, [selectedFrames, pieces, swapFrame, ensureAnalysis, frameIdFor]);



  const removeSwap = useCallback(async (frameIndex: number) => {
    const ids = [swaps[frameIndex]?.id, altSwaps[frameIndex]?.id].filter(Boolean) as string[];
    setSwaps((prev) => {
      const next = { ...prev };
      delete next[frameIndex];
      return next;
    });
    setAltSwaps((prev) => {
      const next = { ...prev };
      delete next[frameIndex];
      return next;
    });
    setApproved((prev) => {
      const next = new Set(prev);
      next.delete(frameIndex);
      return next;
    });
    if (ids.length) {
      await callJewelrySwap({ action: "delete", generationIds: ids }).catch(() => null);
    }
  }, [swaps, altSwaps]);

  /** The result the user picked (defaults to Nano Banana Pro). */
  const selectedSwap = useCallback(
    (index: number) =>
      (chosenModel[index] === "nb2" ? altSwaps[index] : swaps[index]) ?? swaps[index] ?? null,
    [chosenModel, swaps, altSwaps],
  );

  /* ---------------------------- 5. Reconstruction --------------------------- */

  const approvedUrls = useMemo(
    () =>
      [...approved]
        .sort((a, b) => a - b)
        .map((index) => selectedSwap(index)?.outputUrl)
        .filter((url): url is string => !!url),
    [approved, selectedSwap],
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

  const swapCostUsd = useMemo(
    () => IMAGE_FLAT_USD * resolutionMultiplier("2K") * Math.max(0, selectedFrames.size),
    [selectedFrames],
  );

  const videoCostUsd = useMemo(() => {
    const perSecond = VIDEO_MODELS.find((entry) => entry.key === videoModel)?.usdPerSecond ?? 0;
    return perSecond * videoDuration * resolutionMultiplier(resolution);
  }, [videoModel, videoDuration, resolution]);

  const reconstruct = useCallback(async () => {
    if (!approvedUrls.length) {
      toast.error("Approve at least one swapped frame first");
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
      });
      // Non-blocking: each click is its own record, so several can run at once.
      setVideos((prev) => [data.generation, ...prev]);
      toast.success("Video queued — you can start another while this runs");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the video");
    } finally {
      setReconstructing(false);
    }
  }, [approvedUrls, piecePayload, videoModel, resolution, preserveAudio, meta, extraPrompt, videoDuration]);

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
          url: selectedSwap(index)?.outputUrl ?? null,
          time: frames[index]?.time ?? 0,
        }))
        .filter((entry): entry is { index: number; url: string; time: number } => !!entry.url),
    [approved, selectedSwap, frames],
  );

  // Kling 3.0 without audio: $0.112 per second.
  const animateCostUsd = useMemo(() => 0.112 * 3 * approvedFrames.length, [approvedFrames]);

  const [animating, setAnimating] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [cameraDirection, setCameraDirection] = useState<string>("auto");
  const [customCameraPrompt, setCustomCameraPrompt] = useState("");

  const pieceTypes = useMemo(
    () => pieces.map((piece) => piece.type).filter(Boolean),
    [pieces],
  );

  const animateFrame = useCallback(
    async (
      frame: { index: number; url: string; time: number },
      position: { setIndex: number; setSize: number; direction?: string },
    ) => {
      const generation = await animateJewelryFrame({
        imageUrl: frame.url,
        frameIndex: frame.index,
        frameTime: frame.time,
        cameraDirection: position.direction ?? cameraDirection,
        customPrompt: customCameraPrompt.trim() || null,
        setIndex: position.setIndex,
        setSize: position.setSize,
        pieceTypes,
      });
      setVideos((prev) => [generation, ...prev]);
    },
    [cameraDirection, customCameraPrompt, pieceTypes],
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
      let setIndex = 0;
      for (const frame of approvedFrames) {
        await animateFrame(frame, { setIndex, setSize: approvedFrames.length });
        setIndex += 1;
      }
      toast.success(`${approvedFrames.length} clip${approvedFrames.length === 1 ? "" : "s"} queued`);
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

  const toggleApproved = useCallback((index: number) => {
    setApproved((prev) => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  }, []);


  const swapEntries = useMemo(
    () =>
      Object.keys(swaps)
        .map(Number)
        .sort((a, b) => a - b),
    [swaps],
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
          <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">Jewelry Swap</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Upload a clip, replace the jewelry in the frames you pick with your references, then rebuild the
            same video with the new pieces.
          </p>
        </header>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          {/* LEFT: inputs */}
          <div className="space-y-5">
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

            <SectionCard
              step={3}
              title="Jewelry references"
              hint="Drop everything for the piece at once — FUSE reads the references and organizes them."
            >
              <input
                ref={pieceInputRef}
                type="file"
                accept="image/*"
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
                  const files = Array.from(event.dataTransfer.files ?? []).filter((file) =>
                    file.type.startsWith("image/"),
                  );
                  if (files.length) void addPieces(files);
                }}
                className={cn(
                  "mb-2.5 rounded-2xl border border-dashed bg-black/25 px-4 py-6 text-center transition-colors",
                  dropActive ? "border-cyan-200/70 bg-cyan-200/5" : "border-white/15",
                )}
              >
                <p className="text-xs text-foreground/85">
                  Upload jewelry references — drag &amp; drop product photos, CAD, front/back/side, macro &amp;
                  close-ups together; FUSE organizes them.
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
                    {intake.status === "running"
                      ? "Analyzing jewelry…"
                      : intake.status === "ready"
                        ? "Analysis ready"
                        : "Analysis unavailable — the manual reference fields below still work"}
                  </p>
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
                          setIntake({ status: "idle", stage: 0, productCount: 0 });
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
                                item.needsConfirmation?.length ? { ...item, expanded: true } : item,
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
                      <p className="truncate text-[11px] font-medium text-foreground" title={piece.name}>
                        {piece.name || `Piece ${index + 1}`}
                      </p>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="rounded-full border border-white/12 bg-black/40 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-foreground/70">
                          Design authority:{" "}
                          {authorityCount(piece)
                            ? `${authorityCount(piece)} reference${authorityCount(piece) === 1 ? "" : "s"}`
                            : "none"}
                        </span>
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
                          {/* Geometry authority is per reference image — auto-on for CAD labels. */}
                          <label
                            className="flex items-center gap-1 text-[9px] text-muted-foreground"
                            title="Use this image as the geometry / design authority"
                          >
                            <input
                              type="checkbox"
                              checked={isGeometryAuthority(piece, angleIndex)}
                              onChange={(event) =>
                                setPieces((prev) =>
                                  prev.map((item, i) =>
                                    i === index
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
                            Authority
                          </label>
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
                      <p className="text-[9px] uppercase tracking-[0.14em] text-cyan-200/70">Design authority</p>
                      <p className="text-[11px] text-foreground/85">
                        {authorityCount(piece)
                          ? `${authorityCount(piece)} reference${authorityCount(piece) === 1 ? "" : "s"}`
                          : "None selected"}
                      </p>
                      {piece.needsConfirmation?.length ? (
                        <p className="text-[10px] text-amber-200/90">
                          Review {piece.needsConfirmation.length} detail
                          {piece.needsConfirmation.length === 1 ? "" : "s"}: {piece.needsConfirmation.join(", ")}
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
                        {piece.expanded ? "Hide analysis" : piece.needsConfirmation?.length ? `Review ${piece.needsConfirmation.length} details` : "Edit analysis"}
                      </button>
                    </div>

                    {piece.expanded === true ? (
                      <>
                    <div className="mt-2.5 grid gap-2 sm:grid-cols-2">

                      <div>
                        <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
                          Type
                        </label>
                        <select
                          value={piece.type}
                          onChange={(event) =>
                            setPieces((prev) =>
                              prev.map((item, i) => (i === index ? { ...item, type: event.target.value } : item)),
                            )
                          }
                          className={SELECT_CLASS}
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
                          Metal
                        </label>
                        <select
                          value={piece.metal}
                          onChange={(event) =>
                            setPieces((prev) =>
                              prev.map((item, i) => (i === index ? { ...item, metal: event.target.value } : item)),
                            )
                          }
                          className={SELECT_CLASS}
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
                          Stone
                        </label>
                        <select
                          value={piece.stone}
                          onChange={(event) =>
                            setPieces((prev) =>
                              prev.map((item, i) => (i === index ? { ...item, stone: event.target.value } : item)),
                            )
                          }
                          className={SELECT_CLASS}
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
                          Stone color
                        </label>
                        <select
                          value={piece.stoneColor || AUTO_STONE_COLOR}
                          onChange={(event) =>
                            setPieces((prev) =>
                              prev.map((item, i) =>
                                i === index ? { ...item, stoneColor: event.target.value } : item,
                              ),
                            )
                          }
                          className={SELECT_CLASS}
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
                          Quality
                        </label>
                        <select
                          value={piece.quality || AUTO_QUALITY}
                          onChange={(event) =>
                            setPieces((prev) =>
                              prev.map((item, i) => (i === index ? { ...item, quality: event.target.value } : item)),
                            )
                          }
                          className={SELECT_CLASS}
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
                                    Setting
                                  </label>
                                ) : null}
                                <select
                                  value={setting.type || AUTO_SETTING}
                                  onChange={(event) =>
                                    setPieces((prev) =>
                                      prev.map((item, i) =>
                                        i === index
                                          ? {
                                            ...item,
                                            settings: (item.settings?.length
                                              ? item.settings
                                              : [{ ...EMPTY_SETTING }]
                                            ).map((entry, j) =>
                                              j === settingIndex
                                                ? { ...entry, type: event.target.value }
                                                : entry,
                                            ),
                                          }
                                          : item,
                                      ),
                                    )
                                  }
                                  className={SELECT_CLASS}
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
                                            ? {
                                              ...item,
                                              settings: (item.settings ?? []).map((entry, j) =>
                                                j === settingIndex
                                                  ? { ...entry, region: event.target.value }
                                                  : entry,
                                              ),
                                            }
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

            </SectionCard>

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
                      {["480p", "720p", "1080p", "4k"].map((option) => (
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

                <Button
                  onClick={reconstruct}
                  disabled={reconstructing || !approvedUrls.length}
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
          </div>

          {/* RIGHT: frames, review, result */}
          <div className="space-y-5">
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

            <SectionCard step={4} title="Review swaps" hint="Approve the frames that will drive the rebuild.">
              {swapEntries.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {swapEntries.map((index) => {
                    const swap = swaps[index];
                    const alt = altSwaps[index];
                    const frame = frames[index];
                    const isApproved = approved.has(index);
                    const picked = chosenModel[index] === "nb2" && alt ? "nb2" : "pro";
                    const active = picked === "nb2" ? alt : swap;
                    return (
                      <article
                        key={swap.id}
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
                              {costPreview(swap.estimatedCredits, swap.estimatedCostUsd)}
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
                                disabled={swap.status !== "complete"}
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

            <SectionCard
              step={6}
              title="Animate swapped frames"
              hint="Optional — turn each approved swapped frame into a short Kling clip. Separate from the rebuilt video."
            >
              <div className="space-y-3">
                <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ["Model", "Kling 3.0"],
                    ["Resolution", "1080p"],
                    ["Duration", "3 sec"],
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
                              Kling 3.0 · 3 sec · 1080p
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
                          </>
                        ) : running ? (
                          <VideoProgress
                            compact
                            startedAt={video.createdAt}
                            onCancel={() => setCancelTarget(video.id)}
                          />
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
            const isApproved = approved.has(index);
            const picked = chosenModel[index] === "nb2" && alt ? "nb2" : "pro";
            const active = (picked === "nb2" ? alt : swap)!;
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
