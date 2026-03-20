import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Download, Film, Loader2, LockKeyhole, RefreshCw, Upload } from "lucide-react";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

type Phase = "idle" | "running" | "complete" | "error";

type JobStep = {
  id: string;
  label: string;
  type: string;
  status: string;
  outputUrl: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  executionTimeMs: number | null;
  telemetry: {
    estimatedCostUsd?: number | null;
    billingUnit?: string | null;
    billingQuantity?: number | null;
    unitPriceUsd?: number | null;
    currency?: string | null;
    falDurationSeconds?: number | null;
  } | null;
};

type JobStatus = {
  status: string;
  progress: number;
  error: string | null;
  telemetry: Record<string, unknown>;
  outputs: Array<{ label: string; type: "image" | "video"; url: string }>;
  steps: JobStep[];
};

const PAPARAZZI_VERSION_ID = "34239a27-27ed-4b1f-8fc9-6a0f1e1ac778";
const ACCESS_CODE_STORAGE_KEY = "fuse-lab-access-code";
const MAX_DIMENSION = 2048;

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

function formatDuration(ms: number | null | undefined) {
  if (ms == null) return "Pending";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatUsd(value: number | null | undefined) {
  if (value == null) return "Pending";
  return `$${value.toFixed(4)}`;
}

const PapparaziLab = () => {
  const [accessCode, setAccessCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const savedCode = window.localStorage.getItem(ACCESS_CODE_STORAGE_KEY);
    if (savedCode) setAccessCode(savedCode);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ACCESS_CODE_STORAGE_KEY, accessCode);
  }, [accessCode]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const outputImage = useMemo(
    () => job?.outputs.find((item) => item.type === "image")?.url ?? null,
    [job],
  );
  const outputVideo = useMemo(
    () => job?.outputs.find((item) => item.type === "video")?.url ?? null,
    [job],
  );

  const normalizeFile = useCallback((sourceFile: File) => {
    return new Promise<File>((resolve, reject) => {
      const img = new window.Image();
      const objectUrl = URL.createObjectURL(sourceFile);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);

        if (img.width <= MAX_DIMENSION && img.height <= MAX_DIMENSION) {
          resolve(sourceFile);
          return;
        }

        const scale = Math.min(MAX_DIMENSION / img.width, MAX_DIMENSION / img.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas unavailable"));
          return;
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("Could not resize image"));
            return;
          }

          resolve(new File([blob], sourceFile.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }));
        }, "image/jpeg", 0.9);
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Could not load image"));
      };

      img.src = objectUrl;
    });
  }, []);

  const handleFile = useCallback(async (nextFile: File | null) => {
    setError(null);
    setJob(null);
    setJobId(null);
    setPhase("idle");

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    if (!nextFile) {
      setFile(null);
      return;
    }

    try {
      const normalized = await normalizeFile(nextFile);
      setFile(normalized);
      setPreviewUrl(URL.createObjectURL(normalized));
    } catch (fileError) {
      const message = fileError instanceof Error ? fileError.message : "Could not prepare image";
      setError(message);
      toast({ title: "Image error", description: message, variant: "destructive" });
    }
  }, [normalizeFile, previewUrl]);

  const pollJob = useCallback((nextJobId: string, runnerCode: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-job-status-public?jobId=${nextJobId}`,
          {
            headers: {
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              "x-runner-code": runnerCode,
            },
          },
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error ?? "Could not load job status");
        }

        setJob(data);

        if (data.status === "complete") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setPhase("complete");
        } else if (data.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setPhase("error");
          setError(data.error ?? "Template run failed");
        } else {
          setPhase("running");
        }
      } catch (pollError) {
        const message = pollError instanceof Error ? pollError.message : "Polling failed";
        setPhase("error");
        setError(message);
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 2500);
  }, []);

  const handleRun = useCallback(async () => {
    if (!file) {
      toast({ title: "Missing image", description: "Upload the clothing image first.", variant: "destructive" });
      return;
    }

    if (!accessCode.trim()) {
      toast({ title: "Missing access code", description: "Enter the lab access code first.", variant: "destructive" });
      return;
    }

    setError(null);
    setJob(null);
    setJobId(null);
    setPhase("running");

    try {
      const dataUrl = await fileToDataUrl(file);
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/start-template-run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          "x-runner-code": accessCode.trim(),
        },
        body: JSON.stringify({
          versionId: PAPARAZZI_VERSION_ID,
          inputFiles: {
            "Input: Clothing Item": {
              dataUrl,
              filename: file.name,
            },
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? "Could not start template");
      }

      setJobId(data.jobId);
      pollJob(data.jobId, accessCode.trim());
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : "Could not start template";
      setPhase("error");
      setError(message);
      toast({ title: "Run failed", description: message, variant: "destructive" });
    }
  }, [accessCode, file, pollJob]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pb-16 pt-28">
        <div className="grid gap-8 lg:grid-cols-[1.1fr,0.9fr]">
          <section className="rounded-3xl border border-border/50 bg-card/70 p-8 shadow-sm">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Admin Lab</p>
                <h1 className="mt-2 font-display text-4xl font-black tracking-tight">PAPARAZZI</h1>
                <p className="mt-3 max-w-xl text-sm text-muted-foreground">
                  This is the stripped-down test harness. One product image in, styled image plus video out, all through Supabase.
                </p>
              </div>
              <div className="rounded-2xl border border-border/50 bg-background/70 px-4 py-3 text-right">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Template Version</p>
                <p className="mt-1 font-mono text-xs text-foreground">{PAPARAZZI_VERSION_ID}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="runner-code" className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.15em]">
                  <LockKeyhole className="h-3.5 w-3.5" />
                  Lab Access Code
                </Label>
                <Input
                  id="runner-code"
                  value={accessCode}
                  onChange={(event) => setAccessCode(event.target.value)}
                  placeholder="Enter the private runner code"
                />
              </div>

              <div
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const droppedFile = event.dataTransfer.files?.[0];
                  if (droppedFile) void handleFile(droppedFile);
                }}
                className="rounded-3xl border border-dashed border-border/70 bg-background/60 p-6"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Input Image</p>
                <div className="mt-4 flex flex-col gap-4">
                  {previewUrl ? (
                    <img src={previewUrl} alt="Selected clothing" className="max-h-80 rounded-2xl object-contain" />
                  ) : (
                    <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-border/40 bg-muted/20 text-center text-sm text-muted-foreground">
                      <Upload className="mb-3 h-8 w-8" />
                      Drag a clothing image here or browse from disk
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = "image/png,image/jpeg,image/webp";
                        input.onchange = (event) => {
                          const selectedFile = (event.target as HTMLInputElement).files?.[0];
                          if (selectedFile) void handleFile(selectedFile);
                        };
                        input.click();
                      }}
                    >
                      Choose Image
                    </Button>
                    <Button type="button" onClick={() => void handleRun()} disabled={!file || phase === "running"}>
                      {phase === "running" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Film className="mr-2 h-4 w-4" />}
                      Run Paparazzi
                    </Button>
                    {file ? (
                      <Button type="button" variant="ghost" onClick={() => void handleFile(null)} disabled={phase === "running"}>
                        Reset
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-border/50 bg-card/70 p-8 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Run State</p>
                <h2 className="mt-2 text-2xl font-bold">Execution</h2>
              </div>
              {phase === "running" ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : null}
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-border/40 bg-background/60 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  <span className="font-medium uppercase tracking-wide">
                    {job?.status ?? phase}
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${job?.progress ?? (phase === "complete" ? 100 : 0)}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{jobId ? `Job ${jobId.slice(0, 8)}...` : "No job started yet"}</span>
                  <span>{job?.progress ?? 0}%</span>
                </div>
              </div>

              {error ? (
                <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4" />
                    <span>{error}</span>
                  </div>
                </div>
              ) : null}

              <div className="space-y-3">
                {(job?.steps ?? []).map((step) => (
                  <div key={step.id} className="rounded-2xl border border-border/40 bg-background/60 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium">{step.label}</p>
                        <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">{step.type}</p>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        {step.status === "complete" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : null}
                        {step.status === "running" ? <RefreshCw className="h-4 w-4 animate-spin text-primary" /> : null}
                        {step.status === "failed" ? <AlertCircle className="h-4 w-4 text-destructive" /> : null}
                        <span className="uppercase tracking-wide">{step.status}</span>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                      <div className="rounded-xl border border-border/30 bg-background/70 px-3 py-2">
                        <p className="uppercase tracking-[0.15em]">Elapsed</p>
                        <p className="mt-1 text-sm text-foreground">{formatDuration(step.executionTimeMs)}</p>
                      </div>
                      <div className="rounded-xl border border-border/30 bg-background/70 px-3 py-2">
                        <p className="uppercase tracking-[0.15em]">Est. Cost</p>
                        <p className="mt-1 text-sm text-foreground">{formatUsd(step.telemetry?.estimatedCostUsd)}</p>
                      </div>
                    </div>
                    {step.telemetry?.billingUnit ? (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Billing: {step.telemetry.billingQuantity ?? 1} {step.telemetry.billingUnit}
                        {step.telemetry.unitPriceUsd != null ? ` at $${step.telemetry.unitPriceUsd.toFixed(4)} each` : ""}
                      </p>
                    ) : null}
                    {step.telemetry?.falDurationSeconds != null ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Provider runtime: {step.telemetry.falDurationSeconds.toFixed(2)} s
                      </p>
                    ) : null}
                    {step.error ? <p className="mt-2 text-xs text-destructive">{step.error}</p> : null}
                  </div>
                ))}
              </div>

              {outputImage ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Generated Image</p>
                    <Button asChild size="sm" variant="outline">
                      <a href={outputImage} download="papparazzi-output.png">
                        <Download className="mr-2 h-4 w-4" />
                        Download Image
                      </a>
                    </Button>
                  </div>
                  <img src={outputImage} alt="Generated paparazzi still" className="rounded-2xl border border-border/40" />
                </div>
              ) : null}

              {outputVideo ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Generated Video</p>
                    <Button asChild size="sm" variant="outline">
                      <a href={outputVideo} download="papparazzi-output.mp4">
                        <Download className="mr-2 h-4 w-4" />
                        Download Video
                      </a>
                    </Button>
                  </div>
                  <video src={outputVideo} controls className="w-full rounded-2xl border border-border/40" />
                </div>
              ) : null}

              {!job && !error ? (
                <div className="rounded-2xl border border-border/40 bg-background/60 p-4 text-sm text-muted-foreground">
                  Start a run and the step-by-step status will show here.
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PapparaziLab;
