import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { Zap, Film, Image as ImageIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchTemplates, type ApiTemplate } from "@/services/fuseApi";

const categoryColors: Record<string, string> = {
  Street: "text-orange-400",
  Editorial: "text-purple-400",
  UGC: "text-green-400",
  Studio: "text-blue-400",
  General: "text-muted-foreground",
};

const categoryIcons: Record<string, string> = {
  Street: "🔥",
  Editorial: "📸",
  UGC: "🤳",
  Studio: "💡",
  General: "✦",
};

const CREDIT_DOLLAR_VALUE = 0.098;

const Templates = () => {
  const navigate = useNavigate();

  const { data: templates, isLoading } = useQuery<ApiTemplate[]>({
    queryKey: ["all-templates-page"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return [];
      return fetchTemplates(session.access_token);
    },
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <div className="container mx-auto px-6 pt-28 pb-16">
        <h1 className="font-display text-3xl font-black tracking-tight mb-8">Templates</h1>

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-12">
            <Loader2 size={16} className="animate-spin" /> Loading templates...
          </div>
        ) : !templates?.length ? (
          <p className="text-muted-foreground text-sm">No templates found.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.filter(t => t.is_active).map((t) => {
              const cat = t.category || "General";
              const color = categoryColors[cat] || categoryColors.General;
              const icon = categoryIcons[cat] || categoryIcons.General;
              const cost = t.estimated_credits_per_run || 0;

              return (
                <Link
                  key={t.id}
                  to={`/app/templates/run?templateId=${encodeURIComponent(t.id)}`}
                  className="group rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden hover:border-white/15 hover:bg-white/[0.04] transition-all"
                >
                  <div className="aspect-[4/3] w-full overflow-hidden bg-muted/20 relative">
                    {t.preview_url ? (
                      <img
                        src={t.preview_url}
                        alt={t.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-primary/10 to-muted/30 gap-2">
                        <span className="text-3xl opacity-40 group-hover:opacity-60 group-hover:scale-110 transition-all duration-300">{icon}</span>
                        <span className="text-lg font-black tracking-tighter text-muted-foreground/30 select-none">{t.name}</span>
                      </div>
                    )}
                    <span className={`absolute top-2 left-2 text-[8px] font-black uppercase tracking-wider ${color} bg-background/70 backdrop-blur-sm px-2 py-0.5 rounded-md`}>
                      {cat}
                    </span>
                    <span className="absolute top-2 right-2">
                      {t.output_type === "video"
                        ? <Film size={12} className="text-muted-foreground/40" />
                        : <ImageIcon size={12} className="text-muted-foreground/40" />
                      }
                    </span>
                  </div>

                  <div className="p-4">
                    <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate">
                      {t.name}
                    </h3>
                    {t.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>
                    )}
                    <div className="flex items-center justify-between mt-3">
                      <span className="flex items-center gap-1 text-[11px] font-bold text-primary/80">
                        <Zap className="w-3 h-3" /> {cost} credits
                      </span>
                      <span className="text-[10px] text-muted-foreground/40 font-medium">
                        ~${(cost * CREDIT_DOLLAR_VALUE).toFixed(2)}
                      </span>
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
