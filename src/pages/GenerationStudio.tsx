import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckSquare,
  ChevronDown,
  Copy,
  Download,
  ImageIcon,
  Images,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Square,
  Trash2,
  Video,
  Wand2,
  X,
} from "lucide-react";

import { toast } from "sonner";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
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
import { uploadRunInputFile } from "@/services/runInputUpload";
import { cn } from "@/lib/utils";

const USD_PER_CREDIT = 0.098;
const IMAGE_FALLBACK_USD = 0.15;
const MAX_REFERENCES = 15;
const REFERENCE_STORE_KEY = "fuse-studio-reference-library";

type StudioModelKey =
  | "nano-banana-pro"
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
  supportsAudio?: boolean;
  supportsEndFrame?: boolean;
};

const DEFAULT_RESOLUTIONS = ["2K", "4K"];
const SEEDANCE_RESOLUTIONS = ["480p", "720p", "1080p", "4K"];

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

const STUDIO_MODELS: StudioModel[] = [
  {
    key: "nano-banana-pro",
    label: "Nano Banana Pro",
    kind: "image",
    blurb: "Google's flagship image model — reference-driven edits",
    recommended: true,
    resolutions: DEFAULT_RESOLUTIONS,
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
    resolutions: DEFAULT_RESOLUTIONS,
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
    resolutions: DEFAULT_RESOLUTIONS,
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
    resolutions: SEEDANCE_RESOLUTIONS,
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

type Generation = {
  id: string;
  status: "queued" | "running" | "complete" | "failed";
  kind: string | null;
  prompt: string | null;
  outputUrl: string | null;
  outputType: string | null;
  error: string | null;
  estimatedCredits: number | null;
  estimatedCostUsd: number | null;
  providerModel: string | null;
  inputPayload: Record<string, unknown> | null;
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


type Reference = { url: string; label: string };

function creditsFromUsd(usd: number) {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return Math.max(1, Math.ceil(usd / USD_PER_CREDIT));
}

async function callStudio(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("generate-studio", { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    let message = error.message;
    if (context) {
      const parsed = await context.json().catch(() => null);
      if (parsed?.error) message = String(parsed.error);
    }
    throw new Error(message || "Studio request failed");
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
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200/70">
        {children}
      </span>
      {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

const ICON_ACTION_CLASS =
  "flex h-7 w-7 items-center justify-center rounded-lg border border-white/15 bg-black/60 text-foreground/80 backdrop-blur-md transition-colors hover:border-cyan-200/60 hover:text-cyan-100";

function GenerationCard({
  generation,
  onUseAsReference,
  onExpand,
  onDelete,
}: {
  generation: Generation;
  onUseAsReference: (url: string) => void;
  onExpand: (generation: Generation) => void;
  onDelete: (generation: Generation) => void;
}) {
  const inFlight = generation.status === "queued" || generation.status === "running";
  const [progress, setProgress] = useState(generation.status === "running" ? 25 : 8);

  useEffect(() => {
    if (!inFlight) return;
    const timer = setInterval(() => setProgress((prev) => Math.min(94, prev + 2)), 1500);
    return () => clearInterval(timer);
  }, [inFlight]);

  const isImage = generation.outputType !== "video";
  const done = generation.status === "complete" && !!generation.outputUrl;

  return (
    <article className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl transition-colors hover:border-cyan-200/30">
      <div className="relative flex aspect-[3/4] items-center justify-center bg-black/50">
        {done ? (
          <>
            <button
              type="button"
              onClick={() => onExpand(generation)}
              aria-label="Expand result"
              className="block h-full w-full"
            >
              {isImage ? (
                <img
                  src={generation.outputUrl as string}
                  alt={generation.prompt ?? "Generated result"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <video
                  src={generation.outputUrl as string}
                  muted
                  loop
                  playsInline
                  className="h-full w-full object-cover"
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
              <a
                href={generation.outputUrl as string}
                download
                target="_blank"
                rel="noreferrer"
                aria-label="Download"
                title="Download"
                className={ICON_ACTION_CLASS}
              >
                <Download size={13} />
              </a>
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
          </>
        ) : generation.status === "failed" ? (
          <>
            <p className="max-h-full overflow-y-auto px-5 py-4 text-center text-xs text-red-300">
              {generation.error ?? "Generation failed"}
            </p>
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
            <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-200/70">
              {generation.status === "queued" ? "Queued" : "Generating"}
            </p>
            <Progress value={progress} className="h-1.5" />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <p className="line-clamp-1 flex-1 text-xs text-muted-foreground">{generation.prompt ?? "—"}</p>
        <span className="shrink-0 text-[11px] text-cyan-200/70">
          {generation.estimatedCredits ? `${generation.estimatedCredits} cr` : "—"}
        </span>
      </div>
    </article>
  );

}

export default function GenerationStudio() {
  const [modelKey, setModelKey] = useState<StudioModelKey>("nano-banana-pro");
  const [modelOpen, setModelOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [references, setReferences] = useState<Reference[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<string>("auto");
  const [aspectOpen, setAspectOpen] = useState(false);
  const [quality, setQuality] = useState("2K");
  const [duration, setDuration] = useState(5);
  const [generateAudio, setGenerateAudio] = useState(true);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [library, setLibrary] = useState<string[]>(() => readReferenceLibrary());
  const [selected, setSelected] = useState<string[]>([]);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [confirmSingle, setConfirmSingle] = useState<Generation | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [deleting, setDeleting] = useState(false);
  const lastSelectedRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const model = useMemo(
    () => STUDIO_MODELS.find((entry) => entry.key === modelKey) ?? STUDIO_MODELS[0],
    [modelKey],
  );
  const isVideo = model.kind === "video";

  const estimatedCredits = useMemo(() => {
    const multiplier = RESOLUTION_MULTIPLIER[quality] ?? 1;
    if (!isVideo) return creditsFromUsd(IMAGE_FALLBACK_USD * multiplier);
    const perSecond = model.supportsAudio && generateAudio && model.usdPerSecondAudio
      ? model.usdPerSecondAudio
      : model.usdPerSecond ?? 0;
    return creditsFromUsd(perSecond * duration * multiplier);
  }, [isVideo, model, generateAudio, quality, duration]);

  useEffect(() => {
    if (model.durationRange) {
      setDuration((prev) =>
        Math.min(model.durationRange!.max, Math.max(model.durationRange!.min, prev))
      );
    }
    setQuality((prev) => (model.resolutions.includes(prev) ? prev : model.resolutions[0]));
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

  const loadQueue = useCallback(async (silent = true) => {
    try {
      const data = await callStudio({ action: "queue", limit: 36 });
      setGenerations((data?.generations ?? []) as Generation[]);
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Could not load generations");
    }
  }, []);

  useEffect(() => {
    void loadQueue(false);
  }, [loadQueue]);

  const hasInFlight = generations.some((entry) => entry.status === "queued" || entry.status === "running");
  useEffect(() => {
    if (!hasInFlight) return;
    const timer = setInterval(() => void loadQueue(), 5000);
    return () => clearInterval(timer);
  }, [hasInFlight, loadQueue]);

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

  const useAsReference = useCallback(
    (url: string) => {
      addReference(url);
      setLightboxId(null);
      toast.success("Added to references");
    },
    [addReference],
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
  const recreate = useCallback((generation: Generation) => {
    const recipe = generationRecipe(generation);
    setPrompt(recipe.prompt);
    setReferences(recipe.urls.slice(0, MAX_REFERENCES).map((url) => ({ url, label: "" })));
    if (recipe.aspect) setAspectRatio(recipe.aspect);
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

  const moveReference = (index: number, delta: number) => {
    setReferences((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleGenerate = () => {
    const text = prompt.trim();
    if (!text) {
      toast.error("Describe the scene you imagine first");
      return;
    }

    const urls = references.map((entry) => entry.url);
    const payload: Record<string, unknown> = {
      action: "start",
      kind: model.kind,
      model: model.key,
      prompt: text,
      resolution: quality,
      aspectRatio,
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
        generationId: entry.id,
      }));
    const uploads = library.map((url) => ({
      id: `upload:${url}`,
      url,
      type: "image" as const,
      generationId: null as string | null,
    }));
    return { outputs, uploads };
  }, [generations, library]);

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
      setTimeout(() => {
        const link = document.createElement("a");
        link.href = asset.url;
        link.download = "";
        link.target = "_blank";
        link.rel = "noreferrer";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }, index * 350);
    });
    toast.success(`Downloading ${selectedAssets.length} asset${selectedAssets.length > 1 ? "s" : ""}`);
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
    items: { id: string; url: string; type: string; generationId: string | null }[],
    empty: string,
  ) => {
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
              {item.type === "video" ? (
                <video src={item.url} className="aspect-square w-full object-cover" muted />
              ) : (
                <img src={item.url} alt="Asset" className="aspect-square w-full object-cover" />
              )}
              <button
                type="button"
                aria-label={isSelected ? "Deselect asset" : "Select asset"}
                onClick={(event) => toggleSelect(item.id, ids, event.shiftKey)}
                className="absolute left-1 top-1 rounded-md bg-black/70 p-1 text-cyan-100"
              >
                {isSelected ? <CheckSquare size={13} /> : <Square size={13} />}
              </button>
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

      <div className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6">
        <header className="mb-6 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/70">FUSE Lab</p>
          <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">
            Generation Studio
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            Set your model, stack references in order, and queue as many generations as you want.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[400px_minmax(0,1fr)] xl:grid-cols-[440px_minmax(0,1fr)]">
          {/* LEFT: control panel */}
          <aside className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto sm:p-5">
            {/* Model */}
            <section>
              <SectionLabel>Model</SectionLabel>
              <Popover open={modelOpen} onOpenChange={setModelOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-left transition-colors hover:border-cyan-200/40"
                  >
                    <span className="rounded-lg border border-white/12 bg-black/40 p-1.5 text-cyan-200">
                      {isVideo ? <Video size={15} /> : <ImageIcon size={15} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {model.label}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {model.blurb}
                      </span>
                    </span>
                    <ChevronDown size={14} className="shrink-0 opacity-60" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-[--radix-popover-trigger-width] border-white/12 bg-background/95 p-2 backdrop-blur-xl"
                >
                  <p className="px-2 pb-2 text-xs font-semibold text-foreground">
                    {isVideo ? "Choose Video Model" : "Choose Image Model"}
                  </p>
                  <p className="px-2 pb-1 text-[10px] uppercase tracking-[0.18em] text-cyan-200/60">
                    Recommended
                  </p>
                  <div className="max-h-80 space-y-1 overflow-y-auto">
                    {[...STUDIO_MODELS].sort((a, b) => Number(!!b.recommended) - Number(!!a.recommended)).map((entry, index, sorted) => (
                      <div key={entry.key}>
                        {index > 0 && sorted[index - 1].recommended && !entry.recommended ? (
                          <p className="px-2 pb-1 pt-2 text-[10px] uppercase tracking-[0.18em] text-cyan-200/60">
                            All models
                          </p>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setModelKey(entry.key);
                            setModelOpen(false);
                          }}
                          className={cn(
                            "flex w-full items-start gap-3 rounded-xl border px-3 py-2 text-left transition-colors",
                            entry.key === modelKey
                              ? "border-cyan-200/40 bg-cyan-400/10"
                              : "border-transparent hover:border-white/15 hover:bg-white/[0.04]",
                          )}
                        >
                          <span className="mt-0.5 rounded-lg border border-white/12 bg-black/40 p-1.5 text-cyan-200">
                            {entry.kind === "image" ? <ImageIcon size={14} /> : <Video size={14} />}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-foreground">{entry.label}</span>
                            <span className="block text-[11px] text-muted-foreground">{entry.blurb}</span>
                          </span>
                        </button>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </section>

            {/* References */}
            <section
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
                const url = event.dataTransfer.getData("text/uri-list") ||
                  event.dataTransfer.getData("text/plain");
                if (url) addReference(url);
              }}
              className={cn(
                "rounded-2xl border p-3 transition-colors",
                dragActive ? "border-cyan-300/60 bg-cyan-400/5" : "border-white/10 bg-black/20",
              )}
            >
              <SectionLabel hint={`Optional · ${references.length}/${MAX_REFERENCES}`}>
                References
              </SectionLabel>
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
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/[0.02] py-3 text-xs text-foreground/85 transition-colors hover:border-cyan-200/50 hover:text-cyan-100"
                >
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Add image
                </button>

                {references.map((reference, index) => (
                  <div
                    key={`${reference.url}-${index}`}
                    className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-2"
                  >
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-white/12">
                      <img src={reference.url} alt={`Reference ${index + 1}`} className="h-full w-full object-cover" />
                      <span className="absolute inset-x-0 bottom-0 bg-black/75 text-center text-[9px] font-semibold uppercase tracking-wide text-cyan-100">
                        Ref {index + 1}
                      </span>
                    </div>
                    <Input
                      value={reference.label}
                      onChange={(event) =>
                        setReferences((prev) =>
                          prev.map((entry, i) =>
                            i === index ? { ...entry, label: event.target.value } : entry
                          )
                        )}
                      placeholder="Label (optional)"
                      className="h-8 border-white/12 bg-black/30 text-xs"
                    />
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        aria-label="Move earlier"
                        disabled={index === 0}
                        onClick={() => moveReference(index, -1)}
                        className="rounded-md p-1 text-foreground/70 transition-colors hover:text-cyan-100 disabled:opacity-30"
                      >
                        <ArrowLeft size={13} />
                      </button>
                      <button
                        type="button"
                        aria-label="Move later"
                        disabled={index === references.length - 1}
                        onClick={() => moveReference(index, 1)}
                        className="rounded-md p-1 text-foreground/70 transition-colors hover:text-cyan-100 disabled:opacity-30"
                      >
                        <ArrowRight size={13} />
                      </button>
                      <button
                        type="button"
                        aria-label="Remove reference"
                        onClick={() => setReferences((prev) => prev.filter((_, i) => i !== index))}
                        className="rounded-md p-1 text-foreground/70 transition-colors hover:text-red-300"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Prompt */}
            <section>
              <SectionLabel hint="Sent verbatim">Prompt</SectionLabel>
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Describe the scene you imagine"
                rows={8}
                className="min-h-[170px] resize-y border-white/12 bg-black/30 text-sm leading-relaxed"
              />
            </section>

            {/* Aspect ratio */}
            <section>
              <SectionLabel>Aspect ratio</SectionLabel>
              <Popover open={aspectOpen} onOpenChange={setAspectOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-left transition-colors hover:border-cyan-200/40"
                  >
                    <AspectGlyph ratio={aspectRatio} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-foreground">
                        {aspectRatio === "auto" ? "Auto" : aspectRatio}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {ASPECT_OPTIONS.find((entry) => entry.value === aspectRatio)?.note}
                      </span>
                    </span>
                    <ChevronDown size={14} className="shrink-0 opacity-60" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="max-h-80 w-[--radix-popover-trigger-width] overflow-y-auto border-white/12 bg-background/95 p-2 backdrop-blur-xl"
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
                        "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-xs transition-colors",
                        option.value === aspectRatio
                          ? "bg-cyan-400/15 text-cyan-100"
                          : "text-foreground/85 hover:bg-white/[0.06]",
                      )}
                    >
                      <AspectGlyph ratio={option.value} />
                      <span className="font-medium">{option.value === "auto" ? "Auto" : option.value}</span>
                      <span className="ml-auto truncate text-[11px] text-muted-foreground">{option.note}</span>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            </section>

            {/* Resolution */}
            <section>
              <SectionLabel>Resolution</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {model.resolutions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setQuality(option)}
                    className={cn(
                      "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                      option === quality
                        ? "border-cyan-200/60 bg-cyan-400/15 text-cyan-100"
                        : "border-white/12 bg-white/[0.03] text-foreground/85 hover:border-cyan-200/40",
                    )}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </section>

            {/* Motion */}
            {isVideo ? (
              <section className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                <SectionLabel>Motion</SectionLabel>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <Label className="text-cyan-100/70">Duration</Label>
                    <span className="font-medium text-foreground">{duration}s</span>
                  </div>
                  <Slider
                    value={[duration]}
                    min={model.durationRange?.min ?? 3}
                    max={model.durationRange?.max ?? 15}
                    step={1}
                    onValueChange={([value]) => setDuration(value)}
                  />
                </div>
                {model.supportsAudio ? (
                  <label className="flex items-center justify-between text-xs text-foreground/90">
                    Generate audio
                    <Switch checked={generateAudio} onCheckedChange={setGenerateAudio} />
                  </label>
                ) : null}
              </section>
            ) : null}

            {/* Generate */}
            <div className="space-y-2 border-t border-white/10 pt-4">
              <div className="flex items-center justify-between text-[11px] text-cyan-200/70">
                <span>~{estimatedCredits} credits</span>
                <span>{references.length ? `${references.length} reference(s)` : "No references"}</span>
              </div>
              <Button
                onClick={handleGenerate}
                className="w-full rounded-xl bg-[hsl(var(--primary))] py-6 text-base font-semibold text-primary-foreground hover:bg-[hsl(var(--primary))]/90"
              >
                <Sparkles size={17} className="mr-2" /> Generate
              </Button>
            </div>
          </aside>

          {/* RIGHT: output canvas */}
          <div className="space-y-4">
            <Tabs defaultValue="gallery">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <TabsList>
                  <TabsTrigger value="gallery">Gallery</TabsTrigger>
                  <TabsTrigger value="library">
                    <Images size={14} className="mr-1.5" /> Asset library
                  </TabsTrigger>
                </TabsList>
                {selected.length ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-cyan-200/70">{selected.length} selected</span>
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
                ) : null}
              </div>

              <TabsContent value="gallery" className="mt-4">
                {generations.length ? (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                    {generations.map((generation) => (
                      <GenerationCard
                        key={generation.id}
                        generation={generation}
                        onUseAsReference={useAsReference}
                        onExpand={(entry) => setLightboxId(entry.id)}
                        onDelete={(entry) => setConfirmSingle(entry)}
                      />

                    ))}
                  </div>
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
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <SectionLabel hint="Shift-click to select a range">Generated outputs</SectionLabel>
                  {assetGrid(assets.outputs, "No generated assets yet.")}
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <SectionLabel>Uploaded references</SectionLabel>
                  {assetGrid(assets.uploads, "Uploaded references appear here.")}
                </div>
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
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200/70">
                        Result
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {lightbox.providerModel ?? "—"}
                      </p>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {recipe.aspect ? (
                          <span className="rounded-full border border-white/12 bg-white/[0.04] px-2 py-0.5 text-[11px] text-foreground/80">
                            {recipe.aspect}
                          </span>
                        ) : null}
                        {recipe.resolution ? (
                          <span className="rounded-full border border-white/12 bg-white/[0.04] px-2 py-0.5 text-[11px] text-foreground/80">
                            {recipe.resolution}
                          </span>
                        ) : null}
                        {lightbox.estimatedCredits ? (
                          <span className="rounded-full border border-white/12 bg-white/[0.04] px-2 py-0.5 text-[11px] text-cyan-200/80">
                            {lightbox.estimatedCredits} credits
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {isImage && lightbox.outputUrl ? (
                      <Button
                        onClick={() => useAsReference(lightbox.outputUrl as string)}
                        className="w-full rounded-xl bg-[hsl(var(--primary))] text-primary-foreground hover:bg-[hsl(var(--primary))]/90"
                      >
                        <Wand2 size={15} className="mr-2" /> Use as reference
                      </Button>
                    ) : null}

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200/70">
                          Prompt
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
                      <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-3 text-xs leading-relaxed text-foreground/90">
                        {recipe.prompt || "No prompt stored for this generation."}
                      </p>
                    </div>

                    {recipe.urls.length ? (
                      <div className="space-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200/70">
                          References used
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {recipe.urls.map((url, index) => (
                            <div
                              key={`${url}-${index}`}
                              className="relative h-14 w-14 overflow-hidden rounded-lg border border-white/12"
                            >
                              <img src={url} alt={`Reference ${index + 1}`} className="h-full w-full object-cover" />
                              <span className="absolute inset-x-0 bottom-0 bg-black/75 text-center text-[9px] font-semibold uppercase text-cyan-100">
                                Ref {index + 1}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-auto space-y-2 border-t border-white/10 pt-4">
                      <Button
                        variant="outline"
                        onClick={() => recreate(lightbox)}
                        className="w-full border-white/15 bg-white/[0.04]"
                      >
                        <RefreshCw size={15} className="mr-2" /> Recreate
                      </Button>
                      {lightbox.outputUrl ? (
                        <Button
                          variant="outline"
                          asChild
                          className="w-full border-white/15 bg-white/[0.04]"
                        >
                          <a href={lightbox.outputUrl} download target="_blank" rel="noreferrer">
                            <Download size={15} className="mr-2" /> Download
                          </a>
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
