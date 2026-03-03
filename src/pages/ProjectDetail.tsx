import { useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import CreditConfirmModal from "@/components/CreditConfirmModal";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { RefreshCw, Download, AlertTriangle, Upload, Loader2, Check, Play, X } from "lucide-react";

const ProjectDetail = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const { profile, refreshProfile, isAdmin } = useAuth();
  const [rerunStep, setRerunStep] = useState<{ id: string; key: string; cost: number } | null>(null);

  // Admin fulfillment state
  const [uploading, setUploading] = useState(false);
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);
  const [fulfilling, setFulfilling] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: project, refetch: refetchProject } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, templates(name, estimated_credits_per_run, output_type)")
        .eq("id", projectId!)
        .single();
      if (error) throw error;
      return data;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "running" || status === "queued" ? 4000 : false;
    },
  });

  const { data: steps, refetch: refetchSteps } = useQuery({
    queryKey: ["project-steps", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_steps")
        .select("*")
        .eq("project_id", projectId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    refetchInterval: (query) => {
      const hasRunning = query.state.data?.some(s => s.status === "running" || s.status === "queued");
      return hasRunning ? 4000 : false;
    },
  });

  const handleRerun = async () => {
    if (!rerunStep) return;
    try {
      const { data, error } = await supabase.functions.invoke("rerun-step", {
        body: { projectId, stepId: rerunStep.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Step re-run started" });
      refetchSteps();
      refetchProject();
      refreshProfile();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setRerunStep(null);
    }
  };

  // Admin: upload output files to storage
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !project) return;
    setUploading(true);
    try {
      const newUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split(".").pop() || "bin";
        const storagePath = `${project.user_id}/${project.id}/output-${uploadedUrls.length + i}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from("project-assets")
          .upload(storagePath, file, { contentType: file.type, upsert: true });
        if (upErr) throw upErr;

        const { data: signedData } = await supabase.storage
          .from("project-assets")
          .createSignedUrl(storagePath, 86400 * 7); // 7 day URL

        if (signedData?.signedUrl) {
          newUrls.push(signedData.signedUrl);
        }
      }
      setUploadedUrls(prev => [...prev, ...newUrls]);
      toast({ title: `${files.length} file(s) uploaded` });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Admin: fulfill project
  const adminAction = async (action: "start" | "complete" | "fail") => {
    setFulfilling(true);
    try {
      const body: any = { projectId, action };
      if (action === "complete") {
        if (uploadedUrls.length === 0) {
          toast({ title: "Upload at least one output file first", variant: "destructive" });
          setFulfilling(false);
          return;
        }
        body.outputUrls = uploadedUrls;
      }
      const { data, error } = await supabase.functions.invoke("admin-fulfill-project", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: `Project ${action === "complete" ? "completed" : action === "start" ? "started" : "failed"}` });
      refetchProject();
      setUploadedUrls([]);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setFulfilling(false);
    }
  };

  if (!project) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 flex justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      </div>
    );
  }

  const outputs = (project.outputs as any)?.items || [];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16 container mx-auto px-6">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-black text-foreground mb-1">{(project as any).templates?.name ?? "Project"}</h1>
          <p className="text-xs text-muted-foreground">Created {new Date(project.created_at).toLocaleString()}</p>
          <span className={`inline-block mt-2 text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full ${
            project.status === "complete" ? "bg-green-500/20 text-green-400" :
            project.status === "running" ? "bg-primary/20 text-primary" :
            project.status === "failed" ? "bg-red-500/20 text-red-400" :
            "bg-muted text-muted-foreground"
          }`}>
            {project.status}
          </span>
        </div>

        {project.status === "failed" && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 mb-6 flex items-start gap-3">
            <AlertTriangle size={18} className="text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-300">This project failed during processing.</p>
              {project.error && (
                <p className="text-xs text-red-300/70 mt-1">{project.error}</p>
              )}
              <p className="text-xs text-red-300/50 mt-1">Please try running again or contact support.</p>
            </div>
          </div>
        )}

        {/* Completed outputs */}
        {outputs.length > 0 && (
          <div className="mb-8">
            <h2 className="font-display text-lg font-bold text-foreground mb-4">Outputs</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {outputs.map((item: any, i: number) => (
                <div key={i} className="rounded-xl border border-border/30 bg-card p-4">
                  {item.type === "video" ? (
                    <video src={item.url} controls className="w-full rounded-lg mb-3" />
                  ) : (
                    <img src={item.url} alt={item.label} className="w-full rounded-lg mb-3 object-cover" />
                  )}
                  <a href={item.url} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="w-full border-border/50 text-foreground bg-secondary hover:bg-secondary/80 text-xs">
                      <Download size={12} className="mr-1.5" /> {item.label || `Download ${i + 1}`}
                    </Button>
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Admin Fulfillment Panel */}
        {isAdmin && (project.status === "queued" || project.status === "running") && (
          <div className="rounded-xl border border-accent/30 bg-accent/5 p-5 mb-8">
            <h2 className="font-display text-sm font-bold text-foreground mb-1">🔧 Admin Fulfillment</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Upload finished outputs from Weavy, then mark complete.
            </p>

            {/* User inputs preview */}
            {project.inputs && Object.keys(project.inputs as any).length > 0 && (
              <div className="mb-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">User Inputs</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(project.inputs as Record<string, string>).map(([key, url]) => (
                    <div key={key} className="rounded-lg border border-border/20 bg-secondary p-2">
                      <p className="text-[10px] font-bold text-muted-foreground mb-1">{key}</p>
                      {typeof url === "string" && (url.includes(".mp4") || url.includes(".webm")) ? (
                        <video src={url} controls className="w-full rounded" />
                      ) : typeof url === "string" ? (
                        <img src={url} alt={key} className="w-full rounded object-cover max-h-32" />
                      ) : (
                        <p className="text-xs text-foreground truncate">{String(url)}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upload outputs */}
            <div className="mb-4">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="video/*,image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="border-border/50 text-foreground bg-secondary hover:bg-secondary/80 text-xs"
              >
                {uploading ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Upload size={12} className="mr-1.5" />}
                Upload Output Files
              </Button>
              {uploadedUrls.length > 0 && (
                <p className="text-xs text-green-400 mt-2">
                  <Check size={12} className="inline mr-1" />
                  {uploadedUrls.length} file(s) ready
                </p>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              {project.status === "queued" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => adminAction("start")}
                  disabled={fulfilling}
                  className="border-border/50 text-foreground bg-secondary hover:bg-secondary/80 text-xs"
                >
                  <Play size={12} className="mr-1.5" /> Mark Running
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => adminAction("complete")}
                disabled={fulfilling || uploadedUrls.length === 0}
                className="gradient-primary text-primary-foreground font-bold border-0 text-xs"
              >
                {fulfilling ? <Loader2 size={12} className="mr-1.5 animate-spin" /> : <Check size={12} className="mr-1.5" />}
                Complete Project
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => adminAction("fail")}
                disabled={fulfilling}
                className="border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs"
              >
                <X size={12} className="mr-1.5" /> Mark Failed
              </Button>
            </div>
          </div>
        )}

        {/* Steps */}
        {steps && steps.length > 0 && (
          <>
            <h2 className="font-display text-lg font-bold text-foreground mb-4">Steps</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {steps.map((step) => (
                <div key={step.id} className="rounded-xl border border-border/30 bg-card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-foreground">{step.step_key}</span>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      step.status === "complete" ? "bg-green-500/20 text-green-400" :
                      step.status === "running" ? "bg-primary/20 text-primary" :
                      step.status === "failed" ? "bg-red-500/20 text-red-400" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {step.status}
                    </span>
                  </div>
                  
                  {step.output_url && step.status === "complete" && (
                    <a href={step.output_url} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" className="w-full border-border/50 text-foreground bg-secondary hover:bg-secondary/80 text-xs">
                        <Download size={12} className="mr-1.5" /> Download
                      </Button>
                    </a>
                  )}

                  {(step.status === "complete" || step.status === "failed") && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-2 border-border/50 text-foreground bg-secondary hover:bg-secondary/80 text-xs"
                      onClick={() => setRerunStep({ id: step.id, key: step.step_key, cost: step.last_run_cost_credits ?? 5 })}
                    >
                      <RefreshCw size={12} className="mr-1.5" /> Re-run Step
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {rerunStep && (
        <CreditConfirmModal
          open={!!rerunStep}
          onOpenChange={() => setRerunStep(null)}
          creditCost={rerunStep.cost}
          currentBalance={profile?.credits_balance ?? 0}
          actionLabel={`Re-run ${rerunStep.key}`}
          onConfirm={handleRerun}
        />
      )}
    </div>
  );
};

export default ProjectDetail;
