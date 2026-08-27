import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Gift, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export default function EarnCreditsCard() {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["my-referral"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("referrals", {
        body: { action: "get-my-code" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { code?: string; referrals?: unknown[] };
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const referralCount = Array.isArray(data?.referrals) ? data!.referrals!.length : null;

  return (
    <section className="rounded-[2rem] border border-cyan-300/20 bg-cyan-300/[0.05] p-6">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-xl">
          <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-cyan-100">
            <Gift className="h-3.5 w-3.5" aria-hidden="true" />
            Earn free credits
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-[-0.03em] text-white">
            Refer creators and brands — you both get credits.
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Share your referral link. When someone signs up and starts building, credits land on both accounts.
          </p>

          {data?.code ? (
            <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
              <span>
                Your code: <span className="font-mono text-cyan-200">{data.code}</span>
              </span>
              {referralCount !== null ? (
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" aria-hidden="true" />
                  {referralCount} referred
                </span>
              ) : null}
            </p>
          ) : null}
        </div>

        <Button asChild className="rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200">
          <Link to="/referrals">Get your referral link</Link>
        </Button>
      </div>
    </section>
  );
}
