/**
 * ADMIN USERS LEDGER — admin-only account list + in-app alert sender.
 * Service role reads; caller must have user_roles.role = 'admin'.
 * Credit grants are NOT handled here (use admin-adjust-credits).
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PAID_PLANS = new Set(["starter", "pro", "studio"]);
const PAID_STATUSES = new Set(["active", "trialing"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No authorization header" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData?.user) return json({ error: "Not authenticated" }, 401);

    const { data: role } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) return json({ error: "Admin access required" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "list";

    if (action === "list") {
      const search = String(body.search ?? "").trim().slice(0, 120);
      const filter = ["paid", "free"].includes(String(body.filter)) ? String(body.filter) : "all";
      const sort = body.sort === "credits" ? "credits_balance" : "created_at";
      const ascending = body.direction === "asc";
      const limit = Math.min(Math.max(Number(body.limit ?? 100) || 100, 1), 200);
      const offset = Math.max(Number(body.offset ?? 0) || 0, 0);

      let query = admin
        .from("profiles")
        .select(
          "user_id, email, name, plan, subscription_status, credits_balance, created_at, updated_at",
          { count: "exact" },
        )
        .order(sort, { ascending })
        .range(offset, offset + limit - 1);

      if (search) {
        const escaped = search.replace(/[%,()]/g, "");
        if (escaped) query = query.or(`email.ilike.%${escaped}%,name.ilike.%${escaped}%`);
      }
      if (filter === "paid") {
        query = query.in("plan", [...PAID_PLANS]).in("subscription_status", [...PAID_STATUSES]);
      }

      const { data, error, count } = await query;
      if (error) return json({ error: error.message }, 500);

      let rows = (data ?? []).map((row: any) => {
        const isPaid =
          PAID_PLANS.has(String(row.plan ?? "").toLowerCase()) &&
          PAID_STATUSES.has(String(row.subscription_status ?? "").toLowerCase());
        return {
          user_id: row.user_id,
          email: row.email ?? null,
          name: row.name ?? null,
          plan: row.plan ?? null,
          subscription_status: row.subscription_status ?? null,
          credits_balance: Number(row.credits_balance ?? 0),
          created_at: row.created_at,
          last_activity_at: row.updated_at ?? null,
          tier: isPaid ? "paid" : "free",
        };
      });

      if (filter === "free") rows = rows.filter((row) => row.tier === "free");

      return json({ rows, total: count ?? rows.length, limit, offset });
    }

    if (action === "notify") {
      const userId = String(body.userId ?? "").trim();
      const title = String(body.title ?? "").trim().slice(0, 160);
      const message = String(body.message ?? "").trim().slice(0, 2000);
      if (!userId) return json({ error: "userId required" }, 400);
      if (!title) return json({ error: "A title is required" }, 400);

      const { error } = await admin.from("user_notifications").insert({
        user_id: userId,
        type: "system",
        title,
        body: message || null,
        metadata: { source: "admin_alert", sent_by: userData.user.id },
      });
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
