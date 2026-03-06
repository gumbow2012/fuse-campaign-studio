import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import Navbar from "@/components/Navbar";
import {
  listTemplates,
  uploadFile,
  createProject,
  enqueueProject,
  getProjectStatus,
  type Template,
  type InputField,
  type ProjectStatus,
} from "@/lib/api";
import {
  X, Zap, Loader2, Download, CheckCircle2,
  AlertTriangle, Image as ImageIcon, ArrowLeft, Sparkles,
} from "lucide-react";

/* ─── Upload card ─── */
const FileUploadCard = ({
  input,
  file,
  uploaded,
  onFile,
}: {
  input: InputField;
  file: File | null;
  uploaded: boolean;
  onFile: (f: File | null) => void;
}) => {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f && f.type.startsWith("image/")) onFile(f);
    },
    [onFile]
  );

  const browse = () => {
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
    <div className="rounded-xl border border-border/30 bg-card/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-black tracking-[0.15em] uppercase bg-primary/20 text-primary px-2.5 py-0.5 rounded">
          FILE
        </span>
        <div className="flex-1 h-px bg-border/20" />
        {input.required !== false && (
          <span className="text-[8px] font-bold uppercase tracking-wider text-primary/60 bg-primary/10 px-1.5 py-0.5 rounded">
            Required
          </span>
        )}
      </div>

      <p className="text-[10px] font-black uppercase tracking-[0.25em] text-foreground/60">
        {input.label}
      </p>

      {file ? (
        <div
          className={`relative rounded-lg border p-3 flex items-center gap-3 transition-all ${
            uploaded ? "border-green-500/40 bg-green-500/[0.04]" : "border-primary/30 bg-primary/[0.03]"
          }`}
        >
          <img
            src={URL.createObjectURL(file)}
            alt={input.label}
            className="w-14 h-14 object-cover rounded-lg ring-1 ring-border/30"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">{file.name}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {(file.size / 1024).toFixed(0)} KB
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
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={browse}
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
            Drop image or{" "}
            <span className="text-primary/70 underline underline-offset-2">browse</span>
          </p>
          <p className="text-[9px] text-muted-foreground/25">PNG, JPG up to 10 MB</p>
        </div>
      )}
    </div>
  );
};

/* ─── Media helpers ─── */
function mediaType(url: string): "image" | "video" | null {
  const l = url.toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|svg)/.test(l)) return "image";
  if (/\.(mp4|webm|mov)/.test(l)) return "video";
  return null;
}

