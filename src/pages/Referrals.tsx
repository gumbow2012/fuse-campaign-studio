import { useState } from "react";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Gift, Users, Zap, Copy, Check } from "lucide-react";

const Referrals = () => {
  const { user } = useAuth();
  const [applyCode, setApplyCode] = useState("");
  const [applying, setApplying] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["my-referral"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("referrals", {
        body: { action: "get-my-code" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    enabled: !!user,
  });

  const handleApply = async () => {
    if (!applyCode.trim()) return;
    setApplying(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("referrals", {
        body: { action: "apply-code", code: applyCode.trim() },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      toast({
        title: "Referral applied!",
        description: result.bonusCredits ? `You received ${result.bonusCredits} bonus credits!` : "Code applied successfully.",
      });
      setApplyCode("");
      refetch();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  const copyCode = () => {
    if (!data?.code) return;
    const url = `${window.location.origin}/auth?ref=${data.code}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied!", description: "Referral link copied to clipboard." });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16 container mx-auto px-6 max-w-2xl">
        <h1 className="font-display text-3xl font-black text-foreground mb-1">Referrals</h1>
        <p className="text-muted-foreground text-sm mb-8">Invite friends and earn credits.</p>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Your Code */}
            <div className="rounded-xl border border-border/40 bg-card p-6 mb-6">
              <h2 className="font-display text-sm font-bold text-foreground mb-4 uppercase tracking-wider">Your Referral Code</h2>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 rounded-lg bg-secondary border border-border px-4 py-3">
                  <p className="font-display text-lg font-black text-foreground tracking-wider">{data?.code || "—"}</p>
                </div>
                <Button onClick={copyCode} variant="outline" className="border-border/50 text-foreground bg-secondary hover:bg-secondary/80">
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Share your referral link. New users get bonus credits on signup!
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="rounded-xl border border-border/40 bg-card p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Users size={16} className="text-primary" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Signups</span>
                </div>
                <p className="font-display text-3xl font-black text-foreground">{data?.totalSignups ?? 0}</p>
              </div>
              <div className="rounded-xl border border-border/40 bg-card p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Gift size={16} className="text-primary" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Qualified</span>
                </div>
                <p className="font-display text-3xl font-black text-foreground">{data?.qualifiedReferrals ?? 0}</p>
              </div>
              <div className="rounded-xl border border-border/40 bg-card p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Zap size={16} className="text-primary" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Rewards Earned</span>
                </div>
                <p className="font-display text-3xl font-black text-foreground">{data?.totalRewardsEarned ?? 0} credits</p>
              </div>
            </div>

            {/* Apply a code */}
            <div className="rounded-xl border border-border/40 bg-card p-6">
              <h2 className="font-display text-sm font-bold text-foreground mb-4 uppercase tracking-wider">Have a Referral Code?</h2>
              <div className="flex gap-3">
                <Input
                  placeholder="Enter code (e.g. FUSE-ABC123)"
                  value={applyCode}
                  onChange={e => setApplyCode(e.target.value)}
                  className="bg-secondary border-border text-foreground"
                />
                <Button
                  onClick={handleApply}
                  disabled={applying || !applyCode.trim()}
                  className="gradient-primary text-primary-foreground font-bold border-0"
                >
                  {applying ? "Applying..." : "Apply"}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Referrals;
