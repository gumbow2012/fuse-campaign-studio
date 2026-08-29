import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function maskEmail(email: unknown) {
  const value = typeof email === "string" ? email.trim() : "";
  if (!value.includes("@")) return null;
  const [local, domain] = value.split("@");
  const head = local.slice(0, 2);
  return `${head}${"*".repeat(Math.max(local.length - head.length, 1))}@${domain}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(userError.message);
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");

    // Check admin role
    const { data: role } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) throw new Error("Admin access required");

    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "adjust";

    // ---- Identity search (admin only, never returns full email) ----
    if (action === "search_user") {
      const raw = String(body.query ?? "").trim();
      if (raw.length < 2) return json({ results: [] });
      const limit = Math.min(Math.max(Number(body.limit ?? 8) || 8, 1), 25);
      const handleQuery = raw.replace(/^@+/, "");

      const [{ data: profileMatches }, { data: creatorMatches }] = await Promise.all([
        supabaseClient
          .from("profiles")
          .select("user_id, name, email, credits_balance, plan")
          .or(`name.ilike.%${raw}%,email.ilike.%${raw}%`)
          .limit(limit),
        supabaseClient
          .from("creator_profiles")
          .select("user_id, handle, display_name")
          .or(`handle.ilike.%${handleQuery}%,display_name.ilike.%${handleQuery}%`)
          .limit(limit),
      ]);

      const ids = Array.from(
        new Set([
          ...(profileMatches ?? []).map((row: any) => row.user_id),
          ...(creatorMatches ?? []).map((row: any) => row.user_id),
        ]),
      ).slice(0, limit);

      if (!ids.length) return json({ results: [] });

      const { data: profiles } = await supabaseClient
        .from("profiles")
        .select("user_id, name, email, credits_balance, plan")
        .in("user_id", ids);
      const { data: creators } = await supabaseClient
        .from("creator_profiles")
        .select("user_id, handle, display_name")
        .in("user_id", ids);

      const creatorById = new Map<string, any>((creators ?? []).map((row: any) => [row.user_id, row]));
      const profileById = new Map<string, any>((profiles ?? []).map((row: any) => [row.user_id, row]));

      const results = ids.map((id) => {
        const profile = profileById.get(id) ?? {};
        const creator = creatorById.get(id) ?? null;
        return {
          user_id: id,
          handle: creator?.handle ?? null,
          display_name: creator?.display_name ?? profile.name ?? null,
          masked_email: maskEmail(profile.email),
          credits_balance: Number(profile.credits_balance ?? 0),
          plan: profile.plan ?? null,
        };
      });

      return json({ results });
    }

    if (action === "recent_ledger") {
      const userId = String(body.userId ?? "").trim();
      if (!userId) throw new Error("userId required");
      const { data, error } = await supabaseClient
        .from("credit_ledger")
        .select("id, amount, type, description, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw new Error(error.message);
      return json({ entries: data ?? [] });
    }

    const userId = String(body.userId ?? "").trim();
    const description = String(body.description ?? "").trim();
    if (!userId) throw new Error("userId required");
    if (!description) throw new Error("A reason is required for every credit adjustment");

    let amount: number;

    if (action === "set_balance") {
      const targetBalance = Number(body.targetBalance);
      if (!Number.isFinite(targetBalance) || targetBalance < 0) {
        throw new Error("targetBalance must be zero or greater");
      }
      const { data: profile, error: profileError } = await supabaseClient
        .from("profiles")
        .select("credits_balance")
        .eq("user_id", userId)
        .maybeSingle();
      if (profileError) throw new Error(profileError.message);
      if (!profile) throw new Error("That user has no profile");
      const current = Number((profile as any).credits_balance ?? 0);
      amount = Math.round(targetBalance) - current;
      if (amount === 0) {
        return json({ success: true, newBalance: current, delta: 0, unchanged: true });
      }
    } else {
      amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount === 0) throw new Error("A non-zero amount is required");
      amount = Math.round(amount);
    }

    const { error: creditError, data: creditRows } = await supabaseClient.rpc("apply_credit_transaction", {
      p_user_id: userId,
      p_amount: amount,
      p_type: "adjustment",
      p_description: description,
      p_template_id: null,
      p_project_id: null,
      p_step_id: null,
    });
    if (creditError) throw new Error(creditError.message);

    const newBalance = Array.isArray(creditRows) ? creditRows[0]?.new_balance ?? null : (creditRows as any)?.new_balance ?? null;

    return json({ success: true, newBalance, delta: amount });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return json({ error: msg }, 500);
  }
});
