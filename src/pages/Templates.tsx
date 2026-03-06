import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listTemplates, type Template } from "@/lib/api";
import Navbar from "@/components/Navbar";
import { Zap, Layers } from "lucide-react";

const Templates = () => {
  const { data: templates, isLoading, error } = useQuery({
    queryKey: ["templates"],
    queryFn: listTemplates,
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <div className="container mx-auto px-6 pt-28 pb-16 max-w-5xl">
        <div className="mb-10">
          <h1 className="font-display text-3xl font-bold tracking-tight">Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Choose a template, upload your assets, and let Fuse generate the outputs.
          </p>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-border/20 bg-card/40 h-64 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
            <p className="text-sm text-destructive font-medium">Failed to load templates</p>
            <p className="text-xs text-muted-foreground mt-1">{(error as Error).message}</p>
          </div>
        ) : !templates?.length ? (
          <p className="text-muted-foreground text-sm">No templates available.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <Link
                key={t.id}
                to={`/app/run/${t.id}`}
                className="group rounded-xl border border-border/20 bg-card/40 overflow-hidden hover:border-primary/30 hover:bg-card/60 transition-all duration-200"
              >
                {/* Preview */}
                <div className="aspect-[4/3] w-full overflow-hidden bg-secondary/20 relative">
                  {t.preview_url ? (
                    <img
                      src={t.preview_url}
                      alt={t.name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Layers className="w-10 h-10 text-muted-foreground/15" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-4 space-y-2">
                  <h3 className="text-sm font-bold text-foreground tracking-tight group-hover:text-primary transition-colors truncate">
                    {t.name}
                  </h3>
                  {t.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                  )}
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground uppercase tracking-widest pt-1">
                    <span className="flex items-center gap-1">
                      <Zap className="w-3 h-3 text-primary" />
                      {t.estimated_credits_per_run} credits
                    </span>
                    {t.category && <span className="text-muted-foreground/60">· {t.category}</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Templates;
