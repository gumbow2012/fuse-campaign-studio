import { useState } from "react";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Gift, Users, Zap, Copy, Check, Link2 } from "lucide-react";
import { getSiteUrl } from "@/lib/site-url";
import { track } from "@/lib/analytics/track";

type ReferralConfig = {
  enabled: boolean;
  signup_bonus_credits: number;
  referrer_bonus_credits_on_paid: number;
  paid_trigger: string;
};

type RecentReferral = {
  id: string;
  maskedEmail: string;
  status: string;
  creditsEarned: number;
  at: string | null;
};

type ReferralData = {
  code?: string;
  totalSignups?: number;
  qualifiedReferrals?: number;
  totalRewardsEarned?: number;
  config?: ReferralConfig | null;
  recent?: RecentReferral[];
};

const Referrals = () => {
  const { user } = useAuth();
  const [applyCode, setApplyCode] = useState("");
  const [applying, setApplying] = useState(false);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<ReferralData>({
    queryKey: ["my-referral"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("referrals", {
        body: { action: "get-my-code" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as ReferralData;
    },
    enabled: !!user,
  });

  const config = data?.config ?? null;
  const rewardsOn = !!config?.enabled;
  const shareUrl = data?.code ? `${getSiteUrl()}/join/${data.code}` : "";
  const shareLabel = shareUrl.replace(/^https?:\/\//, "");

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

  const copyValue = (kind: "link" | "code") => {
    const value = kind === "link" ? shareUrl : data?.code;
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
    track("referral_link_copied", { kind });
    toast({ title: "Copied!", description: kind === "link" ? "Referral link copied." : "Referral code copied." });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-16 container mx-auto px-6 max-w-2xl">
        <h1 className="font-display text-3xl sm:text-4xl font-black text-foreground mb-2 uppercase tracking-tight">
          Share FUSE. Earn more creative.
        </h1>
        <p className="text-muted-foreground text-sm mb-8">
          Invite brands to FUSE. Earn credits when they become paying members.
        </p>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : isError ? (
          <div className="rounded-xl border border-border/40 bg-card p-6">
            <h2 className="font-display text-sm font-bold text-foreground mb-2 uppercase tracking-wider">
              Could not load your referral program.
            </h2>
            <p className="text-xs text-muted-foreground mb-4">Something went wrong on our side. Try again in a moment.</p>
            <Button
              onClick={() => refetch()}
              variant="outline"
              className="border-border/50 text-foreground bg-secondary hover:bg-secondary/80"
            >
              Try again
            </Button>
          </div>
        ) : (
          <>
            {/* Referral link */}
            <div className="rounded-xl border border-border/40 bg-card p-6 mb-6">
              <h2 className="font-display text-sm font-bold text-foreground mb-4 uppercase tracking-wider">Your Referral Link</h2>
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 min-w-0 rounded-lg bg-secondary border border-border px-4 py-3 flex items-center gap-2">
                  <Link2 size={14} className="text-primary shrink-0" />
                  <p className="truncate text-sm font-medium text-foreground">{shareLabel || "—"}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => copyValue("link")}
                  disabled={!shareUrl}
                  className="gradient-primary text-primary-foreground font-bold border-0"
                >
                  {copied === "link" ? <Check size={14} className="mr-2" /> : <Copy size={14} className="mr-2" />}
                  Copy link
                </Button>
                <Button
                  onClick={() => copyValue("code")}
                  disabled={!data?.code}
                  variant="outline"
                  className="border-border/50 text-foreground bg-secondary hover:bg-secondary/80"
                >
                  {copied === "code" ? <Check size={14} className="mr-2" /> : <Copy size={14} className="mr-2" />}
                  Copy code {data?.code ? `· ${data.code}` : ""}
                </Button>
              </div>

              {rewardsOn && config && (
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border/40 bg-secondary/50 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-1">Your friend gets</p>
                    <p className="font-display text-xl font-black text-foreground">{config.signup_bonus_credits} signup credits</p>
                  </div>
                  <div className="rounded-lg border border-border/40 bg-secondary/50 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-1">You earn</p>
                    <p className="font-display text-xl font-black text-foreground">
                      {config.referrer_bonus_credits_on_paid} FUSE credits
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">when they qualify as a paying member.</p>
                  </div>
                </div>
              )}
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
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">Credits Earned</span>
                </div>
                <p className="font-display text-3xl font-black text-foreground">{data?.totalRewardsEarned ?? 0}</p>
              </div>
            </div>

            {/* Activity */}
            <div className="rounded-xl border border-border/40 bg-card p-6 mb-6">
              <h2 className="font-display text-sm font-bold text-foreground mb-4 uppercase tracking-wider">Recent Referrals</h2>
              {(data?.recent?.length ?? 0) === 0 ? (
                <p className="text-xs text-muted-foreground">No referrals yet. Share your link to get started.</p>
              ) : (
                <ul className="divide-y divide-border/40">
                  {data!.recent!.map(item => {
                    const paid = item.status === "QUALIFIED" || item.status === "REWARDED";
                    return (
                      <li key={item.id} className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{item.maskedEmail}</p>
                          <p className="text-xs text-muted-foreground">
                            {paid
                              ? `Paid member${item.creditsEarned > 0 ? ` — +${item.creditsEarned} credits` : ""}`
                              : "New signup — pending qualification"}
                          </p>
                        </div>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-[0.15em] shrink-0 ${
                            paid ? "text-primary" : "text-muted-foreground"
                          }`}
                        >
                          {paid ? "Qualified" : "Pending"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
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
