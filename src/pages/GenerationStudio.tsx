import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Download,
  ImageIcon,
  Images,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Video,
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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
  usdPerSecond?: number;
  usdPerSecondAudio?: number;
  durationRange?: { min: number; max: number };
  resolutions?: string[];
  supportsAudio?: boolean;
  supportsEndFrame?: boolean;
  aspectRatios?: string[];
};

const ASPECT_RATIOS = [
  "auto",
  "1:1",
  "3:4",
  "4:3",
  "2:3",
  "3:2",
  "9:16",
  "16:9",
  "5:4",
  "4:5",
  "21:9",
] as const;

const STUDIO_MODELS: StudioModel[] = [
  {
    key: "nano-banana-pro",
    label: "Nano Banana Pro",
    kind: "image",
    blurb: "Google's flagship image model — reference-driven edits",
    aspectRatios: [...ASPECT_RATIOS],
  },
  {
    key: "kling-3.0-pro",
    label: "Kling 3.0 Pro",
    kind: "video",
    blurb: "Highest-fidelity motion with native audio",
    usdPerSecond: 0.112,
    usdPerSecondAudio: 0.168,
    durationRange: { min: 3, max: 15 },
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
    resolutions: ["480p", "720p", "1080p", "4k"],
    supportsAudio: true,
    aspectRatios: ["auto", "9:16", "16:9", "1:1", "4:3", "3:4", "21:9"],
  },
  {
    key: "seedance-2.0-fast",
    label: "Seedance 2.0 Fast",
    kind: "video",
    blurb: "Faster, lower-cost Seedance pass",
    usdPerSecond: 0.2419,
    durationRange: { min: 4, max: 15 },
    resolutions: ["480p", "720p", "1080p", "4k"],
    supportsAudio: true,
    aspectRatios: ["auto", "9:16", "16:9", "1:1", "4:3", "3:4", "21:9"],
  },
];

const RESOLUTION_MULTIPLIER: Record<string, number> = {
  "480p": 0.5,
  "720p": 1,
  "1080p": 1.8,
  "4k": 3.5,
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
  createdAt: string | null;
  completedAt: string | null;
};

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
  const max = 14;
  const scale = max / Math.max(w, h);
  return (
    <span
      className="inline-block rounded-[3px] border border-cyan-200/60"
      style={{ width: Math.max(5, w * scale), height: Math.max(5, h * scale) }}
    />
  );
}

