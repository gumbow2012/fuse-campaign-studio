import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import CreditConfirmModal from "@/components/CreditConfirmModal";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { runTemplate as cfRunTemplate, getPapparaziJobStatus, isCfWorkerConfigured } from "@/lib/cf-worker";
import { useQuery } from "@tanstack/react-query";
import {
  Minus, Plus, GripVertical, MoreVertical, Upload, X, Zap,
  Loader2, Download, CheckCircle2, AlertTriangle, Copy, Maximize2,
} from "lucide-react";

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
  outputs: OutputItem[];
  error?: string;
}

/* ─── Main page ─── */
const TemplateRun = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const { user, profile } = useAuth();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [runs, setRuns] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

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

  // Auto-select template from slug (template id or weavy_recipe_id)
  useEffect(() => {
    if (!templates || !slug || selectedTemplateId) return;
    const match = templates.find((t: any) => t.id === slug || t.weavy_recipe_id === slug);
    if (match) setSelectedTemplateId(match.id);
  }, [templates, slug, selectedTemplateId]);

  const template = templates?.find((t: any) => t.id === selectedTemplateId);
  const inputSchema: InputField[] = (template?.input_schema as any) || [];
  const requiredFields = inputSchema.filter((i) => i.required);
  const allRequiredUploaded = requiredFields.every((f) => files[f.key]);
  const totalCost = (template?.estimated_credits_per_run || 0) * runs;

  /* ─── Poll job status via CF Worker ─── */
  useEffect(() => {
    if (!projectId) return;
    pollingRef.current = true;

    const poll = async () => {
      if (!pollingRef.current) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;

        const status = await getPapparaziJobStatus(projectId, token);

        const outputs: OutputItem[] = [];
        if (status.outputImageUrl) outputs.push({ type: "image", url: status.outputImageUrl, label: "Image" });
        if (status.outputVideoUrl) outputs.push({ type: "video", url: status.outputVideoUrl, label: "Video" });

        const normalizedStatus =
          status.status === "succeeded" ? "complete" : status.status as ProjectResult["status"];

        setResult({
          status: normalizedStatus,
          outputs,
          error: status.error ?? undefined,
        });

        if (normalizedStatus === "queued" || normalizedStatus === "running") {
          setTimeout(poll, 3000);
        }
      } catch {
        if (pollingRef.current) setTimeout(poll, 5000);
      }
    };

    poll();
    return () => { pollingRef.current = false; };
  }, [projectId]);

  const handleRun = async () => {
    if (!user) { navigate("/auth"); return; }
    if (!template) return;
    if (!allRequiredUploaded) {
      toast({ title: "Missing uploads", description: "Please upload all required files.", variant: "destructive" });
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

      // Upload files to storage
      const inputs: Record<string, string> = {};
      for (const field of inputSchema) {
        const f = files[field.key];
        if (f) inputs[field.key] = await uploadToStorage(user.id, field.key, f);
      }

      // Call CF Worker /api/run-template with Bearer token
      const response = await cfRunTemplate({ templateId: template.id, inputs }, token);

      if (response.error) throw new Error(response.error);

      const jobId = response.jobId;
      if (!jobId) throw new Error("No job ID returned from worker");

      // Start polling via CF Worker
      setProjectId(jobId);
      setResult({ status: "queued", outputs: [] });
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
      {!isCfWorkerConfigured && (
        <div className="mx-4 mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-destructive">Backend Not Connected</p>
            <p className="text-xs text-muted-foreground mt-1">
              The worker URL is not configured. Please add <code className="bg-muted px-1 py-0.5 rounded text-[10px]">VITE_CF_WORKER_URL</code> in your environment settings and redeploy.
            </p>
          </div>
        </div>
      )}

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
                  inputSchema.map((field) => (
                    <UploadZone
                      key={field.key}
                      label={field.label}
                      required={field.required}
                      file={files[field.key] || null}
                      onFile={(f) => setFiles((prev) => ({ ...prev, [field.key]: f }))}
                    />
                  ))
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
                    disabled={!allRequiredUploaded || loading || isRunning}
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
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {result?.status === "queued" ? "Queued..." : "Generating your assets..."}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">This may take a few minutes</p>
                </div>
              </div>
            </div>
          )}

          {/* Failed state */}
          {isFailed && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center space-y-4 max-w-sm">
                <AlertTriangle className="w-10 h-10 text-destructive-foreground mx-auto" />
                <p className="text-sm font-bold text-foreground">Generation Failed</p>
                <p className="text-xs text-muted-foreground">{result?.error || "Something went wrong."}</p>
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
