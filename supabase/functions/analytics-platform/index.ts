import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

    const url = new URL(req.url);
    const view = url.searchParams.get("view") || "overview";

    // Check admin for platform/admin views
    const { data: adminRole } = await supabaseClient
      .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    const isAdmin = !!adminRole;

    if (view === "overview" && !isAdmin) throw new Error("Admin access required");

    if (view === "overview") {
      // Platform overview
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [
        { count: totalProjects },
        { count: completedProjects },
        { count: failedProjects },
        { data: creditData },
        { data: activeUsers7d },
        { data: activeUsers30d },
        { data: topTemplates },
        { data: recentAllocations },
      ] = await Promise.all([
        supabaseClient.from("projects").select("*", { count: "exact", head: true }),
        supabaseClient.from("projects").select("*", { count: "exact", head: true }).eq("status", "complete"),
        supabaseClient.from("projects").select("*", { count: "exact", head: true }).eq("status", "failed"),
        supabaseClient.from("credit_ledger").select("amount, type"),
        supabaseClient.from("analytics_events").select("user_id").gte("created_at", sevenDaysAgo.toISOString()),
        supabaseClient.from("analytics_events").select("user_id").gte("created_at", thirtyDaysAgo.toISOString()),
        supabaseClient.from("usage_charges").select("template_id, credits_spent, usd_price_cents, templates(name)")
          .order("created_at", { ascending: false }).limit(100),
        supabaseClient.from("revenue_allocations").select("beneficiary_type, amount_cents, status"),
      ]);

      // Aggregate top templates
      const templateMap: Record<string, { name: string; runs: number; credits: number; revenue: number }> = {};
      (topTemplates || []).forEach((uc: any) => {
        const tid = uc.template_id;
        if (!templateMap[tid]) templateMap[tid] = { name: uc.templates?.name || "Unknown", runs: 0, credits: 0, revenue: 0 };
        templateMap[tid].runs++;
        templateMap[tid].credits += uc.credits_spent;
        templateMap[tid].revenue += uc.usd_price_cents;
      });
      const topTemplatesList = Object.entries(templateMap)
        .map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => b.runs - a.runs)
        .slice(0, 10);

      // Credits summary
      let creditsSpent = 0, creditsGranted = 0;
      (creditData || []).forEach((e: any) => {
        if (e.amount < 0) creditsSpent += Math.abs(e.amount);
        else creditsGranted += e.amount;
      });

      // Revenue summary
      let pendingRevenue = 0, availableRevenue = 0, paidRevenue = 0;
      (recentAllocations || []).forEach((a: any) => {
        if (a.status === "PENDING") pendingRevenue += a.amount_cents;
        else if (a.status === "AVAILABLE") availableRevenue += a.amount_cents;
        else if (a.status === "PAID") paidRevenue += a.amount_cents;
      });

      const uniqueUsers7d = new Set((activeUsers7d || []).map((e: any) => e.user_id)).size;
      const uniqueUsers30d = new Set((activeUsers30d || []).map((e: any) => e.user_id)).size;

      return new Response(JSON.stringify({
        totalProjects: totalProjects || 0,
        completedProjects: completedProjects || 0,
        failedProjects: failedProjects || 0,
        failureRate: totalProjects ? ((failedProjects || 0) / totalProjects * 100).toFixed(1) : "0",
        creditsSpent,
        creditsGranted,
        activeUsers7d: uniqueUsers7d,
        activeUsers30d: uniqueUsers30d,
        topTemplates: topTemplatesList,
        revenue: { pending: pendingRevenue, available: availableRevenue, paid: paidRevenue },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (view === "user") {
      // Current user analytics
      const { data: charges } = await supabaseClient
        .from("usage_charges").select("credits_spent, charge_type, template_id, templates(name), created_at")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);

      const { count: totalRuns } = await supabaseClient
        .from("projects").select("*", { count: "exact", head: true }).eq("user_id", user.id);
      const { count: completedRuns } = await supabaseClient
        .from("projects").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "complete");

      let totalCreditsSpent = 0;
      const templateUsage: Record<string, { name: string; runs: number; credits: number }> = {};
      (charges || []).forEach((c: any) => {
        totalCreditsSpent += c.credits_spent;
        const tid = c.template_id;
        if (!templateUsage[tid]) templateUsage[tid] = { name: c.templates?.name || "Unknown", runs: 0, credits: 0 };
        templateUsage[tid].runs++;
        templateUsage[tid].credits += c.credits_spent;
      });

      return new Response(JSON.stringify({
        totalRuns: totalRuns || 0,
        completedRuns: completedRuns || 0,
        successRate: totalRuns ? ((completedRuns || 0) / totalRuns * 100).toFixed(1) : "0",
        totalCreditsSpent,
        topTemplates: Object.entries(templateUsage).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.runs - a.runs).slice(0, 5),
        recentCharges: (charges || []).slice(0, 10),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (view === "creator") {
      // Creator analytics
      const { data: creator } = await supabaseClient
        .from("creators").select("id").eq("user_id", user.id).maybeSingle();
      if (!creator) {
        return new Response(JSON.stringify({ isCreator: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: allocations } = await supabaseClient
        .from("revenue_allocations").select("amount_cents, status, created_at")
        .eq("beneficiary_type", "CREATOR").eq("beneficiary_id", creator.id);

      let pending = 0, available = 0, paid = 0;
      (allocations || []).forEach((a: any) => {
        if (a.status === "PENDING") pending += a.amount_cents;
        else if (a.status === "AVAILABLE") available += a.amount_cents;
        else if (a.status === "PAID") paid += a.amount_cents;
      });

      const { data: creatorTemplates } = await supabaseClient
        .from("templates").select("id, name").eq("creator_id", creator.id);

      const templateIds = (creatorTemplates || []).map((t: any) => t.id);
      const { data: templateCharges } = templateIds.length > 0
        ? await supabaseClient.from("usage_charges").select("template_id, credits_spent").in("template_id", templateIds)
        : { data: [] };

      const templateStats: Record<string, { name: string; runs: number; credits: number }> = {};
      (creatorTemplates || []).forEach((t: any) => { templateStats[t.id] = { name: t.name, runs: 0, credits: 0 }; });
      (templateCharges || []).forEach((c: any) => {
        if (templateStats[c.template_id]) {
          templateStats[c.template_id].runs++;
          templateStats[c.template_id].credits += c.credits_spent;
        }
      });

      return new Response(JSON.stringify({
        isCreator: true,
        earnings: { pending, available, paid, total: pending + available + paid },
        templates: Object.entries(templateStats).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.runs - a.runs),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    throw new Error("Invalid view parameter");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
