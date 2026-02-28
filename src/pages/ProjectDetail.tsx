import { useParams } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import CreditConfirmModal from "@/components/CreditConfirmModal";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { RefreshCw, Download, AlertTriangle } from "lucide-react";

const ProjectDetail = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const { profile, refreshProfile } = useAuth();
  const [rerunStep, setRerunStep] = useState<{ id: string; key: string; cost: number } | null>(null);

  const { data: project, refetch: refetchProject } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, templates(name, estimated_credits_per_run)")
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

  if (!project) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 flex justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
      </div>
    );
  }

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
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 mb-6 flex items-center gap-3">
            <AlertTriangle size={18} className="text-red-400" />
            <p className="text-sm text-red-300">This project failed during processing. Please try running again or contact support.</p>
          </div>
        )}

        {/* Steps */}
        <h2 className="font-display text-lg font-bold text-foreground mb-4">Steps</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {steps?.map((step) => (
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
