/**
 * ADMIN-ONLY per-creator revenue share control (P5A).
 *
 * Money-sensitive: bounds come from platform_economics_config (never hardcoded) and the
 * edge function `admin-creator-economics` re-validates + enforces admin access server-side.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Percent, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  bpsToPercent,
  loadPlatformEconomicsConfig,
  percentToBps,
  type PlatformEconomicsConfig,
} from "@/lib/creatorEconomics";

type Props = {
  userId: string;
  label: string;
  callFunction: (name: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

export default function CreatorRevenueShareControl({ userId, label, callFunction }: Props) {
  const [config, setConfig] = useState<PlatformEconomicsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"default" | "custom">("default");
  const [percent, setPercent] = useState<number | null>(null);
  const [effectiveBps, setEffectiveBps] = useState<number | null>(null);
  const [source, setSource] = useState<"default" | "custom">("default");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, data] = await Promise.all([
        loadPlatformEconomicsConfig(),
        callFunction("admin-creator-economics", { action: "get", userId }),
      ]);
      setConfig(cfg);
      const nextSource = data.source === "custom" ? "custom" : "default";
      const effective = Number(data.effectiveShareBps);
      const custom = data.customShareBps === null || data.customShareBps === undefined
        ? null
        : Number(data.customShareBps);
      setSource(nextSource);
      setEffectiveBps(Number.isFinite(effective) ? effective : null);
      setMode(nextSource);
      setPercent(bpsToPercent(custom ?? effective));
    } catch (error) {
      toast({
        title: "Could not load revenue share",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [callFunction, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const minPercent = config ? bpsToPercent(config.creatorShareMinBps) : null;
  const maxPercent = config ? bpsToPercent(config.creatorShareMaxBps) : null;
  const defaultPercent = config ? bpsToPercent(config.defaultCreatorShareBps) : null;

  const save = async () => {
    if (mode === "custom") {
      if (percent === null || minPercent === null || maxPercent === null) return;
      if (percent < minPercent || percent > maxPercent) {
        toast({
          title: `Enter a rate between ${minPercent}% and ${maxPercent}%`,
          variant: "destructive",
        });
        return;
      }
    }
    setSaving(true);
    try {
      const data = await callFunction("admin-creator-economics", {
        action: "set_creator_share",
        userId,
        shareBps: mode === "custom" && percent !== null ? percentToBps(percent) : null,
      });
      setSource(data.source === "custom" ? "custom" : "default");
      const effective = Number(data.effectiveShareBps);
      setEffectiveBps(Number.isFinite(effective) ? effective : null);
      toast({
        title: "Revenue share saved",
        description: `${label} keeps ${bpsToPercent(effective)}%.`,
      });
    } catch (error) {
      toast({
        title: "Could not save revenue share",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const creatorPercent = mode === "custom" ? percent ?? defaultPercent ?? 0 : defaultPercent ?? 0;
  const fusePercent = 100 - creatorPercent;

  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-background/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/70">
          <Percent className="h-3.5 w-3.5 text-cyan-300" />
          Creator revenue share
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
            source === "custom"
              ? "border-amber-300/40 bg-amber-400/10 text-amber-200"
              : "border-white/15 bg-white/5 text-muted-foreground"
          }`}
        >
          {source === "custom" ? "Custom agreement" : "Platform default"}
        </span>
      </div>

      {loading ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading rate…
        </p>
      ) : !config ? (
        <p className="mt-3 text-xs text-muted-foreground">Economics config unavailable.</p>
      ) : (
        <>
          <div className="mt-3 space-y-2 text-sm">
            <label className="flex items-center gap-2 text-foreground/90">
              <input
                type="radio"
                name={`share-mode-${userId}`}
                checked={mode === "default"}
                onChange={() => setMode("default")}
              />
              Use platform default — {defaultPercent}%
            </label>
            <label className="flex items-center gap-2 text-foreground/90">
              <input
                type="radio"
                name={`share-mode-${userId}`}
                checked={mode === "custom"}
                onChange={() => setMode("custom")}
              />
              Custom rate
            </label>
          </div>

          {mode === "custom" ? (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor={`share-input-${userId}`} className="text-xs text-foreground/70">
                  Creator keeps (%)
                </Label>
                <Input
                  id={`share-input-${userId}`}
                  type="number"
                  min={minPercent ?? undefined}
                  max={maxPercent ?? undefined}
                  step={1}
                  value={percent ?? ""}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setPercent(Number.isFinite(next) ? next : null);
                  }}
                  className="mt-1 h-10 w-28"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Allowed {minPercent}–{maxPercent}%
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-muted-foreground">
                FUSE marketplace share {Number.isFinite(fusePercent) ? fusePercent : "—"}%
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted-foreground">
              Effective now: {effectiveBps === null ? "—" : `${bpsToPercent(effectiveBps)}%`}
            </p>
            <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
