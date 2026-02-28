import Navbar from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Zap, Users, TrendingUp, AlertTriangle, DollarSign } from "lucide-react";

const AdminAnalytics = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: async () => {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analytics-platform?view=overview`,
        {
          headers: {
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to fetch");
      }
      return res.json();
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16 container mx-auto px-6">
        <h1 className="font-display text-3xl font-black text-foreground mb-1">Platform Analytics</h1>
        <p className="text-muted-foreground text-sm mb-8">Admin overview of platform performance.</p>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !data ? (
          <p className="text-muted-foreground">Failed to load analytics.</p>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
              <StatCard icon={BarChart3} label="Total Projects" value={data.totalProjects} />
              <StatCard icon={AlertTriangle} label="Failure Rate" value={`${data.failureRate}%`} />
              <StatCard icon={Users} label="Active 7d" value={data.activeUsers7d} />
              <StatCard icon={Users} label="Active 30d" value={data.activeUsers30d} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
              <StatCard icon={Zap} label="Credits Spent" value={data.creditsSpent} />
              <StatCard icon={Zap} label="Credits Granted" value={data.creditsGranted} />
              <StatCard icon={DollarSign} label="Revenue (Paid)" value={`$${(data.revenue?.paid / 100).toFixed(2)}`} />
            </div>

            {/* Revenue Breakdown */}
            <div className="rounded-xl border border-border/40 bg-card p-6 mb-10">
              <h2 className="font-display text-sm font-bold text-foreground mb-4 uppercase tracking-wider">Revenue Breakdown</h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-1">Pending</p>
                  <p className="font-display text-xl font-black text-foreground">${((data.revenue?.pending || 0) / 100).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-1">Available</p>
                  <p className="font-display text-xl font-black text-foreground">${((data.revenue?.available || 0) / 100).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-1">Paid Out</p>
                  <p className="font-display text-xl font-black text-foreground">${((data.revenue?.paid || 0) / 100).toFixed(2)}</p>
                </div>
              </div>
            </div>

            {/* Top Templates */}
            <h2 className="font-display text-lg font-bold text-foreground mb-4">Top Templates</h2>
            <div className="space-y-2">
              {data.topTemplates?.map((t: any) => (
                <div key={t.id} className="rounded-xl border border-border/30 bg-card p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.runs} runs · {t.credits} credits · ${(t.revenue / 100).toFixed(2)} revenue</p>
                  </div>
                  <TrendingUp size={14} className="text-primary" />
                </div>
              ))}
              {!data.topTemplates?.length && <p className="text-sm text-muted-foreground">No usage data yet.</p>}
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

export default AdminAnalytics;
