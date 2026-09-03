import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readStudioGalleryCache, writeStudioGalleryCache } from "@/lib/studioGalleryCache";
import {
  readPublicFailure,
  type ProviderFailureDetail,
  type PublicGenerationFailure,
} from "@/lib/generationFailure";
import {
  galleryPerfMount,
  galleryPerfInitialApi,
  galleryPerfLoadMore,
  galleryPerfMediaLoaded,
  galleryPerfRender,
  galleryPerfCardRender,
} from "@/lib/galleryPerf";
import {
  ArrowLeft,
  ArrowRight,
  CheckSquare,
  ChevronDown,
  Copy,
  Download,
  Film,
  GripVertical,
  Heart,
  ImageIcon,
  Images,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Square,
  Trash2,
  Video,
  Volume2,
  VolumeX,
  Wand2,
  X,
} from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";


import { toast } from "sonner";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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
import { Dialog, DialogContent } from "@/components/ui/dialog";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { uploadRunInputFile } from "@/services/runInputUpload";
import { cn } from "@/lib/utils";
import { useNearViewport } from "@/hooks/useNearViewport";
import {
  FieldHelper,
  FusePanel,
  SectionTitle,
  SegmentedControl,
} from "@/components/fuse/FuseUI";
import {
  CAMERA_MOVEMENT_PRESETS,
  DEFAULT_CAMERA_MOVEMENT_ID,
  getCameraMovementPreset,
} from "@/lib/generationStudio/cameraMovementPresets";

import {
  IMAGE_FLAT_USD as IMAGE_FALLBACK_USD,
  costPreview,
  creditsFromUsd,
} from "@/lib/costEstimate";



const MAX_REFERENCES = 15;
const REFERENCE_STORE_KEY = "fuse-studio-reference-library";

type StudioModelKey =
  | "nano-banana-pro"
  | "gpt-image-2"
  | "seedream-v4"
  | "kling-3.0-pro"
  | "kling-3.0-standard"
  | "seedance-2.0"
  | "seedance-2.0-fast";

type StudioModel = {
  key: StudioModelKey;
  label: string;
  kind: "image" | "video";
  blurb: string;
  recommended?: boolean;
  usdPerSecond?: number;
  usdPerSecondAudio?: number;
  durationRange?: { min: number; max: number };
  resolutions: string[];
  /** Label of the model's single secondary control (image models). */
  paramLabel?: string;
  /** Payload field the secondary control maps to (image models). */
  paramField?: "resolution" | "quality" | "imageSize";
  /** Image models only: whether the provider accepts aspect_ratio. */
  supportsAspectRatio?: boolean;
  supportsAudio?: boolean;
  supportsEndFrame?: boolean;
};

/**
 * RESOLUTION TRUTHFULNESS — these lists mirror the live fal OpenAPI schemas:
 *   nano-banana-pro (edit + text)        → 1K, 2K, 4K
 *   kling 3.0 pro/standard               → NO resolution field (provider-fixed)
 *   seedance 2.0 image-to-video          → 480p, 720p, 1080p, 4k
 *   seedance 2.0 FAST image-to-video     → 480p, 720p ONLY
 */
const IMAGE_RESOLUTIONS = ["1K", "2K", "4K"];
/** LIVE fal schema: fal-ai/gpt-image-2(/edit) quality enum. No resolution, no aspect_ratio. */
const GPT_IMAGE_2_QUALITIES = ["auto", "low", "medium", "high"];
/** LIVE fal schema: seedream v4 takes image_size {width,height} — these tiers map to real dims. */
const SEEDREAM_SIZES = ["1K", "2K", "4K"];
const KLING_RESOLUTIONS: string[] = [];
const SEEDANCE_RESOLUTIONS = ["480p", "720p", "1080p", "4k"];
const SEEDANCE_FAST_RESOLUTIONS = ["480p", "720p"];

const ASPECT_OPTIONS: { value: string; note: string }[] = [
  { value: "auto", note: "Let the model decide" },
  { value: "9:16", note: "TikTok / Reels / Stories" },
  { value: "1:1", note: "Instagram / product / marketplace" },
  { value: "4:5", note: "IG feed / editorial" },
  { value: "3:4", note: "Fashion / editorial" },
  { value: "16:9", note: "YouTube / cinematic / banners" },
  { value: "4:3", note: "Editorial" },
  { value: "2:3", note: "Print / poster" },
  { value: "3:2", note: "Classic photo" },
  { value: "21:9", note: "Ultra-wide cinematic" },
];

/** Formats surfaced directly in the segmented control; the rest live behind "More formats". */
const PRIMARY_ASPECTS = ["auto", "9:16", "4:5", "1:1", "16:9"];

function formatDescriptor(ratio: string) {
  const note = ASPECT_OPTIONS.find((option) => option.value === ratio)?.note;
  return note ? note.toUpperCase() : "CUSTOM FORMAT";
}



const STUDIO_MODELS: StudioModel[] = [
  {
    key: "nano-banana-pro",
    label: "Nano Banana Pro",
    kind: "image",
    blurb: "Google's flagship image model — reference-driven edits",
    recommended: true,
    resolutions: IMAGE_RESOLUTIONS,
    paramLabel: "RESOLUTION",
    paramField: "resolution",
    supportsAspectRatio: true,
  },
  {
    key: "gpt-image-2",
    label: "GPT Image 2",
    kind: "image",
    blurb: "OpenAI image model — prompt-faithful edits and text",
    resolutions: GPT_IMAGE_2_QUALITIES,
    paramLabel: "QUALITY",
    paramField: "quality",
  },
  {
    key: "seedream-v4",
    label: "Seedream v4",
    kind: "image",
    blurb: "ByteDance Seedream — up to 4K sizes",
    resolutions: SEEDREAM_SIZES,
    paramLabel: "SIZE",
    paramField: "imageSize",
  },
  {
    key: "kling-3.0-pro",
    label: "Kling 3.0 Pro",
    kind: "video",
    blurb: "Highest-fidelity motion with native audio",
    recommended: true,
    usdPerSecond: 0.112,
    usdPerSecondAudio: 0.168,
    durationRange: { min: 3, max: 15 },
    resolutions: KLING_RESOLUTIONS,
    supportsAudio: true,
    supportsEndFrame: true,
  },
  {
    key: "kling-3.0-standard",
    label: "Kling 3.0 Standard",
    kind: "video",
    blurb: "Balanced quality and speed, vertical output",
    usdPerSecond: 0.112,
    usdPerSecondAudio: 0.168,
    durationRange: { min: 3, max: 15 },
    resolutions: KLING_RESOLUTIONS,
    supportsAudio: true,
    supportsEndFrame: true,
  },
  {
    key: "seedance-2.0",
    label: "Seedance 2.0",
    kind: "video",
    blurb: "Cinematic motion with resolution control",
    usdPerSecond: 0.3024,
    durationRange: { min: 4, max: 15 },
    resolutions: SEEDANCE_RESOLUTIONS,
    supportsAudio: true,
  },
  {
    key: "seedance-2.0-fast",
    label: "Seedance 2.0 Fast",
    kind: "video",
    blurb: "Faster, lower-cost Seedance pass",
    usdPerSecond: 0.2419,
    durationRange: { min: 4, max: 15 },
    resolutions: SEEDANCE_FAST_RESOLUTIONS,
    supportsAudio: true,
  },
];

const RESOLUTION_MULTIPLIER: Record<string, number> = {
  "480p": 0.5,
  "720p": 1,
  "1080p": 1.8,
  "2K": 1.8,
  "4K": 3.5,
};

/**
 * GS-PERF1: gallery rows come from the lightweight list action — heavy fields
 * (prompt, inputPayload, error) are only present after a `detail` fetch or a
 * reconcile merge, so they stay optional here.
 */
type Generation = {
  id: string;
  status: "queued" | "running" | "complete" | "failed";
  kind: string | null;
  prompt?: string | null;
  promptPreview?: string | null;
  outputUrl: string | null;
  previewUrl?: string | null;
  posterUrl?: string | null;

  outputType: string | null;
  /** Customer-safe failure contract — raw provider text is never sent. */
  publicFailure?: PublicGenerationFailure | null;
  /** Privileged (admin/dev) diagnostics only — absent for customers. */
  providerFailure?: ProviderFailureDetail | null;
  estimatedCredits: number | null;
  estimatedCostUsd: number | null;
  providerModel: string | null;
  inputPayload?: Record<string, unknown> | null;
  favorited?: boolean;
  createdAt: string | null;
  completedAt: string | null;
};

/** Prompt + reference urls that produced a generation, read from the stored payload. */
function generationRecipe(generation: Generation) {
  const payload = (generation.inputPayload ?? {}) as Record<string, unknown>;
  const prompt = String(payload.prompt ?? generation.prompt ?? "");
  const rawUrls = Array.isArray(payload.image_urls) ? payload.image_urls : [];
  const urls = rawUrls.map((entry) => String(entry ?? "").trim()).filter(Boolean);
  if (!urls.length) {
    const single = String(payload.init_image ?? payload.image_url ?? "").trim();
    if (single) urls.push(single);
  }
  const aspect = String(payload.aspect_ratio ?? "").trim();
  const resolution = String(payload.resolution ?? "").trim();
  return { prompt, urls, aspect, resolution };
}


type Reference = { url: string; label: string; role?: string };

/** Optional creative role chips — cosmetic labels, never sent to a provider. */
const REFERENCE_ROLES = [
  "HERO",
  "MACRO",
  "DETAIL",
  "SIDE",
  "BACK",
  "CLASP",
  "LINK",
  "TRANSITION",
  "TEXTURE",
  "LIGHTING",
  "CUSTOM",
];

type ShotPlanEntry = { index: number; shot: string; start: number | null; end: number | null };

/**
 * Reads an already-stored shot plan off a generation payload (Jewelry Swap's
 * Seedance director output). Nothing is generated or altered here.
 */
function readShotPlan(payload: Record<string, unknown> | null | undefined): ShotPlanEntry[] {
  const raw = (payload ?? {}) as Record<string, unknown>;
  const list = Array.isArray(raw.shot_plan)
    ? raw.shot_plan
    : Array.isArray((raw.shotPlan as unknown[]) ?? null)
      ? (raw.shotPlan as unknown[])
      : [];
  return list
    .map((entry, index) => {
      const item = (entry ?? {}) as Record<string, unknown>;
      const shot = String(item.shot ?? item.shot_type ?? item.label ?? item.name ?? "").trim();
      if (!shot) return null;
      const start = Number(item.start ?? item.start_s ?? item.startSeconds ?? NaN);
      const end = Number(item.end ?? item.end_s ?? item.endSeconds ?? NaN);
      return {
        index: index + 1,
        shot,
        start: Number.isFinite(start) ? start : null,
        end: Number.isFinite(end) ? end : null,
      } satisfies ShotPlanEntry;
    })
    .filter((entry): entry is ShotPlanEntry => Boolean(entry));
}

