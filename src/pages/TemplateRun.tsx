import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import CreditConfirmModal from "@/components/CreditConfirmModal";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  Minus, Plus, GripVertical, MoreVertical, Upload, X, Zap,
  Loader2, Download, CheckCircle2, AlertTriangle, Copy, Maximize2,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

/* ─── Storage upload helper ─── */
const uploadToStorage = async (userId: string, fieldKey: string, file: File): Promise<string> => {
  const ext = file.name.split(".").pop() || "png";
  const path = `${userId}/${Date.now()}-${fieldKey}.${ext}`;
  const { error: uploadErr } = await supabase.storage.from("template-inputs").upload(path, file, { upsert: true });
  if (uploadErr) throw new Error(`Upload failed for ${fieldKey}: ${uploadErr.message}`);
  const { data: signedData, error: signErr } = await supabase.storage.from("template-inputs").createSignedUrl(path, 3600);
  if (signErr || !signedData?.signedUrl) throw new Error(`Could not get URL for ${fieldKey}`);
  return signedData.signedUrl;
};

/* ─── File node header (Weavy-style) ─── */
const FileNodeHeader = () => (
  <div className="flex items-center justify-between mb-3">
    <div className="flex items-center gap-2">
      <GripVertical className="w-3.5 h-3.5 text-foreground/20" />
      <span className="text-[9px] font-black tracking-[0.15em] uppercase bg-primary/80 text-primary-foreground px-2.5 py-0.5 rounded">File</span>
      <div className="flex-1 h-px bg-gradient-to-r from-primary/30 to-transparent ml-1 min-w-[60px]" />
    </div>
    <MoreVertical className="w-3.5 h-3.5 text-foreground/25" />
  </div>
);

/* ─── Upload zone ─── */
interface UploadZoneProps {
  label: string;
  required: boolean;
  file: File | null;
  onFile: (file: File | null) => void;
}

const UploadZone = ({ label, required, file, onFile }: UploadZoneProps) => {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("image/")) onFile(f);
  }, [onFile]);

  const handleClick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) onFile(f);
    };
    input.click();
  };

  return (
    <div>
      <FileNodeHeader />
      <div className="h-px bg-gradient-to-r from-foreground/[0.06] to-transparent mb-2" />
      <label className="text-[9px] font-black uppercase tracking-[0.25em] text-foreground/70 mb-2 block">
        {label} {required && <span className="text-destructive-foreground">*</span>}
      </label>
      {file ? (
        <div className="relative border border-border rounded-lg p-3 flex items-center gap-3">
          <img src={URL.createObjectURL(file)} alt={label} className="w-14 h-14 object-cover rounded" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-foreground font-medium truncate">{file.name}</p>
            <p className="text-[10px] text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
          </div>
          <button onClick={() => onFile(null)} className="p-1 rounded hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors">
            <X size={14} />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={handleClick}
          className={`border border-dashed rounded-lg py-9 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all group ${
            dragOver ? "border-primary bg-primary/5" : "border-border hover:border-foreground/30 hover:bg-foreground/[0.02]"
          }`}
        >
          <Upload className="w-8 h-8 text-muted-foreground/30 group-hover:text-muted-foreground/50 transition-colors" />
          <p className="text-xs text-muted-foreground/50 font-medium">Drag & drop or click to upload</p>
        </div>
      )}
    </div>
  );
};

/* ─── Types ─── */
interface InputField { key: string; label: string; nodeId: string; type: string; required: boolean; }

interface OutputItem { type: string; url: string; label?: string; }
interface ProjectResult {
  status: "queued" | "running" | "complete" | "failed";
  progress: number;
  logs: string[];
  attempts: number;
  maxAttempts: number;
  outputs: OutputItem[];
  error?: string;
}

