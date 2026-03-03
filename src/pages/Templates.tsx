import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Navbar from "@/components/Navbar";
import { Zap } from "lucide-react";

const Templates = () => {
  const { data: templates, isLoading } = useQuery({
    queryKey: ["all-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <div className="container mx-auto px-6 pt-28 pb-16">
        <h1 className="font-display text-3xl font-black tracking-tight mb-8">Templates</h1>

        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : !templates?.length ? (
          <p className="text-muted-foreground text-sm">No templates found.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <Link
                key={t.id}
                to={t.weavy_recipe_id ? `/app/flow/${t.weavy_recipe_id}` : `/app/templates/run?templateId=${t.id}`}
                className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 hover:border-white/15 hover:bg-white/[0.04] transition-all"
              >
                <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate">
                  {t.name}
                </h3>
                {t.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>
                )}
                <div className="flex items-center gap-3 mt-3 text-[10px] text-muted-foreground uppercase tracking-widest">
                  <span className="flex items-center gap-1">
                    <Zap className="w-3 h-3" /> {t.estimated_credits_per_run} credits
                  </span>
                  {t.category && <span>· {t.category}</span>}
                  {!t.is_active && (
                    <span className="text-destructive font-bold">Inactive</span>
                  )}
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