/** Branded, human status wording for in-flight and finished work. */
function statusLabel(status: Generation["status"], progress: number) {
  if (status === "complete") return "READY";
  // Customer-facing wording — never an internal "FAILED" state.
  if (status === "failed") return "NEEDS ATTENTION";
  if (status === "queued") return "ANALYZING REFERENCES";
  if (progress < 35) return "BUILDING SHOT PLAN";
  if (progress < 85) return "GENERATING";
  return "FINALIZING";
}




/** Error carrying the edge function HTTP status (402 = out of credits). */
class StudioRequestError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

async function callStudio(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("generate-studio", { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    let message = error.message;
    if (context) {
      // Gateway timeouts return an HTML page — never parse it as JSON.
      const text = await context.text().catch(() => "");
      let parsed: any = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = null;
      }
      if (parsed?.error) message = String(parsed.error);
      else if (context.status === 504 || context.status === 408 || context.status === 524) {
        message = "Generation timed out — please retry.";
      } else if (!parsed) message = `Generation request failed (${context.status}) — please retry.`;
    }
    throw new StudioRequestError(
      message || "Generation timed out — please retry.",
      (error as { context?: Response }).context?.status,
    );
  }
  if ((data as any)?.error) throw new Error(String((data as any).error));
  return data as any;
}


function readReferenceLibrary(): string[] {
  try {
    const raw = localStorage.getItem(REFERENCE_STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Cross-origin URLs ignore the anchor `download` attribute, so fetch the bytes
 * and download the blob instead. Falls back to opening the URL if that fails.
 */
async function downloadAsset(url: string, id: string, type?: string | null) {
  const extension = type === "video" ? "mp4" : "png";
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(String(response.status));
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `fuse-${id}.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}


function AspectGlyph({ ratio }: { ratio: string }) {
  if (ratio === "auto") return <Sparkles size={12} className="text-cyan-200/80" />;
  const [w, h] = ratio.split(":").map(Number);
  const scale = 14 / Math.max(w, h);
  return (
    <span
      className="inline-block shrink-0 rounded-[3px] border border-cyan-200/60"
      style={{ width: Math.max(5, w * scale), height: Math.max(5, h * scale) }}
    />
  );
}

function SectionLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3">
      <span className="font-display text-[13px] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--electric-cyan))]">
        {children}
      </span>
      {hint ? <span className="text-[12px] text-muted-foreground">{hint}</span> : null}
    </div>
  );
}


const ICON_ACTION_CLASS =
  "flex h-7 w-7 items-center justify-center rounded-lg border border-white/15 bg-black/60 text-foreground/80 backdrop-blur-md transition-colors hover:border-cyan-200/60 hover:text-cyan-100";

function FavoriteButton({
  favorited,
  onToggle,
  className,
  size = 13,
}: {
  favorited: boolean;
  onToggle: () => void;
  className?: string;
  size?: number;
}) {
  return (
    <button
      type="button"
      aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
      title={favorited ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={favorited}
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        onToggle();
      }}
      className={cn(ICON_ACTION_CLASS, favorited && "text-red-400 hover:text-red-300", className)}
    >
      <Heart size={size} className={favorited ? "fill-current" : undefined} />
    </button>
  );
}

function GenerationCard({
  generation,
  onUseAsReference,
  onExpand,
  onDelete,
  onToggleFavorite,
  priority = false,
}: {
  generation: Generation;
  onUseAsReference: (url: string) => void;
  onExpand: (generation: Generation) => void;
  onDelete: (generation: Generation) => void;
  onToggleFavorite: (generation: Generation) => void;
  /** GS-PERF5: first-screen tiles load eagerly at high priority. */
  priority?: boolean;
}) {
  galleryPerfCardRender(); // GS-PERF9 dev-only render counter
  const inFlight = generation.status === "queued" || generation.status === "running";
  const [progress, setProgress] = useState(generation.status === "running" ? 25 : 8);

  useEffect(() => {
    if (!inFlight) return;
    const timer = setInterval(() => setProgress((prev) => Math.min(94, prev + 2)), 1500);
    return () => clearInterval(timer);
  }, [inFlight]);

  const isImage = generation.outputType !== "video";
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const done = generation.status === "complete" && !!generation.outputUrl;
  /* GS-PERF6: tiles load the small stored preview when it exists; the master
     output_url stays the source for lightbox/download/reference/animate. */
  const tileSrc = generation.previewUrl ?? generation.outputUrl;

  /* GS-PERF5: media only mounts/downloads once the tile nears the viewport. */
  const { ref: mediaHostRef, near } = useNearViewport<HTMLDivElement>(priority, "500px");
  const [loaded, setLoaded] = useState(false);
  /* GS-PERF9 dev-only: report successful media decode for first-paint metrics. */
  const handleMediaLoaded = useCallback(() => {
    setLoaded(true);
    galleryPerfMediaLoaded();
  }, []);
  useEffect(() => {
    setLoaded(false);
  }, [tileSrc]);
  /* GS-PERF7: shimmer skeleton stays until the media's first frame is ready
     (image onLoad / video onLoadedData) so video tiles never show a black box. */
  const showSkeleton = done && !loaded;


  return (
    <article className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl transition-colors hover:border-cyan-200/30">
      <div
        ref={mediaHostRef}
        className="relative flex aspect-[3/4] items-center justify-center bg-black/50"
      >
        {done ? (
          <>
            {showSkeleton ? (
              <div className="pointer-events-none absolute inset-0 fuse-skeleton" aria-hidden="true" />
            ) : null}
            <button
              type="button"
              onClick={() => onExpand(generation)}
              aria-label="Expand result"
              className="block h-full w-full"
            >
              {isImage ? (
                near ? (
                  <img
                    src={tileSrc as string}


                    alt={generation.prompt ?? generation.promptPreview ?? "Generated result"}
                    loading={priority ? "eager" : "lazy"}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    {...({ fetchpriority: priority ? "high" : "low" } as any)}
                    decoding="async"
                    onLoad={handleMediaLoaded}
                    onError={() => setLoaded(true)}
                    className={cn(
                      "h-full w-full object-cover transition-opacity duration-150",
                      loaded ? "opacity-100" : "opacity-0",
                    )}
                  />
                ) : null
              ) : (
                /* GS-PERF7: poster frame without new infra. With a stored
                   posterUrl we set it directly; otherwise preload="metadata"
                   (only once near the viewport) plus a `#t=0.1` media fragment
                   makes the browser fetch just enough to paint the first frame
                   instead of a black rectangle. Offscreen cards keep
                   preload="none" and no src. */
                <video
                  ref={videoRef}
                  src={near ? `${generation.outputUrl as string}#t=0.1` : undefined}
                  poster={generation.posterUrl ?? undefined}
                  muted
                  loop
                  playsInline
                  preload={near ? "metadata" : "none"}
                  onLoadedData={handleMediaLoaded}
                  onLoadedMetadata={() => setLoaded(true)}
                  onError={() => setLoaded(true)}
                  onMouseEnter={() => {
                    void videoRef.current?.play()?.catch(() => {});
                  }}
                  onMouseLeave={() => {
                    const el = videoRef.current;
                    if (!el) return;
                    el.pause();
                    el.currentTime = 0;
                  }}
                  className={cn(
                    "h-full w-full bg-black/60 object-cover transition-opacity duration-200",
                    loaded ? "opacity-100" : "opacity-0",
                  )}
                />
              )}
            </button>

            <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end gap-1.5 p-2 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100">
              {isImage ? (
                <button
                  type="button"
                  aria-label="Use as reference"
                  title="Use as reference"
                  onClick={() => onUseAsReference(generation.outputUrl as string)}
                  className={ICON_ACTION_CLASS}
                >
                  <Wand2 size={13} />
                </button>
              ) : null}
              <FavoriteButton
                favorited={generation.favorited === true}
                onToggle={() => onToggleFavorite(generation)}
              />
              <button
                type="button"
                onClick={() =>
                  void downloadAsset(
                    generation.outputUrl as string,
                    generation.id,
                    generation.outputType,
                  )
                }
                aria-label="Download"
                title="Download"
                className={ICON_ACTION_CLASS}
              >
                <Download size={13} />
              </button>

              <button
                type="button"
                aria-label="Delete"
                title="Delete"
                onClick={() => onDelete(generation)}
                className={cn(ICON_ACTION_CLASS, "hover:border-red-400/60 hover:text-red-300")}
              >
                <Trash2 size={13} />
              </button>
            </div>
            {generation.favorited ? (
              <span className="pointer-events-none absolute left-2 top-2 rounded-lg border border-red-400/40 bg-black/60 p-1.5 text-red-400 backdrop-blur-md group-hover:opacity-0">
                <Heart size={12} className="fill-current" />
              </span>
            ) : null}
          </>
        ) : generation.status === "failed" ? (
          <>
            <div className="flex max-h-full flex-col items-center justify-center gap-2 px-6 py-4 text-center">
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-rose-300/30 bg-rose-400/10 text-[13px] font-semibold text-rose-200">
                !
              </span>
              <p className="text-xs font-medium text-rose-100/90">
                {readPublicFailure(generation.publicFailure).title}
              </p>
              <p className="text-[11px] leading-relaxed text-rose-100/60">
                {readPublicFailure(generation.publicFailure).message}
              </p>
            </div>
            <button
              type="button"
              aria-label="Delete"
              title="Delete"
              onClick={() => onDelete(generation)}
              className={cn(
                ICON_ACTION_CLASS,
                "absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100 hover:border-red-400/60 hover:text-red-300",
              )}
            >
              <Trash2 size={13} />
            </button>
          </>
        ) : (
          <div className="w-full space-y-3 px-6 text-center">
            <Loader2 size={20} className="mx-auto animate-spin text-cyan-200" />
            <p className="font-display text-[12px] font-semibold tracking-[0.08em] text-[hsl(var(--electric-cyan))]">
              {statusLabel(generation.status, progress)}
            </p>

            <Progress value={progress} className="h-1.5" />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <p className="line-clamp-1 flex-1 text-xs text-muted-foreground">{generation.prompt ?? "—"}</p>
        <span className="shrink-0 text-[11px] text-cyan-200/70">
          {costPreview(generation.estimatedCredits, generation.estimatedCostUsd)}
        </span>
      </div>
    </article>
  );

}

/**
 * GS-PERF4: memoized so a realtime/reconcile update to one generation only
 * re-renders its own card — unchanged rows keep the same object reference.
 */
const MemoizedGenerationCard = memo(GenerationCard);

/**
 * One creative reference card in the stack. Drag handle uses dnd-kit; the arrow
 * buttons remain as the keyboard/accessibility fallback.
 */
