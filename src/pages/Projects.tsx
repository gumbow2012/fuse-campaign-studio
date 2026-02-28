import Navbar from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { FolderOpen, Download } from "lucide-react";

const Projects = () => {
  const { data: projects, isLoading } = useQuery({
    queryKey: ["all-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, templates(name, estimated_credits_per_run)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16 container mx-auto px-6">
        <h1 className="font-display text-3xl font-black text-foreground mb-1">My Projects</h1>
        <p className="text-muted-foreground text-sm mb-8">All your campaign runs in one place.</p>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !projects?.length ? (
          <div className="rounded-xl border border-border/30 bg-card/50 p-16 text-center">
            <FolderOpen size={40} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No projects yet. Go run a drop!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project: any) => (
              <Link key={project.id} to={`/projects/${project.id}`}>
                <div className="rounded-xl border border-border/30 bg-card p-5 hover:border-primary/30 transition-colors h-full">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                      project.status === "complete" ? "bg-green-500/20 text-green-400" :
                      project.status === "running" ? "bg-primary/20 text-primary" :
                      project.status === "failed" ? "bg-red-500/20 text-red-400" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {project.status}
                    </span>
                    {project.status === "complete" && <Download size={14} className="text-muted-foreground" />}
                  </div>
                  <h3 className="font-display text-sm font-bold text-foreground mb-1">{project.templates?.name ?? "Template"}</h3>
                  <p className="text-xs text-muted-foreground">{new Date(project.created_at).toLocaleDateString()}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Projects;