function extractUrls(outputs: ProjectStatus["outputs"]): string[] {
  if (!outputs?.items) return [];
  return outputs.items.map((i) => i.url).filter(Boolean);
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */
const RunTemplate = () => {
  const { templateId } = useParams<{ templateId: string }>();

  // Fetch template
  const { data: allTemplates } = useQuery({
    queryKey: ["templates"],
    queryFn: listTemplates,
  });

  const template = allTemplates?.find((t) => t.id === templateId) ?? null;

  // Derive input fields from template
  const inputFields: InputField[] =
    template?.input_schema && Array.isArray(template.input_schema)
      ? (template.input_schema as InputField[])
      : [{ key: "image", label: "Image", type: "image", required: true }];

  // File state
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [uploadedKeys, setUploadedKeys] = useState<Record<string, { key: string; url: string }>>({});

  // Execution state
  const [running, setRunning] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef(false);

  const allFilled = inputFields
    .filter((i) => i.required !== false)
    .every((i) => !!files[i.key]);

  // ─── Polling ───
  useEffect(() => {
    if (!projectId) return;
    pollingRef.current = true;

    const poll = async () => {
      if (!pollingRef.current) return;
      try {
        const s = await getProjectStatus(projectId);
        setStatus(s);

        if (s.status === "complete" || s.status === "failed") {
          pollingRef.current = false;
          setRunning(false);
          if (s.status === "failed") setError(s.error || "Job failed");
        } else {
          setTimeout(poll, 3000);
        }
      } catch {
        if (pollingRef.current) setTimeout(poll, 5000);
      }
    };

    poll();
    return () => {
      pollingRef.current = false;
    };
  }, [projectId]);

  // ─── Run handler ───
  const handleRun = async () => {
    if (!allFilled || !template) return;

    setRunning(true);
    setError(null);
    setStatus(null);
    setProjectId(null);
    setUploadedKeys({});

    try {
      // 1. Upload files
      const inputs: Record<string, string> = {};

      for (const field of inputFields) {
        const file = files[field.key];
        if (!file) continue;

        const result = await uploadFile(file);
        inputs[field.key] = result.assetUrl;
        inputs[`${field.key}_key`] = result.assetKey;
        setUploadedKeys((prev) => ({
          ...prev,
          [field.key]: { key: result.assetKey, url: result.assetUrl },
        }));
      }

      // 2. Create project
      const pId = await createProject({
        template_id: template.id,
        inputs,
      });

      // 3. Enqueue
      await enqueueProject(pId);

      // 4. Start polling
      setProjectId(pId);
      setStatus({ status: "queued", progress: 0, logs: [], outputs: null, error: null, attempts: 0, maxAttempts: 3 });
    } catch (err: any) {
      setError(err.message);
      setRunning(false);
    }
  };

  const outputUrls = status?.outputs ? extractUrls(status.outputs) : [];
  const progress = status?.progress ?? 0;
  const logs = status?.logs ?? [];

  if (!template && allTemplates) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <AlertTriangle className="w-10 h-10 text-muted-foreground/30 mx-auto" />
            <p className="text-sm text-muted-foreground">Template not found</p>
            <Link to="/app/templates" className="text-xs text-primary hover:underline">
              ← Back to templates
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <div className="flex-1 flex flex-col lg:flex-row pt-16">
        {/* ════════ LEFT PANEL ════════ */}
        <div className="w-full lg:w-[420px] xl:w-[440px] border-r border-border/20 flex flex-col bg-card/20 overflow-y-auto">
          {/* Back link + header */}
          <div className="px-5 pt-5 pb-4 space-y-3">
            <Link
              to="/app/templates"
              className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft size={12} /> Templates
            </Link>

            {template ? (
              <>
                <h2 className="text-lg font-bold text-foreground tracking-tight font-display">
                  {template.name}
                </h2>
                {template.description && (
                  <p className="text-xs text-muted-foreground">{template.description}</p>
                )}
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <Zap size={11} className="text-primary" />
                  {template.estimated_credits_per_run} credits per run
                </div>
              </>
            ) : (
              <div className="h-20 rounded-lg bg-secondary/20 animate-pulse" />
            )}
          </div>

          {/* Upload cards */}
          <div className="px-5 space-y-3 pb-4">
            {inputFields.map((input) => (
              <FileUploadCard
                key={input.key}
                input={input}
                file={files[input.key] || null}
                uploaded={!!uploadedKeys[input.key]}
                onFile={(f) => {
                  setFiles((prev) => ({ ...prev, [input.key]: f }));
                  setUploadedKeys((prev) => {
                    const next = { ...prev };
                    delete next[input.key];
                    return next;
                  });
                }}
              />
            ))}
          </div>

          {/* Run button */}
          <div className="px-5 pb-5 mt-auto">
            <button
              onClick={handleRun}
              disabled={!allFilled || running || !template}
              className="w-full gradient-primary text-primary-foreground font-black text-xs tracking-[0.25em] uppercase rounded-xl h-11 glow-blue hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-30 disabled:shadow-none flex items-center justify-center gap-2"
            >
              {running ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> RUNNING…
                </>
              ) : (
                <>
                  <Sparkles size={14} /> GENERATE
                </>
              )}
            </button>
          </div>
        </div>

        {/* ════════ RIGHT PANEL ════════ */}
        <div className="flex-1 flex flex-col bg-background min-h-0">
          {/* Idle */}
          {!status && !error && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-secondary/20 flex items-center justify-center mx-auto">
                  <ImageIcon className="w-8 h-8 text-muted-foreground/15" />
                </div>
                <p className="text-sm font-medium text-muted-foreground/30">
                  Upload assets and hit Run
                </p>
              </div>
            </div>
          )}

          {/* Running / Queued */}
          {status && (status.status === "queued" || status.status === "running") && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center space-y-6 max-w-sm w-full">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {status.status === "queued" ? "Queued…" : "Generating assets…"}
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

                {/* Logs */}
                {logs.length > 0 && (
                  <div className="w-full max-h-48 overflow-y-auto rounded-lg border border-border/20 bg-secondary/20 p-3 space-y-1.5 text-left">
                    {logs.map((log, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0 text-primary" />
                        <span className="text-[11px] font-mono text-muted-foreground leading-tight">
                          {log}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Failed */}
          {(status?.status === "failed" || (error && !status)) && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center space-y-4 max-w-sm w-full">
                <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-7 h-7 text-destructive" />
                </div>
                <p className="text-sm font-bold text-foreground">
                  {status?.status === "failed" ? "Generation Failed" : "Error"}
                </p>
                <p className="text-xs text-muted-foreground break-all">
                  {error || status?.error || "Something went wrong."}
                </p>
                {logs.length > 0 && (
                  <div className="w-full max-h-32 overflow-y-auto rounded-lg border border-border/20 bg-secondary/20 p-3 space-y-1 text-left">
                    {logs.map((log, i) => (
                      <p key={i} className="text-[10px] font-mono text-muted-foreground">{log}</p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Complete — gallery */}
          {status?.status === "complete" && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="px-5 py-3 border-b border-border/20 flex items-center justify-between shrink-0">
                <div>
                  <p className="text-xs font-bold text-foreground flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-green-400" /> Output Ready
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                    {outputUrls.length} asset{outputUrls.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                {outputUrls.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {outputUrls.map((url, i) => {
                      const type = mediaType(url);
                      return (
                        <div
                          key={i}
                          className="rounded-xl border border-border/30 bg-card overflow-hidden group"
                        >
                          {type === "video" ? (
                            <video
                              src={url}
                              controls
                              className="w-full aspect-video object-cover bg-secondary/50"
                            />
                          ) : (
                            <div className="relative">
                              <img
                                src={url}
                                alt={`Asset ${i + 1}`}
                                className="w-full aspect-square object-cover bg-secondary/50"
                              />
                              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <a href={url} target="_blank" rel="noreferrer">
                                  <button className="w-7 h-7 rounded-md bg-background/80 backdrop-blur-sm flex items-center justify-center text-foreground hover:bg-background transition-colors">
                                    <Download size={12} />
                                  </button>
                                </a>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <CheckCircle2 className="w-10 h-10 text-primary mx-auto mb-3" />
                    <p className="text-sm font-bold text-foreground">Complete</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      No output assets returned.
                    </p>
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

export default RunTemplate;