function ReferenceCard({
  reference,
  index,
  total,
  onLabelChange,
  onRoleChange,
  onMove,
  onRemove,
}: {
  reference: Reference;
  index: number;
  total: number;
  onLabelChange: (value: string) => void;
  onRoleChange: (value: string | undefined) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: reference.url });
  const [roleOpen, setRoleOpen] = useState(false);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-stretch gap-3 rounded-2xl border bg-black/35 p-3 transition-all duration-200",
        isDragging
          ? "z-20 scale-[1.02] border-[hsl(var(--electric-blue)/0.7)] shadow-[0_0_28px_-8px_hsl(var(--electric-blue)/0.9)]"
          : "border-white/10 hover:-translate-y-[1px] hover:border-[hsl(var(--electric-blue)/0.35)]",
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        aria-label={`Reorder reference ${index + 1}`}
        className="flex cursor-grab items-center rounded-lg px-1 text-foreground/45 transition-colors hover:text-[hsl(var(--electric-cyan))] active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={18} />
      </button>

      <div className="relative h-[86px] w-[68px] shrink-0 overflow-hidden rounded-xl border border-white/12">
        <img src={reference.url} alt={`Reference ${index + 1}`} className="h-full w-full object-cover" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-display text-[13px] font-semibold tracking-[0.06em] text-[hsl(var(--electric-cyan))]">
            REF {String(index + 1).padStart(2, "0")}
          </span>
          <Popover open={roleOpen} onOpenChange={setRoleOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "rounded-full border px-2.5 py-0.5 font-display text-[11px] font-semibold tracking-[0.06em] transition-colors",
                  reference.role
                    ? "border-[hsl(var(--electric-blue)/0.5)] bg-[hsl(var(--electric-blue)/0.12)] text-[hsl(var(--electric-cyan))]"
                    : "border-white/12 text-muted-foreground hover:text-foreground",
                )}
              >
                {reference.role ?? "ROLE"}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-44 border-white/12 bg-background/95 p-1.5 backdrop-blur-xl">
              <button
                type="button"
                onClick={() => {
                  onRoleChange(undefined);
                  setRoleOpen(false);
                }}
                className="w-full rounded-lg px-2 py-1.5 text-left text-[13px] text-muted-foreground hover:bg-white/[0.06]"
              >
                No role
              </button>
              {REFERENCE_ROLES.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => {
                    onRoleChange(role);
                    setRoleOpen(false);
                  }}
                  className={cn(
                    "w-full rounded-lg px-2 py-1.5 text-left font-display text-[12px] font-semibold tracking-[0.05em] transition-colors",
                    reference.role === role
                      ? "bg-[hsl(var(--electric-blue)/0.15)] text-[hsl(var(--electric-cyan))]"
                      : "text-foreground/85 hover:bg-white/[0.06]",
                  )}
                >
                  {role}
                </button>
              ))}
            </PopoverContent>
          </Popover>
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              aria-label="Move reference earlier"
              disabled={index === 0}
              onClick={() => onMove(-1)}
              className="rounded-md p-1 text-foreground/40 transition-colors hover:text-[hsl(var(--electric-cyan))] disabled:opacity-25"
            >
              <ArrowLeft size={13} />
            </button>
            <button
              type="button"
              aria-label="Move reference later"
              disabled={index === total - 1}
              onClick={() => onMove(1)}
              className="rounded-md p-1 text-foreground/40 transition-colors hover:text-[hsl(var(--electric-cyan))] disabled:opacity-25"
            >
              <ArrowRight size={13} />
            </button>
            <button
              type="button"
              aria-label="Remove reference"
              onClick={onRemove}
              className="rounded-md p-1 text-foreground/50 transition-colors hover:text-red-300"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <Input
          value={reference.label}
          onChange={(event) => onLabelChange(event.target.value)}
          placeholder="Shot name"
          className="h-9 border-white/12 bg-black/30 text-[14px]"
        />
      </div>
    </div>
  );
}

