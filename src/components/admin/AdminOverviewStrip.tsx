/**
 * Compact ops overview for the Admin landing page.
 * Read-only, truthful: unavailable sources render "—".
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import {
  eventCount,
  fetchActiveRecent,
  fetchEventCounts,
  fetchGenerationHealth,
  num,
} from "@/lib/analytics/adminMetrics";

const DAY_MINUTES = 60 * 24;

function Cell({ label, value, note }: { label: string; value: number | null; note?: string }) {
  const rendered = typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : null;
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{label}</p>
      <p className="font-display text-xl font-black text-foreground">{rendered ?? "—"}</p>
      {rendered === null ? (
        <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{note ?? "needs event"}</p>
      ) : null}
    </div>
  );
}

export default function AdminOverviewStrip() {
  const common = { refetchInterval: 30_000, refetchOnWindowFocus: false } as const;
  const active = useQuery({ queryKey: ["admin-strip-active"], queryFn: () => fetchActiveRecent(5), ...common });
  const events = useQuery({ queryKey: ["admin-strip-events"], queryFn: () => fetchEventCounts(1), ...common });
  const health = useQuery({ queryKey: ["admin-strip-health"], queryFn: () => fetchGenerationHealth(DAY_MINUTES), ...common });

  return (
    <div className="mb-8 rounded-xl border border-border/40 bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid flex-1 grid-cols-2 gap-4 md:grid-cols-4">
          <Cell label="Active last 5 min" value={num(active.data?.row?.sessions ?? null)} note="no source" />
          <Cell label="Signups today" value={eventCount(events.data?.list ?? [], "sign_up")} />
          <Cell label="Campaign runs today" value={num(health.data?.row?.runs ?? null)} note="no source" />
          <Cell label="Failures today" value={num(health.data?.row?.failed ?? null)} note="no source" />
        </div>
        <Link
          to="/admin/analytics"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-primary hover:underline"
        >
          Open Live Analytics <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  );
}
