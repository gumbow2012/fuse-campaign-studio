import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

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

    const { userId, amount, description } = await req.json();
    if (!userId || amount === undefined) throw new Error("userId and amount required");

    // Update balance
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("credits_balance")
      .eq("user_id", userId)
      .single();
    if (!profile) throw new Error("User not found");

    await supabaseClient
      .from("profiles")
      .update({ credits_balance: profile.credits_balance + amount })
      .eq("user_id", userId);

    // Log
    await supabaseClient.from("credit_ledger").insert({
      user_id: userId,
      type: "adjustment",
      amount,
      description: description || `Admin adjustment: ${amount > 0 ? "+" : ""}${amount}`,
    });

    return new Response(JSON.stringify({ success: true, newBalance: profile.credits_balance + amount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
