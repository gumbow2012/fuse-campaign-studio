import { supabase } from "@/integrations/supabase/client";

export interface CreditLedgerRow {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  created_at: string;
}

export async function loadCreditHistory(userId: string, limit = 50): Promise<CreditLedgerRow[]> {
  const { data, error } = await supabase
    .from("credit_ledger")
    .select("id, type, amount, description, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as CreditLedgerRow[];
}
