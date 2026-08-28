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
  Shirt,
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
import { Switch } from "@/components/ui/switch";
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
  analyzeOutfitSwapSource,
  callOutfitSwap,
  createTemplateFromOutfitSwap,
  persistTemplateLayout,
  loadCastAssignment,
  saveCastAssignment,
  suggestCastAssignment,
  loadModelAssignment,
  saveModelAssignment,
  primarySubjectId,
  isBottomGarment,
  isTopGarment,
  KEEP_ORIGINAL_MODEL,
  type OutfitSwapCastAssignment,
  type OutfitSwapGarment,
  type OutfitSwapModelAssignment,
  type OutfitSwapSubjectModel,
  type OutfitSwapSourceAnalysis,
  type OutfitSwapTemplateResult,
  type SwapGeneration,
} from "@/services/outfitSwap";
import SubjectModelSelector from "@/components/outfitswap/SubjectModelSelector";
import { useAuth } from "@/contexts/AuthContext";
import { extractFrames, frameTimestamps, loadVideo, readMeta, type VideoMeta } from "@/lib/videoFrames";
import { compressImageFile } from "@/lib/imageCompress";


const GARMENT_TYPES = [
  "Shirt / Top",
  "Hoodie / Jacket",
  "Pants",
  "Shorts",
  "Shoes",
  "Hat",
  "Sunglasses / Glasses",
  "Accessory",
  "Jewelry",
  "Other",
];

/**
 * V1 has no real subject detection, so we never fabricate "Person 1/2/3".
 * Each product carries its own target — room for real per-person thumbnails later.
 */
const APPLY_TO_OPTIONS = ["Main Subject", "Everyone"];
const DEFAULT_APPLY_TO = APPLY_TO_OPTIONS[0];

const VIDEO_MODELS = [
  { key: "seedance-2.0", label: "Seedance 2.0", usdPerSecond: 0.3024 },
  { key: "seedance-2.0-fast", label: "Seedance 2.0 Fast", usdPerSecond: 0.2419 },
];

type Frame = { time: number; url: string };
/** PHASE 2: structured refs; `url` still mirrors FRONT for generation. */
type Garment = OutfitSwapGarment;
type GarmentSlot = "front" | "back" | "detail" | "side";

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

