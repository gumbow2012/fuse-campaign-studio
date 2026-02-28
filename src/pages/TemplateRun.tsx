import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { getTemplateBySlug } from "@/lib/template-configs";
import { useAuth } from "@/contexts/AuthContext";
import CreditConfirmModal from "@/components/CreditConfirmModal";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Minus, Plus, GripVertical, MoreVertical, Upload, X, Zap, Loader2 } from "lucide-react";

const BACKEND_URL = "https://fuse-backend.workers.dev";

/** Upload a file to storage and return a signed URL (1 hour expiry). */
const uploadToStorage = async (
  userId: string,
  fieldKey: string,
  file: File
): Promise<string> => {
  const ext = file.name.split(".").pop() || "png";
  const path = `${userId}/${Date.now()}-${fieldKey}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from("template-inputs")
    .upload(path, file, { upsert: true });
  if (uploadErr) throw new Error(`Upload failed for ${fieldKey}: ${uploadErr.message}`);

  const { data: signedData, error: signErr } = await supabase.storage
    .from("template-inputs")
    .createSignedUrl(path, 3600); // 1 hour
  if (signErr || !signedData?.signedUrl)
    throw new Error(`Could not get URL for ${fieldKey}`);

  return signedData.signedUrl;
};

/* ─── Drop zone with preview ─── */
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
          <img
            src={URL.createObjectURL(file)}
            alt={label}
            className="w-14 h-14 object-cover rounded"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-foreground font-medium truncate">{file.name}</p>
            <p className="text-[10px] text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
          </div>
          <button
            onClick={() => onFile(null)}
            className="p-1 rounded hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
          >
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
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-foreground/30 hover:bg-foreground/[0.02]"
          }`}
        >
          <Upload className="w-8 h-8 text-muted-foreground/30 group-hover:text-muted-foreground/50 transition-colors" />
          <p className="text-xs text-muted-foreground/50 font-medium">Drag & drop or click</p>
        </div>
      )}
    </div>
  );
};

/* ─── Page ─── */
const TemplateRun = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const template = getTemplateBySlug(slug || "");

  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [runs, setRuns] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  if (!template) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center pt-32">
          <p className="text-muted-foreground">Template not found.</p>
        </div>
      </div>
    );
  }

  const totalCost = template.estimatedCredits * runs;
  const requiredFields = template.inputs.filter((i) => i.required);
  const allRequiredUploaded = requiredFields.every((f) => files[f.key]);

  const handleRun = async () => {
    if (!user) { navigate("/auth"); return; }
    if (!allRequiredUploaded) {
      toast({ title: "Missing uploads", description: "Please upload all required files.", variant: "destructive" });
      return;
    }
    setShowConfirm(true);
  };

  const executeRun = async () => {
    setShowConfirm(false);
    setLoading(true);
    try {
      if (!user) throw new Error("Not authenticated");

      // Upload all files to storage and collect signed URLs
      const inputs: Record<string, string> = {};
      for (const field of template.inputs) {
        const f = files[field.key];
        if (f) {
          inputs[field.key] = await uploadToStorage(user.id, field.key, f);
        }
      }

      const res = await fetch(`${BACKEND_URL}/jobs/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateSlug: template.slug,
          weavyFlowId: template.weavyFlowId,
          inputs,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || "Failed to create job");
      }

      const data = await res.json();
      navigate(`/app/jobs/${data.jobId}`);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-6 pt-28 pb-16">
        {/* Header */}
        <div className="mb-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-muted-foreground mb-2">Template</p>
          <h1 className="font-display text-3xl md:text-4xl font-black text-foreground">{template.name}</h1>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left: Info */}
          <div className="flex-1">
            <div className="rounded-xl border border-border/40 bg-card p-6">
              <h3 className="font-display text-sm font-bold text-foreground mb-4 uppercase tracking-wider">About This Template</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-border/20">
                  <span className="text-sm text-muted-foreground">Credits per run</span>
                  <span className="text-sm font-bold text-primary">{template.estimatedCredits}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border/20">
                  <span className="text-sm text-muted-foreground">Required inputs</span>
                  <span className="text-sm font-bold text-foreground">{requiredFields.length}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-muted-foreground">Optional inputs</span>
                  <span className="text-sm font-bold text-foreground">{template.inputs.length - requiredFields.length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Upload card (matches existing style) */}
          <div className="w-full lg:w-[340px] flex flex-col gap-3">
            {/* Upload zones */}
            <div className="rounded-xl p-5 flex flex-col gap-5 border border-border/[0.08] bg-card/90 backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
              {template.inputs.map((field) => (
                <UploadZone
                  key={field.key}
                  label={field.label}
                  required={field.required}
                  file={files[field.key] || null}
                  onFile={(f) => setFiles((prev) => ({ ...prev, [field.key]: f }))}
                />
              ))}
            </div>

            {/* Runs & Run button */}
            <div className="rounded-xl p-5 flex flex-col gap-3 border border-border/[0.08] bg-card/90 backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Runs</span>
                <div className="h-8 bg-secondary/40 border border-border rounded-lg flex items-center px-1">
                  <button
                    onClick={() => setRuns((r) => Math.max(1, r - 1))}
                    className="w-6 h-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-5 text-center text-xs font-bold text-foreground/80">{runs}</span>
                  <button
                    onClick={() => setRuns((r) => r + 1)}
                    className="w-6 h-full flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground/40 font-medium">Total cost</span>
                <span className="text-[10px] text-muted-foreground/60 font-bold">
                  <Zap size={10} className="inline text-primary mr-0.5" />
                  {totalCost} credits
                </span>
              </div>

              <Button
                onClick={handleRun}
                disabled={!allRequiredUploaded || loading}
                className="w-full gradient-primary text-primary-foreground font-black text-xs tracking-[0.25em] rounded-lg h-10 glow-blue hover:opacity-90 active:scale-[0.98] transition-all duration-300 border-0 relative overflow-hidden group uppercase disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="relative z-10">Processing...</span>
                ) : (
                  <>
                    <div className="absolute inset-0 bg-foreground/15 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                    <span className="relative z-10">RUN</span>
                  </>
                )}
              </Button>

              <div className="pt-2 border-t border-border/[0.04] space-y-1">
                <p className="text-[8px] text-muted-foreground/30 uppercase tracking-[0.2em] font-bold">
                  Cost: {template.estimatedCredits} credits per run
                </p>
              </div>
            </div>
          </div>
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
