import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function maskEmail(email?: string | null) {
  if (!email || !email.includes("@")) return "a new member";
  const [local, domain] = email.split("@");
  const head = local.slice(0, 2);
  return `${head}***@${domain}`;
}

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

    const body = await req.json();
    const { action, code } = body as { action?: string; code?: string };

    const requireAdmin = async () => {
      const { data: roles } = await supabaseClient
        .from("user_roles").select("role").eq("user_id", user.id);
      if (!(roles ?? []).some((r: any) => String(r.role) === "admin")) {
        throw new Error("Admin access required");
      }
    };

    if (action === "get-my-code") {
      // Get or create user's referral code
      let { data: existing } = await supabaseClient
        .from("referral_codes").select("*").eq("owner_user_id", user.id).maybeSingle();

      if (!existing) {
        // Generate unique code
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let newCode = "FUSE-";
        for (let i = 0; i < 6; i++) newCode += chars[Math.floor(Math.random() * chars.length)];

        const { data: created, error: createErr } = await supabaseClient
          .from("referral_codes").insert({ code: newCode, owner_user_id: user.id }).select().single();
        if (createErr) throw new Error(createErr.message);
        existing = created;
      }

      // Get stats
      const { count: totalSignups } = await supabaseClient
        .from("referral_attributions").select("*", { count: "exact", head: true })
        .eq("referrer_user_id", user.id);
      const { count: qualifiedCount } = await supabaseClient
        .from("referral_attributions").select("*", { count: "exact", head: true })
        .eq("referrer_user_id", user.id).in("status", ["QUALIFIED", "REWARDED"]);
      const { data: rewards } = await supabaseClient
        .from("referral_rewards").select("credits_amount").eq("referrer_user_id", user.id);

      const totalRewards = (rewards || []).reduce((sum: number, r: any) => sum + (r.credits_amount || 0), 0);

      // Program config (public reward numbers)
      const { data: config } = await supabaseClient
        .from("referral_program_config").select("*").limit(1).maybeSingle();

      // Recent activity
      const { data: attributions } = await supabaseClient
        .from("referral_attributions")
        .select("id, referred_user_id, status, attributed_at, qualified_at, rewarded_at")
        .eq("referrer_user_id", user.id)
        .order("attributed_at", { ascending: false })
        .limit(20);

      const referredIds = (attributions ?? []).map((a: any) => a.referred_user_id);
      let emailByUser: Record<string, string> = {};
      if (referredIds.length) {
        const { data: profiles } = await supabaseClient
          .from("profiles").select("user_id, email").in("user_id", referredIds);
        for (const p of profiles ?? []) emailByUser[p.user_id] = p.email;
      }

      const { data: myRewards } = await supabaseClient
        .from("referral_rewards")
        .select("attribution_id, credits_amount")
        .eq("referrer_user_id", user.id);
      const creditsByAttribution: Record<string, number> = {};
      for (const r of myRewards ?? []) {
        if (r.attribution_id) {
          creditsByAttribution[r.attribution_id] =
            (creditsByAttribution[r.attribution_id] || 0) + (r.credits_amount || 0);
        }
      }

      const recent = (attributions ?? []).map((a: any) => ({
        id: a.id,
        maskedEmail: maskEmail(emailByUser[a.referred_user_id]),
        status: a.status,
        creditsEarned: creditsByAttribution[a.id] ?? 0,
        at: a.rewarded_at ?? a.qualified_at ?? a.attributed_at,
      }));

      return new Response(JSON.stringify({
        code: existing.code,
        totalSignups: totalSignups || 0,
        qualifiedReferrals: qualifiedCount || 0,
        totalRewardsEarned: totalRewards,
        config: config
          ? {
              enabled: !!config.enabled,
              signup_bonus_credits: config.signup_bonus_credits,
              referrer_bonus_credits_on_paid: config.referrer_bonus_credits_on_paid,
              paid_trigger: config.paid_trigger,
            }
          : null,
        recent,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "admin-stats") {
      await requireAdmin();

      const { data: config } = await supabaseClient
        .from("referral_program_config").select("*").limit(1).maybeSingle();

      const countFor = async (status?: string) => {
        let q = supabaseClient.from("referral_attributions").select("*", { count: "exact", head: true });
        if (status) q = q.eq("status", status);
        const { count } = await q;
        return count || 0;
      };

      const [attributed, qualified, rewarded, total] = await Promise.all([
        countFor("ATTRIBUTED"),
        countFor("QUALIFIED"),
        countFor("REWARDED"),
        countFor(),
      ]);

      const { data: rewards } = await supabaseClient
        .from("referral_rewards").select("credits_amount");
      const creditsIssued = (rewards ?? []).reduce((s: number, r: any) => s + (r.credits_amount || 0), 0);

      return new Response(JSON.stringify({
        config,
        counts: { attributed, qualified, rewarded, total },
        creditsIssued,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "admin-update-config") {
      await requireAdmin();

      const patch: Record<string, unknown> = {};
      if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
      if (body.signup_bonus_credits !== undefined) {
        const n = Number(body.signup_bonus_credits);
        if (!Number.isInteger(n) || n < 0 || n > 100000) throw new Error("Invalid signup_bonus_credits");
        patch.signup_bonus_credits = n;
      }
      if (body.referrer_bonus_credits_on_paid !== undefined) {
        const n = Number(body.referrer_bonus_credits_on_paid);
        if (!Number.isInteger(n) || n < 0 || n > 100000) throw new Error("Invalid referrer_bonus_credits_on_paid");
        patch.referrer_bonus_credits_on_paid = n;
      }
      if (!Object.keys(patch).length) throw new Error("Nothing to update");
      patch.updated_at = new Date().toISOString();

      const { data: existingConfig } = await supabaseClient
        .from("referral_program_config").select("id").limit(1).maybeSingle();

      let updated;
      if (existingConfig) {
        const { data, error } = await supabaseClient
          .from("referral_program_config").update(patch).eq("id", existingConfig.id).select().single();
        if (error) throw new Error(error.message);
        updated = data;
      } else {
        const { data, error } = await supabaseClient
          .from("referral_program_config").insert(patch).select().single();
        if (error) throw new Error(error.message);
        updated = data;
      }

      return new Response(JSON.stringify({ success: true, config: updated }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "apply-code") {
      if (!code) throw new Error("Code is required");

      // Check if already attributed
      const { data: existingAttr } = await supabaseClient
        .from("referral_attributions").select("id").eq("referred_user_id", user.id).maybeSingle();
      if (existingAttr) throw new Error("You already have a referral attribution");

      // Find the code
      const { data: refCode } = await supabaseClient
        .from("referral_codes").select("*").eq("code", code.toUpperCase()).maybeSingle();
      if (!refCode) throw new Error("Invalid referral code");

      // Block self-referral
      if (refCode.owner_user_id === user.id) throw new Error("Cannot use your own referral code");

      // Create attribution
      const { error: attrErr } = await supabaseClient.from("referral_attributions").insert({
        referred_user_id: user.id,
        referrer_user_id: refCode.owner_user_id,
        code_used: code.toUpperCase(),
        status: "ATTRIBUTED",
      });
      if (attrErr) throw new Error(attrErr.message);

      // Grant signup bonus
      const { data: config } = await supabaseClient
        .from("referral_program_config").select("*").limit(1).single();
      if (config?.enabled && config.signup_bonus_credits > 0) {
        const { error: bonusError } = await supabaseClient.rpc("apply_credit_transaction", {
          p_user_id: user.id,
          p_amount: config.signup_bonus_credits,
          p_type: "adjustment",
          p_description: `Referral signup bonus (code: ${code.toUpperCase()})`,
          p_template_id: null,
          p_project_id: null,
          p_step_id: null,
        });
        if (bonusError) throw new Error(bonusError.message);
      }

      return new Response(JSON.stringify({
        success: true,
        bonusCredits: config?.signup_bonus_credits || 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    throw new Error("Invalid action");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
