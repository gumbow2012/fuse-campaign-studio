/**
 * ADMIN live analytics readers.
 *
 * HARD RULES
 *  - Read-only. Every call is wrapped: a missing/failed RPC returns
 *    { available: false } and the UI renders "—" instead of a fabricated value.
 *  - No new RPCs, no new tables. These are the deployed admin-gated functions.
 */
import { supabase } from "@/integrations/supabase/client";

type LooseRpc = (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
const rpc = supabase.rpc.bind(supabase) as unknown as LooseRpc;

export type RpcResult<T> = { data: T | null; available: boolean };

async function safeRpc<T>(name: string, args?: Record<string, unknown>): Promise<RpcResult<T>> {
  try {
    const { data, error } = await rpc(name, args);
    if (error) return { data: null, available: false };
    return { data: (data ?? null) as T | null, available: true };
  } catch {
    return { data: null, available: false };
  }
}

/** TABLE-returning RPCs come back as arrays; scalar/jsonb ones do not. */
function firstRow<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] ?? null) as T | null;
  return (value ?? null) as T | null;
}

function rows<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export const num = (value: unknown): number | null => {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
};

// ---- first-party event RPCs -------------------------------------------------

export type DailyRow = { day: string; events: number; sessions: number; users: number };
export type EventCountRow = { event_name: string; events: number; sessions: number; users: number };
export type PathRow = { path: string; views: number; sessions: number };

export async function fetchDaily(days: number) {
  const res = await safeRpc<unknown>("analytics_daily", { _days: days });
  return { ...res, list: rows<DailyRow>(res.data) };
}

export async function fetchEventCounts(days: number) {
  const res = await safeRpc<unknown>("analytics_event_counts", { _days: days });
  return { ...res, list: rows<EventCountRow>(res.data) };
}

export async function fetchTopPaths(days: number) {
  const res = await safeRpc<unknown>("analytics_top_paths", { _days: days });
  return { ...res, list: rows<PathRow>(res.data) };
}

// ---- execution / ops RPCs ---------------------------------------------------

export type GenerationHealth = { runs: number; success: number; failed: number; running: number; queued: number };
export type LiveFailure = { template_id: string | null; template: string | null; failures: number; last_failed_at: string | null };
export type TemplateActivity = {
  template_id: string | null;
  template: string | null;
  runs: number;
  complete: number;
  fail: number;
  credits: number;
};
export type ActiveRecent = { sessions: number; users: number; events: number };
export type CreditsSummary = { granted: number; spent: number; net: number; entries: number };

export async function fetchGenerationHealth(minutes: number) {
  const res = await safeRpc<unknown>("admin_generation_health", { _mins: minutes });
  return { available: res.available, row: firstRow<GenerationHealth>(res.data) };
}

export async function fetchLiveFailures(minutes: number, limit = 8) {
  const res = await safeRpc<unknown>("admin_live_failures", { _mins: minutes, _lim: limit });
  return { available: res.available, list: rows<LiveFailure>(res.data) };
}

export async function fetchTemplateActivity(days: number, limit = 12) {
  const res = await safeRpc<unknown>("admin_template_activity", { _days: days, _lim: limit });
  return { available: res.available, list: rows<TemplateActivity>(res.data) };
}

export async function fetchActiveRecent(minutes: number) {
  const res = await safeRpc<unknown>("admin_active_recent", { _mins: minutes });
  return { available: res.available, row: firstRow<ActiveRecent>(res.data) };
}

export async function fetchCreditsSummary(days: number) {
  const res = await safeRpc<unknown>("admin_credits_summary", { _days: days });
  return { available: res.available, row: firstRow<CreditsSummary>(res.data) };
}

// ---- live event stream ------------------------------------------------------

export type StreamEvent = {
  id: string;
  event_name: string | null;
  path: string | null;
  created_at: string;
  session_id: string | null;
  user_id: string | null;
};

/** Newest-first recent activity. No prompts, no props, no PII columns. */
export async function fetchRecentEvents(limit = 30): Promise<{ available: boolean; list: StreamEvent[] }> {
  try {
    const { data, error } = await supabase
      .from("analytics_events")
      .select("id,event_name,path,created_at,session_id,user_id")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { available: false, list: [] };
    return { available: true, list: (data ?? []) as StreamEvent[] };
  } catch {
    return { available: false, list: [] };
  }
}

/** Short non-identifying tail of an id, e.g. "…8f3a". */
export function maskId(value: string | null | undefined): string {
  if (!value) return "anon";
  return `…${value.slice(-4)}`;
}

export function eventCount(list: EventCountRow[], name: string): number | null {
  const hit = list.find((row) => row.event_name === name);
  return hit ? (num(hit.events) ?? 0) : null;
}

export function eventSessions(list: EventCountRow[], name: string): number | null {
  const hit = list.find((row) => row.event_name === name);
  return hit ? (num(hit.sessions) ?? 0) : null;
}
