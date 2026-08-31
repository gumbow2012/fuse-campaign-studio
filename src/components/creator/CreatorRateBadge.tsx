/**
 * Read-only creator rate display. Shows ONLY the signed-in creator's own effective share.
 * Creators cannot edit it, and no other creator's rate (or audit history) is exposed.
 */

import { useEffect, useState } from "react";
import { Percent } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { bpsToPercent } from "@/lib/creatorEconomics";

export default function CreatorRateBadge({ className = "" }: { className?: string }) {
  const [sharePercent, setSharePercent] = useState<number | null>(null);
  const [custom, setCustom] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await supabase.functions.invoke("admin-creator-economics", {
        body: { action: "my_rate" },
      });
      if (!active || error || !data) return;
      const bps = Number((data as Record<string, unknown>).effectiveShareBps);
      if (!Number.isFinite(bps)) return;
      setSharePercent(bpsToPercent(bps));
      setCustom((data as Record<string, unknown>).source === "custom");
    })();
    return () => {
      active = false;
    };
  }, []);

  if (sharePercent === null) return null;

  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 ${className}`}
      aria-live="polite"
    >
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/80">
        <Percent className="h-3.5 w-3.5" />
        {custom ? "VIP creator rate" : "Your creator rate"}
      </p>
      <p className="mt-1 text-sm text-foreground">
        You keep <span className="font-semibold text-cyan-200">{sharePercent}%</span> of your template royalty.
      </p>
    </div>
  );
}
