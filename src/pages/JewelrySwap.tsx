import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Check,
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
  animateJewelryFrame,
  callJewelrySwap,
  createTemplateFromJewelrySwap,
  persistTemplateLayout,
  CAMERA_DIRECTIONS,
  type JewelryGeneration,
  type JewelryImageModel,
  type JewelrySwapTemplateResult,
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
  "Natural Diamond",
  "Lab Diamond",
  "Moissanite",
  "CZ",
  "Emerald",
  "Ruby",
  "Sapphire",
  "Onyx",
  "Black Diamond",
  "Colored Diamond",
  "Gemstone",
  "No Stones",
];

const QUALITY_OPTIONS = ["", "D–F", "G–H", "VS", "VVS", "SI", "Custom/Notes"];

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

/** Optional regenerate reasons — each appends a targeted corrective sentence. */
const FAILURE_REASONS = [
  "Wrong angle",
  "Wrong crop / zoom",
  "Wrong jewelry geometry",
  "Wrong bail / connector",
  "Wrong stones / setting",
  "Wrong lettering / logo",
  "Wrong scale",
  "Wrong rotation",
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
/** One card = ONE physical piece, described by one or more reference angles. */
type Piece = {
  urls: string[];
  /** Optional role label per angle, aligned by index with `urls`. */
  roles: string[];
  name: string;
  type: string;
  metal: string;
  stone: string;
  quality: string;
  width: string;
  height: string;
  depth: string;
  weight: string;
  cad: boolean;
  person: string;
  notes: string;
};

/** Compact, factual config line — never a fabricated accuracy score. */
function pieceSummary(piece: Piece, frameCount: number) {
  const parts = [
    `${piece.type.toUpperCase()} REPLACEMENT`,
    `CAD Authority: ${piece.cad ? "ON" : "OFF"}`,
    `Metal: ${piece.metal === AUTO_METAL ? "Auto" : piece.metal}`,
    `Stone: ${piece.stone === AUTO_STONE ? "Auto" : piece.stone}`,
  ];
  if (piece.quality) parts.push(`Quality: ${piece.quality}`);
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
  const [extraPrompt, setExtraPrompt] = useState("");

  // Nano Banana Pro results (the default) and the opt-in Nano Banana 2 runs live
  // side by side so a frame can be compared before one is approved.
  const [swaps, setSwaps] = useState<Record<number, JewelryGeneration>>({});
  const [altSwaps, setAltSwaps] = useState<Record<number, JewelryGeneration>>({});
  const [chosenModel, setChosenModel] = useState<Record<number, JewelryImageModel>>({});
  const [framePreferredRole, setFramePreferredRole] = useState<Record<number, string>>({});
  const [frameReason, setFrameReason] = useState<Record<number, string>>({});
  const [needsReview, setNeedsReview] = useState<Set<number>>(new Set());
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
    setNeedsReview(new Set());
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
          quality: "",
          width: "",
          height: "",
          depth: "",
          weight: "",
          cad: false,
          person: DEFAULT_APPLY_TO,
          notes: "",
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
          // A CAD-flagged card marks its CAD-labeled angles as the geometry
          // authority; if no angle is labeled CAD, every angle inherits the flag.
          cad: piece.cad === true &&
            (/^CAD/i.test(piece.roles[angleIndex] ?? "") ||
              !piece.roles.some((role) => /^CAD/i.test(role ?? ""))),
        })),
        type: piece.type,
        metal: piece.metal === AUTO_METAL ? null : piece.metal,
        stone: piece.stone === AUTO_STONE ? null : piece.stone,
        quality: piece.quality || null,
        dimensions: {
          width: piece.width || null,
          height: piece.height || null,
          depth: piece.depth || null,
          weight: piece.weight || null,
        },
        cad: piece.cad,
        person: piece.person,
        notes: piece.notes || null,
      })),
    [pieces],
  );

  const swapFrame = useCallback(
    async (
      frameIndex: number,
      options?: {
        imageModel?: JewelryImageModel;
        preferredRole?: string | null;
        failureReason?: string | null;
      },
    ) => {
      const frame = frames[frameIndex];
      if (!frame) return;
      const imageModel: JewelryImageModel = options?.imageModel ?? "pro";
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
    [frames, piecePayload, meta, extraPrompt, framePreferredRole],
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
      for (const index of indices) {
        // Initial generation is always Nano Banana Pro only — never two models.
        await swapFrame(index, { imageModel: "pro" });
      }
      toast.success(`${indices.length} frame swap(s) queued`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue the swaps");
    } finally {
      setSwapping(false);
    }
  }, [selectedFrames, pieces, swapFrame]);


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


  const videoDuration = useMemo(
    () => Math.min(15, Math.max(4, Math.round(meta?.duration ?? 5))),
    [meta],
  );

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
          quality: piece.quality || null,
          cad: piece.cad,
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => videoInputRef.current?.click()}
                    className="w-full rounded-xl border-white/15 bg-transparent text-xs"
                  >
                    <RefreshCw size={13} /> Replace video
                  </Button>
                </div>
              ) : (
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
              )}
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
              hint="One card per physical piece. Add extra angles (front / back / side / CAD / macro) to the same card."
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
              <div className="space-y-2.5">
                {pieces.map((piece, index) => (
                  <div
                    key={`${piece.urls[0] ?? index}-${index}`}
                    className={cn(
                      "rounded-2xl border bg-black/25 p-2.5",
                      piece.cad ? "border-cyan-200/50" : "border-white/10",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-[11px] font-medium text-foreground" title={piece.name}>
                        {piece.name || `Piece ${index + 1}`}
                      </p>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {piece.cad ? (
                          <span className="rounded-full border border-cyan-200/60 bg-cyan-400/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-cyan-100">
                            CAD authority
                          </span>
                        ) : null}
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
                            {ANGLE_ROLE_OPTIONS.map((option) => (
                              <option key={option || "unlabeled"} value={option}>
                                {option || "Role (optional)"}
                              </option>
                            ))}
                          </select>
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
                    </div>


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
                          Stone quality
                        </label>
                        <select
                          value={piece.quality}
                          onChange={(event) =>
                            setPieces((prev) =>
                              prev.map((item, i) => (i === index ? { ...item, quality: event.target.value } : item)),
                            )
                          }
                          className={SELECT_CLASS}
                        >
                          {QUALITY_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option || "Optional"}
                            </option>
                          ))}
                        </select>
                      </div>
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
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={piece.cad}
                      onClick={() =>
                        setPieces((prev) =>
                          prev.map((item, i) => (i === index ? { ...item, cad: !item.cad } : item)),
                        )
                      }
                      className={cn(
                        "mt-2 flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-[11px] font-medium transition-colors",
                        piece.cad
                          ? "border-cyan-200/60 bg-cyan-400/15 text-cyan-100"
                          : "border-white/12 bg-white/[0.03] text-foreground/70 hover:border-cyan-200/40",
                      )}
                    >
                      <span className="text-left">This is a CAD / design-authority reference</span>
                      <span
                        className={cn(
                          "relative h-4 w-8 shrink-0 rounded-full transition-colors",
                          piece.cad ? "bg-cyan-300/80" : "bg-white/15",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 h-3 w-3 rounded-full bg-black transition-all",
                            piece.cad ? "left-[18px]" : "left-0.5",
                          )}
                        />
                      </span>
                    </button>
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
                  Add jewelry piece
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
                  Source composition dominates · no reframing or invented detail
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
                      Swap {selectedFrames.size} frame(s)
                    </Button>
                  </div>
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
                    const flagged = needsReview.has(index);
                    return (
                      <article
                        key={swap.id}
                        className={cn(
                          "space-y-2 rounded-2xl border bg-black/25 p-2.5",
                          isApproved ? "border-cyan-200/50" : "border-white/10",
                          flagged ? "border-amber-300/50" : "",
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
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setLightboxIndex(index)}
                          className={cn(
                            "group grid w-full gap-2 text-left",
                            alt ? "grid-cols-3" : "grid-cols-2",
                          )}
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
                          {([["pro", swap], ["nb2", alt]] as const)
                            .filter(([, generation]) => !!generation)
                            .map(([key, generation]) => (
                              <div
                                key={key}
                                className={cn(
                                  "relative overflow-hidden rounded-xl border bg-black/40",
                                  picked === key ? "border-cyan-200/60" : "border-white/10",
                                )}
                              >
                                {generation!.status === "complete" && generation!.outputUrl ? (
                                  <img
                                    src={generation!.outputUrl}
                                    alt={`${IMAGE_MODEL_LABELS[key]} result`}
                                    className="h-32 w-full object-cover"
                                  />
                                ) : generation!.status === "failed" || generation!.status === "canceled" ? (
                                  <p className="h-32 overflow-y-auto p-2 text-[10px] text-red-300">
                                    {generation!.error ?? "Generation failed"}
                                  </p>
                                ) : (
                                  <div className="flex h-32 items-center justify-center">
                                    <Loader2 size={16} className="animate-spin text-cyan-200" />
                                  </div>
                                )}
                                {key === "pro" ? (
                                  <span className="absolute right-1.5 top-1.5 rounded-lg border border-white/15 bg-black/70 p-1 text-cyan-100 opacity-0 transition-opacity group-hover:opacity-100">
                                    <Maximize2 size={11} />
                                  </span>
                                ) : null}
                                <p className="px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
                                  {IMAGE_MODEL_LABELS[key]}
                                </p>
                              </div>
                            ))}
                        </button>

                        {/* The picked result is the one that flows downstream. */}
                        {alt ? (
                          <div className="flex items-center gap-1.5">
                            {(["pro", "nb2"] as const).map((key) => (
                              <Button
                                key={key}
                                size="sm"
                                variant="outline"
                                onClick={() => setChosenModel((prev) => ({ ...prev, [index]: key }))}
                                className={cn(
                                  "flex-1 rounded-lg text-[11px]",
                                  picked === key
                                    ? "border-cyan-200/60 bg-cyan-400/15 text-cyan-100"
                                    : "border-white/15 bg-transparent",
                                )}
                              >
                                Use {key === "pro" ? "Pro" : "NB2"}
                              </Button>
                            ))}
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={swap.status !== "complete"}
                            onClick={() => void swapFrame(index, { imageModel: "nb2" })}
                            className="w-full rounded-lg border-white/15 bg-transparent text-[11px]"
                          >
                            Try with Nano Banana 2
                          </Button>
                        )}

                        {/* Manual angle override — no auto-detection. */}
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          <select
                            aria-label="Preferred angle reference"
                            value={framePreferredRole[index] ?? ""}
                            onChange={(event) =>
                              setFramePreferredRole((prev) => ({ ...prev, [index]: event.target.value }))
                            }
                            className="rounded-lg border border-white/12 bg-black/40 px-2 py-1.5 text-[10px] text-foreground outline-none focus:border-cyan-200/60"
                          >
                            <option value="">Preferred angle: Auto</option>
                            {ANGLE_ROLE_OPTIONS.filter(Boolean).map((role) => (
                              <option key={role} value={role}>
                                Preferred angle: {role}
                              </option>
                            ))}
                          </select>
                          <select
                            aria-label="Failure reason for regeneration"
                            value={frameReason[index] ?? ""}
                            onChange={(event) =>
                              setFrameReason((prev) => ({ ...prev, [index]: event.target.value }))
                            }
                            className="rounded-lg border border-white/12 bg-black/40 px-2 py-1.5 text-[10px] text-foreground outline-none focus:border-cyan-200/60"
                          >
                            <option value="">Regen reason: none</option>
                            {FAILURE_REASONS.map((reason) => (
                              <option key={reason} value={reason}>
                                {reason}
                              </option>
                            ))}
                          </select>
                        </div>

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
                            title="Regenerate with the selected angle and reason"
                            onClick={() =>
                              void swapFrame(index, {
                                imageModel: picked,
                                failureReason: frameReason[index] || null,
                              })
                            }
                            className="rounded-lg border-white/15 bg-transparent text-[11px]"
                          >
                            <RefreshCw size={12} />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void removeSwap(index)}
                            className="rounded-lg border-white/15 bg-transparent text-[11px] hover:border-red-400/60 hover:text-red-300"
                          >
                            <Trash2 size={12} />
                          </Button>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setNeedsReview((prev) => {
                              const next = new Set(prev);
                              if (next.has(index)) next.delete(index);
                              else next.add(index);
                              return next;
                            })
                          }
                          className={cn(
                            "w-full rounded-lg border px-2 py-1.5 text-[10px] transition-colors",
                            flagged
                              ? "border-amber-300/60 bg-amber-300/10 text-amber-100"
                              : "border-white/12 bg-transparent text-muted-foreground hover:border-amber-300/40",
                          )}
                        >
                          {flagged
                            ? "Flagged: source region ambiguous"
                            : "Flag — source region ambiguous"}
                        </button>
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
                              <p className="rounded-xl border border-red-400/30 bg-red-500/5 p-2 text-[10px] text-red-300">
                                {clip.error ?? "Clip failed"}
                              </p>
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
                            <p className="rounded-xl border border-red-400/30 bg-red-500/10 p-2.5 text-[11px] text-red-300">
                              {video.status === "canceled"
                                ? "Canceled — start a new video whenever you're ready."
                                : video.error ?? "Reconstruction failed"}
                            </p>
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
                  <div className={cn("grid gap-3", alt ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
                    <figure className="overflow-hidden rounded-2xl border border-white/10 bg-black/50">
                      {frame ? (
                        <img src={frame.url} alt="Original frame" className="max-h-[62vh] w-full object-contain" />
                      ) : null}
                      <figcaption className="px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        Original
                      </figcaption>
                    </figure>
                    {([["pro", swap], ["nb2", alt]] as const)
                      .filter(([, generation]) => !!generation)
                      .map(([key, generation]) => (
                        <figure
                          key={key}
                          className={cn(
                            "overflow-hidden rounded-2xl bg-black/50",
                            picked === key ? "border-2 border-cyan-200/50" : "border border-white/10",
                          )}
                        >
                          {generation!.status === "complete" && generation!.outputUrl ? (
                            <img
                              src={generation!.outputUrl}
                              alt={`${IMAGE_MODEL_LABELS[key]} result`}
                              className="max-h-[62vh] w-full object-contain"
                            />
                          ) : generation!.status === "failed" || generation!.status === "canceled" ? (
                            <p className="p-3 text-xs text-red-300">{generation!.error ?? "Generation failed"}</p>
                          ) : (
                            <div className="flex h-48 items-center justify-center">
                              <Loader2 size={18} className="animate-spin text-cyan-200" />
                            </div>
                          )}
                          <figcaption className="flex items-center justify-between gap-2 px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
                            {IMAGE_MODEL_LABELS[key]}
                            <button
                              type="button"
                              onClick={() => setChosenModel((prev) => ({ ...prev, [index]: key }))}
                              className={cn(
                                "rounded-md border px-2 py-0.5 text-[9px] tracking-normal normal-case transition-colors",
                                picked === key
                                  ? "border-cyan-200/60 bg-cyan-400/15 text-cyan-100"
                                  : "border-white/15 text-foreground/70 hover:border-cyan-200/40",
                              )}
                            >
                              {picked === key ? "Selected" : `Use ${key === "pro" ? "Pro" : "NB2"}`}
                            </button>
                          </figcaption>
                        </figure>
                      ))}
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
                          imageModel: picked,
                          failureReason: frameReason[index] || null,
                        })
                      }
                      className="w-full rounded-xl border-white/15 bg-transparent text-xs"
                    >
                      <RefreshCw size={13} /> Regenerate
                    </Button>
                    {!alt ? (
                      <Button
                        variant="outline"
                        disabled={swap.status !== "complete"}
                        onClick={() => void swapFrame(index, { imageModel: "nb2" })}
                        className="w-full rounded-xl border-white/15 bg-transparent text-xs"
                      >
                        Try with Nano Banana 2
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

    </SiteShell>
  );
}
