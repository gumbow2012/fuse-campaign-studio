import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Zap, FolderOpen, Plus, CreditCard, Loader2 } from "lucide-react";

type RecentRun = {
  id: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  progress: number;
  error: string | null;
  templateName: string;
  outputs: Array<{ label: string; type: "image" | "video"; url: string }>;
};

const Dashboard = () => {
  const { profile, session } = useAuth();

  const { data: recentRuns, isLoading: loadingRuns } = useQuery<RecentRun[]>({
    queryKey: ["dashboard-recent-runs", session?.user.id],
    enabled: !!session?.access_token,
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/list-recent-runs?limit=5`,
        {
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${session?.access_token}`,
          },
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Could not load recent runs");
      return (data.jobs ?? []) as RecentRun[];
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16 container mx-auto px-6">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-black text-foreground mb-1">
            Welcome back{profile?.name ? `, ${profile.name}` : ""}
          </h1>
          <p className="text-muted-foreground text-sm">Your campaign command center.</p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <div className="rounded-xl border border-border/40 bg-card p-5">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={16} className="text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Credits</span>
            </div>
            <p className="font-display text-3xl font-black text-foreground">{profile?.credits_balance ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-1">Plan: {profile?.plan ?? "Free"}</p>
          </div>
          <div className="rounded-xl border border-border/40 bg-card p-5">
            <div className="flex items-center gap-2 mb-2">
              <FolderOpen size={16} className="text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Runs</span>
            </div>
            <p className="font-display text-3xl font-black text-foreground">{recentRuns?.length ?? 0}</p>
          </div>
          <div className="rounded-xl border border-border/40 bg-card p-5">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard size={16} className="text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Plan</span>
            </div>
            <p className="font-display text-xl font-black text-foreground capitalize">{profile?.plan ?? "Free"}</p>
            <Link to="/billing" className="text-xs text-primary hover:text-primary/80 transition-colors">Manage →</Link>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-3 mb-10">
          <Link to="/app/templates/run">
            <Button className="gradient-primary text-primary-foreground font-bold border-0 glow-blue-sm">
              <Plus size={14} className="mr-2" /> Run Template
            </Button>
          </Link>
          <Link to="/app/templates/run">
            <Button variant="outline" className="border-border/50 text-foreground bg-secondary hover:bg-secondary/80">
              <FolderOpen size={14} className="mr-2" /> Recent Runs
            </Button>
          </Link>
          <Link to="/billing">
            <Button variant="outline" className="border-border/50 text-foreground bg-secondary hover:bg-secondary/80">
              <CreditCard size={14} className="mr-2" /> Billing
            </Button>
          </Link>
        </div>

        {/* Recent Runs */}
        <div>
          <h2 className="font-display text-lg font-bold text-foreground mb-4">Recent Runs</h2>
          {loadingRuns ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" /> Loading recent runs...
            </div>
          ) : !recentRuns?.length ? (
            <div className="rounded-xl border border-border/30 bg-card/50 p-10 text-center">
              <p className="text-muted-foreground mb-4">No runs yet. Start with a template.</p>
              <Link to="/app/templates/run">
                <Button className="gradient-primary text-primary-foreground font-bold border-0 glow-blue-sm">
                  <Plus size={14} className="mr-2" /> Run Template
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentRuns.map((run) => (
                <Link key={run.id} to={`/app/jobs/${run.id}`} className="block">
                  <div className="rounded-xl border border-border/30 bg-card p-4 hover:border-primary/30 transition-colors flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{run.templateName ?? "Template"}</p>
                      <p className="text-xs text-muted-foreground">
                        {run.startedAt ? new Date(run.startedAt).toLocaleDateString() : "Pending"}
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                      run.status === "complete" ? "bg-green-500/20 text-green-400" :
                      run.status === "running" || run.status === "queued" ? "bg-primary/20 text-primary" :
                      run.status === "failed" ? "bg-red-500/20 text-red-400" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {run.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
