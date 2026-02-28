import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useState } from "react";
import { DollarSign, TrendingUp, Zap, PackagePlus } from "lucide-react";

const CreatorAnalytics = () => {
  const { user } = useAuth();
  const [onboarding, setOnboarding] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["creator-analytics"],
    queryFn: async () => {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analytics-platform?view=creator`,
        {
          headers: {
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!user,
  });

  const handleOnboard = async () => {
    setOnboarding(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("revenue-split", {
        body: { action: "creator-onboard" },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      toast({ title: "Creator profile created", description: result?.message });
      refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setOnboarding(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16 container mx-auto px-6 max-w-4xl">
        <h1 className="font-display text-3xl font-black text-foreground mb-1">Creator Dashboard</h1>
        <p className="text-muted-foreground text-sm mb-8">Track your template performance and earnings.</p>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !data?.isCreator ? (
          <div className="rounded-xl border border-border/30 bg-card/50 p-10 text-center">
            <PackagePlus size={40} className="mx-auto text-muted-foreground mb-4" />
            <p className="text-foreground font-semibold mb-2">Become a Creator</p>
            <p className="text-muted-foreground text-sm mb-6">
              Upload templates and earn revenue when users run them.
            </p>
            <Button
              onClick={handleOnboard}
              disabled={onboarding}
              className="gradient-primary text-primary-foreground font-bold border-0 glow-blue-sm"
            >
              {onboarding ? "Setting up..." : "Start Creator Onboarding"}
            </Button>
          </div>
        ) : (
          <>
            {/* Earnings */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-10">
              <div className="rounded-xl border border-border/40 bg-card p-5">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign size={16} className="text-primary" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Total Earned</span>
                </div>
                <p className="font-display text-2xl font-black text-foreground">${((data.earnings?.total || 0) / 100).toFixed(2)}</p>
              </div>
              <div className="rounded-xl border border-border/40 bg-card p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Zap size={16} className="text-muted-foreground" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Pending</span>
                </div>
                <p className="font-display text-2xl font-black text-foreground">${((data.earnings?.pending || 0) / 100).toFixed(2)}</p>
              </div>
              <div className="rounded-xl border border-border/40 bg-card p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Zap size={16} className="text-green-400" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Available</span>
                </div>
                <p className="font-display text-2xl font-black text-foreground">${((data.earnings?.available || 0) / 100).toFixed(2)}</p>
              </div>
              <div className="rounded-xl border border-border/40 bg-card p-5">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign size={16} className="text-green-400" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Paid Out</span>
                </div>
                <p className="font-display text-2xl font-black text-foreground">${((data.earnings?.paid || 0) / 100).toFixed(2)}</p>
              </div>
            </div>

            {/* Templates */}
            <h2 className="font-display text-lg font-bold text-foreground mb-4">Your Templates</h2>
            {data.templates?.length ? (
              <div className="space-y-2">
                {data.templates.map((t: any) => (
                  <div key={t.id} className="rounded-xl border border-border/30 bg-card p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.runs} runs · {t.credits} credits consumed</p>
                    </div>
                    <TrendingUp size={14} className="text-primary" />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No templates yet. Submit templates via the admin panel.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CreatorAnalytics;