export default function GenerationStudio() {
  galleryPerfRender(); // GS-PERF9 dev-only render counter

  const [modelKey, setModelKey] = useState<StudioModelKey>("nano-banana-pro");
  const [modelOpen, setModelOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  /** Shot plan read from a loaded generation (never regenerated here). */
  const [shotPlan, setShotPlan] = useState<ShotPlanEntry[]>([]);
  const [directionExpanded, setDirectionExpanded] = useState(true);
  const [references, setReferences] = useState<Reference[]>([]);

  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<string>("auto");
  const [aspectOpen, setAspectOpen] = useState(false);
  const [quality, setQuality] = useState("2K");
  const [duration, setDuration] = useState(5);
  const [generateAudio, setGenerateAudio] = useState(true);
  /** VIDEO only — optional camera movement instruction appended to the prompt. */
  const [cameraMovementId, setCameraMovementId] = useState<string>(DEFAULT_CAMERA_MOVEMENT_ID);

  const [generations, setGenerations] = useState<Generation[]>([]);
  const [library, setLibrary] = useState<string[]>(() => readReferenceLibrary());
  const [selected, setSelected] = useState<string[]>([]);
  const [assetTypeFilter, setAssetTypeFilter] = useState<"all" | "image" | "video">("all");
  const [assetSort, setAssetSort] = useState<"newest" | "oldest">("newest");
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [confirmSingle, setConfirmSingle] = useState<Generation | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const composerRef = useRef<HTMLElement | null>(null);

  const [deleting, setDeleting] = useState(false);
  const lastSelectedRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const model = useMemo(
    () => STUDIO_MODELS.find((entry) => entry.key === modelKey) ?? STUDIO_MODELS[0],
    [modelKey],
  );
  const isVideo = model.kind === "video";

  /** Selected movement fragment (video only, empty for "None"). */
  const cameraMovement = isVideo ? getCameraMovementPreset(cameraMovementId) : undefined;
  const movementFragment = cameraMovement?.promptFragment?.trim() ?? "";


  /** Live dollar + credit estimate; updates with model, duration and quality. */
  const estimatedCostUsd = useMemo(() => {
    const multiplier = RESOLUTION_MULTIPLIER[quality] ?? 1;
    if (!isVideo) return IMAGE_FALLBACK_USD * multiplier;
    const perSecond = model.supportsAudio && generateAudio && model.usdPerSecondAudio
      ? model.usdPerSecondAudio
      : model.usdPerSecond ?? 0;
    return perSecond * duration * multiplier;
  }, [isVideo, model, generateAudio, quality, duration]);

  const estimatedCredits = useMemo(() => creditsFromUsd(estimatedCostUsd), [estimatedCostUsd]);

  useEffect(() => {
    if (model.durationRange) {
      setDuration((prev) =>
        Math.min(model.durationRange!.max, Math.max(model.durationRange!.min, prev))
      );
    }
    // Models with no resolution field keep an empty value — nothing is sent.
    setQuality((prev) => (model.resolutions.includes(prev) ? prev : (model.resolutions[0] ?? "")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelKey]);

  const rememberReferences = useCallback((urls: string[]) => {
    setLibrary((prev) => {
      const next = Array.from(new Set([...urls, ...prev])).slice(0, 60);
      try {
        localStorage.setItem(REFERENCE_STORE_KEY, JSON.stringify(next));
      } catch {
        // storage is a convenience only
      }
      return next;
    });
  }, []);

  /**
   * GS-PERF2: keyset cursor pagination. Page 1 (no cursor) MERGES into the
   * loaded list in place — the 5s poll refreshes statuses without collapsing
   * loaded pages. Load More appends the next page strictly after nextCursor.
   */
  const PAGE_SIZE = 24;
  type ListCursor = { createdAt: string; id: string };
  const nextCursorRef = useRef<ListCursor | null>(null);
  /** GS-PERF8: page-1 cursor, kept current by every loadQueue — used for the SWR cache. */
  const page1CursorRef = useRef<ListCursor | null>(null);
  /** GS-PERF9 dev-only: only the first page-1 fetch gets timed. */
  const initialApiTimedRef = useRef(false);
  const pagedRef = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const loadQueue = useCallback(async (silent = true) => {
    // GS-PERF9 dev-only: time the FIRST page-1 fetch + payload size.
    const timeInitial = !initialApiTimedRef.current;
    if (timeInitial) initialApiTimedRef.current = true;
    const t0 = timeInitial ? performance.now() : 0;
    try {
      const data = await callStudio({ action: "queue", limit: PAGE_SIZE });
      if (timeInitial) galleryPerfInitialApi(performance.now() - t0, data);
      const rows = (data?.generations ?? []) as Generation[];
      const cursor = (data?.nextCursor as ListCursor | null) ?? null;
      page1CursorRef.current = cursor;
      setGenerations((prev) => {
        if (!prev.length) return rows;
        // In-place refresh: page-1 rows update by id and lead the list
        // (newest first); already-paged older rows keep their positions.
        const fresh = new Set(rows.map((row) => row.id));
        return [...rows, ...prev.filter((entry) => !fresh.has(entry.id))];
      });
      // Only adopt page 1's cursor before the user has paged deeper —
      // afterwards the cursor belongs to the oldest loaded row and stays valid.
      if (!pagedRef.current) {
        nextCursorRef.current = cursor;
        setHasMore(Boolean(cursor));
      }
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Could not load generations");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    galleryPerfMount(); // GS-PERF9 dev-only: reset session + start resource observer
    void loadQueue(false);
  }, [loadQueue]);

  const loadMore = useCallback(async () => {
    const cursor = nextCursorRef.current;
    if (!cursor) return;
    pagedRef.current = true;
    setLoadingMore(true);
    try {
      const t0 = performance.now(); // GS-PERF9 dev-only
      const data = await callStudio({ action: "queue", limit: PAGE_SIZE, cursor });
      galleryPerfLoadMore(performance.now() - t0);
      const rows = (data?.generations ?? []) as Generation[];
      setGenerations((prev) => {
        const seen = new Set(prev.map((entry) => entry.id));
        return [...prev, ...rows.filter((row) => !seen.has(row.id))];
      });
      nextCursorRef.current = (data?.nextCursor as ListCursor | null) ?? null;
      setHasMore(Boolean(nextCursorRef.current));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load more");
    } finally {
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasInFlight = generations.some((entry) => entry.status === "queued" || entry.status === "running");

  /**
   * GS-PERF3: Realtime is the primary completion path — one changed row updates
   * one card. Replaces the old 5s full-gallery poll. Heavy fields stay out of
   * gallery state (the lightbox still fetches them via action:"detail").
   */
  const { user, hasAppAccess } = useAuth();
  /** Admin/dev — the only viewers of raw provider diagnostics. */
  const isPrivilegedUser = hasAppAccess;

  /**
   * GS-PERF8: stale-while-revalidate first-page cache.
   * Hydrate once from the cache (render stale rows instantly), then
   * loadQueue's background refresh merges fresh page-1 rows in place.
   */
  const hydratedCacheRef = useRef(false);
  useEffect(() => {
    const userId = user?.id;
    if (!userId || hydratedCacheRef.current) return;
    hydratedCacheRef.current = true;
    const cached = readStudioGalleryCache<Generation>(userId);
    if (!cached || !cached.rows.length) return;
    setGenerations((prev) => (prev.length ? prev : cached.rows));
    if (!pagedRef.current) {
      nextCursorRef.current = (cached.cursor as ListCursor | null) ?? null;
      setHasMore(Boolean(cached.cursor));
    }
  }, [user?.id]);

  /**
   * GS-PERF8: keep the cache fresh — the list is newest-first after the
   * GS-PERF2 in-place merge, so the first PAGE_SIZE rows ARE page 1.
   * Realtime/reconcile mutations flow through generations, so the cache
   * never goes stale-wrong. Only page 1 is cached (uses page1CursorRef,
   * never the deeper pagination cursor).
   */
  useEffect(() => {
    const userId = user?.id;
    if (!userId || !generations.length) return;
    writeStudioGalleryCache(userId, generations.slice(0, PAGE_SIZE), page1CursorRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generations, user?.id]);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`studio_generations:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "studio_generations",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const row = payload.new as Record<string, unknown> | null;
            if (!row?.id) return;
            const rowId = String(row.id);
            // Skip rows the optimistic submit already placed in state.
            setGenerations((prev) => {
              if (prev.some((entry) => entry.id === rowId)) return prev;
              const inserted: Generation = {
                id: rowId,
                status: (row.status as Generation["status"]) ?? "queued",
                outputUrl: (row.output_url as string | null) ?? null,
                previewUrl: (row.preview_url as string | null) ?? null,
                posterUrl: (row.poster_url as string | null) ?? null,

                outputType: (row.output_type as string | null) ?? null,
                providerModel: (row.provider_model as string | null) ?? null,
                estimatedCredits: (row.estimated_credits as number | null) ?? null,
                estimatedCostUsd: (row.estimated_cost_usd as number | null) ?? null,
                favorited: typeof row.favorited === "boolean" ? row.favorited : false,
                createdAt: (row.created_at as string | null) ?? null,
                completedAt: (row.completed_at as string | null) ?? null,
                promptPreview:
                  typeof row.prompt === "string"
                    ? row.prompt.slice(0, 160)
                    : null,
              } as Generation;
              return [inserted, ...prev];
            });
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "studio_generations",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const row = payload.new as Record<string, unknown> | null;
            if (!row?.id) return;
            const rowId = String(row.id);
            setGenerations((prev) => {
              if (!prev.some((entry) => entry.id === rowId)) return prev;
              return prev.map((entry) =>
                entry.id === rowId
                  ? {
                      ...entry,
                      status: (row.status as Generation["status"]) ?? entry.status,
                      outputUrl: (row.output_url as string | null) ?? entry.outputUrl,
                      previewUrl: (row.preview_url as string | null) ?? entry.previewUrl ?? null,
                      posterUrl: (row.poster_url as string | null) ?? entry.posterUrl ?? null,

                      outputType: (row.output_type as string | null) ?? entry.outputType,
                      providerModel: (row.provider_model as string | null) ?? entry.providerModel,
                      estimatedCredits:
                        (row.estimated_credits as number | null) ?? entry.estimatedCredits,
                      estimatedCostUsd:
                        (row.estimated_cost_usd as number | null) ?? entry.estimatedCostUsd,
                      favorited:
                        typeof row.favorited === "boolean" ? row.favorited : entry.favorited,
                      completedAt: (row.completed_at as string | null) ?? entry.completedAt,
                    }
                  : entry,
              );
            });
          },
        )
        .subscribe();
    } catch {
      // Degrade gracefully — the reconcile fallback below still resolves jobs.
      channel = null;
    }

    return () => {
      if (channel) {
        try {
          void supabase.removeChannel(channel);
        } catch {
          // ignore teardown errors
        }
      }
    };
  }, [user?.id]);

  /**
   * Missed-webhook safety net (GS-PERF1): rows in flight > 2 minutes are
   * reconciled explicitly, at most every 30s. Paused while the tab is hidden.
   */
  const lastReconcileRef = useRef(0);
  const [tabVisible, setTabVisible] = useState(() =>
    typeof document === "undefined" ? true : !document.hidden,
  );
  useEffect(() => {
    const onVisibility = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!hasInFlight || !tabVisible) return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      const now = Date.now();
      if (now - lastReconcileRef.current < 30_000) return;
      const staleIds = generations
        .filter(
          (entry) =>
            (entry.status === "queued" || entry.status === "running") &&
            entry.createdAt &&
            now - Date.parse(entry.createdAt) > 120_000,
        )
        .map((entry) => entry.id)
        .slice(0, 6);
      if (!staleIds.length) return;
      lastReconcileRef.current = now;
      void callStudio({ action: "reconcile", generationIds: staleIds })
        .then((data) => {
          const reconciled = (data?.generations ?? []) as Generation[];
          if (!reconciled.length) return;
          setGenerations((prev) =>
            prev.map((entry) => {
              const update = reconciled.find((row) => row.id === entry.id);
              return update ? { ...entry, ...update } : entry;
            }),
          );
        })
        .catch(() => null);
    }, 5000);
    return () => clearInterval(timer);
  }, [hasInFlight, tabVisible, generations]);


  const addReference = useCallback((url: string) => {
    setReferences((prev) => {
      if (prev.some((entry) => entry.url === url)) return prev;
      if (prev.length >= MAX_REFERENCES) {
        toast.message(`Up to ${MAX_REFERENCES} reference images`);
        return prev;
      }
      return [...prev, { url, label: "" }];
    });
  }, []);

  const lightbox = useMemo(
    () => generations.find((entry) => entry.id === lightboxId) ?? null,
    [generations, lightboxId],
  );

  /**
   * GS-PERF1: the lightbox needs the FULL row (prompt, payload, references,
   * error). List rows are light, so fetch `detail` on open and merge it in.
   */
  useEffect(() => {
    if (!lightboxId) return;
    const entry = generations.find((item) => item.id === lightboxId);
    if (!entry || entry.inputPayload) return;
    let cancelled = false;
    void callStudio({ action: "detail", generationId: lightboxId })
      .then((data) => {
        const full = data?.generation as Generation | undefined;
        if (cancelled || !full) return;
        setGenerations((prev) =>
          prev.map((item) => (item.id === lightboxId ? { ...item, ...full } : item)),
        );
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [lightboxId, generations]);

  const useAsReference = useCallback(
    (url: string) => {
      addReference(url);
      setLightboxId(null);
      toast.success("Added to references");
    },
    [addReference],
  );

  /** Optimistic heart toggle; reverts if the backend rejects it. */
  const toggleFavorite = useCallback(async (generation: Generation) => {
    const next = !(generation.favorited === true);
    setGenerations((prev) =>
      prev.map((entry) => (entry.id === generation.id ? { ...entry, favorited: next } : entry)),
    );
    try {
      await callStudio({ action: "set_favorite", generationId: generation.id, favorited: next });
    } catch (error) {
      setGenerations((prev) =>
        prev.map((entry) => (entry.id === generation.id ? { ...entry, favorited: !next } : entry)),
      );
      toast.error(error instanceof Error ? error.message : "Could not update the favorite");
    }
  }, []);

  /**
   * GS-PERF4: stable card handlers — identities never change across renders,
   * so MemoizedGenerationCard's shallow prop comparison holds.
   */
  const handleCardExpand = useCallback((entry: Generation) => setLightboxId(entry.id), []);
  const handleCardDelete = useCallback((entry: Generation) => setConfirmSingle(entry), []);
  const handleCardToggleFavorite = useCallback(
    (entry: Generation) => void toggleFavorite(entry),
    [toggleFavorite],
  );

  /** Animate: add the image as a reference and switch the composer to Kling 3.0. */
  const animateImage = useCallback(
    (url: string) => {
      addReference(url);
      setModelKey("kling-3.0-pro");
      setLightboxId(null);
      toast.success("Added to Kling 3.0 — ready to animate");
      requestAnimationFrame(() => {
        composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    [addReference],
  );

  /** Adds one of the SOURCE references shown in the lightbox; keeps the lightbox open. */
  const addSourceReference = useCallback(
    (url: string) => {
      setReferences((prev) => {
        if (prev.some((entry) => entry.url === url)) {
          toast.message("Already in your references");
          return prev;
        }
        if (prev.length >= MAX_REFERENCES) {
          toast.message(`Up to ${MAX_REFERENCES} reference images`);
          return prev;
        }
        toast.success("Added to references");
        return [...prev, { url, label: "" }];
      });
    },
    [],
  );


  const copyPrompt = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Prompt copied");
    } catch {
      toast.error("Could not copy the prompt");
    }
  }, []);

  /** Restore prompt + reference stack (REF order preserved) from a past generation. */
  const recreate = useCallback(async (generation: Generation) => {
    // List rows are light — pull the full payload first if it hasn't loaded yet.
    let full = generation;
    if (!full.inputPayload) {
      try {
        const data = await callStudio({ action: "detail", generationId: generation.id });
        if (data?.generation) full = { ...generation, ...(data.generation as Generation) };
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not load the recipe");
        return;
      }
    }
    const recipe = generationRecipe(full);
    setPrompt(recipe.prompt);
    setReferences(recipe.urls.slice(0, MAX_REFERENCES).map((url) => ({ url, label: "" })));
    if (recipe.aspect) setAspectRatio(recipe.aspect);
    const plan = readShotPlan(full.inputPayload ?? null);
    setShotPlan(plan);
    setDirectionExpanded(!(plan.length > 0 || recipe.prompt.length > 1200));
    setLightboxId(null);
    toast.success("Loaded into the composer");
  }, []);


  const deleteGeneration = useCallback(async (generation: Generation) => {
    try {
      await callStudio({ action: "delete", generationIds: [generation.id] });
      setGenerations((prev) => prev.filter((entry) => entry.id !== generation.id));
      setSelected((prev) => prev.filter((id) => id !== generation.id));
      setLightboxId((prev) => (prev === generation.id ? null : prev));
      setConfirmSingle(null);
      toast.success("Generation deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the generation");
    }
  }, []);

  /** Stale failed rows clutter the gallery; delete them via the existing delete action. */
  const failedGenerations = useMemo(
    () => generations.filter((entry) => entry.status === "failed"),
    [generations],
  );
  const visibleGenerations = useMemo(
    () =>
      generations.filter(
        (entry) => entry.status !== "failed" && (!favoritesOnly || entry.favorited === true),
      ),
    [generations, favoritesOnly],
  );
  const [clearingFailed, setClearingFailed] = useState(false);

  const clearFailed = useCallback(async () => {
    const ids = generations.filter((entry) => entry.status === "failed").map((entry) => entry.id);
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} failed generation${ids.length === 1 ? "" : "s"}?`)) return;
    setClearingFailed(true);
    try {
      await callStudio({ action: "delete", generationIds: ids });
      setSelected((prev) => prev.filter((id) => !ids.includes(id)));
      setLightboxId((prev) => (prev && ids.includes(prev) ? null : prev));
      await loadQueue(true);
      toast.success("Failed generations cleared");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not clear the failed generations");
    } finally {
      setClearingFailed(false);
    }
  }, [generations, loadQueue]);

  /**
   * Failed tiles are hidden from the gallery, so surface the reason once —
   * polished customer copy only; raw provider detail is privileged-only.
   */
  const [recentFailure, setRecentFailure] = useState<{
    id: string;
    failure: PublicGenerationFailure;
    providerDetail: string | null;
  } | null>(null);
  const seenStatusRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const seen = seenStatusRef.current;
    let latest: Generation | null = null;
    for (const entry of generations) {
      const previous = seen.get(entry.id);
      seen.set(entry.id, entry.status);
      if (entry.status === "failed" && previous && previous !== "failed") latest = entry;
    }
    if (!latest) return;
    const failedId = latest.id;
    const applyFailure = (generation: Generation | null | undefined) => {
      setRecentFailure({
        id: failedId,
        failure: readPublicFailure(generation?.publicFailure),
        providerDetail: generation?.providerFailure?.rawError ?? null,
      });
    };
    // List rows carry no failure payload (P13) — pull it via `detail` once.
    if (latest.publicFailure) {
      applyFailure(latest);
    } else {
      void callStudio({ action: "detail", generationId: failedId })
        .then((data) => applyFailure(data?.generation as Generation | undefined))
        .catch(() => applyFailure(null));
    }
    const failureCopy = readPublicFailure(latest.publicFailure);
    toast.error(failureCopy.title, { description: failureCopy.message });
  }, [generations]);

  useEffect(() => {
    if (recentFailure && !generations.some((entry) => entry.id === recentFailure.id)) {
      setRecentFailure(null);
    }
  }, [generations, recentFailure]);





  const addFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter((file) => file.type.startsWith("image/"));
      if (!images.length) return;
      setUploading(true);
      try {
        const uploaded: string[] = [];
        for (const file of images) {
          if (references.length + uploaded.length >= MAX_REFERENCES) {
            toast.message(`Up to ${MAX_REFERENCES} reference images`);
            break;
          }
          uploaded.push(await uploadRunInputFile(file));
        }
        if (uploaded.length) {
          setReferences((prev) =>
            [...prev, ...uploaded.map((url) => ({ url, label: "" }))].slice(0, MAX_REFERENCES)
          );
          rememberReferences(uploaded);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not upload the image");
      } finally {
        setUploading(false);
      }
    },
    [references.length, rememberReferences],
  );

  /**
   * Kling end-frame models take TWO ordered anchors: references[0] = first frame
   * (startImageUrl) and references[1] = last frame (endImageUrl). The generation
   * payload is unchanged — this only guarantees that ordering from the UI.
   */
  const supportsEndFrame = isVideo && Boolean(model.supportsEndFrame);
  const firstFrame = references[0] ?? null;
  const lastFrame = references[1] ?? null;

  const setFrameSlot = useCallback(
    async (slot: 0 | 1, file: File) => {
      if (!file.type.startsWith("image/")) return;
      setUploading(true);
      try {
        const url = await uploadRunInputFile(file);
        setReferences((prev) => {
          const next = [...prev];
          if (slot === 1 && next.length === 0) {
            next.push({ url, label: "Last frame" });
          } else {
            next[slot] = { url, label: slot === 0 ? "First frame" : "Last frame" };
          }
          return next.filter(Boolean).slice(0, MAX_REFERENCES);
        });
        rememberReferences([url]);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not upload the image");
      } finally {
        setUploading(false);
      }
    },
    [rememberReferences],
  );

  const clearFrameSlot = useCallback((slot: 0 | 1) => {
    setReferences((prev) => prev.filter((_, index) => index !== slot));
  }, []);


  /** Keyboard/accessibility fallback reorder — mutates the real references array. */
  const moveReference = (index: number, delta: number) => {
    setReferences((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      return arrayMove(prev, index, target);
    });
  };

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /**
   * DRAG REORDER — this is the single source of truth for reference order and
   * writes straight into the `references` state that `handleGenerate` sends.
   */
  const handleReferenceDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setReferences((prev) => {
      const from = prev.findIndex((entry) => entry.url === active.id);
      const to = prev.findIndex((entry) => entry.url === over.id);
      if (from === -1 || to === -1) return prev;
      return arrayMove(prev, from, to);
    });
  }, []);


  const handleGenerate = () => {
    const base = prompt.trim();
    if (!base) {
      toast.error("Describe the scene you imagine first");
      return;
    }
    // Video only: append the optional camera movement instruction. Nothing else changes.
    const text = movementFragment ? `${base}\n\n${movementFragment}` : base;

    const urls = references.map((entry) => entry.url);
    const payload: Record<string, unknown> = {
      action: "start",
      kind: model.kind,
      model: model.key,
      prompt: text,

      // Only send the secondary param the selected model truly accepts.
      ...(model.resolutions.length && quality
        ? { [model.paramField ?? "resolution"]: quality }
        : {}),
      ...(isVideo || model.supportsAspectRatio ? { aspectRatio } : {}),
      ...(urls.length ? { imageUrls: urls, startImageUrl: urls[0] } : {}),
      ...(isVideo
        ? {
          duration,
          generateAudio,
          ...(model.supportsEndFrame && urls[1] ? { endImageUrl: urls[1] } : {}),
        }
        : {}),
    };

    // Non-blocking: fire and let the queue poll pick it up.
    void (async () => {
      try {
        const data = await callStudio(payload);
        const generation = data?.generation as Generation | undefined;
        if (generation) {
          setGenerations((prev) => [generation, ...prev.filter((e) => e.id !== generation.id)]);
        }
      } catch (error) {
        const status = error instanceof StudioRequestError ? error.status : undefined;
        if (status === 402) {
          toast.error("Not enough credits", {
            description: "Top up your credits to run this generation.",
            action: {
              label: "Buy credits",
              onClick: () => window.location.assign("/membership"),
            },
          });
          return;
        }
        toast.error(error instanceof Error ? error.message : "Could not start the generation");
      }
    })();

    toast.success("Added to the queue");
  };

  const assets = useMemo(() => {
    const outputs = generations
      .filter((entry) => entry.status === "complete" && entry.outputUrl)
      .map((entry) => ({
        id: entry.id,
        url: entry.outputUrl as string,
        type: entry.outputType === "video" ? "video" : "image",
        // Optimized thumbnail / poster frame when one exists — signed like any
        // other private reference.
        previewUrl: entry.previewUrl ?? entry.posterUrl ?? null,
        generationId: entry.id,
        createdAt: entry.createdAt,
        favorited: entry.favorited === true,
      }));
    const uploads = library.map((url, index) => ({
      id: `upload:${url}`,
      url,
      type: "image" as const,
      previewUrl: null as string | null,
      generationId: null as string | null,
      // Uploads have no timestamp — the store is newest-first, so use its order.
      createdAt: null as string | null,
      favorited: false,
      order: index,
    }));
    return { outputs, uploads };
  }, [generations, library]);

  /** Client-side type filter + created-at sort shared by both library grids. */
  const arrangeAssets = useCallback(
    <T extends { type: string; createdAt: string | null; order?: number }>(items: T[]) => {
      const filtered =
        assetTypeFilter === "all" ? items : items.filter((item) => item.type === assetTypeFilter);
      const sorted = [...filtered].sort((a, b) => {
        const left = a.createdAt ? Date.parse(a.createdAt) : -(a.order ?? 0);
        const right = b.createdAt ? Date.parse(b.createdAt) : -(b.order ?? 0);
        return assetSort === "newest" ? right - left : left - right;
      });
      return sorted;
    },
    [assetSort, assetTypeFilter],
  );

  const visibleOutputs = useMemo(() => arrangeAssets(assets.outputs), [arrangeAssets, assets.outputs]);
  const visibleUploads = useMemo(() => arrangeAssets(assets.uploads), [arrangeAssets, assets.uploads]);

  const toggleSelect = (id: string, ids: string[], shiftKey: boolean) => {
    setSelected((prev) => {
      if (shiftKey && lastSelectedRef.current) {
        const from = ids.indexOf(lastSelectedRef.current);
        const to = ids.indexOf(id);
        if (from !== -1 && to !== -1) {
          const range = ids.slice(Math.min(from, to), Math.max(from, to) + 1);
          return Array.from(new Set([...prev, ...range]));
        }
      }
      lastSelectedRef.current = id;
      return prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id];
    });
  };

  const selectedAssets = [...assets.outputs, ...assets.uploads].filter((asset) =>
    selected.includes(asset.id)
  );

  const bulkDownload = () => {
    if (!selectedAssets.length) return;
    selectedAssets.forEach((asset, index) => {
      setTimeout(() => void downloadAsset(asset.url, asset.generationId ?? `ref-${index + 1}`, asset.type), index * 350);
    });
    toast.success(`Downloading ${selectedAssets.length} asset${selectedAssets.length > 1 ? "s" : ""}`);
  };

  /** Images only — videos can't be reference frames. Respects the 15-max. */
  const addSelectedToReferences = () => {
    const urls = selectedAssets.filter((asset) => asset.type === "image").map((asset) => asset.url);
    if (!urls.length) {
      toast.message("Select at least one image to use as a reference");
      return;
    }
    let added = 0;
    setReferences((prev) => {
      const next = [...prev];
      for (const url of urls) {
        if (next.length >= MAX_REFERENCES) break;
        if (next.some((entry) => entry.url === url)) continue;
        next.push({ url, label: "" });
        added += 1;
      }
      return next;
    });
    if (added) toast.success(`${added} added to references`);
    else toast.message(`Up to ${MAX_REFERENCES} reference images`);
  };


  const deleteSelected = async () => {
    const generationIds = selectedAssets
      .map((asset) => asset.generationId)
      .filter((id): id is string => Boolean(id));
    const uploadUrls = selectedAssets.filter((asset) => !asset.generationId).map((a) => a.url);

    setDeleting(true);
    try {
      if (generationIds.length) {
        await callStudio({ action: "delete", generationIds });
        setGenerations((prev) => prev.filter((entry) => !generationIds.includes(entry.id)));
      }
      if (uploadUrls.length) {
        setLibrary((prev) => {
          const next = prev.filter((url) => !uploadUrls.includes(url));
          try {
            localStorage.setItem(REFERENCE_STORE_KEY, JSON.stringify(next));
          } catch {
            // convenience only
          }
          return next;
        });
      }
      setSelected([]);
      setConfirmDelete(false);
      toast.success("Assets deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the assets");
    } finally {
      setDeleting(false);
    }
  };

  const assetGrid = (
    rawItems: { id: string; url: string; type: string; generationId: string | null; favorited?: boolean }[],
    empty: string,
  ) => {
    const items = favoritesOnly ? rawItems.filter((item) => item.favorited) : rawItems;
    const ids = items.map((item) => item.id);
    if (!items.length) return <p className="text-xs text-muted-foreground">{empty}</p>;
    return (
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {items.map((item) => {
          const isSelected = selected.includes(item.id);
          return (
            <div
              key={item.id}
              className={cn(
                "group relative overflow-hidden rounded-xl border bg-black/40",
                isSelected ? "border-cyan-300/70 ring-1 ring-cyan-300/40" : "border-white/10",
              )}
            >
              {item.generationId ? (
                <button
                  type="button"
                  aria-label="Open asset details"
                  onClick={() => setLightboxId(item.generationId)}
                  className="block w-full cursor-zoom-in"
                >
                  {item.type === "video" ? (
                    <video src={item.url} className="aspect-square w-full object-cover" muted preload="none" />
                  ) : (
                    <img src={item.url} alt="Asset" className="aspect-square w-full object-cover" />
                  )}
                </button>
              ) : item.type === "video" ? (
                <video src={item.url} className="aspect-square w-full object-cover" muted preload="none" />
              ) : (
                <img src={item.url} alt="Asset" className="aspect-square w-full object-cover" />
              )}
              <button
                type="button"
                aria-label={isSelected ? "Deselect asset" : "Select asset"}
                onClick={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  toggleSelect(item.id, ids, event.shiftKey);
                }}
                className="absolute left-1 top-1 z-10 rounded-md bg-black/70 p-1 text-cyan-100"
              >
                {isSelected ? <CheckSquare size={13} /> : <Square size={13} />}
              </button>

              {item.generationId ? (
                <FavoriteButton
                  favorited={item.favorited === true}
                  size={12}
                  className="absolute right-1 top-1 z-10 h-6 w-6"
                  onToggle={() => {
                    const target = generations.find((entry) => entry.id === item.generationId);
                    if (target) void toggleFavorite(target);
                  }}
                />
              ) : null}

              {item.type === "image" ? (
                <button
                  type="button"
                  onClick={() => addReference(item.url)}
                  className="absolute inset-x-1 bottom-1 rounded-md bg-black/75 py-1 text-[10px] uppercase tracking-wide text-cyan-100 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  Use as ref
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <SiteShell>
      <PageMeta
        title="Generation Studio | FUSE"
        description="Generate campaign images and video clips from a prompt and reference frames."
        path="/app/lab/studio"
      />

      <div className="mx-auto w-full max-w-[1600px] px-4 py-10 sm:px-6">
        <header className="mb-9 space-y-3">
          <p className="font-display text-[12px] font-semibold tracking-[0.16em] text-[hsl(var(--electric-cyan))]">
            FUSE LAB / GENERATION STUDIO
          </p>
          <h1 className="font-display text-[36px] font-bold leading-[1.05] tracking-[0.01em] text-foreground sm:text-[44px]">
            Generation Studio
          </h1>
          <p className="max-w-2xl text-[16px] leading-relaxed text-muted-foreground">
            {isVideo
              ? "Build cinematic motion from your references."
              : "Build the shot. Stack your references. Generate."}
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[420px_minmax(0,1fr)] xl:grid-cols-[460px_minmax(0,1fr)]">
          {/* LEFT: control panel */}
          <aside
            ref={composerRef}
            className="space-y-6 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:pr-1"
          >
            {/* Engine selector */}
            <FusePanel>
              <SectionTitle>ENGINE</SectionTitle>
              <Popover open={modelOpen} onOpenChange={setModelOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl border border-white/12 bg-black/35 px-4 py-3.5 text-left transition-all duration-200 hover:-translate-y-[1px] hover:border-[hsl(var(--electric-blue)/0.45)]"
                  >
                    <span className="rounded-lg border border-white/12 bg-black/50 p-2 text-[hsl(var(--electric-cyan))]">
                      {isVideo ? <Video size={17} /> : <ImageIcon size={17} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-[16px] font-semibold tracking-[0.02em] text-foreground">
                        {model.label}
                      </span>
                      <span className="block truncate text-[13px] text-muted-foreground">
                        {model.blurb}
                      </span>
                    </span>
                    <ChevronDown size={16} className="shrink-0 opacity-60" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-[--radix-popover-trigger-width] border-white/12 bg-background/95 p-2 backdrop-blur-xl"
                >
                  <p className="px-2 pb-2 font-display text-[13px] font-semibold tracking-[0.05em] text-foreground">
                    CHOOSE AN ENGINE
                  </p>
                  <div className="max-h-80 space-y-1 overflow-y-auto">
                    {[...STUDIO_MODELS]
                      .sort((a, b) => Number(!!b.recommended) - Number(!!a.recommended))
                      .map((entry) => (
                        <button
                          key={entry.key}
                          type="button"
                          onClick={() => {
                            setModelKey(entry.key);
                            setModelOpen(false);
                          }}
                          className={cn(
                            "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                            entry.key === modelKey
                              ? "border-[hsl(var(--electric-blue)/0.45)] bg-[hsl(var(--electric-blue)/0.1)]"
                              : "border-transparent hover:border-white/15 hover:bg-white/[0.04]",
                          )}
                        >
                          <span className="mt-0.5 rounded-lg border border-white/12 bg-black/40 p-1.5 text-[hsl(var(--electric-cyan))]">
                            {entry.kind === "image" ? <ImageIcon size={15} /> : <Video size={15} />}
                          </span>
                          <span className="min-w-0">
                            <span className="block font-display text-[15px] font-semibold tracking-[0.02em] text-foreground">
                              {entry.label}
                            </span>
                            <span className="block text-[13px] text-muted-foreground">{entry.blurb}</span>
                          </span>
                        </button>
                      ))}
                  </div>
                </PopoverContent>
              </Popover>
            </FusePanel>

            {/* Frame anchors — models that support a tail/end image (Kling 3.0) */}
            {supportsEndFrame ? (
              <FusePanel>
                <SectionTitle hint={lastFrame ? "start + end" : "start only"}>
                  FRAME ANCHORS
                </SectionTitle>
                <div className="grid grid-cols-2 gap-3">
                  {([0, 1] as const).map((slot) => {
                    const entry = slot === 0 ? firstFrame : lastFrame;
                    const disabled = slot === 1 && !firstFrame;
                    return (
                      <div key={slot} className="space-y-2">
                        <p className="font-display text-[12px] font-semibold tracking-[0.08em] text-foreground/80">
                          {slot === 0 ? "FIRST FRAME" : "LAST FRAME"}
                          <span className="ml-1.5 text-[11px] font-normal tracking-normal text-muted-foreground">
                            {slot === 0 ? "required" : "optional"}
                          </span>
                        </p>
                        <label
                          className={cn(
                            "relative flex aspect-square w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/20 bg-white/[0.02] transition-colors hover:border-[hsl(var(--electric-blue)/0.5)]",
                            disabled && "pointer-events-none opacity-50",
                          )}
                        >
                          {entry ? (
                            <img
                              src={entry.url}
                              alt={slot === 0 ? "First frame reference" : "Last frame reference"}
                              className="h-full w-full object-cover"
                            />
                          ) : uploading ? (
                            <Loader2 size={16} className="animate-spin text-muted-foreground" />
                          ) : (
                            <Plus size={16} className="text-muted-foreground" />
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={disabled}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              event.target.value = "";
                              if (file) void setFrameSlot(slot, file);
                            }}
                          />
                        </label>
                        {entry ? (
                          <button
                            type="button"
                            onClick={() => clearFrameSlot(slot)}
                            className="text-[12px] text-muted-foreground transition-colors hover:text-foreground"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <FieldHelper>
                  Last frame is optional — leave it empty for a single-image animation.
                </FieldHelper>
              </FusePanel>
            ) : null}

            {/* Reference stack */}
            {supportsEndFrame ? null : (
            <FusePanel

              onDragOver={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);
                const files = Array.from(event.dataTransfer.files ?? []);
                if (files.length) {
                  void addFiles(files);
                  return;
                }
                const url =
                  event.dataTransfer.getData("text/uri-list") ||
                  event.dataTransfer.getData("text/plain");
                if (url) addReference(url);
              }}
              className={cn(
                dragActive && "border-[hsl(var(--electric-blue)/0.6)] bg-[hsl(var(--electric-blue)/0.06)]",
              )}
            >
              <SectionTitle hint={`${references.length} / ${MAX_REFERENCES} references`}>
                REFERENCE STACK
              </SectionTitle>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  void addFiles(files);
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/[0.02] py-4 font-display text-[14px] font-semibold tracking-[0.05em] text-foreground/85 transition-all duration-200 hover:border-[hsl(var(--electric-blue)/0.5)] hover:text-[hsl(var(--electric-cyan))]"
              >
                {uploading ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                ADD REFERENCE
              </button>

              {references.length ? (
                <>
                  <div className="mt-4">
                    <DndContext
                      sensors={dndSensors}
                      collisionDetection={closestCenter}
                      modifiers={[restrictToVerticalAxis]}
                      onDragEnd={handleReferenceDragEnd}
                    >
                      <SortableContext
                        items={references.map((entry) => entry.url)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2.5">
                          {references.map((reference, index) => (
                            <ReferenceCard
                              key={reference.url}
                              reference={reference}
                              index={index}
                              total={references.length}
                              onLabelChange={(value) =>
                                setReferences((prev) =>
                                  prev.map((entry, i) => (i === index ? { ...entry, label: value } : entry)),
                                )
                              }
                              onRoleChange={(value) =>
                                setReferences((prev) =>
                                  prev.map((entry, i) => (i === index ? { ...entry, role: value } : entry)),
                                )
                              }
                              onMove={(delta) => moveReference(index, delta)}
                              onRemove={() =>
                                setReferences((prev) => prev.filter((_, i) => i !== index))
                              }
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>
                  <FieldHelper>
                    {isVideo
                      ? "Reference order defines the visual progression."
                      : "Drag references into the order the model reads them."}
                  </FieldHelper>
                </>
              ) : (
                <FieldHelper>
                  Drop images here or add a reference to start your stack.
                </FieldHelper>
              )}
            </FusePanel>
            )}


            {/* Creative direction */}
            <FusePanel>
              <SectionTitle>{isVideo ? "VIDEO DIRECTION" : "CREATIVE DIRECTION"}</SectionTitle>
              {!directionExpanded ? (
                <div className="rounded-xl border border-[hsl(var(--electric-blue)/0.3)] bg-[hsl(var(--electric-blue)/0.06)] p-4">
                  <p className="font-display text-[13px] font-semibold tracking-[0.07em] text-[hsl(var(--electric-cyan))]">
                    AI DIRECTED SEQUENCE
                  </p>
                  {shotPlan.length ? (
                    <ul className="mt-3 space-y-1.5">
                      {shotPlan.map((entry) => (
                        <li key={entry.index} className="flex items-baseline gap-3 text-[14px]">
                          <span className="font-display text-[13px] font-semibold text-[hsl(var(--electric-cyan))]">
                            {String(entry.index).padStart(2, "0")}
                          </span>
                          <span className="font-display text-[13px] font-semibold tracking-[0.04em] text-foreground">
                            {entry.shot.toUpperCase()}
                          </span>
                          {entry.start != null && entry.end != null ? (
                            <span className="ml-auto text-[12px] text-muted-foreground">
                              {entry.start}–{entry.end}s
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                      A full direction has been prepared for this sequence.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => setDirectionExpanded(true)}
                    className="mt-4 font-display text-[13px] font-semibold tracking-[0.05em] text-[hsl(var(--electric-cyan))] hover:underline"
                  >
                    View full direction
                  </button>
                </div>
              ) : (
                <>
                  <Textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="Describe the shot, motion, lighting, atmosphere, transitions."
                    rows={8}
                    className="min-h-[180px] resize-y border-white/12 bg-black/35 text-[15px] leading-relaxed focus-visible:ring-[hsl(var(--electric-blue)/0.5)]"
                  />
                  <FieldHelper>
                    Describe the shot, motion, lighting, atmosphere, transitions.
                  </FieldHelper>
                  {shotPlan.length ? (
                    <button
                      type="button"
                      onClick={() => setDirectionExpanded(false)}
                      className="mt-2 font-display text-[13px] font-semibold tracking-[0.05em] text-[hsl(var(--electric-cyan))] hover:underline"
                    >
                      Hide full direction
                    </button>
                  ) : null}
                </>
              )}
            </FusePanel>

            {/* Format + quality */}
            <FusePanel className="space-y-6">
              {isVideo || model.supportsAspectRatio ? (
              <div>
                <SectionTitle>FORMAT</SectionTitle>
                <SegmentedControl
                  ariaLabel="Format"
                  value={aspectRatio}
                  onChange={setAspectRatio}
                  options={[
                    ...PRIMARY_ASPECTS.map((value) => ({
                      value,
                      label: value === "auto" ? "AUTO" : value,
                      glyph: <AspectGlyph ratio={value} />,
                    })),
                    ...(PRIMARY_ASPECTS.includes(aspectRatio)
                      ? []
                      : [{ value: aspectRatio, label: aspectRatio, glyph: <AspectGlyph ratio={aspectRatio} /> }]),
                  ]}
                />
                <Popover open={aspectOpen} onOpenChange={setAspectOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="mt-2.5 font-display text-[12px] font-semibold tracking-[0.08em] text-[hsl(var(--electric-cyan))] hover:underline"
                    >
                      MORE FORMATS
                    </button>
                  </PopoverTrigger>

                  <PopoverContent
                    align="start"
                    className="max-h-80 w-64 overflow-y-auto border-white/12 bg-background/95 p-2 backdrop-blur-xl"
                  >
                    {ASPECT_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setAspectRatio(option.value);
                          setAspectOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-[13px] transition-colors",
                          option.value === aspectRatio
                            ? "bg-[hsl(var(--electric-blue)/0.15)] text-[hsl(var(--electric-cyan))]"
                            : "text-foreground/85 hover:bg-white/[0.06]",
                        )}
                      >
                        <AspectGlyph ratio={option.value} />
                        <span className="font-display font-semibold">
                          {option.value === "auto" ? "AUTO" : option.value}
                        </span>
                        <span className="ml-auto truncate text-[12px] text-muted-foreground">
                          {option.note}
                        </span>
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
                <p className="mt-2.5 font-display text-[12px] font-semibold tracking-[0.08em] text-muted-foreground">
                  {formatDescriptor(aspectRatio)}
                </p>
              </div>
              ) : null}

              <div>
                <SectionTitle>{model.paramLabel ?? "QUALITY"}</SectionTitle>
                {model.resolutions.length ? (
                  <SegmentedControl
                    ariaLabel={model.paramLabel ?? "Quality"}
                    value={quality}
                    onChange={setQuality}
                    options={model.resolutions.map((option) => ({
                      value: option,
                      label: option.toUpperCase(),
                    }))}
                  />
                ) : (
                  <p className="text-[12px] leading-relaxed text-muted-foreground">
                    Provider-fixed — this model has no resolution setting.
                  </p>
                )}
              </div>

              {isVideo && model.supportsAudio ? (
                <div>
                  <SectionTitle>SOUND</SectionTitle>
                  <SegmentedControl
                    ariaLabel="Sound"
                    value={generateAudio ? "on" : "off"}
                    onChange={(value) => setGenerateAudio(value === "on")}
                    options={[
                      { value: "on", label: "ON", glyph: <Volume2 size={14} /> },
                      { value: "off", label: "OFF", glyph: <VolumeX size={14} /> },
                    ]}
                  />
                </div>
              ) : null}

              {isVideo ? (
                <div>
                  <SectionTitle hint={`${duration}s`}>MOTION</SectionTitle>
                  <Slider
                    value={[duration]}
                    min={model.durationRange?.min ?? 3}
                    max={model.durationRange?.max ?? 15}
                    step={1}
                    onValueChange={([value]) => setDuration(value)}
                  />
                  <FieldHelper>Clip length in seconds.</FieldHelper>
                </div>
              ) : null}

              {/* VIDEO only — optional camera movement instruction.
                  Placeholder chips for now: per-preset preview clips are a
                  separate (paid) generation batch to be added later. */}
              {isVideo ? (
                <div>
                  <SectionTitle hint={cameraMovement && movementFragment ? cameraMovement.name.toUpperCase() : "OPTIONAL"}>
                    CAMERA MOVEMENT
                  </SectionTitle>
                  <div className="flex flex-wrap gap-2">
                    {CAMERA_MOVEMENT_PRESETS.map((preset) => {
                      const active = preset.id === cameraMovementId;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          title={preset.description}
                          aria-pressed={active}
                          onClick={() => setCameraMovementId(preset.id)}
                          className={cn(
                            "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-display text-[12px] font-semibold tracking-[0.04em] transition-colors",
                            active
                              ? "border-[hsl(var(--electric-blue)/0.55)] bg-[hsl(var(--electric-blue)/0.15)] text-[hsl(var(--electric-cyan))]"
                              : "border-white/12 bg-black/30 text-foreground/80 hover:bg-white/[0.06]",
                          )}
                        >
                          {/* previewUrl hook: real clips drop in here later without a redesign. */}
                          {preset.previewUrl ? (
                            <video
                              src={preset.previewUrl}
                              muted
                              loop
                              playsInline
                              preload="none"
                              className="h-6 w-9 rounded object-cover"
                            />
                          ) : (
                            <span className="grid h-6 w-9 place-items-center rounded bg-white/[0.06]">
                              <Film size={12} className="opacity-70" />
                            </span>
                          )}
                          {preset.name.toUpperCase()}
                        </button>
                      );
                    })}
                  </div>
                  {movementFragment ? (
                    <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3">
                      <p className="font-display text-[11px] font-semibold tracking-[0.08em] text-muted-foreground">
                        APPENDED TO YOUR PROMPT
                      </p>
                      <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/85">{movementFragment}</p>
                      <button
                        type="button"
                        onClick={() => setCameraMovementId(DEFAULT_CAMERA_MOVEMENT_ID)}
                        className="mt-2 font-display text-[12px] font-semibold tracking-[0.06em] text-[hsl(var(--electric-cyan))] hover:underline"
                      >
                        REMOVE MOVEMENT
                      </button>
                    </div>
                  ) : (
                    <FieldHelper>Optional — adds one camera instruction to your prompt.</FieldHelper>
                  )}
                </div>
              ) : null}

            </FusePanel>

            {/* Generate */}
            <div className="space-y-3">
              <Button
                onClick={handleGenerate}
                disabled={!prompt.trim()}
                className="h-auto w-full rounded-xl bg-[hsl(var(--electric-blue))] py-5 font-display text-[16px] font-bold tracking-[0.06em] text-[hsl(var(--primary-foreground))] shadow-[0_0_36px_-12px_hsl(var(--electric-blue))] transition-all duration-200 hover:-translate-y-[1px] hover:bg-[hsl(var(--electric-cyan))] disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none"
              >
                <Sparkles size={18} className="mr-2" />
                {isVideo ? "GENERATE VIDEO" : "GENERATE"}
              </Button>
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-[hsl(var(--electric-cyan))]">
                  {costPreview(estimatedCredits, estimatedCostUsd)}
                </span>
                <span className="text-muted-foreground">
                  {model.label}
                  {isVideo ? ` · ${duration} sec` : ""}
                </span>
              </div>
              <details className="rounded-xl border border-white/10 bg-black/25 px-4 py-2.5">
                <summary className="cursor-pointer font-display text-[12px] font-semibold tracking-[0.08em] text-muted-foreground">
                  ADVANCED · DEBUG
                </summary>
                <div className="mt-3 space-y-1 text-[12px] leading-relaxed text-muted-foreground">
                  <p>Direction is sent verbatim to the provider.</p>
                  <p>provider model: {model.key}</p>
                  <p>kind: {model.kind}</p>
                  <p>
                    {(model.paramField ?? "resolution")}:{" "}
                    {model.resolutions.length ? quality : "provider-fixed"}
                  </p>
                  {isVideo || model.supportsAspectRatio ? <p>aspect_ratio: {aspectRatio}</p> : null}
                  {isVideo ? <p>duration: {duration}s · audio: {String(generateAudio)}</p> : null}
                  <p>reference order: {references.map((_, index) => index + 1).join(" → ") || "—"}</p>
                </div>
              </details>
            </div>

          </aside>

          {/* RIGHT: output canvas */}
          <div className="space-y-4">
            <Tabs defaultValue="gallery">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <TabsList>
                  <TabsTrigger value="gallery" className="font-display text-[13px] font-semibold tracking-[0.06em]">
                    GALLERY
                  </TabsTrigger>
                  <TabsTrigger value="library" className="font-display text-[13px] font-semibold tracking-[0.06em]">
                    <Images size={14} className="mr-1.5" /> ASSET LIBRARY
                  </TabsTrigger>
                </TabsList>
                <button
                  type="button"
                  onClick={() => setFavoritesOnly((prev) => !prev)}
                  aria-pressed={favoritesOnly}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 font-display text-[12px] font-semibold uppercase tracking-[0.08em] transition-all duration-200",
                    favoritesOnly
                      ? "border-red-400/50 bg-red-500/15 text-red-200"
                      : "border-white/12 bg-black/30 text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Heart size={13} className={favoritesOnly ? "fill-current" : undefined} /> FAVORITES
                </button>
                {selected.length ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-[hsl(var(--electric-cyan))]">{selected.length} selected</span>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={bulkDownload}
                      className="border-white/15 bg-white/[0.04]"
                    >
                      <Download size={14} className="mr-1.5" /> Download
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmDelete(true)}
                      className="border-red-400/40 bg-red-500/10 text-red-200 hover:bg-red-500/20 hover:text-red-100"
                    >
                      <Trash2 size={14} className="mr-1.5" /> Delete
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                      Clear
                    </Button>
                  </div>
                ) : failedGenerations.length ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={clearingFailed}
                    onClick={() => void clearFailed()}
                    className="border-white/15 bg-white/[0.04] text-[11px]"
                  >
                    <Trash2 size={14} className="mr-1.5" />
                    {clearingFailed ? "Clearing…" : `Clear failed (${failedGenerations.length})`}
                  </Button>
                ) : null}
              </div>

              <TabsContent value="gallery" className="mt-4">
                {recentFailure ? (
                  <div className="mb-4 rounded-xl border border-rose-300/25 bg-rose-400/[0.07] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-rose-300/30 bg-rose-400/10 text-[11px] font-semibold text-rose-200">
                          !
                        </span>
                        <div>
                          <p className="text-xs font-medium text-rose-100/90">
                            {recentFailure.failure.title}
                          </p>
                          <p className="mt-0.5 text-[11px] text-rose-100/60">
                            {recentFailure.failure.message}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setRecentFailure(null)}
                        className="shrink-0 text-[11px] text-rose-100/60 hover:text-rose-50"
                      >
                        Dismiss
                      </button>
                    </div>
                    {isPrivilegedUser && recentFailure.providerDetail ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[11px] text-rose-100/60 hover:text-rose-50">
                          View provider error (admin)
                        </summary>
                        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/40 p-3 text-[10px] leading-relaxed text-rose-100/80">
                          {recentFailure.providerDetail}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                ) : null}
                {visibleGenerations.length ? (
                  <>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                      {visibleGenerations.map((generation, index) => (
                        <MemoizedGenerationCard
                          key={generation.id}
                          generation={generation}
                          priority={index < 8}
                          onUseAsReference={useAsReference}
                          onExpand={handleCardExpand}
                          onDelete={handleCardDelete}
                          onToggleFavorite={handleCardToggleFavorite}
                        />
                      ))}
                    </div>
                    {hasMore ? (
                      <div className="mt-6 flex justify-center">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void loadMore()}
                          disabled={loadingMore}
                          className="border-white/15 bg-white/[0.03]"
                        >
                          {loadingMore ? "Loading…" : "Load more"}
                        </Button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.02] p-14 text-center">
                    <Sparkles className="mx-auto mb-3 text-cyan-200/70" size={22} />
                    <p className="text-sm text-muted-foreground">
                      Your generations will appear here. Start with a prompt on the left.
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="library" className="mt-4 space-y-6">
                {/* Type filter + created-at sort, applied to both grids below. */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex gap-1 rounded-xl border border-white/12 bg-black/30 p-1">
                    {(["all", "image", "video"] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setAssetTypeFilter(option)}
                        className={cn(
                          "rounded-lg px-3 py-1.5 font-display text-[12px] font-semibold uppercase tracking-[0.07em] transition-colors",
                          assetTypeFilter === option
                            ? "bg-cyan-300/20 text-cyan-100"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1 rounded-xl border border-white/12 bg-black/30 p-1">
                    {([
                      { value: "newest", label: "Newest first" },
                      { value: "oldest", label: "Oldest first" },
                    ] as const).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setAssetSort(option.value)}
                        className={cn(
                          "rounded-lg px-3 py-1.5 font-display text-[12px] font-semibold uppercase tracking-[0.07em] transition-colors",
                          assetSort === option.value
                            ? "bg-cyan-300/20 text-cyan-100"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {selected.length ? (
                    <div className="ml-auto flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={addSelectedToReferences}
                        className="border-white/15 bg-white/[0.04]"
                      >
                        <Wand2 size={14} className="mr-1.5" /> Add selected to references
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                        Clear selection
                      </Button>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <SectionLabel hint="Click a tile's checkbox to select — shift-click for a range">
                    Generated outputs
                  </SectionLabel>
                  {assetGrid(visibleOutputs, "No generated assets yet.")}
                </div>
                {assetTypeFilter !== "video" ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <SectionLabel>Uploaded references</SectionLabel>
                    {assetGrid(visibleUploads, "Uploaded references appear here.")}
                  </div>
                ) : null}
              </TabsContent>

            </Tabs>
          </div>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.length} asset(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the selected generations from your history permanently. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void deleteSelected();
              }}
              className="bg-red-500/90 text-white hover:bg-red-500"
            >
              {deleting ? <Loader2 size={15} className="mr-2 animate-spin" /> : null} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmSingle} onOpenChange={(open) => !open && setConfirmSingle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this generation?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be removed from your gallery permanently. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (confirmSingle) void deleteGeneration(confirmSingle);
              }}
              className="bg-red-500/90 text-white hover:bg-red-500"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lightbox: big result on the left, recipe + actions on the right */}
      <Dialog open={!!lightbox} onOpenChange={(open) => !open && setLightboxId(null)}>
        <DialogContent className="max-w-[1200px] gap-0 overflow-hidden border-white/12 bg-background/95 p-0 backdrop-blur-xl">
          {lightbox ? (
            (() => {
              const recipe = generationRecipe(lightbox);
              const isImage = lightbox.outputType !== "video";
              return (
                <div className="grid max-h-[85vh] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="flex max-h-[50vh] items-center justify-center bg-black/60 p-3 lg:max-h-[85vh]">
                    {lightbox.outputUrl ? (
                      isImage ? (
                        <img
                          src={lightbox.outputUrl}
                          alt={recipe.prompt || "Generated result"}
                          className="max-h-full w-auto max-w-full rounded-xl object-contain"
                        />
                      ) : (
                        <video
                          src={lightbox.outputUrl}
                          controls
                          loop
                          autoPlay
                          className="max-h-full w-auto max-w-full rounded-xl"
                        />
                      )
                    ) : (
                      <p className="text-xs text-muted-foreground">No output</p>
                    )}
                  </div>

                  <aside className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto border-t border-white/10 p-5 lg:border-l lg:border-t-0">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-display text-[14px] font-semibold uppercase tracking-[0.07em] text-[hsl(var(--electric-cyan))]">
                          RESULT
                        </p>
                        <FavoriteButton
                          favorited={lightbox.favorited === true}
                          size={15}
                          className="h-8 w-8"
                          onToggle={() => void toggleFavorite(lightbox)}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {lightbox.providerModel ?? "—"}
                      </p>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {recipe.aspect ? (
                          <span className="rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-0.5 text-[12px] text-foreground/85">
                            {recipe.aspect}
                          </span>
                        ) : null}
                        {recipe.resolution ? (
                          <span className="rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-0.5 text-[12px] text-foreground/85">
                            {recipe.resolution}
                          </span>
                        ) : null}
                        {lightbox.estimatedCredits ? (
                          <span className="rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-0.5 text-[12px] text-[hsl(var(--electric-cyan))]">
                            {costPreview(lightbox.estimatedCredits, lightbox.estimatedCostUsd)}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {isImage && lightbox.outputUrl ? (
                      <Button
                        onClick={() => animateImage(lightbox.outputUrl as string)}
                        className="w-full rounded-xl bg-blue-600 text-white hover:bg-blue-500"
                      >
                        <Film size={15} className="mr-2" /> <span className="font-display text-[14px] font-semibold tracking-[0.06em]">ANIMATE</span>
                      </Button>
                    ) : null}

                    {isImage && lightbox.outputUrl ? (
                      <Button
                        onClick={() => useAsReference(lightbox.outputUrl as string)}
                        className="w-full rounded-xl bg-[hsl(var(--primary))] text-primary-foreground hover:bg-[hsl(var(--primary))]/90"
                      >
                        <Wand2 size={15} className="mr-2" /> <span className="font-display text-[14px] font-semibold tracking-[0.06em]">USE AS REFERENCE</span>
                      </Button>
                    ) : null}

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display text-[13px] font-semibold uppercase tracking-[0.07em] text-[hsl(var(--electric-cyan))]">
                          DIRECTION
                        </span>
                        <button
                          type="button"
                          onClick={() => void copyPrompt(recipe.prompt)}
                          disabled={!recipe.prompt}
                          className="flex items-center gap-1 rounded-lg border border-white/15 px-2 py-1 text-[11px] text-foreground/85 transition-colors hover:border-cyan-200/50 hover:text-cyan-100 disabled:opacity-40"
                        >
                          <Copy size={12} /> Copy
                        </button>
                      </div>
                      <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-3 text-[13px] leading-relaxed text-foreground/90">
                        {recipe.prompt || "No prompt stored for this generation."}
                      </p>
                    </div>

                    {recipe.urls.length ? (
                      <div className="space-y-2">
                        <span className="font-display text-[13px] font-semibold uppercase tracking-[0.07em] text-[hsl(var(--electric-cyan))]">
                          REFERENCES USED
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {recipe.urls.map((url, index) => (
                            <button
                              type="button"
                              key={`${url}-${index}`}
                              onClick={() => addSourceReference(url)}
                              title="Add this reference to the stack"
                              className="group/ref relative h-14 w-14 overflow-hidden rounded-lg border border-white/12 transition-colors hover:border-cyan-200/60"
                            >
                              <img src={url} alt={`Reference ${index + 1}`} className="h-full w-full object-cover" />
                              <span className="absolute inset-0 hidden items-center justify-center bg-black/70 text-[10px] font-semibold text-cyan-100 group-hover/ref:flex">
                                + Add
                              </span>
                              <span className="absolute inset-x-0 bottom-0 bg-black/75 text-center font-display text-[11px] font-semibold uppercase text-cyan-100 group-hover/ref:hidden">
                                Ref {index + 1}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                    ) : null}

                    <div className="mt-auto space-y-2 border-t border-white/10 pt-4">
                      <Button
                        variant="outline"
                        onClick={() => void recreate(lightbox)}
                        className="w-full border-white/15 bg-white/[0.04]"
                      >
                        <RefreshCw size={15} className="mr-2" /> Recreate
                      </Button>
                      {lightbox.outputUrl ? (
                        <Button
                          variant="outline"
                          onClick={() =>
                            void downloadAsset(
                              lightbox.outputUrl as string,
                              lightbox.id,
                              lightbox.outputType,
                            )
                          }
                          className="w-full border-white/15 bg-white/[0.04]"
                        >
                          <Download size={15} className="mr-2" /> Download
                        </Button>

                      ) : null}
                      <Button
                        variant="outline"
                        onClick={() => setConfirmSingle(lightbox)}
                        className="w-full border-red-400/40 bg-red-500/10 text-red-200 hover:bg-red-500/20 hover:text-red-100"
                      >
                        <Trash2 size={15} className="mr-2" /> Delete
                      </Button>
                    </div>
                  </aside>
                </div>
              );
            })()
          ) : null}
        </DialogContent>
      </Dialog>
    </SiteShell>

  );
}
