import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { templateConfigs, type TemplateConfig, type TemplateInput } from "@/lib/template-configs";
import {
  Minus, Plus, Upload, X, Zap, ChevronDown,
  Loader2, Download, CheckCircle2, AlertTriangle,
  Image as ImageIcon, Film,
} from "lucide-react";

/* ─── Constants ─── */
const WORKER = "https://shiny-rice-e95bfuse-api.kade-fc1.workers.dev";
const API_KEY = "fuse_sk_live_k4d3m4dd3n2025xQ9zPv7";
const USER_ID = "7a20bd20-b93b-4742-a502-07648cb834e6";

/* ─── Upload card ─── */
interface UploadCardProps {
  input: TemplateInput;
  file: File | null;
  uploaded: { assetKey: string; assetUrl: string } | null;
  onFile: (f: File | null) => void;
}

const UploadCard = ({ input, file, uploaded, onFile }: UploadCardProps) => {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("image/")) onFile(f);
  }, [onFile]);

  const handleClick = () => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.onchange = (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) onFile(f);
    };
    inp.click();
  };

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 backdrop-blur-sm p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-black tracking-[0.15em] uppercase bg-primary/20 text-primary px-2.5 py-0.5 rounded">
          FILE
        </span>
        <div className="flex-1 h-px bg-border/20" />
        {input.required && (
          <span className="text-[8px] font-bold uppercase tracking-wider text-primary/60 bg-primary/10 px-1.5 py-0.5 rounded">
            Required
          </span>
        )}
      </div>

      {/* Label */}
      <p className="text-[10px] font-black uppercase tracking-[0.25em] text-foreground/60">
        {input.label}
      </p>

      {/* Upload zone or preview */}
      {file ? (
        <div className={`relative rounded-lg border p-3 flex items-center gap-3 transition-all ${
          uploaded ? "border-green-500/40 bg-green-500/[0.04]" : "border-primary/30 bg-primary/[0.03]"
        }`}>
          <img
            src={URL.createObjectURL(file)}
            alt={input.label}
            className="w-14 h-14 object-cover rounded-lg ring-1 ring-border/30"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">{file.name}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {(file.size / 1024).toFixed(0)} KB · {file.type.split("/")[1]?.toUpperCase()}
            </p>
            {uploaded && (
              <p className="text-[9px] text-green-400 font-bold mt-0.5 flex items-center gap-1">
                <CheckCircle2 size={10} /> Uploaded
              </p>
            )}
          </div>
          <button
            onClick={() => onFile(null)}
            className="p-1.5 rounded-lg bg-secondary/60 hover:bg-destructive/20 text-muted-foreground hover:text-foreground transition-all"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={handleClick}
          className={`rounded-lg border-2 border-dashed py-10 flex flex-col items-center justify-center gap-2.5 cursor-pointer transition-all duration-200 group ${
            dragOver
              ? "border-primary bg-primary/[0.06] scale-[1.01]"
              : "border-border/30 hover:border-primary/40 hover:bg-foreground/[0.015]"
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-secondary/40 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
            <ImageIcon className="w-5 h-5 text-muted-foreground/30 group-hover:text-primary/60 transition-colors" />
          </div>
          <p className="text-xs text-muted-foreground/40 group-hover:text-muted-foreground/60 transition-colors">
            Drop image or <span className="text-primary/70 underline underline-offset-2">browse</span>
          </p>
          <p className="text-[9px] text-muted-foreground/25">PNG, JPG up to 10MB</p>
        </div>
      )}
    </div>
  );
};

/* ─── Debug accordion ─── */
const DebugSection = ({ title, data, color = "text-primary" }: { title: string; data: any; color?: string }) => {
  const [open, setOpen] = useState(false);
  if (!data) return null;
  return (
    <div className="border border-border/20 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>{title}</span>
        <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <pre className={`px-3 pb-3 text-[10px] font-mono ${color} overflow-auto max-h-60 leading-relaxed`}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
};

/* ─── Media helpers ─── */
function isMedia(url: string) {
  const l = url.toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|svg)/.test(l)) return "image";
  if (/\.(mp4|webm|mov)/.test(l)) return "video";
  return null;
}

function extractOutputUrls(outputs: any): string[] {
  if (!outputs) return [];
  const urls: string[] = [];

  // Handle { items: [{ type, url }] } from the runner
  if (outputs.items && Array.isArray(outputs.items)) {
    for (const item of outputs.items) {
      if (item?.url && typeof item.url === "string") urls.push(item.url);
    }
    if (urls.length > 0) return urls;
  }

  // Fallback: scan all values recursively
  const scan = (obj: unknown) => {
    if (typeof obj === "string" && obj.startsWith("http")) urls.push(obj);
    else if (Array.isArray(obj)) obj.forEach(scan);
    else if (obj && typeof obj === "object") Object.values(obj).forEach(scan);
  };
  scan(outputs);
  return urls;
}

/* ═══════════════════════════════════════════════════════════ */
/* ═══ MAIN PAGE ════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════ */
const TemplateRun = () => {
  const [searchParams] = useSearchParams();
  const queryTemplateId = searchParams.get("templateId");

  // Find initial template from URL param
  const initialTemplate = queryTemplateId
    ? templateConfigs.find((t) => t.templateId === queryTemplateId) || templateConfigs[0]
    : templateConfigs[0];

  const [selectedTemplate, setSelectedTemplate] = useState<TemplateConfig>(initialTemplate);
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, File | null>>({});
  const [uploadedAssets, setUploadedAssets] = useState<Record<string, { assetKey: string; assetUrl: string } | null>>({});
  const [runs, setRuns] = useState(1);

  // Execution state
  const [isRunning, setIsRunning] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [stepLogs, setStepLogs] = useState<string[]>([]);

  // Debug state
  const [uploadDebug, setUploadDebug] = useState<any[]>([]);
  const [runTemplateDebug, setRunTemplateDebug] = useState<any>(null);
  const [enqueueDebug, setEnqueueDebug] = useState<any>(null);
  const [pollDebug, setPollDebug] = useState<any>(null);

  const pollingRef = useRef(false);

  // Reset everything when template changes
  const switchTemplate = (t: TemplateConfig) => {
    pollingRef.current = false;
    setSelectedTemplate(t);
    setUploadedFiles({});
    setUploadedAssets({});
    setIsRunning(false);
    setProjectId(null);
    setStatus(null);
    setOutputs(null);
    setError(null);
    setUploadDebug([]);
    setRunTemplateDebug(null);
    setEnqueueDebug(null);
    setPollDebug(null);
  };

  // Check all required files selected
  const allRequiredFilled = selectedTemplate.inputs
    .filter((i) => i.required)
    .every((i) => !!uploadedFiles[i.key]);

  const totalCost = selectedTemplate.credits * runs;

  // ─── Polling ───
  useEffect(() => {
    if (!projectId) return;
    pollingRef.current = true;

    const poll = async () => {
      if (!pollingRef.current) return;
      try {
        const res = await fetch(`${WORKER}/api/projects/${projectId}`, {
          headers: { "X-Api-Key": API_KEY, "X-User-Id": USER_ID },
        });
        const raw = await res.text();
        let parsed: any = null;
        try { parsed = JSON.parse(raw); } catch {}

        setPollDebug({ url: `${WORKER}/api/projects/${projectId}`, status: res.status, parsed });

        const st = parsed?.status;
        setStatus(st);
        setProgress(parsed?.progress ?? 0);

        if (st === "complete") {
          pollingRef.current = false;
          setOutputs(parsed?.outputs);
          setIsRunning(false);
        } else if (st === "failed") {
          pollingRef.current = false;
          setError(parsed?.error || "Job failed");
          setIsRunning(false);
        } else {
          setTimeout(poll, 3000);
        }
      } catch {
        if (pollingRef.current) setTimeout(poll, 4000);
      }
    };

    poll();
    return () => { pollingRef.current = false; };
  }, [projectId]);

  // ─── Execute the 4-step flow ───
  const handleRun = async () => {
    if (!allRequiredFilled) return;

    setIsRunning(true);
    setStatus(null);
    setOutputs(null);
    setError(null);
    setProgress(0);
    setUploadDebug([]);
    setRunTemplateDebug(null);
    setEnqueueDebug(null);
    setPollDebug(null);
    setProjectId(null);

    try {
      // Step 1: Upload each file
      const assetResults: Record<string, { assetKey: string; assetUrl: string }> = {};
      const debugEntries: any[] = [];

      for (const input of selectedTemplate.inputs) {
        const file = uploadedFiles[input.key];
        if (!file) continue;

        const fd = new FormData();
        fd.append("file", file);
        const url = `${WORKER}/api/uploads`;

        const res = await fetch(url, {
          method: "POST",
          headers: { "X-Api-Key": API_KEY, "X-User-Id": USER_ID },
          body: fd,
        });

        const rawText = await res.text();
        let parsed: any = null;
        try { parsed = JSON.parse(rawText); } catch {}

        const entry = { inputKey: input.key, url, method: "POST", status: res.status, rawText, parsed };
        debugEntries.push(entry);
        setUploadDebug([...debugEntries]);

        if (!parsed?.ok || !parsed?.assetKey) {
          throw new Error(`Upload failed for ${input.label}. Status: ${res.status}`);
        }

        assetResults[input.key] = { assetKey: parsed.assetKey, assetUrl: parsed.assetUrl };
        setUploadedAssets((prev) => ({ ...prev, [input.key]: { assetKey: parsed.assetKey, assetUrl: parsed.assetUrl } }));
      }

      // Step 2: Call run-template edge function
      const inputs: Record<string, string> = {};
      for (const [key, asset] of Object.entries(assetResults)) {
        inputs[key] = asset.assetUrl;
        inputs[`${key}_key`] = asset.assetKey;
      }

      const runBody = { templateId: selectedTemplate.templateId, inputs };

      const { data: rtData, error: rtError } = await supabase.functions.invoke("run-template", {
        body: runBody,
      });

      setRunTemplateDebug({
        functionName: "run-template",
        requestBody: runBody,
        response: rtData,
        error: rtError ? { message: rtError.message, name: rtError.name } : null,
      });

      if (rtError || !rtData?.projectId) {
        throw new Error(`run-template failed: ${rtError?.message || JSON.stringify(rtData)}`);
      }

      const pId = rtData.projectId;

      // Step 3: Enqueue
      const enqueueUrl = `${WORKER}/api/enqueue`;
      const enqueueBody = { projectId: pId };

      const enqRes = await fetch(enqueueUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": API_KEY,
          "X-User-Id": USER_ID,
        },
        body: JSON.stringify(enqueueBody),
      });

      const enqRaw = await enqRes.text();
      let enqParsed: any = null;
      try { enqParsed = JSON.parse(enqRaw); } catch {}

      setEnqueueDebug({
        url: enqueueUrl,
        method: "POST",
        requestBody: enqueueBody,
        status: enqRes.status,
        rawText: enqRaw,
        parsed: enqParsed,
      });

      // Step 4: Start polling
      setProjectId(pId);
      setStatus("queued");

    } catch (err: any) {
      setError(err.message);
      setIsRunning(false);
    }
  };

  const outputUrls = extractOutputUrls(outputs);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <div className="flex-1 flex flex-col lg:flex-row pt-16">
        {/* ════════ LEFT PANEL ════════ */}
        <div className="w-full lg:w-[420px] xl:w-[440px] border-r border-border/20 flex flex-col bg-card/20 backdrop-blur-sm overflow-y-auto">

          {/* Template selector */}
          <div className="px-5 pt-5 pb-3">
            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-2 block">
              Template
            </label>
            <select
              value={selectedTemplate.id}
              onChange={(e) => {
                const t = templateConfigs.find((tc) => tc.id === e.target.value);
                if (t) switchTemplate(t);
              }}
              className="w-full rounded-lg border border-border/30 bg-secondary/30 px-3 py-2.5 text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 appearance-none cursor-pointer"
            >
              {templateConfigs.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Template header */}
          <div className="px-5 pb-4">
            <h2 className="text-lg font-black text-foreground tracking-tight">{selectedTemplate.name}</h2>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {selectedTemplate.inputs.length} input{selectedTemplate.inputs.length !== 1 ? "s" : ""} required
            </p>
          </div>

          {/* Dynamic upload cards */}
          <div className="px-5 space-y-3 pb-4">
            {selectedTemplate.inputs.map((input) => (
              <UploadCard
                key={input.key}
                input={input}
                file={uploadedFiles[input.key] || null}
                uploaded={uploadedAssets[input.key] || null}
                onFile={(f) => {
                  setUploadedFiles((prev) => ({ ...prev, [input.key]: f }));
                  setUploadedAssets((prev) => ({ ...prev, [input.key]: null }));
                }}
              />
            ))}
          </div>

          {/* Runs + Cost + Run button */}
          <div className="px-5 pb-5 space-y-3 mt-auto">
            {/* Runs counter */}
            <div className="rounded-xl border border-border/20 bg-card/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Runs</span>
                <div className="h-8 bg-secondary/40 border border-border/30 rounded-lg flex items-center">
                  <button
                    onClick={() => setRuns((r) => Math.max(1, r - 1))}
                    className="w-8 h-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded-l-lg hover:bg-secondary/60"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-8 text-center text-sm font-bold text-foreground tabular-nums">{runs}</span>
                  <button
                    onClick={() => setRuns((r) => r + 1)}
                    className="w-8 h-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded-r-lg hover:bg-secondary/60"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground/50">Total cost</span>
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Zap size={11} className="text-primary" />
                  {totalCost} credits
                </span>
              </div>

              {/* Run button */}
              <button
                onClick={handleRun}
                disabled={!allRequiredFilled || isRunning}
                className="w-full gradient-primary text-primary-foreground font-black text-xs tracking-[0.25em] uppercase rounded-xl h-11 glow-blue hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-30 disabled:shadow-none flex items-center justify-center gap-2"
              >
                {isRunning ? (
                  <><Loader2 size={14} className="animate-spin" /> RUNNING…</>
                ) : (
                  <><Zap size={14} /> RUN</>
                )}
              </button>

              {/* Output estimate */}
              <div className="pt-2 border-t border-border/10 space-y-1">
                <p className="text-[8px] text-muted-foreground/30 uppercase tracking-[0.2em] font-bold">
                  Est. Output: {selectedTemplate.estimatedOutputs}
                </p>
                <p className="text-[8px] text-muted-foreground/20 uppercase tracking-[0.15em]">
                  Includes: {selectedTemplate.includes.join(" / ")}
                </p>
              </div>
            </div>

            {/* Debug accordion */}
            {(uploadDebug.length > 0 || runTemplateDebug || enqueueDebug || pollDebug) && (
              <div className="space-y-1.5">
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40 px-1">Debug</p>
                <DebugSection title="Upload Debug" data={uploadDebug.length > 0 ? uploadDebug : null} color="text-green-400" />
                <DebugSection title="Run-Template Debug" data={runTemplateDebug} color="text-orange-400" />
                <DebugSection title="Enqueue Debug" data={enqueueDebug} color="text-yellow-400" />
                <DebugSection title="Poll Debug" data={pollDebug} color="text-cyan-400" />
              </div>
            )}
          </div>
        </div>

        {/* ════════ RIGHT PANEL ════════ */}
        <div className="flex-1 flex flex-col bg-background min-h-0">

          {/* No result yet — show preview */}
          {!status && !error && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="relative max-w-lg w-full">
                <div className="aspect-[4/3] rounded-2xl border border-border/20 bg-secondary/20 overflow-hidden flex items-center justify-center">
                  {selectedTemplate.previewImage !== "/placeholder.svg" ? (
                    <img
                      src={selectedTemplate.previewImage}
                      alt={selectedTemplate.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center space-y-3">
                      <div className="w-16 h-16 rounded-2xl bg-secondary/30 flex items-center justify-center mx-auto">
                        <ImageIcon className="w-8 h-8 text-muted-foreground/15" />
                      </div>
                      <p className="text-sm font-semibold text-muted-foreground/30">Preview</p>
                    </div>
                  )}
                </div>
                {/* Badge */}
                <div className="absolute bottom-4 right-4 bg-background/80 backdrop-blur-sm border border-border/30 rounded-lg px-3 py-1.5">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
                    Example Output
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Running */}
          {(status === "queued" || status === "running") && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center space-y-6 max-w-xs w-full">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {status === "queued" ? "Queued…" : "Generating your assets…"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">This may take a few minutes</p>
                </div>

                {/* Progress bar */}
                <div className="space-y-2">
                  <div className="relative h-2 w-full rounded-full bg-secondary overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-lg font-black text-foreground tabular-nums">{progress}%</p>
                </div>
              </div>
            </div>
          )}

          {/* Failed */}
          {status === "failed" && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center space-y-4 max-w-sm w-full">
                <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-7 h-7 text-destructive" />
                </div>
                <p className="text-sm font-bold text-foreground">Generation Failed</p>
                <p className="text-xs text-muted-foreground">{error || "Something went wrong."}</p>
              </div>
            </div>
          )}

          {/* Error without status (upload/enqueue error) */}
          {error && !status && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center space-y-4 max-w-sm w-full">
                <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-7 h-7 text-destructive" />
                </div>
                <p className="text-sm font-bold text-foreground">Error</p>
                <p className="text-xs text-muted-foreground break-all">{error}</p>
              </div>
            </div>
          )}

          {/* Complete — show outputs */}
          {status === "complete" && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="px-5 py-3 border-b border-border/20 flex items-center justify-between shrink-0">
                <div>
                  <p className="text-xs font-bold text-foreground flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-green-400" /> Output Ready
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                    {outputUrls.length} asset{outputUrls.length !== 1 ? "s" : ""} · {totalCost} credits
                  </p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                {outputUrls.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {outputUrls.map((url, i) => {
                      const type = isMedia(url);
                      return (
                        <div key={i} className="rounded-xl border border-border/30 bg-card overflow-hidden group">
                          {type === "video" ? (
                            <video src={url} controls className="w-full aspect-video object-cover bg-secondary/50" />
                          ) : (
                            <div className="relative">
                              <img src={url} alt={`Asset ${i + 1}`} className="w-full aspect-square object-cover bg-secondary/50" />
                              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <a href={url} target="_blank" rel="noreferrer">
                                  <button className="w-7 h-7 rounded-md bg-background/80 backdrop-blur-sm flex items-center justify-center text-foreground hover:bg-background transition-colors">
                                    <Download size={12} />
                                  </button>
                                </a>
                              </div>
                            </div>
                          )}
                          <div className="px-3 py-2">
                            <a href={url} target="_blank" rel="noreferrer" className="text-[10px] text-primary/70 hover:text-primary font-mono break-all">
                              {url}
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <CheckCircle2 className="w-10 h-10 text-primary mx-auto mb-3" />
                    <p className="text-sm font-bold text-foreground">Complete</p>
                    <p className="text-xs text-muted-foreground mt-1">No output assets found in the response.</p>
                    {outputs && (
                      <pre className="mt-4 text-left text-[10px] font-mono text-muted-foreground bg-secondary/30 rounded-lg p-4 max-h-60 overflow-auto">
                        {JSON.stringify(outputs, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TemplateRun;
