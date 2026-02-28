import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Zap, FolderOpen, TrendingUp, CheckCircle } from "lucide-react";

const Analytics = () => {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["user-analytics"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("analytics-platform", {
        body: {},
        headers: {},
      });
      // Use query params approach via GET workaround
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analytics-platform?view=user`,
        {
          headers: {
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
    enabled: !!user,
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16 container mx-auto px-6">
        <h1 className="font-display text-3xl font-black text-foreground mb-1">Analytics</h1>
        <p className="text-muted-foreground text-sm mb-8">Your usage overview.</p>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !data ? (
          <div className="rounded-xl border border-border/30 bg-card/50 p-10 text-center">
            <p className="text-muted-foreground">No analytics data yet. Start running drops!</p>
          </div>
        ) : (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
              <StatCard icon={FolderOpen} label="Total Runs" value={data.totalRuns} />
              <StatCard icon={CheckCircle} label="Success Rate" value={`${data.successRate}%`} />
              <StatCard icon={Zap} label="Credits Spent" value={data.totalCreditsSpent} />
              <StatCard icon={BarChart3} label="Completed" value={data.completedRuns} />
            </div>

            {/* Top Templates */}
            <div className="mb-10">
              <h2 className="font-display text-lg font-bold text-foreground mb-4">Most Used Templates</h2>
              {data.topTemplates?.length ? (
                <div className="space-y-2">
                  {data.topTemplates.map((t: any) => (
                    <div key={t.id} className="rounded-xl border border-border/30 bg-card p-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{t.name}</p>
                        <p className="text-xs text-muted-foreground">{t.runs} runs · {t.credits} credits</p>
                      </div>
                      <TrendingUp size={14} className="text-primary" />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No template usage yet.</p>
              )}
            </div>

            {/* Recent Charges */}
            <div>
              <h2 className="font-display text-lg font-bold text-foreground mb-4">Recent Charges</h2>
              {data.recentCharges?.length ? (
                <div className="space-y-2">
                  {data.recentCharges.map((c: any, i: number) => (
                    <div key={i} className="rounded-lg border border-border/30 bg-card p-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-foreground">{c.templates?.name || "Template"}</p>
                        <p className="text-[10px] text-muted-foreground">{c.charge_type} · {new Date(c.created_at).toLocaleDateString()}</p>
                      </div>
                      <span className="text-xs font-bold text-primary">-{c.credits_spent} credits</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No charges yet.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) => (
  <div className="rounded-xl border border-border/40 bg-card p-5">
    <div className="flex items-center gap-2 mb-2">
      <Icon size={16} className="text-primary" />
      <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{label}</span>
    </div>
    <p className="font-display text-3xl font-black text-foreground">{value}</p>
  </div>
);

export default Analytics;