/** One structured garment reference slot (upload / replace / clear). */
function GarmentSlotUpload({
  label,
  url,
  busy,
  required,
  onPick,
  onClear,
}: {
  label: string;
  url: string | null;
  busy: boolean;
  required?: boolean;
  onPick: (file: File | undefined) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-2">
      {url ? (
        <img src={url} alt={`${label} reference`} className="h-12 w-10 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="flex h-12 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-white/15 text-foreground/40">
          <Plus size={12} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
          {label}
          {required ? <span className="ml-1 text-red-300">required</span> : null}
        </p>
        <p className="truncate text-[11px] text-foreground/60">
          {url ? "Stored" : required ? "Add the back image" : "Optional"}
        </p>
      </div>
      {busy ? <Loader2 size={13} className="animate-spin text-cyan-200" /> : null}
      <label className="cursor-pointer rounded-lg border border-white/15 bg-black/50 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-foreground/80 transition-colors hover:border-cyan-200/50">
        {url ? "Replace" : "Upload"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            onPick(file);
          }}
        />
      </label>
      {url ? (
        <button
          type="button"
          aria-label={`Remove ${label} reference`}
          onClick={onClear}
          className="rounded-lg border border-white/15 bg-black/50 p-1 text-foreground/70 transition-colors hover:border-red-400/60 hover:text-red-300"
        >
          <X size={11} />
        </button>
      ) : null}
    </div>
  );
}



/** One detected subject track + its model choice and assigned wardrobe (mapping only). */
function SubjectCastCard({
  label,
  description,
  portraitUrl,
  garments,
  wardrobe,
  onChange,
  userId,
  model,
  onModelChange,
}: {
  label: string;
  description: string;
  portraitUrl: string | null;
  garments: Garment[];
  wardrobe: { topGarmentId: string | null; bottomGarmentId: string | null } | null;
  onChange: (slot: "topGarmentId" | "bottomGarmentId", garmentId: string | null) => void;
  userId?: string | null;
  model: OutfitSwapSubjectModel | null;
  onModelChange: (next: OutfitSwapSubjectModel) => void;
}) {

  const tops = garments.filter(isTopGarment);
  const bottoms = garments.filter(isBottomGarment);
  const name = (garment: Garment) => garment.label || garment.name || garment.type;

  const renderSlot = (
    slotLabel: string,
    slot: "topGarmentId" | "bottomGarmentId",
    pool: Garment[],
    value: string | null,
  ) => (
    <div>
      <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
        {slotLabel}
      </label>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(slot, event.target.value || null)}
        className={SELECT_CLASS}
      >
        <option value="">Unassigned</option>
        {/* The library is reusable — one garment can dress several subjects. */}
        {(pool.length ? pool : garments).map((garment) => (
          <option key={garment.id} value={garment.id}>
            {name(garment)}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-2.5">
      <div className="flex gap-3">
        <div className="h-24 w-16 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/50">
          {portraitUrl ? (
            <img src={portraitUrl} alt={label} className="h-full w-full object-cover object-top" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wide text-cyan-100">{label}</p>
            {description ? (
              <p className="truncate text-[10px] text-muted-foreground" title={description}>
                {description}
              </p>
            ) : null}
          </div>
          {/* PHASE 4 — model choice per subject (stored only, generation unchanged). */}
          <SubjectModelSelector userId={userId} model={model} onChange={onModelChange} compact />
          {renderSlot("Top", "topGarmentId", tops, wardrobe?.topGarmentId ?? null)}
          {renderSlot("Bottom", "bottomGarmentId", bottoms, wardrobe?.bottomGarmentId ?? null)}

        </div>
      </div>
    </div>
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
  "Rendering the new wardrobe…",
  "Matching lighting & fabric folds…",
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



export default function OutfitSwap() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);

  const [frames, setFrames] = useState<Frame[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);
  const [selectedFrames, setSelectedFrames] = useState<Set<number>>(new Set());

  // PHASE 1 source analysis (detection only — no generation, no provider spend).
  const [analysisStage, setAnalysisStage] = useState<
    "idle" | "frames" | "subjects" | "orientation" | "done" | "error"
  >("idle");
  const [analysis, setAnalysis] = useState<OutfitSwapSourceAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisFingerprint, setAnalysisFingerprint] = useState<string | null>(null);
  // PHASE 3 — subject track id → assigned garment ids. Mapping only: it is
  // stored with the run and is NOT sent to the generation calls in this phase.
  const [castAssignment, setCastAssignment] = useState<OutfitSwapCastAssignment>({});
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  const [garments, setGarments] = useState<Garment[]>([]);
  const [uploadingGarment, setUploadingGarment] = useState(false);
  const [extraPrompt, setExtraPrompt] = useState("");

  const [swaps, setSwaps] = useState<Record<number, SwapGeneration>>({});
  const [approved, setApproved] = useState<Set<number>>(new Set());
  const [swapping, setSwapping] = useState(false);

  const [videoModel, setVideoModel] = useState("seedance-2.0");
  const [preserveAudio, setPreserveAudio] = useState(true);
  const [resolution, setResolution] = useState("1080p");
  // Every Outfit Swap video the user has started — newest first. Jobs live
  // server-side, so refreshing simply re-attaches to the running ones.
  const [videos, setVideos] = useState<SwapGeneration[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [reconstructing, setReconstructing] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);

  // Which reviewed frame is open in the comparison lightbox.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // Which library video is open in the player lightbox.
  const [videoLightboxId, setVideoLightboxId] = useState<string | null>(null);



  const videoInputRef = useRef<HTMLInputElement>(null);
  const garmentInputRef = useRef<HTMLInputElement>(null);

  /* ---------------------------- 1. Source video ---------------------------- */

  /**
   * Detection-only pass over the extracted source frames. Never generates and
   * never touches the swap / reconstruction calls; results are cached server
   * side by input fingerprint so returning here does not recompute.
   */
  const runSourceAnalysis = useCallback(async (uploaded: Frame[]) => {
    if (!uploaded.length) return;
    setAnalysisError(null);
    setAnalysis(null);
    setAnalysisStage("frames");
    try {
      setAnalysisStage("subjects");
      const result = await analyzeOutfitSwapSource(
        uploaded.map((frame, index) => ({
          frameId: `frame-${index}`,
          timestamp: frame.time,
          imageUrl: frame.url,
        })),
      );
      setAnalysisStage("orientation");
      setAnalysis(result.analysis);
      setAnalysisFingerprint(result.fingerprint);
      setSuggestionDismissed(false);
      setCastAssignment(loadCastAssignment(result.fingerprint) ?? {});
      setAnalysisStage("done");
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Could not analyse that clip");
      setAnalysisStage("error");
    }
  }, []);

  const handleVideoFile = useCallback(async (file: File) => {
    const objectUrl = URL.createObjectURL(file);
    setVideoPreview(objectUrl);
    setFrames([]);
    setSwaps({});
    setApproved(new Set());
    setSelectedFrames(new Set());
    setAnalysis(null);
    setAnalysisError(null);
    setAnalysisStage("idle");
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
      void runSourceAnalysis(uploaded);


    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not process that video");
    } finally {
      setUploadingVideo(false);
      setExtracting(false);
    }
  }, [runSourceAnalysis]);

  /* -------------------------- 3. Garment references ------------------------- */

  const addGarments = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setUploadingGarment(true);
    try {
      const folder = await createOutfitSwapFolder();
      const uploaded: Garment[] = [];
      for (const file of files) {
        const compressed = await compressImageFile(file);
        const stored = await uploadToStorage(folder, compressed, compressed.name);
        uploaded.push({
          id:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `garment-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          // FRONT is the primary reference: `url` mirrors `frontUrl` so the
          // existing generation call keeps working unchanged.
          url: stored.url,
          frontUrl: stored.url,
          hasBackDesign: false,
          backUrl: null,
          detailUrl: null,
          sideUrl: null,
          name: file.name,
          type: GARMENT_TYPES[0],
          label: "",
          person: DEFAULT_APPLY_TO,
        });
      }

      setGarments((prev) => [...prev, ...uploaded].slice(0, 14));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload that reference");
    } finally {
      setUploadingGarment(false);
    }
  }, []);

  /**
   * Uploads one extra structured reference for a garment. FRONT replaces the
   * primary ref (keeping `url` in sync); BACK / DETAIL / SIDE are stored only —
   * they are NOT sent to generation in this phase.
   */
  const [slotUploading, setSlotUploading] = useState<string | null>(null);
  const [expandedRefs, setExpandedRefs] = useState<Set<number>>(new Set());
  const uploadGarmentSlot = useCallback(
    async (index: number, slot: GarmentSlot, file: File | undefined) => {
      if (!file) return;
      setSlotUploading(`${index}:${slot}`);
      try {
        const folder = await createOutfitSwapFolder();
        const compressed = await compressImageFile(file);
        const stored = await uploadToStorage(folder, compressed, compressed.name);
        setGarments((prev) =>
          prev.map((item, i) => {
            if (i !== index) return item;
            if (slot === "front") return { ...item, frontUrl: stored.url, url: stored.url };
            if (slot === "back") return { ...item, backUrl: stored.url };
            if (slot === "detail") return { ...item, detailUrl: stored.url };
            return { ...item, sideUrl: stored.url };
          }),
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not upload that reference");
      } finally {
        setSlotUploading(null);
      }
    },
    [],
  );

  /* --------------------- 3b. Cast assignment (mapping only) ------------------ */

  const subjectTracks = useMemo(
    () => (analysis && analysis.subjectCount > 1 ? analysis.subjectTracks : []),
    [analysis],
  );

  const suggestedAssignment = useMemo(
    () => suggestCastAssignment(subjectTracks.map((track) => track.subjectId), garments),
    [subjectTracks, garments],
  );

  const hasAssignment = useMemo(
    () =>
      subjectTracks.some((track) => {
        const entry = castAssignment[track.subjectId];
        return Boolean(entry?.topGarmentId || entry?.bottomGarmentId);
      }),
    [subjectTracks, castAssignment],
  );

  // Stored with the run so navigating back never recomputes the mapping.
  useEffect(() => {
    if (!analysisFingerprint) return;
    saveCastAssignment(analysisFingerprint, castAssignment);
  }, [analysisFingerprint, castAssignment]);

  const setSubjectGarment = useCallback(
    (subjectId: string, slot: "topGarmentId" | "bottomGarmentId", garmentId: string | null) => {
      setCastAssignment((prev) => ({
        ...prev,
        [subjectId]: {
          topGarmentId: prev[subjectId]?.topGarmentId ?? null,
          bottomGarmentId: prev[subjectId]?.bottomGarmentId ?? null,
          [slot]: garmentId,
        },
      }));
    },
    [],
  );

  /** The source frame where this track first appears — used as its portrait. */
  const subjectPortrait = useCallback(
    (appearsStart: number) => {
      if (!frames.length) return null;
      let best = frames[0];
      for (const frame of frames) {
        if (Math.abs(frame.time - appearsStart) < Math.abs(best.time - appearsStart)) best = frame;
      }
      return best.url;
    },
    [frames],
  );

  /* ------------------------------ 4. Frame swaps ---------------------------- */

  /** Merge a fresh generation record into whichever collection owns it. */
  const applyGeneration = useCallback((generation: SwapGeneration) => {
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
      setSwaps((prev) => ({ ...prev, [generation.frameIndex as number]: generation }));
    }
  }, []);

  // Re-attach to anything the backend still has in flight (refresh-safe).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await callOutfitSwap<{ generations: SwapGeneration[] }>({
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
    const ids = Object.values(swaps)
      .filter((swap) => swap.status === "queued" || swap.status === "running")
      .map((swap) => swap.id);
    for (const video of videos) {
      if (video.status === "queued" || video.status === "running") ids.push(video.id);
    }
    return ids;
  }, [swaps, videos]);

  useEffect(() => {
    if (!inFlightIds.length) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const data = await callOutfitSwap<{ generations: SwapGeneration[] }>({
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

  const swapFrame = useCallback(
    async (frameIndex: number) => {
      const frame = frames[frameIndex];
      if (!frame) return;
      const data = await callOutfitSwap<{ generation: SwapGeneration }>({
        action: "swap_frame",
        sourceFrameUrl: frame.url,
        garments,
        // Per-product targets travel with each garment; this is only a fallback.
        person: garments[0]?.person ?? DEFAULT_APPLY_TO,
        frameIndex,
        frameTime: frame.time,
        aspectRatio: meta?.aspectRatio,
        extraPrompt,
        resolution: "2K",
      });
      setSwaps((prev) => ({ ...prev, [frameIndex]: data.generation }));
      setApproved((prev) => {
        const next = new Set(prev);
        next.delete(frameIndex);
        return next;
      });
    },
    [frames, garments, meta, extraPrompt],
  );

  const runSelectedSwaps = useCallback(async () => {
    if (!garments.length) {
      toast.error("Add at least one clothing reference");
      return;
    }
    // BACK is required once the user says the garment has a back design.
    if (garments.some((garment) => garment.hasBackDesign && !garment.backUrl)) {
      toast.error("Add the back image for every product marked with a back design");
      return;
    }
    const indices = [...selectedFrames].sort((a, b) => a - b);
    if (!indices.length) {
      toast.error("Select the frames you want to swap");
      return;
    }
    setSwapping(true);
    try {
      for (const index of indices) await swapFrame(index);
      toast.success(`${indices.length} frame swap(s) queued`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue the swaps");
    } finally {
      setSwapping(false);
    }
  }, [selectedFrames, garments, swapFrame]);

  const removeSwap = useCallback(async (frameIndex: number) => {
    const swap = swaps[frameIndex];
    setSwaps((prev) => {
      const next = { ...prev };
      delete next[frameIndex];
      return next;
    });
    setApproved((prev) => {
      const next = new Set(prev);
      next.delete(frameIndex);
      return next;
    });
    if (swap) {
      await callOutfitSwap({ action: "delete", generationIds: [swap.id] }).catch(() => null);
    }
  }, [swaps]);

  /* ---------------------------- 5. Reconstruction --------------------------- */

  const approvedUrls = useMemo(
    () =>
      [...approved]
        .sort((a, b) => a - b)
        .map((index) => swaps[index]?.outputUrl)
        .filter((url): url is string => !!url),
    [approved, swaps],
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
      const data = await callOutfitSwap<{ generation: SwapGeneration }>({
        action: "reconstruct",
        frameUrls: approvedUrls,
        garments,
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
  }, [approvedUrls, garments, videoModel, resolution, preserveAudio, meta, extraPrompt, videoDuration]);

  /** Stops tracking and frees the UI, even if the provider job keeps running. */
  const cancelVideo = useCallback(async () => {
    const id = cancelTarget;
    setCancelTarget(null);
    if (!id) return;
    setVideos((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, status: "canceled" } : entry)),
    );
    try {
      await callOutfitSwap({ action: "cancel", generationIds: [id] });
    } catch {
      // The record may already be terminal; the UI is free either way.
    }
    toast.success("Video generation canceled");
  }, [cancelTarget]);

  const deleteVideo = useCallback(async (id: string) => {
    setVideos((prev) => prev.filter((entry) => entry.id !== id));
    setVideoLightboxId((current) => (current === id ? null : current));
    await callOutfitSwap({ action: "delete", generationIds: [id] }).catch(() => null);
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
          url: swaps[index]?.outputUrl ?? null,
          time: frames[index]?.time ?? 0,
        }))
        .filter((entry): entry is { index: number; url: string; time: number } => !!entry.url),
    [approved, swaps, frames],
  );

  // Kling 3.0 without audio: $0.112 per second.
  const animateCostUsd = useMemo(() => 0.112 * 3 * approvedFrames.length, [approvedFrames]);

  const [animating, setAnimating] = useState(false);
  const [zipping, setZipping] = useState(false);

  const animateFrame = useCallback(
    async (frame: { index: number; url: string; time: number }) => {
      const data = await callOutfitSwap<{ generation: SwapGeneration }>({
        action: "animate_frame",
        imageUrl: frame.url,
        frameIndex: frame.index,
        frameTime: frame.time,
      });
      setVideos((prev) => [data.generation, ...prev]);
    },
    [],
  );

  const animateApproved = useCallback(async () => {
    if (!approvedFrames.length) {
      toast.error("Approve at least one swapped frame first");
      return;
    }
    setAnimating(true);
    try {
      for (const frame of approvedFrames) await animateFrame(frame);
      toast.success(`${approvedFrames.length} clip${approvedFrames.length === 1 ? "" : "s"} queued`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the clips");
    } finally {
      setAnimating(false);
    }
  }, [approvedFrames, animateFrame]);

  const regenerateClip = useCallback(
    async (clip: SwapGeneration) => {
      if (!clip.sourceFrameUrl) {
        toast.error("That clip has no source frame to reuse");
        return;
      }
      try {
        await animateFrame({
          index: clip.frameIndex ?? 0,
          url: clip.sourceFrameUrl,
          time: clip.frameTime ?? 0,
        });
        setVideos((prev) => prev.filter((entry) => entry.id !== clip.id));
        await callOutfitSwap({ action: "delete", generationIds: [clip.id] }).catch(() => null);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not regenerate that clip");
      }
    },
    [animateFrame],
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
      link.download = "fuse-outfit-swap-clips.zip";
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

  const canMakeTemplate = frames.length > 0 && garments.length > 0 && approvedFrames.length > 0;
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState(
    "Reusable outfit replacement workflow generated from Outfit Swap.",
  );
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [createdTemplate, setCreatedTemplate] = useState<OutfitSwapTemplateResult | null>(null);

  const openTemplateModal = useCallback(() => {
    setCreatedTemplate(null);
    setTemplateName(
      `Outfit Swap – ${new Date().toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })}`,
    );
    setTemplateDescription("Reusable outfit replacement workflow generated from Outfit Swap.");
    setTemplateOpen(true);
  }, []);

  const createTemplate = useCallback(async () => {
    if (!canMakeTemplate) return;
    setCreatingTemplate(true);
    try {
      const result = await createTemplateFromOutfitSwap({
        name: templateName,
        description: templateDescription,
        // Approved swapped frames define the STRUCTURE — each becomes a
        // replaceable input slot with the swapped frame as its example.
        frames: approvedFrames.map((frame, index) => ({
          url: frame.url,
          label: `Input Image ${String(index + 1).padStart(2, "0")}`,
        })),
        products: garments.map((garment) => ({
          url: garment.url,
          type: garment.type,
          label: garment.label || garment.name,
          person: garment.person,
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
    garments,
    clips.length,
    videoModel,
    videoDuration,
    resolution,
    meta,
  ]);


  return (
    <SiteShell>
      <PageMeta
        title="Outfit Swap | FUSE"
        description="Swap the wardrobe in any clip: extract source frames, restyle them, and rebuild the video."
        path="/app/lab/outfit-swap"
      />

      <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6">
        <header className="mb-6 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/70">FUSE Lab</p>
          <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">Outfit Swap</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Upload a clip, restyle the frames you pick with your product references, then rebuild the
            same video in the new wardrobe.
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
              title="Clothing references"
              hint="Set the type for each product. No auto-detection."
            >
              <input
                ref={garmentInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  void addGarments(files);
                }}
              />
              <div className="space-y-2.5">
                {garments.map((garment, index) => (
                  <div
                    key={`${garment.url}-${index}`}
                    className="rounded-2xl border border-white/10 bg-black/25 p-2.5"
                  >
                    <div className="flex gap-3">
                      <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/50">
                        <img
                          src={garment.url}
                          alt={garment.name || `Reference ${index + 1}`}
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute left-1 top-1 rounded bg-black/80 px-1 text-[9px] font-semibold text-cyan-100">
                          REF {index + 2}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="truncate text-[11px] font-medium text-foreground" title={garment.name}>
                          {garment.name || `Product ${index + 1}`}
                        </p>
                        <div>
                          <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
                            Type
                          </label>
                          <select
                            value={garment.type}
                            onChange={(event) =>
                              setGarments((prev) =>
                                prev.map((item, i) => (i === index ? { ...item, type: event.target.value } : item)),
                              )
                            }
                            className={SELECT_CLASS}
                          >
                            {GARMENT_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {type}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
                            Apply to
                          </label>
                          <select
                            value={garment.person}
                            onChange={(event) =>
                              setGarments((prev) =>
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
                        <Input
                          value={garment.label}
                          onChange={(event) =>
                            setGarments((prev) =>
                              prev.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)),
                            )
                          }
                          placeholder="Optional label"
                          className="h-8 rounded-lg border-white/12 bg-black/40 text-xs"
                        />
                      </div>
                      <button
                        type="button"
                        aria-label="Remove product"
                        onClick={() => setGarments((prev) => prev.filter((_, i) => i !== index))}
                        className="self-start rounded-lg border border-white/15 bg-black/50 p-1.5 text-foreground/70 transition-colors hover:border-red-400/60 hover:text-red-300"
                      >
                        <X size={12} />
                      </button>
                    </div>

                    {/* PHASE 2 — structured refs. FRONT is the primary ref used by
                        generation; BACK/DETAIL/SIDE are captured + stored only. */}
                    <div className="mt-2.5 space-y-2 border-t border-white/10 pt-2.5">
                      <label className="flex cursor-pointer items-center justify-between gap-3">
                        <span className="text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
                          Has back design
                        </span>
                        <Switch
                          checked={garment.hasBackDesign}
                          onCheckedChange={(checked) =>
                            setGarments((prev) =>
                              prev.map((item, i) =>
                                i === index ? { ...item, hasBackDesign: checked } : item,
                              ),
                            )
                          }
                        />
                      </label>

                      {garment.hasBackDesign ? (
                        <GarmentSlotUpload
                          label="Back"
                          required
                          url={garment.backUrl}
                          busy={slotUploading === `${index}:back`}
                          onPick={(file) => void uploadGarmentSlot(index, "back", file)}
                          onClear={() =>
                            setGarments((prev) =>
                              prev.map((item, i) => (i === index ? { ...item, backUrl: null } : item)),
                            )
                          }
                        />
                      ) : null}

                      {expandedRefs.has(index) ? (
                        <div className="space-y-2">
                          <GarmentSlotUpload
                            label="Detail"
                            url={garment.detailUrl ?? null}
                            busy={slotUploading === `${index}:detail`}
                            onPick={(file) => void uploadGarmentSlot(index, "detail", file)}
                            onClear={() =>
                              setGarments((prev) =>
                                prev.map((item, i) => (i === index ? { ...item, detailUrl: null } : item)),
                              )
                            }
                          />
                          <GarmentSlotUpload
                            label="Side"
                            url={garment.sideUrl ?? null}
                            busy={slotUploading === `${index}:side`}
                            onPick={(file) => void uploadGarmentSlot(index, "side", file)}
                            onClear={() =>
                              setGarments((prev) =>
                                prev.map((item, i) => (i === index ? { ...item, sideUrl: null } : item)),
                              )
                            }
                          />
                        </div>
                      ) : null}

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedRefs((prev) => {
                            const next = new Set(prev);
                            if (next.has(index)) next.delete(index);
                            else next.add(index);
                            return next;
                          })
                        }
                        className="text-[10px] uppercase tracking-[0.14em] text-foreground/50 transition-colors hover:text-cyan-200"
                      >
                        {expandedRefs.has(index) ? "Hide extra references" : "Add more references"}
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => garmentInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-black/25 py-4 text-xs text-foreground/80 transition-colors hover:border-cyan-200/50"
                >
                  {uploadingGarment ? (
                    <Loader2 size={14} className="animate-spin text-cyan-200" />
                  ) : (
                    <Plus size={14} className="text-cyan-200" />
                  )}
                  Add product image
                </button>
              </div>

              <div className="mt-4">
                <Textarea
                  value={extraPrompt}
                  onChange={(event) => setExtraPrompt(event.target.value)}
                  placeholder="Optional extra direction (styling notes, fit, how the garment sits)"
                  className="min-h-[70px] rounded-xl border-white/12 bg-black/40 text-xs"
                />
              </div>
            </SectionCard>

            {/* PHASE 3 — only appears when the clip really has multiple subjects.
                One subject keeps the flow exactly as simple as before. */}
            {subjectTracks.length > 1 ? (
              <SectionCard
                step={4}
                title="Assign your cast"
                hint="Assign wardrobe once per subject — the same product can go on more than one person."
              >
                {suggestedAssignment && !hasAssignment && !suggestionDismissed ? (
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-cyan-200/25 bg-cyan-400/5 px-3 py-2 text-[11px] text-cyan-100">
                    <span>Suggested assignment available — you can change anything after applying.</span>
                    <Button
                      size="sm"
                      onClick={() => setCastAssignment(suggestedAssignment)}
                      className="h-6 rounded-lg bg-cyan-400/20 px-2 text-[10px] uppercase tracking-[0.12em] text-cyan-100 hover:bg-cyan-400/30"
                    >
                      Use suggestion
                    </Button>
                    <button
                      type="button"
                      onClick={() => setSuggestionDismissed(true)}
                      className="text-[10px] uppercase tracking-[0.12em] text-foreground/50 hover:text-foreground/80"
                    >
                      Dismiss
                    </button>
                  </div>
                ) : null}

                {garments.length ? (
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {subjectTracks.map((track, index) => (
                      <SubjectCastCard
                        key={track.subjectId}
                        label={`Subject ${index + 1}`}
                        description={track.description}
                        portraitUrl={subjectPortrait(track.appearsStart)}
                        garments={garments}
                        wardrobe={castAssignment[track.subjectId] ?? null}
                        onChange={(slot, garmentId) => setSubjectGarment(track.subjectId, slot, garmentId)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Add clothing references above to assign them to each subject.
                  </p>
                )}
              </SectionCard>
            ) : null}



            <SectionCard step={5} title="Video generation" hint="Your clip, rebuilt in the new wardrobe.">
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
                    ? "Saves this run's structure as a real, editable template — future runs use new images and new products."
                    : "Needs source frames, at least one product and one approved swapped frame."}
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
              {/* Detection-only status — no generation happens here. */}
              {frames.length && analysisStage !== "idle" ? (
                <div className="mb-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px]">
                  {analysisStage === "done" && analysis ? (
                    <div className="flex flex-wrap items-center gap-2 text-cyan-100">
                      <span className="font-semibold tracking-wide">
                        {analysis.subjectCount === 1
                          ? "1 SUBJECT DETECTED ✓"
                          : `✓ ${analysis.subjectCount} SUBJECTS`}
                      </span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">✓ {analysis.frameCount} FRAMES</span>
                    </div>
                  ) : analysisStage === "error" ? (
                    <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                      <span>{analysisError ?? "Clip analysis unavailable"}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void runSourceAnalysis(frames)}
                        className="h-6 rounded-lg border-white/15 bg-transparent text-[10px]"
                      >
                        Retry
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 size={12} className="animate-spin text-cyan-200" />
                      <span>
                        Analyzing video…{" "}
                        {analysisStage === "frames"
                          ? "· detecting frames"
                          : analysisStage === "subjects"
                            ? "· detecting subjects"
                            : "· tracking wardrobe orientation"}
                      </span>
                    </div>
                  )}
                </div>
              ) : null}

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
                      {swapping ? <Loader2 size={13} className="animate-spin" /> : <Shirt size={13} />}
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
                    const frame = frames[index];
                    const isApproved = approved.has(index);
                    return (
                      <article
                        key={swap.id}
                        className={cn(
                          "space-y-2 rounded-2xl border bg-black/25 p-2.5",
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
                            <StatusPill generation={swap} />
                          </span>
                        </div>
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
                          <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/40">
                            {swap.status === "complete" && swap.outputUrl ? (
                              <img src={swap.outputUrl} alt="Swapped frame" className="h-32 w-full object-cover" />
                            ) : swap.status === "failed" || swap.status === "canceled" ? (
                              <p className="h-32 overflow-y-auto p-2 text-[10px] text-red-300">
                                {swap.error ?? "Generation failed"}
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
                              Swapped
                            </p>
                          </div>
                        </button>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant={isApproved ? "default" : "outline"}
                            disabled={swap.status !== "complete"}
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
                            onClick={() => void swapFrame(index)}
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
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-4 py-8 text-xs text-muted-foreground">
                  <Shirt size={14} /> Swapped frames land here for review.
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
                    ["Motion", "Dolly in"],
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
                            </p>

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
            const frame = frames[index];
            if (!swap) return null;
            const isApproved = approved.has(index);
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
                    <figure className="overflow-hidden rounded-2xl border border-cyan-200/30 bg-black/50">
                      {swap.status === "complete" && swap.outputUrl ? (
                        <img src={swap.outputUrl} alt="Swapped frame" className="max-h-[62vh] w-full object-contain" />
                      ) : swap.status === "failed" || swap.status === "canceled" ? (
                        <p className="p-3 text-xs text-red-300">{swap.error ?? "Generation failed"}</p>
                      ) : (
                        <div className="flex h-48 items-center justify-center">
                          <Loader2 size={18} className="animate-spin text-cyan-200" />
                        </div>
                      )}
                      <figcaption className="px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-cyan-200/70">
                        Swapped
                      </figcaption>
                    </figure>
                  </div>

                  <aside className="space-y-3">
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                      <StatusPill generation={swap} />
                      <span className="text-[11px] text-cyan-200/70">
                        {costPreview(swap.estimatedCredits, swap.estimatedCostUsd)}
                      </span>
                    </div>
                    <Button
                      disabled={swap.status !== "complete"}
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
                      onClick={() => void swapFrame(index)}
                      className="w-full rounded-xl border-white/15 bg-transparent text-xs"
                    >
                      <RefreshCw size={13} /> Regenerate
                    </Button>
                    {swap.outputUrl ? (
                      <a
                        href={swap.outputUrl}
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
                  ["Products", `${createdTemplate.productReferenceCount}`],
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
                {garments.length} product reference{garments.length === 1 ? "" : "s"},{" "}
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
