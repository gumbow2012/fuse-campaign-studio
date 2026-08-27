/**
 * FUSE LIVE — admin analytics dashboard.
 *
 * TRUTHFULNESS
 *  - Every number is read from a deployed admin RPC or analytics_events.
 *  - Missing source (RPC not available / event never fired) renders "—" plus a
 *    "needs event" note. Nothing is estimated or extrapolated.
 *  - "ACTIVE LAST 5 MIN" is admin_active_recent(5).sessions — measured activity,
 *    not browser presence.
 *  - Analytics failures are swallowed; they never affect product behaviour.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, Coins, Radio, Users, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  eventCount,
  eventSessions,
  fetchActiveRecent,
  fetchCreditsSummary,
  fetchDaily,
  fetchEventCounts,
  fetchGenerationHealth,
  fetchLiveFailures,
  fetchRecentEvents,
  fetchTemplateActivity,
  maskId,
  num,
  type StreamEvent,
} from "@/lib/analytics/adminMetrics";

const REFRESH_MS = 20_000;

type RangeKey = "live" | "today" | "7d" | "30d" | "90d";

const RANGES: { key: RangeKey; label: string; minutes: number; days: number }[] = [
  { key: "live", label: "LIVE", minutes: 5, days: 1 },
  { key: "today", label: "TODAY", minutes: 60 * 24, days: 1 },
  { key: "7d", label: "7D", minutes: 60 * 24 * 7, days: 7 },
  { key: "30d", label: "30D", minutes: 60 * 24 * 30, days: 30 },
  { key: "90d", label: "90D", minutes: 60 * 24 * 90, days: 90 },
];

const fmt = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : null;

function Metric({
  icon: Icon,
  label,
  value,
  note,
  hint,
}: {
  icon?: typeof Zap;
  label: string;
  value: number | null;
  note?: string;
  hint?: string;
}) {
  const rendered = fmt(value);
  return (
    <div className="rounded-xl border border-border/40 bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        {Icon ? <Icon size={14} className="text-primary" /> : null}
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{label}</span>
      </div>
      <p className="font-display text-2xl font-black text-foreground">{rendered ?? "—"}</p>
      {rendered === null ? (
        <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{note ?? "needs event"}</p>
      ) : hint ? (
        <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function FunnelRow({
  step,
  value,
  previous,
  note,
}: {
  step: string;
  value: number | null;
  previous: number | null;
  note?: string;
}) {
  const rendered = fmt(value);
  const rate =
    typeof value === "number" && typeof previous === "number" && previous > 0
      ? `${((value / previous) * 100).toFixed(1)}%`
      : "—";
  return (
    <div className="flex items-center justify-between border-b border-border/20 py-2 text-sm last:border-0">
      <span className="text-foreground">{step}</span>
      <span className="flex items-center gap-4">
        <span className="font-display font-bold text-foreground">{rendered ?? "—"}</span>
        <span className="w-16 text-right text-xs text-muted-foreground">{rendered === null ? (note ?? "needs event") : rate}</span>
      </span>
    </div>
  );
}

export default function LiveAnalytics() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("live");
  const range = RANGES.find((entry) => entry.key === rangeKey) ?? RANGES[0];
  const [stream, setStream] = useState<StreamEvent[]>([]);

  const common = { refetchInterval: REFRESH_MS, refetchOnWindowFocus: false } as const;

  const active = useQuery({ queryKey: ["fuse-live-active"], queryFn: () => fetchActiveRecent(5), ...common });
  const daily = useQuery({ queryKey: ["fuse-live-daily", 1], queryFn: () => fetchDaily(1), ...common });
  const todayEvents = useQuery({ queryKey: ["fuse-live-events", 1], queryFn: () => fetchEventCounts(1), ...common });
  const rangeEvents = useQuery({
    queryKey: ["fuse-live-events", range.days],
    queryFn: () => fetchEventCounts(range.days),
    ...common,
  });
  const health = useQuery({
    queryKey: ["fuse-live-health", range.minutes],
    queryFn: () => fetchGenerationHealth(range.minutes),
    ...common,
  });
  const failures = useQuery({
    queryKey: ["fuse-live-failures", range.minutes],
    queryFn: () => fetchLiveFailures(range.minutes, 8),
    ...common,
  });
  const templates = useQuery({
    queryKey: ["fuse-live-template-activity", range.days],
    queryFn: () => fetchTemplateActivity(range.days, 12),
    ...common,
  });
  const credits = useQuery({
    queryKey: ["fuse-live-credits", range.days],
    queryFn: () => fetchCreditsSummary(range.days),
    ...common,
  });
  const recent = useQuery({ queryKey: ["fuse-live-stream"], queryFn: () => fetchRecentEvents(30), ...common });

  useEffect(() => {
    if (recent.data?.list) setStream(recent.data.list);
  }, [recent.data]);

  // Realtime prepend. If Realtime is not enabled for the table the polling above
  // still refreshes the feed — the subscription simply never fires.
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel("admin-live-analytics")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "analytics_events" }, (payload) => {
          try {
            const row = payload.new as StreamEvent;
            if (!row?.id) return;
            setStream((prev) => (prev.some((item) => item.id === row.id) ? prev : [row, ...prev].slice(0, 40)));
          } catch {
            /* analytics must never break the page */
          }
        })
        .subscribe();
    } catch {
      channel = null;
    }
    return () => {
      try {
        if (channel) supabase.removeChannel(channel);
      } catch {
        /* ignore */
      }
    };
  }, []);

  const todayRow = daily.data?.list?.[0] ?? null;
  const todayList = todayEvents.data?.list ?? [];
  const rangeList = rangeEvents.data?.list ?? [];
  const healthRow = health.data?.row ?? null;
  const creditsRow = credits.data?.row ?? null;

  const funnel = useMemo(() => {
    const visitors = eventSessions(rangeList, "page_view");
    const signups = eventCount(rangeList, "sign_up");
    const brand = eventCount(rangeList, "brand_setup_complete");
    const views = eventCount(rangeList, "template_view");
    const generate = num(healthRow?.runs) ?? eventCount(rangeList, "generate");
    const complete = num(healthRow?.success) ?? eventCount(rangeList, "campaign_complete");
    const paid = eventCount(rangeList, "paid");
    return { visitors, signups, brand, views, generate, complete, paid };
  }, [rangeList, healthRow]);

  const successRate =
    healthRow && (num(healthRow.runs) ?? 0) > 0
      ? `${(((num(healthRow.success) ?? 0) / (num(healthRow.runs) ?? 1)) * 100).toFixed(1)}%`
      : "—";

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-black text-foreground">FUSE LIVE</h2>
          <p className="text-xs text-muted-foreground">
            Measured activity only. Aggregates refresh every 20s; the event stream is live.
          </p>
        </div>
        <div className="inline-flex rounded-full border border-border/50 bg-background/40 p-1">
          {RANGES.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setRangeKey(entry.key)}
              className={`rounded-full px-3 py-1 text-[11px] font-bold tracking-wide transition-colors ${
                rangeKey === entry.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {/* TOP ROW */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Metric
          icon={Radio}
          label="Active last 5 min"
          value={num(active.data?.row?.sessions ?? null)}
          note="no source"
          hint="sessions with activity"
        />
        <Metric icon={Users} label="Today's sessions" value={num(todayRow?.sessions ?? null)} note="no events today" />
        <Metric icon={Users} label="Signups today" value={eventCount(todayList, "sign_up")} />
        <Metric icon={Zap} label={`Campaign runs (${range.label})`} value={num(healthRow?.runs ?? null)} note="no source" />
        <Metric icon={Activity} label="Brand setups" value={eventCount(rangeList, "brand_setup_complete")} />
        <Metric icon={Coins} label="Paid conversions" value={eventCount(rangeList, "paid")} />
      </div>

      {/* GENERATION HEALTH */}
      <div className="rounded-xl border border-border/40 bg-card p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="font-display text-sm font-bold uppercase tracking-[0.15em] text-foreground">Generation health</h3>
          <span className="text-xs text-muted-foreground">{range.label} window</span>
        </div>
        {health.data && !health.data.available ? (
          <p className="text-sm text-muted-foreground">Generation health is unavailable for this account.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            {[
              ["Runs", num(healthRow?.runs ?? null)],
              ["Success", num(healthRow?.success ?? null)],
              ["Failed", num(healthRow?.failed ?? null)],
              ["Running", num(healthRow?.running ?? null)],
              ["Queued", num(healthRow?.queued ?? null)],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{String(label)}</p>
                <p className="font-display text-2xl font-black text-foreground">{fmt(value as number | null) ?? "—"}</p>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          Success rate: <span className="font-semibold text-foreground">{successRate}</span>
        </p>

        <div className="mt-6">
          <p className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            <AlertTriangle size={12} className="text-destructive" /> Failures right now
          </p>
          {failures.data && !failures.data.available ? (
            <p className="text-sm text-muted-foreground">Failure feed unavailable.</p>
          ) : (failures.data?.list.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No failures in this window.</p>
          ) : (
            <div className="space-y-2">
              {failures.data?.list.map((row) => (
                <Link
                  key={`${row.template_id ?? "unknown"}-${row.last_failed_at ?? ""}`}
                  to={`/admin/audits${row.template_id ? `?template=${encodeURIComponent(row.template_id)}` : ""}`}
                  className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm transition-colors hover:border-destructive/60"
                >
                  <span className="text-foreground">{row.template ?? row.template_id ?? "Unknown template"}</span>
                  <span className="text-xs text-muted-foreground">
                    {fmt(num(row.failures)) ?? "—"} failed ·{" "}
                    {row.last_failed_at ? new Date(row.last_failed_at).toLocaleTimeString() : "—"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* LIVE EVENT STREAM */}
        <div className="rounded-xl border border-border/40 bg-card p-6">
          <h3 className="mb-4 font-display text-sm font-bold uppercase tracking-[0.15em] text-foreground">Live event stream</h3>
          {recent.data && !recent.data.available ? (
            <p className="text-sm text-muted-foreground">Event stream unavailable for this account.</p>
          ) : stream.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events recorded yet.</p>
          ) : (
            <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
              {stream.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-3 border-b border-border/15 py-1.5 text-xs last:border-0">
                  <span className="font-semibold text-foreground">{row.event_name ?? "event"}</span>
                  <span className="truncate text-muted-foreground">{row.path ?? "—"}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {maskId(row.user_id ?? row.session_id)} · {new Date(row.created_at).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* PRODUCT FUNNEL */}
        <div className="rounded-xl border border-border/40 bg-card p-6">
          <h3 className="mb-4 font-display text-sm font-bold uppercase tracking-[0.15em] text-foreground">
            Product funnel · {range.label}
          </h3>
          <FunnelRow step="Visitor (sessions)" value={funnel.visitors} previous={null} />
          <FunnelRow step="Signup" value={funnel.signups} previous={funnel.visitors} />
          <FunnelRow step="Brand built" value={funnel.brand} previous={funnel.signups} />
          <FunnelRow step="Template view" value={funnel.views} previous={funnel.signups} />
          <FunnelRow step="Generate" value={funnel.generate} previous={funnel.views} note="no source" />
          <FunnelRow step="Complete" value={funnel.complete} previous={funnel.generate} note="no source" />
          <FunnelRow step="Paid" value={funnel.paid} previous={funnel.signups} />
        </div>
      </div>

      {/* CREDITS */}
      <div className="rounded-xl border border-border/40 bg-card p-6">
        <h3 className="mb-4 font-display text-sm font-bold uppercase tracking-[0.15em] text-foreground">
          Credits · {range.label}
        </h3>
        {credits.data && !credits.data.available ? (
          <p className="text-sm text-muted-foreground">Credit summary unavailable.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              ["Granted", num(creditsRow?.granted ?? null)],
              ["Spent", num(creditsRow?.spent ?? null)],
              ["Net", num(creditsRow?.net ?? null)],
              ["Ledger entries", num(creditsRow?.entries ?? null)],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{String(label)}</p>
                <p className="font-display text-2xl font-black text-foreground">{fmt(value as number | null) ?? "—"}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* TEMPLATE ACTIVITY */}
      <div className="rounded-xl border border-border/40 bg-card p-6">
        <h3 className="mb-4 font-display text-sm font-bold uppercase tracking-[0.15em] text-foreground">
          Template activity · {range.label}
        </h3>
        {templates.data && !templates.data.available ? (
          <p className="text-sm text-muted-foreground">Template activity unavailable.</p>
        ) : (templates.data?.list.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No template runs in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  {["Template", "Runs", "Complete", "Fail", "Credits"].map((head) => (
                    <th key={head} className="border-b border-border/30 pb-2 text-left font-bold">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {templates.data?.list.map((row) => (
                  <tr key={`${row.template_id ?? row.template}`} className="border-b border-border/15 last:border-0">
                    <td className="py-2 text-foreground">{row.template ?? row.template_id ?? "Unknown"}</td>
                    <td className="py-2 text-muted-foreground">{fmt(num(row.runs)) ?? "—"}</td>
                    <td className="py-2 text-muted-foreground">{fmt(num(row.complete)) ?? "—"}</td>
                    <td className="py-2 text-muted-foreground">{fmt(num(row.fail)) ?? "—"}</td>
                    <td className="py-2 text-muted-foreground">{fmt(num(row.credits)) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
