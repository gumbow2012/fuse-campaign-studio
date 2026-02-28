import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Download, RotateCcw, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";

const BACKEND_URL = "https://fuse-backend.workers.dev";

interface JobOutput {
  type: "video" | "image";
  url: string;
}

interface JobData {
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  outputs: JobOutput[];
}

const JobStatus = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const [job, setJob] = useState<JobData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    let active = true;

    const poll = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/jobs/${jobId}`);
        if (!res.ok) throw new Error("Failed to fetch job status");
        const data: JobData = await res.json();
        if (active) {
          setJob(data);
          setError(null);
          if (data.status === "queued" || data.status === "running") {
            setTimeout(poll, 2000);
          }
        }
      } catch (err: any) {
        if (active) setError(err.message);
        // Retry on error
        if (active) setTimeout(poll, 5000);
      }
    };

    poll();
    return () => { active = false; };
  }, [jobId]);

  const isRunning = job?.status === "queued" || job?.status === "running";
  const isCompleted = job?.status === "completed";
  const isFailed = job?.status === "failed";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-6 pt-28 pb-16 max-w-3xl">
        {/* Header */}
        <div className="mb-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-muted-foreground mb-2">Job</p>
          <h1 className="font-display text-2xl md:text-3xl font-black text-foreground break-all">
            {jobId}
          </h1>
        </div>

        {/* Error state */}
        {error && !job && (
          <div className="rounded-xl border border-destructive/30 bg-card p-8 text-center">
            <AlertTriangle className="w-10 h-10 text-destructive-foreground mx-auto mb-4" />
            <p className="text-foreground font-bold mb-2">Connection Error</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        )}

        {/* Loading */}
        {!job && !error && (
          <div className="rounded-xl border border-border/40 bg-card p-12 text-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Connecting to job...</p>
          </div>
        )}

        {/* Running / Queued */}
        {isRunning && job && (
          <div className="rounded-xl border border-border/40 bg-card p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-3 h-3 rounded-full bg-primary animate-pulse" />
              <p className="text-sm font-bold uppercase tracking-wider text-foreground">
                {job.status === "queued" ? "Queued" : "Generating your campaign..."}
              </p>
            </div>

            <Progress value={job.progress} className="h-2 mb-3" />
            <p className="text-xs text-muted-foreground text-right">{job.progress}%</p>

            <div className="mt-8 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
              <span className="text-xs text-muted-foreground">Processing... this may take a few minutes</span>
            </div>
          </div>
        )}

        {/* Failed */}
        {isFailed && (
          <div className="rounded-xl border border-destructive/30 bg-card p-8 text-center">
            <AlertTriangle className="w-10 h-10 text-destructive-foreground mx-auto mb-4" />
            <p className="text-foreground font-bold mb-2">Job Failed</p>
            <p className="text-sm text-muted-foreground mb-6">Something went wrong during generation.</p>
            <Link to="/dashboard">
              <Button variant="outline" className="border-border text-foreground">
                Back to Dashboard
              </Button>
            </Link>
          </div>
        )}

        {/* Completed */}
        {isCompleted && job && (
          <div className="space-y-6">
            {/* Status badge */}
            <div className="rounded-xl border border-primary/30 bg-card p-6 flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-primary" />
              <div>
                <p className="text-sm font-bold text-foreground">Campaign Complete</p>
                <p className="text-xs text-muted-foreground">{job.outputs.length} assets generated</p>
              </div>
            </div>

            {/* Outputs grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {job.outputs.map((output, i) => (
                <div key={i} className="rounded-xl border border-border/40 bg-card overflow-hidden">
                  {output.type === "video" ? (
                    <video
                      src={output.url}
                      controls
                      className="w-full aspect-video object-cover bg-secondary"
                    />
                  ) : (
                    <img
                      src={output.url}
                      alt={`Output ${i + 1}`}
                      className="w-full aspect-square object-cover bg-secondary"
                    />
                  )}
                  <div className="p-3 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {output.type} · Asset {i + 1}
                    </span>
                    <a href={output.url} download target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="h-7 text-xs border-border text-foreground">
                        <Download size={12} className="mr-1" />
                        Download
                      </Button>
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-4">
              <Link to="/dashboard">
                <Button variant="outline" className="border-border text-foreground">
                  Back to Dashboard
                </Button>
              </Link>
              <Button
                onClick={() => window.history.back()}
                className="gradient-primary text-primary-foreground border-0 glow-blue-sm"
              >
                <RotateCcw size={14} className="mr-2" />
                Run Again
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default JobStatus;
