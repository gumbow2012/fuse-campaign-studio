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
  Minus, Plus, Upload, X, Zap, ChevronLeft,
  Loader2, Download, CheckCircle2, AlertTriangle, Copy, Maximize2,
  MoreVertical, DollarSign, Sparkles, Image as ImageIcon, Film,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

/* ─── Constants ─── */
const CF_WORKER_URL = import.meta.env.VITE_CF_WORKER_URL as string || "https://shiny-rice-e95bfuse-api.kade-fc1.workers.dev";
const CREDIT_DOLLAR_VALUE = 0.098; // ~$0.098 per credit (Starter: $49/500)

/* ─── R2 upload ─── */
const uploadToR2 = async (token: string, fieldKey: string, file: File): Promise<string> => {
  const presignRes = await fetch(`${CF_WORKER_URL}/api/uploads/presign`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ filename: `${fieldKey}-${file.name}`, content_type: file.type }),
  });
  if (!presignRes.ok) throw new Error(`Presign failed: ${await presignRes.text()}`);
  const { key, upload_url } = await presignRes.json();
  const putRes = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": file.type, Authorization: `Bearer ${token}` },
    body: file,
  });
  if (!putRes.ok) throw new Error(`Upload failed: ${await putRes.text()}`);
  return key;
};

/* ─── Category icons/colors ─── */
const categoryConfig: Record<string, { color: string; icon: string }> = {
  Street: { color: "text-orange-400", icon: "🔥" },
  Editorial: { color: "text-purple-400", icon: "📸" },
  UGC: { color: "text-green-400", icon: "🤳" },
  Studio: { color: "text-blue-400", icon: "💡" },
  General: { color: "text-muted-foreground", icon: "✦" },
};

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
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/60">
          {label}
        </label>
        {required && (
          <span className="text-[8px] font-bold uppercase tracking-wider text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded">Required</span>
        )}
      </div>
      {file ? (
        <div className="relative rounded-xl border border-primary/30 bg-primary/[0.03] p-3 flex items-center gap-3 group">
          <img src={URL.createObjectURL(file)} alt={label} className="w-16 h-16 object-cover rounded-lg ring-1 ring-border" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">{file.name}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{(file.size / 1024).toFixed(0)} KB · {file.type.split("/")[1]?.toUpperCase()}</p>
          </div>
          <button
            onClick={() => onFile(null)}
            className="p-1.5 rounded-lg bg-secondary/60 hover:bg-destructive/20 text-muted-foreground hover:text-destructive-foreground transition-all"
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
          className={`relative rounded-xl border-2 border-dashed py-8 flex flex-col items-center justify-center gap-2.5 cursor-pointer transition-all duration-200 group ${
            dragOver
              ? "border-primary bg-primary/[0.06] scale-[1.01]"
              : "border-border/40 hover:border-primary/40 hover:bg-foreground/[0.015]"
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-secondary/50 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
            <ImageIcon className="w-5 h-5 text-muted-foreground/40 group-hover:text-primary/60 transition-colors" />
          </div>
          <div className="text-center">
            <p className="text-xs font-medium text-foreground/40 group-hover:text-foreground/60 transition-colors">
              Drop image or <span className="text-primary/70 underline underline-offset-2">browse</span>
            </p>
            <p className="text-[9px] text-muted-foreground/30 mt-0.5">PNG, JPG up to 10MB</p>
          </div>
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

/* ═══════════════════════════════════════════════════════════ */
/* ═══ MAIN PAGE ════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════ */
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
  const [categoryFilter, setCategoryFilter] = useState<string>("All");

  const [projectId, setProjectId] = useState<string | null>(null);
  const [result, setResult] = useState<ProjectResult | null>(null);
  const pollingRef = useRef(false);

  // Load templates
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

  // Auto-select
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

  const creditCost = template?.estimated_credits_per_run || 0;
  const totalCost = creditCost * runs;
  const dollarCost = (totalCost * CREDIT_DOLLAR_VALUE).toFixed(2);
  const balance = profile?.credits_balance ?? 0;
  const canAfford = balance >= totalCost;

  // Categories
  const categories = ["All", ...Array.from(new Set(templates?.map((t: any) => t.category || "General") || []))];
  const filteredTemplates = categoryFilter === "All"
    ? templates
    : templates?.filter((t: any) => (t.category || "General") === categoryFilter);

  /* ─── Poll job status ─── */
  useEffect(() => {
    if (!projectId) return;
    pollingRef.current = true;
    const poll = async () => {
      if (!pollingRef.current) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const statusRes = await fetch(`${CF_WORKER_URL}/api/projects/${projectId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const status = await statusRes.json();
        const outputs: OutputItem[] = (status.outputs?.items || []).map((item: any) => ({
          type: item.type || "image", url: item.url, label: item.label,
        }));
        const normalizedStatus = status.status === "succeeded" ? "complete" : status.status as ProjectResult["status"];
        setResult({
          status: normalizedStatus,
          progress: status.progress ?? 0,
          logs: status.logs ?? [],
          attempts: status.attempts ?? 0,
          maxAttempts: status.maxAttempts ?? 3,
          outputs,
          error: status.error ?? undefined,
        });
        if (normalizedStatus === "queued" || normalizedStatus === "running") setTimeout(poll, 2000);
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

      const inputs: Record<string, string> = {};
      for (const field of inputSchema) {
        if (field.type === "image") {
          const f = files[field.key];
          if (f) inputs[field.key] = await uploadToR2(token, field.key, f);
        } else {
          const val = textInputs[field.key]?.trim();
          if (val) inputs[field.key] = val;
        }
      }

      const { data: runData, error: runErr } = await supabase.functions.invoke("run-template", {
        body: { templateId: template.id, inputs },
      });
      if (runErr) throw new Error(runErr.message || "Run template failed");
      if (runData?.error) throw new Error(runData.error);
      const jobId = runData?.projectId;
      if (!jobId) throw new Error("No job ID returned");

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

        {/* ════════ LEFT PANEL ════════ */}
        <div className="w-full lg:w-[400px] xl:w-[420px] border-r border-border/20 flex flex-col bg-card/30">

          {/* ── Template selector ── */}
          {!template && (
            <div className="flex-1 overflow-y-auto">
              {/* Header */}
              <div className="sticky top-0 z-10 bg-card/80 backdrop-blur-xl border-b border-border/10 px-5 py-4">
                <h2 className="font-display text-lg font-bold text-foreground">Choose Template</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Select a campaign style to get started</p>

                {/* Category pills */}
                <div className="flex gap-1.5 mt-3 flex-wrap">
                  {categories.map((cat) => {
                    const cfg = categoryConfig[cat] || categoryConfig.General;
                    return (
                      <button
                        key={cat}
                        onClick={() => setCategoryFilter(cat)}
                        className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full transition-all ${
                          categoryFilter === cat
                            ? "bg-primary/20 text-primary border border-primary/30"
                            : "bg-secondary/40 text-muted-foreground border border-transparent hover:bg-secondary/60 hover:text-foreground"
                        }`}
                      >
                        {cat !== "All" && <span className="mr-1">{cfg.icon}</span>}
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Template grid */}
              <div className="p-4">
                {templatesLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm py-12 justify-center">
                    <Loader2 size={16} className="animate-spin" /> Loading templates...
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {filteredTemplates?.map((t: any) => {
                      const cat = t.category || "General";
                      const cfg = categoryConfig[cat] || categoryConfig.General;
                      const cost = t.estimated_credits_per_run || 0;
                      const dollarEst = (cost * CREDIT_DOLLAR_VALUE).toFixed(2);

                      return (
                        <button
                          key={t.id}
                          onClick={() => {
                            setSelectedTemplateId(t.id);
                            setFiles({});
                            setTextInputs({});
                            setResult(null);
                            setProjectId(null);
                          }}
                          className="group text-left rounded-xl border border-border/20 bg-secondary/20 hover:bg-secondary/40 hover:border-primary/30 transition-all duration-200 overflow-hidden hover:-translate-y-0.5"
                        >
                          {/* Preview area */}
                          <div className="aspect-[4/3] bg-gradient-to-br from-secondary/60 to-secondary/20 flex items-center justify-center relative overflow-hidden">
                            <div className="text-3xl opacity-30 group-hover:opacity-50 group-hover:scale-110 transition-all duration-300">
                              {cfg.icon}
                            </div>
                            {/* Category badge */}
                            <span className={`absolute top-2 left-2 text-[8px] font-black uppercase tracking-wider ${cfg.color} bg-background/70 backdrop-blur-sm px-2 py-0.5 rounded-md`}>
                              {cat}
                            </span>
                            {/* Output type */}
                            <span className="absolute top-2 right-2">
                              {t.output_type === "video" ? (
                                <Film size={12} className="text-muted-foreground/40" />
                              ) : (
                                <ImageIcon size={12} className="text-muted-foreground/40" />
                              )}
                            </span>
                          </div>

                          {/* Info */}
                          <div className="p-3 space-y-1.5">
                            <p className="text-xs font-bold text-foreground leading-tight group-hover:text-primary transition-colors">
                              {t.name}
                            </p>
                            {t.description && (
                              <p className="text-[10px] text-muted-foreground/60 leading-snug line-clamp-2">
                                {t.description}
                              </p>
                            )}
                            <div className="flex items-center justify-between pt-1">
                              <span className="flex items-center gap-1 text-[10px] font-bold text-primary/80">
                                <Zap size={10} /> {cost}
                              </span>
                              <span className="text-[9px] text-muted-foreground/40 font-medium">
                                ~${dollarEst}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Upload + controls ── */}
          {template && (
            <>
              {/* Template header */}
              <div className="px-5 py-4 border-b border-border/10 bg-card/50">
                <button
                  onClick={() => { setSelectedTemplateId(""); setFiles({}); setTextInputs({}); setResult(null); setProjectId(null); }}
                  className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors mb-3"
                >
                  <ChevronLeft size={12} /> All Templates
                </button>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-lg">
                    {categoryConfig[template.category || "General"]?.icon || "✦"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-foreground">{template.name}</h3>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {template.category || "General"} · {template.expected_output_count || 1} asset{(template.expected_output_count || 1) > 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              </div>

              {/* Upload zones */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                {inputSchema.length > 0 ? (
                  <>
                    {imageFields.map((field) => (
                      <UploadZone
                        key={field.key}
                        label={field.label}
                        required={field.required}
                        file={files[field.key] || null}
                        onFile={(f) => setFiles((prev) => ({ ...prev, [field.key]: f }))}
                      />
                    ))}
                    {textFields.map((field) => (
                      <div key={field.key} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground/60">
                            {field.label}
                          </label>
                          {field.required && (
                            <span className="text-[8px] font-bold uppercase tracking-wider text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded">Required</span>
                          )}
                        </div>
                        {field.type === "prompt" ? (
                          <textarea
                            value={textInputs[field.key] || ""}
                            onChange={(e) => setTextInputs((prev) => ({ ...prev, [field.key]: e.target.value }))}
                            placeholder={`Enter ${field.label.toLowerCase()}...`}
                            rows={3}
                            className="w-full rounded-xl border border-border/40 bg-secondary/20 px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/40 resize-none transition-all"
                          />
                        ) : (
                          <input
                            type="text"
                            value={textInputs[field.key] || ""}
                            onChange={(e) => setTextInputs((prev) => ({ ...prev, [field.key]: e.target.value }))}
                            placeholder={`Enter ${field.label.toLowerCase()}...`}
                            className="w-full rounded-xl border border-border/40 bg-secondary/20 px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/40 transition-all"
                          />
                        )}
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="py-12 text-center">
                    <Sparkles className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground/40">No file inputs — hit Run to generate</p>
                  </div>
                )}
              </div>

              {/* ── Bottom: Cost + Run ── */}
              <div className="border-t border-border/10 bg-card/60 backdrop-blur-sm">
                {/* Runs counter */}
                <div className="px-5 py-3 flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground/70">Runs</span>
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

                {/* Cost breakdown */}
                <div className="px-5 pb-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground/50">Per run</span>
                    <span className="text-[10px] text-muted-foreground/70 font-medium tabular-nums">
                      {creditCost} credits · ~${(creditCost * CREDIT_DOLLAR_VALUE).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-foreground/70">Total</span>
                    <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Zap size={11} className="text-primary" />
                      {totalCost} credits
                      <span className="text-[10px] font-normal text-muted-foreground ml-1">~${dollarCost}</span>
                    </span>
                  </div>
                  {/* Balance indicator */}
                  <div className="flex items-center justify-between pt-0.5">
                    <span className="text-[10px] text-muted-foreground/40">Your balance</span>
                    <span className={`text-[10px] font-bold tabular-nums ${canAfford ? "text-green-400/80" : "text-red-400/80"}`}>
                      {balance} credits
                    </span>
                  </div>
                </div>

                {/* Run button */}
                <div className="px-5 pb-5 pt-2">
                  {hasResult && !isRunning ? (
                    <Button
                      onClick={handleRerun}
                      className="w-full bg-amber-500/90 hover:bg-amber-500 text-background font-black text-xs tracking-[0.2em] rounded-xl h-11 transition-all uppercase shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                    >
                      <Sparkles size={14} className="mr-2" /> Re-run
                    </Button>
                  ) : (
                    <Button
                      onClick={handleRun}
                      disabled={!allRequiredFilled || loading || isRunning || !canAfford}
                      className="w-full gradient-primary text-primary-foreground font-black text-xs tracking-[0.25em] rounded-xl h-11 glow-blue hover:opacity-90 active:scale-[0.98] transition-all border-0 uppercase disabled:opacity-30 disabled:shadow-none"
                    >
                      {loading ? (
                        <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Uploading...</span>
                      ) : isRunning ? (
                        <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Running...</span>
                      ) : !canAfford ? (
                        "Insufficient Credits"
                      ) : (
                        <span className="flex items-center gap-2">
                          <Zap size={14} /> RUN · {totalCost} CR
                        </span>
                      )}
                    </Button>
                  )}
                  {!canAfford && !hasResult && (
                    <button
                      onClick={() => navigate("/billing")}
                      className="w-full text-center text-[10px] text-primary/70 hover:text-primary font-medium mt-2 transition-colors"
                    >
                      Get more credits →
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ════════ RIGHT PANEL — Output ════════ */}
        <div className="flex-1 flex flex-col bg-background min-h-0">
          {!hasResult && (
            <div className="flex-1 flex items-center justify-center text-center p-8">
              <div>
                <div className="w-20 h-20 rounded-2xl bg-secondary/20 flex items-center justify-center mx-auto mb-5">
                  <Sparkles className="w-8 h-8 text-muted-foreground/15" />
                </div>
                <p className="text-sm font-semibold text-muted-foreground/40">Upload your assets and hit Run</p>
                <p className="text-[10px] text-muted-foreground/25 mt-1.5">Generated output will appear here</p>
              </div>
            </div>
          )}

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
                  <p className="text-[10px] text-muted-foreground font-mono tabular-nums">{result?.progress ?? 0}%</p>
                </div>
                {(result?.logs?.length ?? 0) > 0 && (
                  <div className="w-full text-left">
                    <button onClick={() => setShowLogs((v) => !v)} className="text-[10px] text-muted-foreground hover:text-foreground font-mono mb-1">
                      {showLogs ? "▼" : "►"} Logs ({result!.logs.length})
                    </button>
                    {showLogs && (
                      <div className="bg-secondary/40 rounded-lg p-3 max-h-40 overflow-y-auto">
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

          {isFailed && (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center space-y-4 max-w-sm w-full">
                <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-7 h-7 text-red-400" />
                </div>
                <p className="text-sm font-bold text-foreground">Generation Failed</p>
                <p className="text-xs text-muted-foreground">{result?.error || "Something went wrong."}</p>
                {result?.attempts && result.attempts > 1 && (
                  <p className="text-[10px] text-muted-foreground">Failed after {result.attempts} attempts</p>
                )}
                {(result?.logs?.length ?? 0) > 0 && (
                  <div className="text-left">
                    <button onClick={() => setShowLogs((v) => !v)} className="text-[10px] text-muted-foreground hover:text-foreground font-mono mb-1">
                      {showLogs ? "▼" : "►"} Logs ({result!.logs.length})
                    </button>
                    {showLogs && (
                      <div className="bg-secondary/40 rounded-lg p-3 max-h-40 overflow-y-auto">
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

          {isComplete && result && result.outputs.length > 0 && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="px-5 py-3 border-b border-border/20 flex items-center justify-between shrink-0">
                <div>
                  <p className="text-xs font-bold text-foreground flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-green-400" /> Output Ready
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                    {result.outputs.length} asset{result.outputs.length !== 1 ? "s" : ""} · {totalCost} credits used
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <a href={result.outputs[0]?.url} download target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
                      <Download size={14} />
                    </Button>
                  </a>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {result.outputs.map((output, i) => (
                    <div key={i} className="rounded-xl border border-border/30 bg-card overflow-hidden group">
                      {output.type === "video" ? (
                        <video src={output.url} controls className="w-full aspect-video object-cover bg-secondary/50" />
                      ) : (
                        <div className="relative">
                          <img src={output.url} alt={output.label || `Asset ${i + 1}`} className="w-full aspect-square object-cover bg-secondary/50" />
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
                            <Download size={10} className="mr-1" /> Save
                          </Button>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

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
        currentBalance={balance}
        actionLabel="Run Template"
        onConfirm={executeRun}
      />
    </div>
  );
};

export default TemplateRun;
