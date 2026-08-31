/**
 * P5B — Creator royalty pricing UI + customer-impact preview.
 *
 * STORE ONLY: this panel persists the creator's chosen royalty on
 * fuse_templates.creator_royalty_cents and previews customer impact.
 * It does NOT change what customers are charged at run time and never
 * creates earnings records (P5C). All economics come from
 * platform_economics_config — nothing is hardcoded.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Minus, Plus, Save, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { bpsToPercent, type PlatformEconomicsConfig } from "@/lib/creatorEconomics";
import { getTemplateCreditCostByOutputCount } from "../../../supabase/functions/_shared/template-pricing";

const STEP_CENTS = 50;

type EconomicsRow = Record<string, unknown>;

function toConfig(row: EconomicsRow | null): PlatformEconomicsConfig | null {
  if (!row) return null;
  const num = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return {
    id: String(row.id ?? ""),
    defaultCreatorShareBps: num(row.default_creator_share_bps),
    creatorShareMinBps: num(row.creator_share_min_bps),
    creatorShareMaxBps: num(row.creator_share_max_bps),
    creatorRoyaltyMinCents: num(row.creator_royalty_min_cents),
    creatorRoyaltyMaxCents: num(row.creator_royalty_max_cents),
    adminExceptionMaxCents: num(row.admin_exception_max_cents),
    recommendedRoyaltyCents: num(row.recommended_royalty_cents),
    royaltyCreditsPerUsd: num(row.royalty_credits_per_usd),
    payoutHoldDays: num(row.payout_hold_days),
    payoutMinimumCents: num(row.payout_minimum_cents),
    payoutCadence: String(row.payout_cadence ?? ""),
  };
}

function usd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function surchargeCredits(args: {
  royaltyCents: number;
  shareBps: number;
  creditsPerUsd: number;
}) {
  const share = args.shareBps / 10000;
  if (!share || !Number.isFinite(share)) return 0;
  return Math.ceil((args.royaltyCents / 100 / share) * args.creditsPerUsd);
}

type Props = {
  templateId: string | null;
  outputCount: number;
  invoke: (body: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

export default function CreatorRoyaltyPanel({ templateId, outputCount, invoke }: Props) {
  const [config, setConfig] = useState<PlatformEconomicsConfig | null>(null);
  const [shareBps, setShareBps] = useState<number | null>(null);
  const [monetized, setMonetized] = useState(false);
  const [royaltyCents, setRoyaltyCents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!templateId) return;
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const data = await invoke({ action: "template_royalty", templateId });
        if (!active) return;
        const nextConfig = toConfig((data.config as EconomicsRow) ?? null);
        setConfig(nextConfig);
        setShareBps(Number(data.effectiveShareBps) || nextConfig?.defaultCreatorShareBps || null);
        const stored = data.royaltyCents === null || data.royaltyCents === undefined
          ? null
          : Number(data.royaltyCents);
        setMonetized(stored !== null);
        setRoyaltyCents(stored ?? nextConfig?.recommendedRoyaltyCents ?? 0);
      } catch {
        if (active) setConfig(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [invoke, templateId]);

  const minCents = config?.creatorRoyaltyMinCents ?? 0;
  const maxCents = config?.creatorRoyaltyMaxCents ?? 0;
  const recommended = config?.recommendedRoyaltyCents ?? 0;
  const sharePercent = shareBps ? bpsToPercent(shareBps) : null;

  const baseCredits = useMemo(() => getTemplateCreditCostByOutputCount(outputCount), [outputCount]);
  const surcharge = useMemo(() => {
    if (!monetized || !config || !shareBps) return 0;
    return surchargeCredits({
      royaltyCents,
      shareBps,
      creditsPerUsd: config.royaltyCreditsPerUsd,
    });
  }, [config, monetized, royaltyCents, shareBps]);

  const adjust = useCallback((delta: number) => {
    setRoyaltyCents((current) => {
      const next = current + delta;
      return Math.min(maxCents, Math.max(minCents, next));
    });
  }, [maxCents, minCents]);

  const save = useCallback(async () => {
    if (!templateId) return;
    setSaving(true);
    try {
      const data = await invoke({
        action: "set_template_royalty",
        templateId,
        royaltyCents: monetized ? royaltyCents : null,
      });
      const saved = data.royaltyCents === null || data.royaltyCents === undefined
        ? null
        : Number(data.royaltyCents);
      setMonetized(saved !== null);
      if (saved !== null) setRoyaltyCents(saved);
      toast({
        title: saved === null ? "Set to not monetized" : "Royalty saved",
        description: saved === null
          ? "This template is free to run — you earn nothing per run."
          : `You earn ${usd(saved)} per successful run.`,
      });
    } catch (error) {
      toast({
        title: "Could not save royalty",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [invoke, monetized, royaltyCents, templateId]);

  if (!templateId) return null;

  if (loading || !config) {
    return (
      <div className="rounded-2xl border border-border/50 bg-background/45 p-5 text-sm text-foreground/60">
        {loading ? "Loading royalty settings…" : "Royalty settings are unavailable right now."}
      </div>
    );
  }

  const atMax = monetized && royaltyCents >= maxCents;
  const raisesCost = monetized && surcharge > 0;

  return (
    <div className="rounded-2xl border border-border/50 bg-background/45 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-foreground">Set your royalty</h3>
          <p className="mt-1 text-sm text-foreground/65">Earn every time someone runs your template.</p>
        </div>
        <label className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em] text-foreground/70">
          {monetized ? "Monetized" : "Not monetized / free"}
          <Switch
            checked={monetized}
            onCheckedChange={(checked) => {
              setMonetized(checked);
              if (checked && royaltyCents < minCents) setRoyaltyCents(recommended || minCents);
            }}
            aria-label="Monetize this template"
          />
        </label>
      </div>

      {monetized ? (
        <>
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/55">
            How much do you want to earn each time this template runs?
          </p>
          <div className="mt-3 flex items-center gap-4">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="rounded-xl"
              onClick={() => adjust(-STEP_CENTS)}
              disabled={royaltyCents <= minCents}
              aria-label="Decrease royalty"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="min-w-[110px] text-center text-3xl font-bold tabular-nums text-foreground">
              {usd(royaltyCents)}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="rounded-xl"
              onClick={() => adjust(STEP_CENTS)}
              disabled={royaltyCents >= maxCents}
              aria-label="Increase royalty"
            >
              <Plus className="h-4 w-4" />
            </Button>
            {royaltyCents === recommended ? (
              <span className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-100">
                Recommended
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-foreground/50">
            {usd(minCents)}–{usd(maxCents)} in {usd(STEP_CENTS)} steps · recommended {usd(recommended)}
          </p>

          <div className="mt-5 flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3">
            <TrendingUp className="h-4 w-4 text-emerald-200" />
            <p className="text-lg font-bold text-emerald-100">
              You earn {usd(royaltyCents)} <span className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-100/70">/ successful run</span>
            </p>
          </div>

          <dl className="mt-4 grid gap-2 rounded-xl border border-border/40 bg-card/50 p-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-foreground/60">Your earning</dt>
              <dd className="font-semibold text-foreground">{usd(royaltyCents)} / run</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-foreground/60">Your creator rate</dt>
              <dd className="font-semibold text-foreground">{sharePercent === null ? "—" : `${sharePercent}%`}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-foreground/60">Base campaign cost</dt>
              <dd className="font-semibold text-foreground">{baseCredits} CR</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-foreground/60">Creator marketplace surcharge</dt>
              <dd className="font-semibold text-foreground">~{surcharge} CR</dd>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-border/40 pt-2">
              <dt className="font-semibold text-foreground/80">Customer run cost</dt>
              <dd className="font-bold text-cyan-100">~{baseCredits + surcharge} CR</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-foreground/60">You earn</dt>
              <dd className="font-semibold text-emerald-200">{usd(royaltyCents)}</dd>
            </div>
          </dl>

          {atMax ? (
            <p className="mt-3 text-xs text-amber-100/80">
              Higher price — may reduce how often customers run this template.
            </p>
          ) : raisesCost ? (
            <p className="mt-3 text-xs text-foreground/55">
              Higher royalties increase the credits customers need to run this template.
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-4 text-sm text-foreground/60">
          This template is free to run. Turn on monetization to earn a royalty each time it runs.
        </p>
      )}

      <div className="mt-5">
        <Button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save royalty
        </Button>
      </div>
    </div>
  );
}
