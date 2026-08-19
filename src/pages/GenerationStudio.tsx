import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, ImageIcon, Loader2, Sparkles, Upload, Video, X } from "lucide-react";
import { toast } from "sonner";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { uploadRunInputFile } from "@/services/runInputUpload";
import { cn } from "@/lib/utils";

const USD_PER_CREDIT = 0.098;
const IMAGE_FALLBACK_USD = 0.15;

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
  family?: "kling3" | "seedance";
  usdPerSecond?: number;
  usdPerSecondAudio?: number;
  durationRange?: { min: number; max: number };
  resolutions?: string[];
  supportsAudio?: boolean;
  supportsEndFrame?: boolean;
};

const STUDIO_MODELS: StudioModel[] = [
  {
    key: "nano-banana-pro",
    label: "Nano-Banana-Pro",
    kind: "image",
    blurb: "Reference-driven image generation",
  },
  {
    key: "kling-3.0-pro",
    label: "Kling 3.0 Pro",
    kind: "video",
    blurb: "Highest-fidelity motion, native audio",
    family: "kling3",
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
    blurb: "Balanced quality and speed",
    family: "kling3",
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
    blurb: "Cinematic motion, resolution control",
    family: "seedance",
    usdPerSecond: 0.3024,
    durationRange: { min: 4, max: 15 },
    resolutions: ["480p", "720p", "1080p", "4k"],
    supportsAudio: true,
  },
  {
    key: "seedance-2.0-fast",
    label: "Seedance 2.0 Fast",
    kind: "video",
    blurb: "Faster, lower-cost Seedance",
    family: "seedance",
    usdPerSecond: 0.2419,
    durationRange: { min: 4, max: 15 },
    resolutions: ["480p", "720p", "1080p", "4k"],
    supportsAudio: true,
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

const panelClass =
  "rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl shadow-[0_10px_40px_-20px_rgba(0,0,0,0.8)]";

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

function FrameUploader({
  label,
  hint,
  url,
  uploading,
  onPick,
  onClear,
}: {
  label: string;
  hint: string;
  url: string | null;
  uploading: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium uppercase tracking-wide text-cyan-100/70">{label}</Label>
      <div
        className={cn(
          "relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-xl border border-dashed transition-colors",
          url ? "border-cyan-200/30 bg-black/40" : "border-white/15 bg-white/[0.02] hover:border-cyan-200/30",
        )}
      >
        {url ? (
          <>
            <img src={url} alt={`${label} preview`} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={onClear}
              aria-label={`Remove ${label}`}
              className="absolute right-2 top-2 rounded-full border border-white/20 bg-black/70 p-1.5 text-foreground hover:border-red-400/50 hover:text-red-300"
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground"
          >
            {uploading ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
            <span className="text-xs">{uploading ? "Uploading…" : "Upload image"}</span>
            <span className="px-4 text-center text-[11px] text-muted-foreground/70">{hint}</span>
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onPick(file);
          }}
        />
      </div>
    </div>
  );
}

export default function GenerationStudio() {
  const { isAdmin } = useAuth();
  const [modelKey, setModelKey] = useState<StudioModelKey>("nano-banana-pro");
  const [prompt, setPrompt] = useState("");
  const [promptVisible, setPromptVisible] = useState(true);
  const [startImageUrl, setStartImageUrl] = useState<string | null>(null);
  const [endImageUrl, setEndImageUrl] = useState<string | null>(null);
  const [uploadingStart, setUploadingStart] = useState(false);
  const [uploadingEnd, setUploadingEnd] = useState(false);
  const [duration, setDuration] = useState(5);
  const [generateAudio, setGenerateAudio] = useState(true);
  const [resolution, setResolution] = useState("720p");
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [current, setCurrent] = useState<Generation | null>(null);
  const [recent, setRecent] = useState<Generation[]>([]);

  const model = useMemo(
    () => STUDIO_MODELS.find((entry) => entry.key === modelKey) ?? STUDIO_MODELS[0],
    [modelKey],
  );
  const isVideo = model.kind === "video";

  const estimatedCredits = useMemo(() => {
    if (!isVideo) return creditsFromUsd(IMAGE_FALLBACK_USD);
    const perSecond = (model.supportsAudio && generateAudio && model.usdPerSecondAudio)
      ? model.usdPerSecondAudio
      : model.usdPerSecond ?? 0;
    const multiplier = model.resolutions ? RESOLUTION_MULTIPLIER[resolution] ?? 1 : 1;
    return creditsFromUsd(perSecond * duration * multiplier);
  }, [isVideo, model, generateAudio, resolution, duration]);

  useEffect(() => {
    if (!model.durationRange) return;
    setDuration((prev) =>
      Math.min(model.durationRange!.max, Math.max(model.durationRange!.min, prev)),
    );
  }, [model]);

  const loadRecent = useCallback(async () => {
    try {
      const data = await callStudio({ action: "list", limit: 12 });
      setRecent((data?.generations ?? []) as Generation[]);
    } catch (error) {
      // silent: the list is secondary to generating
      console.error("Could not load recent generations", error);
    }
  }, []);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  const uploadFrame = async (file: File, target: "start" | "end") => {
    const setUploading = target === "start" ? setUploadingStart : setUploadingEnd;
    setUploading(true);
    try {
      const url = await uploadRunInputFile(file);
      if (target === "start") setStartImageUrl(url);
      else setEndImageUrl(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload the image");
    } finally {
      setUploading(false);
    }
  };

  const pollGeneration = useCallback(async (generationId: string) => {
    const startedAt = Date.now();
    for (let attempt = 0; attempt < 200; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 4000));
      const elapsed = (Date.now() - startedAt) / 1000;
      setProgress(Math.min(95, 10 + elapsed * (isVideo ? 0.9 : 3)));

      let data: any;
      try {
        data = await callStudio({ action: "status", generationId });
      } catch (_error) {
        continue;
      }
      const generation = data?.generation as Generation | undefined;
      if (!generation) continue;
      setCurrent(generation);
      if (generation.status === "complete" || generation.status === "failed") return generation;
    }
    return null;
  }, [isVideo]);

  const handleGenerate = async () => {
    if (promptVisible && !prompt.trim()) {
      toast.error("Add a prompt first");
      return;
    }
    if (!startImageUrl) {
      toast.error("Upload a start frame first");
      return;
    }

    setGenerating(true);
    setProgress(6);
    setCurrent(null);

    try {
      const data = await callStudio({
        action: "start",
        kind: model.kind,
        model: model.key,
        prompt: prompt.trim(),
        startImageUrl,
        ...(endImageUrl ? { endImageUrl } : {}),
        ...(isVideo
          ? {
            duration,
            ...(model.supportsAudio ? { generateAudio } : {}),
            ...(model.resolutions ? { resolution } : {}),
          }
          : {}),
      });

      const generation = data?.generation as Generation;
      setCurrent(generation);
      const finished = await pollGeneration(generation.id);

      if (finished?.status === "complete") {
        setProgress(100);
        toast.success("Generation ready");
      } else if (finished?.status === "failed") {
        toast.error(finished.error ?? "Generation failed");
      } else {
        toast.message("Still generating — check Recent generations in a moment");
      }
      void loadRecent();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the generation");
    } finally {
      setGenerating(false);
    }
  };

  const result = current?.status === "complete" ? current : null;

  return (
    <SiteShell>
      <PageMeta
        title="Generation Studio | FUSE"
        description="Generate standalone campaign images and video clips from a prompt and reference frames."
        path="/app/lab/studio"
      />

      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <header className="mb-6 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200/70">FUSE Lab</p>
          <h1 className="font-heading text-2xl font-semibold text-foreground sm:text-3xl">Generation Studio</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Generate a single image or video clip straight from a prompt and reference frames — no template required.
          </p>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          {/* Controls */}
          <div className="space-y-5">
            <section className={panelClass}>
              <h2 className="mb-3 text-sm font-semibold text-foreground">Model</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {STUDIO_MODELS.map((entry) => {
                  const active = entry.key === modelKey;
                  return (
                    <button
                      key={entry.key}
                      type="button"
                      onClick={() => setModelKey(entry.key)}
                      className={cn(
                        "rounded-xl border px-3 py-3 text-left transition-colors",
                        active
                          ? "border-cyan-200/40 bg-cyan-400/10"
                          : "border-white/10 bg-white/[0.02] hover:border-white/25",
                      )}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                        {entry.kind === "image" ? <ImageIcon size={14} /> : <Video size={14} />}
                        {entry.label}
                      </span>
                      <span className="mt-1 block text-[11px] text-muted-foreground">{entry.blurb}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className={panelClass}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-foreground">Prompt</h2>
                {isAdmin ? (
                  <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    Require prompt
                    <Switch checked={promptVisible} onCheckedChange={setPromptVisible} />
                  </label>
                ) : null}
              </div>
              {promptVisible ? (
                <Textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Describe the shot: subject, wardrobe, lighting, camera move…"
                  rows={5}
                  className="resize-none border-white/10 bg-black/30 text-sm"
                />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Prompt field hidden. Toggle it back on to write a prompt.
                </p>
              )}
            </section>

            <section className={panelClass}>
              <h2 className="mb-3 text-sm font-semibold text-foreground">Frames</h2>
              <div className={cn("grid gap-4", isVideo ? "sm:grid-cols-2" : "sm:grid-cols-1")}>
                <FrameUploader
                  label="Start frame"
                  hint={isVideo ? "First frame of the clip" : "Reference image"}
                  url={startImageUrl}
                  uploading={uploadingStart}
                  onPick={(file) => void uploadFrame(file, "start")}
                  onClear={() => setStartImageUrl(null)}
                />
                {isVideo ? (
                  <FrameUploader
                    label="End frame (optional)"
                    hint="Where the motion should land"
                    url={endImageUrl}
                    uploading={uploadingEnd}
                    onPick={(file) => void uploadFrame(file, "end")}
                    onClear={() => setEndImageUrl(null)}
                  />
                ) : null}
              </div>
            </section>

            {isVideo ? (
              <section className={cn(panelClass, "space-y-5")}>
                <h2 className="text-sm font-semibold text-foreground">Motion settings</h2>

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
                    onValueChange={(value) => setDuration(value[0])}
                  />
                </div>

                {model.supportsAudio ? (
                  <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
                    <div>
                      <p className="text-sm text-foreground">Generate audio</p>
                      <p className="text-[11px] text-muted-foreground">Native sound design with the clip</p>
                    </div>
                    <Switch checked={generateAudio} onCheckedChange={setGenerateAudio} />
                  </div>
                ) : null}

                {model.resolutions ? (
                  <div className="space-y-2">
                    <Label className="text-xs text-cyan-100/70">Resolution</Label>
                    <div className="flex flex-wrap gap-2">
                      {model.resolutions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => setResolution(option)}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs transition-colors",
                            resolution === option
                              ? "border-cyan-200/40 bg-cyan-400/10 text-foreground"
                              : "border-white/10 bg-white/[0.02] text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>

          {/* Result */}
          <div className="space-y-5">
            <section className={panelClass}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Generate</h2>
                  <p className="text-[11px] text-muted-foreground">
                    Estimated {estimatedCredits.toLocaleString()} credits
                  </p>
                </div>
                <Button
                  onClick={() => void handleGenerate()}
                  disabled={generating || uploadingStart || uploadingEnd}
                  className="rounded-full bg-cyan-400 px-5 text-slate-950 hover:bg-cyan-300"
                >
                  {generating ? (
                    <>
                      <Loader2 size={15} className="mr-2 animate-spin" /> Generating…
                    </>
                  ) : (
                    <>
                      <Sparkles size={15} className="mr-2" /> Generate
                    </>
                  )}
                </Button>
              </div>

              {generating || current ? (
                <div className="mt-4 space-y-2">
                  <Progress value={generating ? progress : current?.status === "complete" ? 100 : progress} />
                  <p className="text-[11px] text-muted-foreground">
                    {current?.status === "failed"
                      ? current.error ?? "Generation failed"
                      : current?.status === "complete"
                      ? "Complete"
                      : generating
                      ? isVideo
                        ? "Rendering the clip — this usually takes a couple of minutes."
                        : "Rendering the image — usually under a minute."
                      : "Queued"}
                  </p>
                </div>
              ) : null}
            </section>

            <section className={cn(panelClass, "min-h-[320px]")}>
              <h2 className="mb-3 text-sm font-semibold text-foreground">Result</h2>
              {result?.outputUrl ? (
                <div className="space-y-3">
                  <div className="overflow-hidden rounded-xl border border-white/10 bg-black/50">
                    {result.outputType === "video" ? (
                      <video src={result.outputUrl} controls className="max-h-[60vh] w-full" />
                    ) : (
                      <img
                        src={result.outputUrl}
                        alt={result.prompt ?? "Generated result"}
                        className="max-h-[60vh] w-full object-contain"
                      />
                    )}
                  </div>
                  <Button asChild variant="outline" size="sm" className="rounded-full border-white/20">
                    <a href={result.outputUrl} download target="_blank" rel="noreferrer">
                      <Download size={14} className="mr-2" /> Download
                    </a>
                  </Button>
                </div>
              ) : (
                <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-white/10 text-xs text-muted-foreground">
                  Your generated image or clip will appear here.
                </div>
              )}
            </section>

            <section className={panelClass}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">Recent generations</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 rounded-full px-2 text-[11px] text-muted-foreground"
                  onClick={() => void loadRecent()}
                >
                  Refresh
                </Button>
              </div>
              {recent.length ? (
                <ul className="space-y-2">
                  {recent.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-2"
                    >
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/50">
                        {entry.outputUrl && entry.outputType === "image" ? (
                          <img src={entry.outputUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                            {entry.kind === "video" ? <Video size={14} /> : <ImageIcon size={14} />}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-foreground">{entry.prompt ?? "Untitled generation"}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {entry.status}
                          {entry.estimatedCredits ? ` · ${entry.estimatedCredits.toLocaleString()} credits` : ""}
                        </p>
                      </div>
                      {entry.outputUrl ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 rounded-full px-2 text-[11px]"
                          onClick={() => setCurrent(entry)}
                        >
                          View
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No generations yet.</p>
              )}
            </section>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
