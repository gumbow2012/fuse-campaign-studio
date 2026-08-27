import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { supabase } from "@/integrations/supabase/client";

type DailyRow = { day: string; events: number; sessions: number; users: number };
type EventRow = { event_name: string; events: number; sessions: number; users: number };
type PathRow = { path: string; views: number; sessions: number };

const RANGES = [7, 30, 90] as const;

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
      const { data, error } = await supabase.rpc("admin_activation_funnel" as never, {
        days,
      } as never);
      if (error) throw error;
      return normalizeFunnel(data);
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
