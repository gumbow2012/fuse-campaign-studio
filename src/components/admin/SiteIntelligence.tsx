import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { supabase } from "@/integrations/supabase/client";

type DailyRow = { day: string; events: number; sessions: number; users: number };
type EventRow = { event_name: string; events: number; sessions: number; users: number };
type PathRow = { path: string; views: number; sessions: number };

const RANGES = [7, 30, 90] as const;

type FunnelStep = { label: string; count: number };

/** Canonical activation funnel order + the keys the RPC may use per step. */
const FUNNEL_STEPS: { label: string; keys: string[] }[] = [
  { label: "New accounts", keys: ["new_accounts", "accounts", "signups"] },
  { label: "Brand started", keys: ["brand_started", "brands_started"] },
  { label: "Brand set up", keys: ["brand_set_up", "brand_setup", "brands_set_up", "brand_complete"] },
  { label: "Product added", keys: ["product_added", "products_added"] },
  { label: "First template run", keys: ["first_template_run", "first_run", "template_run"] },
];

function toCount(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Accepts either a single row of named counts or a row-per-step shape
 * ({ step, count }) so the funnel renders whichever the RPC returns.
 */
function normalizeFunnel(data: unknown): FunnelStep[] {
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  if (!rows.length) return [];
  const flat: Record<string, unknown> = {};
  for (const row of rows as Record<string, unknown>[]) {
    if (!row || typeof row !== "object") continue;
    const stepKey = row.step ?? row.step_key ?? row.stage ?? row.name;
    const stepCount = row.count ?? row.users ?? row.value ?? row.total;
    if (typeof stepKey === "string" && stepCount !== undefined) {
      flat[stepKey.toLowerCase()] = stepCount;
      continue;
    }
    for (const [key, value] of Object.entries(row)) flat[key.toLowerCase()] = value;
  }
  const steps = FUNNEL_STEPS.map(({ label, keys }) => {
    const match = keys.find((key) => flat[key] !== undefined);
    return { label, count: match ? toCount(flat[match]) : 0 };
  });
  return steps.some((step) => step.count > 0) ? steps : [];
}

/** Admin-only site analytics. The RPCs fail closed for non-admins. */
export default function SiteIntelligence() {
  const [days, setDays] = useState<number>(30);

  const daily = useQuery({
    queryKey: ["analytics-daily", days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("analytics_daily", { _days: days });
      if (error) throw error;
      return (data ?? []) as DailyRow[];
    },
  });

  const events = useQuery({
    queryKey: ["analytics-event-counts", days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("analytics_event_counts", { _days: days });
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
  });

  const paths = useQuery({
    queryKey: ["analytics-top-paths", days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("analytics_top_paths", { _days: days });
      if (error) throw error;
      return (data ?? []) as PathRow[];
    },
  });

  // Phase 7 — brand activation funnel. RPC fails closed for non-admins.
  const funnel = useQuery({
    queryKey: ["admin-activation-funnel", days],
    queryFn: async () => {
      // Arg name differs across deployments — try `days`, fall back to `_days`.
      let response = await supabase.rpc("admin_activation_funnel" as never, { days } as never);
      if (response.error) {
        response = await supabase.rpc("admin_activation_funnel" as never, { _days: days } as never);
      }
      if (response.error) throw response.error;
      return normalizeFunnel(response.data);
    },
  });



  const chartData = (daily.data ?? []).map((row) => ({
    ...row,
    label: new Date(row.day).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }));

  return (
    <section className="mt-12 rounded-xl border border-border/40 bg-card p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">Site Intelligence</h2>
          <p className="text-xs text-muted-foreground">Traffic, events and top pages across the site.</p>
        </div>
        <div className="inline-flex rounded-full border border-border/50 bg-background/40 p-1">
          {RANGES.map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => setDays(range)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                days === range ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {range}d
            </button>
          ))}
        </div>
      </div>

      {daily.error || events.error || paths.error ? (
        <p className="text-sm text-muted-foreground">Site analytics are unavailable for this account.</p>
      ) : (
        <div className="space-y-8">
          <div>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Daily events / sessions / users
            </p>
            {chartData.length ? (
              <ChartContainer
                className="h-64 w-full"
                config={{
                  events: { label: "Events", color: "hsl(var(--primary))" },
                  sessions: { label: "Sessions", color: "hsl(var(--accent))" },
                  users: { label: "Users", color: "hsl(var(--muted-foreground))" },
                }}
              >
                <BarChart data={chartData}>
                  <CartesianGrid vertical={false} strokeOpacity={0.15} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} />
                  <YAxis tickLine={false} axisLine={false} fontSize={10} width={32} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="events" fill="var(--color-events)" radius={3} />
                  <Bar dataKey="sessions" fill="var(--color-sessions)" radius={3} />
                  <Bar dataKey="users" fill="var(--color-users)" radius={3} />
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="text-sm text-muted-foreground">No events recorded in this range yet.</p>
            )}
          </div>

          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Brand activation funnel
            </p>
            <p className="mb-3 text-xs text-muted-foreground">
              Reflects tracking from deployment forward — earlier activity is not backfilled.
            </p>
            {funnel.error ? (
              <p className="text-sm text-muted-foreground">Activation funnel is unavailable for this account.</p>
            ) : (funnel.data ?? []).length ? (
              <Table
                head={["Step", "Count", "Step conversion"]}
                rows={(funnel.data ?? []).map((row, index, all) => {
                  const previous = index > 0 ? all[index - 1].count : null;
                  const rate =
                    previous && previous > 0 ? `${Math.round((row.count / previous) * 100)}%` : index === 0 ? "—" : "0%";
                  return [row.label, row.count.toLocaleString("en-US"), rate];
                })}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No activation data recorded in this range yet.</p>
            )}
          </div>



          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Top events
              </p>
              <Table
                head={["Event", "Events", "Sessions", "Users"]}
                rows={(events.data ?? []).map((row) => [
                  row.event_name,
                  row.events.toLocaleString("en-US"),
                  row.sessions.toLocaleString("en-US"),
                  row.users.toLocaleString("en-US"),
                ])}
              />
            </div>
            <div>
              <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Top paths
              </p>
              <Table
                head={["Path", "Views", "Sessions"]}
                rows={(paths.data ?? []).map((row) => [
                  row.path,
                  row.views.toLocaleString("en-US"),
                  row.sessions.toLocaleString("en-US"),
                ])}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border/40">
      <table className="w-full text-sm">
        <thead className="bg-background/40">
          <tr>
            {head.map((label) => (
              <th
                key={label}
                className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join("|")} className="border-t border-border/30">
              {row.map((cell, index) => (
                <td
                  key={index}
                  className={`px-3 py-2 ${index === 0 ? "truncate text-foreground" : "text-muted-foreground"}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
