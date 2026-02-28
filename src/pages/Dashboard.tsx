import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Zap, FolderOpen, Plus, CreditCard } from "lucide-react";

const Dashboard = () => {
  const { profile } = useAuth();

  const { data: recentProjects } = useQuery({
    queryKey: ["recent-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, templates(name)")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
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
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Projects</span>
            </div>
            <p className="font-display text-3xl font-black text-foreground">{recentProjects?.length ?? 0}</p>
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
          <Link to="/app/templates/urban-graffiti-style">
            <Button className="gradient-primary text-primary-foreground font-bold border-0 glow-blue-sm">
              <Plus size={14} className="mr-2" /> Run Template
            </Button>
          </Link>
          <Link to="/projects">
            <Button variant="outline" className="border-border/50 text-foreground bg-secondary hover:bg-secondary/80">
              <FolderOpen size={14} className="mr-2" /> My Projects
            </Button>
          </Link>
          <Link to="/billing">
            <Button variant="outline" className="border-border/50 text-foreground bg-secondary hover:bg-secondary/80">
              <CreditCard size={14} className="mr-2" /> Billing
            </Button>
          </Link>
        </div>

        {/* Recent Projects */}
        <div>
          <h2 className="font-display text-lg font-bold text-foreground mb-4">Recent Projects</h2>
          {!recentProjects?.length ? (
            <div className="rounded-xl border border-border/30 bg-card/50 p-10 text-center">
              <p className="text-muted-foreground mb-4">No projects yet. Run your first drop!</p>
              <Link to="/">
                <Button className="gradient-primary text-primary-foreground font-bold border-0 glow-blue-sm">
                  <Plus size={14} className="mr-2" /> Launch Drop
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentProjects.map((project: any) => (
                <Link key={project.id} to={`/projects/${project.id}`} className="block">
                  <div className="rounded-xl border border-border/30 bg-card p-4 hover:border-primary/30 transition-colors flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{project.templates?.name ?? "Template"}</p>
                      <p className="text-xs text-muted-foreground">{new Date(project.created_at).toLocaleDateString()}</p>
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                      project.status === "complete" ? "bg-green-500/20 text-green-400" :
                      project.status === "running" ? "bg-primary/20 text-primary" :
                      project.status === "failed" ? "bg-red-500/20 text-red-400" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {project.status}
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