function Chip({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-foreground/90 transition-colors hover:border-cyan-200/40 hover:bg-cyan-400/10",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function GenerationCard({ generation }: { generation: Generation }) {
  const inFlight = generation.status === "queued" || generation.status === "running";
  const [progress, setProgress] = useState(generation.status === "running" ? 25 : 8);

  useEffect(() => {
    if (!inFlight) return;
    const timer = setInterval(() => setProgress((prev) => Math.min(94, prev + 2)), 1500);
    return () => clearInterval(timer);
  }, [inFlight]);

  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
      <div className="relative flex aspect-[3/4] items-center justify-center bg-black/50">
        {generation.status === "complete" && generation.outputUrl ? (
          generation.outputType === "video" ? (
            <video src={generation.outputUrl} controls loop className="h-full w-full object-cover" />
          ) : (
            <img
              src={generation.outputUrl}
              alt={generation.prompt ?? "Generated result"}
              className="h-full w-full object-cover"
            />
          )
        ) : generation.status === "failed" ? (
          <p className="px-5 text-center text-xs text-red-300">{generation.error ?? "Generation failed"}</p>
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

      <div className="space-y-2 p-3">
        <p className="line-clamp-2 text-xs text-muted-foreground">{generation.prompt ?? "—"}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-cyan-200/70">
            {generation.estimatedCredits ? `${generation.estimatedCredits} credits` : "—"}
          </span>
          {generation.status === "complete" && generation.outputUrl ? (
            <a
              href={generation.outputUrl}
              download
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-foreground/90 hover:border-cyan-200/40 hover:text-cyan-100"
            >
              <Download size={12} /> Download
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function GenerationStudio() {
  const [modelKey, setModelKey] = useState<StudioModelKey>("nano-banana-pro");
  const [modelSearch, setModelSearch] = useState("");
  const [modelOpen, setModelOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [references, setReferences] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<string>("auto");
  const [quality, setQuality] = useState("720p");
  const [duration, setDuration] = useState(5);
  const [generateAudio, setGenerateAudio] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [library, setLibrary] = useState<string[]>(() => readReferenceLibrary());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const model = useMemo(
    () => STUDIO_MODELS.find((entry) => entry.key === modelKey) ?? STUDIO_MODELS[0],
    [modelKey],
  );
  const isVideo = model.kind === "video";
  const aspectOptions = model.aspectRatios ?? [];
  const qualityOptions = model.resolutions ?? [];

  const estimatedCredits = useMemo(() => {
    if (!isVideo) return creditsFromUsd(IMAGE_FALLBACK_USD);
    const perSecond = model.supportsAudio && generateAudio && model.usdPerSecondAudio
      ? model.usdPerSecondAudio
      : model.usdPerSecond ?? 0;
    const multiplier = qualityOptions.length ? RESOLUTION_MULTIPLIER[quality] ?? 1 : 1;
    return creditsFromUsd(perSecond * duration * multiplier);
  }, [isVideo, model, generateAudio, quality, duration, qualityOptions.length]);

  useEffect(() => {
    if (model.durationRange) {
      setDuration((prev) =>
        Math.min(model.durationRange!.max, Math.max(model.durationRange!.min, prev))
      );
    }
    if (aspectOptions.length && !aspectOptions.includes(aspectRatio)) setAspectRatio(aspectOptions[0]);
    if (qualityOptions.length && !qualityOptions.includes(quality)) setQuality(qualityOptions[1] ?? qualityOptions[0]);
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
      const data = await callStudio({ action: "queue", limit: 24 });
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
          setReferences((prev) => [...prev, ...uploaded].slice(0, MAX_REFERENCES));
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

  const addLibraryItem = (url: string) => {
    setReferences((prev) => (prev.includes(url) ? prev : [...prev, url].slice(0, MAX_REFERENCES)));
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Describe the scene you imagine first");
      return;
    }
    if (isVideo && !references.length) {
      toast.error("Add a start frame first");
      return;
    }
    if (!isVideo && !references.length) {
      toast.error("Add at least one reference image");
      return;
    }

    setSubmitting(true);
    try {
      const data = await callStudio({
        action: "start",
        kind: model.kind,
        model: model.key,
        prompt: prompt.trim(),
        startImageUrl: references[0],
        ...(isVideo
          ? {
            ...(model.supportsEndFrame && references[1] ? { endImageUrl: references[1] } : {}),
            duration,
            ...(model.supportsAudio ? { generateAudio } : {}),
            ...(qualityOptions.length ? { resolution: quality } : {}),
          }
          : { imageUrls: references }),
        ...(aspectOptions.length && aspectRatio !== "auto" ? { aspectRatio } : {}),
      });

      const generation = data?.generation as Generation | undefined;
      if (generation) setGenerations((prev) => [generation, ...prev]);
      toast.success("Added to the queue");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the generation");
    } finally {
      setSubmitting(false);
    }
  };

  const outputAssets = generations
    .filter((entry) => entry.status === "complete" && entry.outputUrl)
    .map((entry) => ({ url: entry.outputUrl as string, type: entry.outputType ?? "image" }));

  return (
    <SiteShell>
      <PageMeta
        title="Generation Studio | FUSE"
        description="Generate campaign images and video clips from a prompt and reference frames."
        path="/app/lab/studio"
      />

      <div className="mx-auto w-full max-w-7xl px-4 pb-64 pt-8 sm:px-6">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/70">FUSE Lab</p>
            <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">
              Generation Studio
            </h1>
            <p className="max-w-xl text-sm text-muted-foreground">
              Describe a scene, drop in references, and queue as many generations as you want.
            </p>
          </div>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="border-white/15 bg-white/[0.04]">
                <Images size={16} className="mr-2" /> Asset library
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full max-w-md border-white/10 bg-background/95 backdrop-blur-xl sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Asset library</SheetTitle>
              </SheetHeader>
              <Tabs defaultValue="outputs" className="mt-4">
                <TabsList className="w-full">
                  <TabsTrigger value="outputs" className="flex-1">Generated</TabsTrigger>
                  <TabsTrigger value="references" className="flex-1">Uploads</TabsTrigger>
                </TabsList>
                <TabsContent value="outputs" className="mt-4">
                  <div className="grid max-h-[70vh] grid-cols-3 gap-2 overflow-y-auto">
                    {outputAssets.length ? (
                      outputAssets.map((asset) => (
                        <button
                          key={asset.url}
                          type="button"
                          draggable
                          onDragStart={(event) => event.dataTransfer.setData("text/uri-list", asset.url)}
                          onClick={() => asset.type === "video" ? toast.message("Videos can't be used as references") : addLibraryItem(asset.url)}
                          className="overflow-hidden rounded-lg border border-white/10 bg-black/40 hover:border-cyan-200/40"
                        >
                          {asset.type === "video" ? (
                            <video src={asset.url} className="aspect-square w-full object-cover" muted />
                          ) : (
                            <img src={asset.url} alt="Generated asset" className="aspect-square w-full object-cover" />
                          )}
                        </button>
                      ))
                    ) : (
                      <p className="col-span-3 text-xs text-muted-foreground">No generated assets yet.</p>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="references" className="mt-4">
                  <div className="grid max-h-[70vh] grid-cols-3 gap-2 overflow-y-auto">
                    {library.length ? (
                      library.map((url) => (
                        <button
                          key={url}
                          type="button"
                          draggable
                          onDragStart={(event) => event.dataTransfer.setData("text/uri-list", url)}
                          onClick={() => addLibraryItem(url)}
                          className="overflow-hidden rounded-lg border border-white/10 bg-black/40 hover:border-cyan-200/40"
                        >
                          <img src={url} alt="Reference" className="aspect-square w-full object-cover" />
                        </button>
                      ))
                    ) : (
                      <p className="col-span-3 text-xs text-muted-foreground">Uploaded references appear here.</p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </SheetContent>
          </Sheet>
        </header>

        {generations.length ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {generations.map((generation) => (
              <GenerationCard key={generation.id} generation={generation} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/12 bg-white/[0.02] p-14 text-center">
            <Sparkles className="mx-auto mb-3 text-cyan-200/70" size={22} />
            <p className="text-sm text-muted-foreground">
              Your generations will appear here. Start with a prompt below.
            </p>
          </div>
        )}
      </div>

      {/* Floating generation bar */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-4 sm:px-6">
        <div
          className={cn(
            "pointer-events-auto w-full max-w-4xl rounded-3xl border bg-background/80 p-3 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur-2xl transition-colors",
            dragActive ? "border-cyan-300/60 bg-cyan-400/5" : "border-white/12",
          )}
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
            const url = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
            if (url) addLibraryItem(url);
          }}
        >
          {references.length ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {references.map((url, index) => (
                <div key={`${url}-${index}`} className="relative h-16 w-16 overflow-hidden rounded-lg border border-white/12">
                  <img src={url} alt={`Reference ${index + 1}`} className="h-full w-full object-cover" />
                  {isVideo ? (
                    <span className="absolute inset-x-0 bottom-0 bg-black/70 text-center text-[9px] uppercase tracking-wide text-cyan-100">
                      {index === 0 ? "Start" : index === 1 ? "End" : "Extra"}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    aria-label="Remove reference"
                    onClick={() => setReferences((prev) => prev.filter((_, i) => i !== index))}
                    className="absolute right-0.5 top-0.5 rounded-full bg-black/75 p-0.5 text-foreground hover:text-red-300"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe the scene you imagine"
            rows={2}
            className="resize-none border-0 bg-transparent px-2 text-sm shadow-none focus-visible:ring-0"
          />

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Chip onClick={() => fileInputRef.current?.click()} aria-label="Add reference images">
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              <span className="hidden sm:inline">Reference</span>
            </Chip>
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

            {/* Model picker */}
            <Popover open={modelOpen} onOpenChange={setModelOpen}>
              <PopoverTrigger asChild>
                <Chip>
                  {isVideo ? <Video size={14} /> : <ImageIcon size={14} />}
                  {model.label}
                  <ChevronDown size={12} className="opacity-60" />
                </Chip>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 border-white/12 bg-background/95 p-2 backdrop-blur-xl">
                <div className="mb-2 flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2">
                  <Search size={14} className="text-muted-foreground" />
                  <Input
                    value={modelSearch}
                    onChange={(event) => setModelSearch(event.target.value)}
                    placeholder="Search models"
                    className="border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                  />
                </div>
                <p className="px-2 pb-1 text-[10px] uppercase tracking-[0.18em] text-cyan-200/60">
                  Featured models
                </p>
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {STUDIO_MODELS.filter((entry) =>
                    entry.label.toLowerCase().includes(modelSearch.trim().toLowerCase())
                  ).map((entry) => (
                    <button
                      key={entry.key}
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
                      <span>
                        <span className="block text-sm font-medium text-foreground">{entry.label}</span>
                        <span className="block text-[11px] text-muted-foreground">{entry.blurb}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* Aspect ratio */}
            {aspectOptions.length ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Chip>
                    <AspectGlyph ratio={aspectRatio} />
                    {aspectRatio === "auto" ? "Auto" : aspectRatio}
                    <ChevronDown size={12} className="opacity-60" />
                  </Chip>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-56 border-white/12 bg-background/95 p-2 backdrop-blur-xl">
                  <div className="grid grid-cols-2 gap-1">
                    {aspectOptions.map((ratio) => (
                      <button
                        key={ratio}
                        type="button"
                        onClick={() => setAspectRatio(ratio)}
                        className={cn(
                          "flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors",
                          ratio === aspectRatio
                            ? "bg-cyan-400/15 text-cyan-100"
                            : "text-foreground/80 hover:bg-white/[0.06]",
                        )}
                      >
                        <AspectGlyph ratio={ratio} />
                        {ratio === "auto" ? "Auto" : ratio}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            ) : null}

            {/* Quality */}
            {qualityOptions.length ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Chip>
                    {quality.toUpperCase()}
                    <ChevronDown size={12} className="opacity-60" />
                  </Chip>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-40 border-white/12 bg-background/95 p-2 backdrop-blur-xl">
                  <div className="space-y-1">
                    {qualityOptions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setQuality(option)}
                        className={cn(
                          "block w-full rounded-lg px-2 py-1.5 text-left text-xs transition-colors",
                          option === quality
                            ? "bg-cyan-400/15 text-cyan-100"
                            : "text-foreground/80 hover:bg-white/[0.06]",
                        )}
                      >
                        {option.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            ) : null}

            {/* Motion settings */}
            {isVideo ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Chip>
                    {duration}s{model.supportsAudio ? (generateAudio ? " · audio" : " · silent") : ""}
                    <ChevronDown size={12} className="opacity-60" />
                  </Chip>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64 space-y-4 border-white/12 bg-background/95 p-4 backdrop-blur-xl">
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
                </PopoverContent>
              </Popover>
            ) : null}

            <span className="ml-auto text-[11px] text-cyan-200/70">~{estimatedCredits} credits</span>

            <Button
              onClick={() => void handleGenerate()}
              disabled={submitting}
              className="rounded-full bg-[hsl(var(--primary))] px-6 font-semibold text-primary-foreground hover:bg-[hsl(var(--primary))]/90"
            >
              {submitting ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Sparkles size={16} className="mr-2" />}
              Generate
            </Button>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
