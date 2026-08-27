import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type AdminStats = {
  config: {
    enabled: boolean;
    signup_bonus_credits: number;
    referrer_bonus_credits_on_paid: number;
    paid_trigger: string;
  } | null;
  counts: { attributed: number; qualified: number; rewarded: number; total: number };
  creditsIssued: number;
};

const Stat = ({ label, value, tone }: { label: string; value: string | number; tone?: string }) => (
  <div>
    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground mb-1">{label}</p>
    <p className={`font-display text-xl font-black ${tone ?? "text-foreground"}`}>{value}</p>
  </div>
);

const AdminReferrals = () => {
  const queryClient = useQueryClient();
  const [signupBonus, setSignupBonus] = useState("");
  const [referrerBonus, setReferrerBonus] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery<AdminStats>({
    queryKey: ["admin-referral-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("referrals", { body: { action: "admin-stats" } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as AdminStats;
    },
  });

  useEffect(() => {
    if (data?.config) {
      setSignupBonus(String(data.config.signup_bonus_credits));
      setReferrerBonus(String(data.config.referrer_bonus_credits_on_paid));
    }
  }, [data?.config?.signup_bonus_credits, data?.config?.referrer_bonus_credits_on_paid]);

  const update = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { data, error } = await supabase.functions.invoke("referrals", {
        body: { action: "admin-update-config", ...patch },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast({ title: "Referral program updated" });
      queryClient.invalidateQueries({ queryKey: ["admin-referral-stats"] });
      queryClient.invalidateQueries({ queryKey: ["referral-config"] });
      queryClient.invalidateQueries({ queryKey: ["my-referral"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading referral program…</p>;

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-border/40 bg-card p-5">
        <p className="text-sm text-foreground mb-3">Could not load the referral program.</p>
        <Button variant="outline" onClick={() => refetch()} className="border-border/50 bg-secondary">
          Try again
        </Button>
      </div>
    );
  }

  const config = data.config;
  const amountsChanged =
    !!config &&
    (Number(signupBonus) !== config.signup_bonus_credits ||
      Number(referrerBonus) !== config.referrer_bonus_credits_on_paid);

  const saveAmounts = () => {
    update.mutate({
      signup_bonus_credits: Number(signupBonus),
      referrer_bonus_credits_on_paid: Number(referrerBonus),
    });
    setConfirmOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/40 bg-card p-5">
        <h3 className="text-sm font-bold text-foreground mb-4">Program Status</h3>
        {config ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat
              label="Status"
              value={config.enabled ? "Active" : "Disabled"}
              tone={config.enabled ? "text-green-400" : "text-red-400"}
            />
            <Stat label="Signup Bonus" value={`${config.signup_bonus_credits} credits`} />
            <Stat label="Referrer Reward" value={`${config.referrer_bonus_credits_on_paid} credits`} />
            <Stat label="Qualifying Trigger" value={config.paid_trigger} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No config row yet — saving amounts will create one.</p>
        )}
      </div>

      <div className="rounded-xl border border-border/40 bg-card p-5">
        <h3 className="text-sm font-bold text-foreground mb-4">Counts</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Attributed" value={data.counts.attributed} />
          <Stat label="Qualified" value={data.counts.qualified} />
          <Stat label="Rewarded" value={data.counts.rewarded} />
          <Stat label="Credits Issued" value={data.creditsIssued} />
        </div>
      </div>

      <div className="rounded-xl border border-border/40 bg-card p-5 space-y-5">
        <h3 className="text-sm font-bold text-foreground">Configuration</h3>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Program enabled</p>
            <p className="text-xs text-muted-foreground">When off, rewards are not advertised or granted.</p>
          </div>
          <Switch
            checked={!!config?.enabled}
            disabled={update.isPending}
            onCheckedChange={checked => update.mutate({ enabled: checked })}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
              Signup bonus credits
            </label>
            <Input
              type="number"
              min={0}
              value={signupBonus}
              onChange={e => setSignupBonus(e.target.value)}
              className="mt-1 bg-secondary border-border text-foreground"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
              Referrer reward credits (on paid)
            </label>
            <Input
              type="number"
              min={0}
              value={referrerBonus}
              onChange={e => setReferrerBonus(e.target.value)}
              className="mt-1 bg-secondary border-border text-foreground"
            />
          </div>
        </div>

        <Button
          onClick={() => setConfirmOpen(true)}
          disabled={!amountsChanged || update.isPending}
          className="gradient-primary text-primary-foreground font-bold border-0"
        >
          {update.isPending ? "Saving…" : "Save amounts"}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update reward amounts?</AlertDialogTitle>
            <AlertDialogDescription>
              New signup bonus: {signupBonus} credits · New referrer reward: {referrerBonus} credits. Future referrals use
              these values immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={saveAmounts}>Save</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminReferrals;
