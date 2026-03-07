import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { listTemplates } from "@/lib/cf-worker";
import Navbar from "@/components/Navbar";
import { Zap } from "lucide-react";

import garageEdit from "@/assets/templates/garage-edit.png";
import ravenOriginal from "@/assets/templates/raven-original.png";
import ugcWhiteGirl from "@/assets/templates/ugc-white-girl.png";
import ugcStudio from "@/assets/templates/ugc-studio.png";

const templateImages: Record<string, string> = {
  GARAGE: garageEdit,
  RAVEN: ravenOriginal,
  "UGC MIRROR": ugcWhiteGirl,
  UNBOXING: ugcStudio,
};

const Templates = () => {
  const { data: templates, isLoading } = useQuery({
    queryKey: ["all-templates"],
    queryFn: async () => {
      // Try worker API first, fall back to Supabase
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          const workerTemplates = await listTemplates(session.access_token);
          if (workerTemplates?.length) return workerTemplates;
        }
      } catch (e) {
        console.warn("Worker templates fetch failed, falling back to DB:", e);
      }
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
            {templates.map((t) => {
              const img = templateImages[t.name] || t.preview_url;
              return (
                <Link
                  key={t.id}
                  to={t.weavy_recipe_id === 'dvgEXt4aeShCeokMq5MIpZ' ? `/app/templates/dvgEXt4aeShCeokMq5MIpZ/run` : `/app/templates/run?templateId=${t.id}`}
                  className="group rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden hover:border-white/15 hover:bg-white/[0.04] transition-all"
                >
                  <div className="aspect-[4/3] w-full overflow-hidden bg-muted/20 relative">
                    {img ? (
                      <img
                        src={img}
                        alt={t.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-muted/30">
                        <span className="text-2xl font-black tracking-tighter text-muted-foreground/40 select-none">
                          {t.name}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate">
                      {t.name}
                    </h3>
                    {t.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground uppercase tracking-widest">
                      <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3" /> {t.estimated_credits_per_run} credits
                      </span>
                      {t.category && <span>· {t.category}</span>}
                      {!t.is_active && (
                        <span className="text-destructive font-bold">Inactive</span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Templates;
