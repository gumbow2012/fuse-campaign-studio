/**
 * Minimal typed handle for tables that are not present in the generated
 * Supabase types on every backend. RLS still scopes every row to the owner.
 */
import { supabase } from "@/integrations/supabase/client";

export interface LooseQuery extends PromiseLike<{ data: unknown; error: unknown }> {
  select: (columns: string) => LooseQuery;
  insert: (values: Record<string, unknown>) => LooseQuery;
  update: (values: Record<string, unknown>) => LooseQuery;
  delete: () => LooseQuery;
  eq: (column: string, value: unknown) => LooseQuery;
  in: (column: string, values: unknown[]) => LooseQuery;
  order: (column: string, options: { ascending: boolean }) => LooseQuery;
  limit: (count: number) => LooseQuery;
  maybeSingle: () => PromiseLike<{ data: Record<string, unknown> | null; error: unknown }>;
}

export function looseTable(name: string): LooseQuery {
  return (supabase as unknown as { from: (table: string) => LooseQuery }).from(name);
}