/* ─── Main page ─── */
const TemplateRun = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const queryTemplateId = searchParams.get("templateId");
  const { user, profile } = useAuth();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [textInputs, setTextInputs] = useState<Record<string, string>>({});
  const [runs, setRuns] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  // Result state (inline, no navigation)
  const [projectId, setProjectId] = useState<string | null>(null);
  const [result, setResult] = useState<ProjectResult | null>(null);
  const pollingRef = useRef(false);

  // Load templates from DB
  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ["active-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("templates")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Auto-select template from slug or query param
  useEffect(() => {
    if (!templates || selectedTemplateId) return;
    if (queryTemplateId) {
      const match = templates.find((t: any) => t.id === queryTemplateId);
      if (match) { setSelectedTemplateId(match.id); return; }
    }
    if (slug) {
      const match = templates.find((t: any) => t.id === slug || t.weavy_recipe_id === slug);
      if (match) setSelectedTemplateId(match.id);
    }
  }, [templates, slug, queryTemplateId, selectedTemplateId]);

  const template = templates?.find((t: any) => t.id === selectedTemplateId);
  const inputSchema: InputField[] = (template?.input_schema as any) || [];
  const imageFields = inputSchema.filter((i) => i.type === "image");
  const textFields = inputSchema.filter((i) => i.type === "text" || i.type === "prompt");
  const requiredFields = inputSchema.filter((i) => i.required);
  const allRequiredFilled = requiredFields.every((f) => {
    if (f.type === "image") return !!files[f.key];
    return !!(textInputs[f.key]?.trim());
  });
  const totalCost = (template?.estimated_credits_per_run || 0) * runs;

  /* ─── Poll job status via CF Worker /api/projects/:id ─── */
  useEffect(() => {
    if (!projectId) return;
    pollingRef.current = true;

    const cfWorkerUrl = import.meta.env.VITE_CF_WORKER_URL as string || "https://shiny-rice-e95bfuse-api.kade-fc1.workers.dev";

    const poll = async () => {
      if (!pollingRef.current) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;

        const statusRes = await fetch(
          `${cfWorkerUrl}/api/projects/${projectId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );
        const status = await statusRes.json();

        const outputs: OutputItem[] = [];
        const items = status.outputs?.items || [];
        for (const item of items) {
          outputs.push({ type: item.type || "image", url: item.url, label: item.label });
        }

        const normalizedStatus =
          status.status === "succeeded" ? "complete" : status.status as ProjectResult["status"];

        setResult({
          status: normalizedStatus,
          progress: status.progress ?? 0,
          logs: status.logs ?? [],
          attempts: status.attempts ?? 0,
          maxAttempts: status.maxAttempts ?? 3,
          outputs,
          error: status.error ?? undefined,
        });

        if (normalizedStatus === "queued" || normalizedStatus === "running") {
          setTimeout(poll, 2000);
        }
      } catch {
        if (pollingRef.current) setTimeout(poll, 4000);
      }
    };

    poll();
    return () => { pollingRef.current = false; };
  }, [projectId]);

  const handleRun = async () => {
    if (!user) { navigate("/auth"); return; }
    if (!template) return;
    if (!allRequiredFilled) {
      toast({ title: "Missing inputs", description: "Please fill all required fields.", variant: "destructive" });
      return;
    }
    setShowConfirm(true);
  };

  const executeRun = async () => {
    setShowConfirm(false);
    setLoading(true);
    setResult(null);
    setProjectId(null);
    try {
      if (!user || !template) throw new Error("Not authenticated");

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated – no session token");

      // Build inputs: upload files + include text inputs
      const inputs: Record<string, string> = {};
      for (const field of inputSchema) {
        if (field.type === "image") {
          const f = files[field.key];
          if (f) inputs[field.key] = await uploadToStorage(user.id, field.key, f);
        } else {
          const val = textInputs[field.key]?.trim();
          if (val) inputs[field.key] = val;
        }
      }

      // Call run-template edge function (handles credits + Weavy trigger)
      const { data: runData, error: runErr } = await supabase.functions.invoke("run-template", {
        body: { templateId: template.id, inputs },
      });

      if (runErr) throw new Error(runErr.message || "Run template failed");
      if (runData?.error) throw new Error(runData.error);

      const jobId = runData?.projectId;
      if (!jobId) throw new Error("No job ID returned");

      // Start polling via edge function
      setProjectId(jobId);
      setResult({ status: "queued", progress: 0, logs: [], attempts: 0, maxAttempts: 3, outputs: [] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleRerun = () => {
    setResult(null);
    setProjectId(null);
    setShowConfirm(true);
  };

  const isRunning = result?.status === "queued" || result?.status === "running";
  const isComplete = result?.status === "complete";
  const isFailed = result?.status === "failed";
  const hasResult = !!result;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 flex flex-col lg:flex-row pt-16">
        {/* ════════ LEFT PANEL — Upload + Controls ════════ */}
        <div className="w-full lg:w-[360px] border-r border-border/30 flex flex-col bg-card/50">
          {/* Template selector (compact) */}
          {!template && (
            <div className="p-4 border-b border-border/20 flex-1 overflow-y-auto">
              <h3 className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground mb-3">Select Template</h3>
              {templatesLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
                  <Loader2 size={14} className="animate-spin" /> Loading...
                </div>
              ) : (
                <div className="space-y-1.5">
                  {templates?.map((t: any) => (
                    <button
                      key={t.id}
                      onClick={() => { setSelectedTemplateId(t.id); setFiles({}); setResult(null); setProjectId(null); }}
                      className="w-full text-left rounded-lg border border-border/20 p-3 hover:border-border/50 hover:bg-foreground/[0.02] transition-all"
                    >
                      <p className="text-xs font-bold text-foreground">{t.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {t.category || "General"} · {t.estimated_credits_per_run} credits
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Upload zones + controls when template selected */}
          {template && (
            <>
              {/* Upload zones */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {inputSchema.length > 0 ? (
                  <>
                    {inputSchema.filter(f => f.type === "image").map((field) => (
                      <UploadZone
                        key={field.key}
                        label={field.label}
                        required={field.required}
                        file={files[field.key] || null}
                        onFile={(f) => setFiles((prev) => ({ ...prev, [field.key]: f }))}
                      />
                    ))}
                    {inputSchema.filter(f => f.type === "text" || f.type === "prompt").map((field) => (
                      <div key={field.key}>
                        <label className="text-[9px] font-black uppercase tracking-[0.25em] text-foreground/70 mb-2 block">
                          {field.label} {field.required && <span className="text-destructive-foreground">*</span>}
                        </label>
                        {field.type === "prompt" ? (
                          <textarea
                            value={textInputs[field.key] || ""}
                            onChange={(e) => setTextInputs((prev) => ({ ...prev, [field.key]: e.target.value }))}
                            placeholder={`Enter ${field.label.toLowerCase()}...`}
                            rows={3}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                          />
                        ) : (
                          <input
                            type="text"
                            value={textInputs[field.key] || ""}
                            onChange={(e) => setTextInputs((prev) => ({ ...prev, [field.key]: e.target.value }))}
                            placeholder={`Enter ${field.label.toLowerCase()}...`}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          />
                        )}
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="py-12 text-center">
                    <p className="text-xs text-muted-foreground/50">No file inputs required</p>
                  </div>
                )}
              </div>

              {/* Bottom controls — Runs + Cost + Run/Re-run button */}
              <div className="border-t border-border/20 p-4 space-y-3 bg-card/80">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-foreground font-medium">Runs</span>
                  <div className="h-7 bg-secondary/40 border border-border rounded-md flex items-center px-0.5">
                    <button onClick={() => setRuns((r) => Math.max(1, r - 1))} className="w-6 h-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-6 text-center text-xs font-bold text-foreground">{runs}</span>
                    <button onClick={() => setRuns((r) => r + 1)} className="w-6 h-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground/60 font-medium">Total cost</span>
                  <span className="text-[10px] text-muted-foreground/80 font-bold">
                    <Zap size={10} className="inline text-primary mr-0.5" />
                    {totalCost} credits
                  </span>
                </div>

                {hasResult && !isRunning ? (
                  <Button
                    onClick={handleRerun}
                    className="w-full bg-[hsl(60,80%,70%)] hover:bg-[hsl(60,80%,65%)] text-[hsl(222,47%,6%)] font-black text-xs tracking-[0.15em] rounded-md h-10 transition-all uppercase"
                  >
                    Re-run
                  </Button>
                ) : (
                  <Button
                    onClick={handleRun}
                    disabled={!allRequiredFilled || loading || isRunning}
                    className="w-full gradient-primary text-primary-foreground font-black text-xs tracking-[0.25em] rounded-md h-10 glow-blue hover:opacity-90 active:scale-[0.98] transition-all border-0 uppercase disabled:opacity-40"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Uploading...</span>
                    ) : isRunning ? (
                      <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Running...</span>
                    ) : (
                      "RUN"
                    )}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>

        {/* ════════ RIGHT PANEL — Output / Results ════════ */}
        <div className="flex-1 flex flex-col bg-background min-h-0">
          {!hasResult && (
            <div className="flex-1 flex items-center justify-center text-center p-8">
              <div>
                <div className="w-16 h-16 rounded-2xl bg-secondary/30 flex items-center justify-center mx-auto mb-4">
                  <Upload className="w-7 h-7 text-muted-foreground/30" />
                </div>
                <p className="text-sm font-medium text-muted-foreground/50">Upload your files and hit Run</p>
                <p className="text-[10px] text-muted-foreground/30 mt-1">Output will appear here</p>
              </div>
            </div>
          )}

          {/* Running state */}
          {isRunning && (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <div className="text-center space-y-5 w-full max-w-sm">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {result?.status === "queued" ? "Queued..." : "Generating your assets..."}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Attempt {result?.attempts ?? 0}/{result?.maxAttempts ?? 3} · This may take a few minutes
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Progress value={result?.progress ?? 0} className="h-2" />
                  <p className="text-[10px] text-muted-foreground font-mono">{result?.progress ?? 0}%</p>
                </div>

                {/* Live logs */}
                {(result?.logs?.length ?? 0) > 0 && (
                  <div className="w-full text-left">
                    <button
                      onClick={() => setShowLogs((v) => !v)}
                      className="text-[10px] text-muted-foreground hover:text-foreground font-mono mb-1"
                    >
                      {showLogs ? "▼" : "►"} Logs ({result!.logs.length})
                    </button>
                    {showLogs && (
                      <div className="bg-secondary/40 rounded-md p-2 max-h-40 overflow-y-auto">
                        {result!.logs.map((log, i) => (
                          <p key={i} className="text-[9px] font-mono text-muted-foreground leading-relaxed">{log}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Failed state */}
          {isFailed && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center space-y-4 max-w-sm w-full">
                <AlertTriangle className="w-10 h-10 text-destructive-foreground mx-auto" />
                <p className="text-sm font-bold text-foreground">Generation Failed</p>
                <p className="text-xs text-muted-foreground">{result?.error || "Something went wrong."}</p>
                {result?.attempts && result.attempts > 1 && (
                  <p className="text-[10px] text-muted-foreground">
                    Failed after {result.attempts} attempt{result.attempts !== 1 ? "s" : ""}
                  </p>
                )}
                {(result?.logs?.length ?? 0) > 0 && (
                  <div className="text-left">
                    <button
                      onClick={() => setShowLogs((v) => !v)}
                      className="text-[10px] text-muted-foreground hover:text-foreground font-mono mb-1"
                    >
                      {showLogs ? "▼" : "►"} Logs ({result!.logs.length})
                    </button>
                    {showLogs && (
                      <div className="bg-secondary/40 rounded-md p-2 max-h-40 overflow-y-auto">
                        {result!.logs.map((log, i) => (
                          <p key={i} className="text-[9px] font-mono text-muted-foreground leading-relaxed">{log}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Complete — show outputs */}
          {isComplete && result && result.outputs.length > 0 && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Output header */}
              <div className="px-5 py-3 border-b border-border/20 flex items-center justify-between shrink-0">
                <div>
                  <p className="text-xs font-bold text-foreground">Output</p>
                  <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                    {result.outputs.length} asset{result.outputs.length !== 1 ? "s" : ""} generated
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
                    <Copy size={14} />
                  </Button>
                  <a
                    href={result.outputs[0]?.url}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
                      <Download size={14} />
                    </Button>
                  </a>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
                    <MoreVertical size={14} />
                  </Button>
                </div>
              </div>

              {/* Output content */}
              <div className="flex-1 overflow-y-auto p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {result.outputs.map((output, i) => (
                    <div key={i} className="rounded-xl border border-border/30 bg-card overflow-hidden group">
                      {output.type === "video" ? (
                        <video
                          src={output.url}
                          controls
                          className="w-full aspect-video object-cover bg-secondary/50"
                        />
                      ) : (
                        <div className="relative">
                          <img
                            src={output.url}
                            alt={output.label || `Asset ${i + 1}`}
                            className="w-full aspect-square object-cover bg-secondary/50"
                          />
                          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                            <a href={output.url} download target="_blank" rel="noopener noreferrer">
                              <button className="w-7 h-7 rounded-md bg-background/80 backdrop-blur-sm flex items-center justify-center text-foreground hover:bg-background transition-colors">
                                <Download size={12} />
                              </button>
                            </a>
                            <a href={output.url} target="_blank" rel="noopener noreferrer">
                              <button className="w-7 h-7 rounded-md bg-background/80 backdrop-blur-sm flex items-center justify-center text-foreground hover:bg-background transition-colors">
                                <Maximize2 size={12} />
                              </button>
                            </a>
                          </div>
                        </div>
                      )}
                      <div className="px-3 py-2 flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          {output.label || `Asset ${i + 1}`}
                        </span>
                        <a href={output.url} download target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="ghost" className="h-6 text-[10px] text-muted-foreground hover:text-foreground px-2">
                            <Download size={10} className="mr-1" /> Download
                          </Button>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Complete but no outputs */}
          {isComplete && result && result.outputs.length === 0 && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center space-y-3">
                <CheckCircle2 className="w-10 h-10 text-primary mx-auto" />
                <p className="text-sm font-bold text-foreground">Complete</p>
                <p className="text-xs text-muted-foreground">Job finished but no output assets were found.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <CreditConfirmModal
        open={showConfirm}
        onOpenChange={setShowConfirm}
        creditCost={totalCost}
        currentBalance={profile?.credits_balance ?? 0}
        actionLabel="Run Template"
        onConfirm={executeRun}
      />
    </div>
  );
};

export default TemplateRun;
