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

    const { action, ...params } = await req.json();

    // ---- ALLOCATE REVENUE (called internally after each usage charge) ----
    if (action === "allocate") {
      const { usageChargeId } = params;
      if (!usageChargeId) throw new Error("usageChargeId required");

      // Get the usage charge
      const { data: charge, error: chargeErr } = await supabaseClient
        .from("usage_charges").select("*, templates(creator_id, owner_type, revenue_split_override)")
        .eq("id", usageChargeId).single();
      if (chargeErr || !charge) throw new Error("Usage charge not found");

      // Get platform config
      const { data: config } = await supabaseClient
        .from("platform_config").select("*").limit(1).single();
      if (!config) throw new Error("Platform config not found");

      const totalCents = charge.usd_price_cents;
      const holdDays = config.hold_period_days;
      const availableAt = new Date(Date.now() + holdDays * 24 * 60 * 60 * 1000).toISOString();

      // Determine splits
      let platformPercent = Number(config.platform_share_percent);
      let creatorPercent = Number(config.creator_share_percent);

      // Per-template override
      if (charge.templates?.revenue_split_override) {
        const override = charge.templates.revenue_split_override as any;
        if (override.platform_percent !== undefined) platformPercent = override.platform_percent;
        if (override.creator_percent !== undefined) creatorPercent = override.creator_percent;
      }

      const allocations: any[] = [];

      if (charge.templates?.owner_type === "CREATOR" && charge.templates?.creator_id) {
        // Creator template: split between platform and creator
        const creatorAmount = Math.floor(totalCents * creatorPercent / 100);
        let platformAmount = totalCents - creatorAmount;

        // Check for affiliate
        const { data: referral } = await supabaseClient
          .from("referral_attributions").select("referrer_user_id")
          .eq("referred_user_id", charge.user_id).in("status", ["QUALIFIED", "REWARDED"]).maybeSingle();

        let affiliateAmount = 0;
        if (referral) {
          const affiliatePercent = Number(config.affiliate_percent_of_platform);
          affiliateAmount = Math.floor(platformAmount * affiliatePercent / 100);
          platformAmount -= affiliateAmount;

          allocations.push({
            usage_charge_id: usageChargeId,
            beneficiary_type: "AFFILIATE",
            beneficiary_id: referral.referrer_user_id,
            amount_cents: affiliateAmount,
            status: "PENDING",
            available_at: availableAt,
          });
        }

        allocations.push({
          usage_charge_id: usageChargeId,
          beneficiary_type: "PLATFORM",
          beneficiary_id: null,
          amount_cents: platformAmount,
          status: "PENDING",
          available_at: availableAt,
        });

        allocations.push({
          usage_charge_id: usageChargeId,
          beneficiary_type: "CREATOR",
          beneficiary_id: charge.templates.creator_id,
          amount_cents: creatorAmount,
          status: "PENDING",
          available_at: availableAt,
        });
      } else {
        // Platform template: 100% to platform, minus affiliate if applicable
        let platformAmount = totalCents;

        const { data: referral } = await supabaseClient
          .from("referral_attributions").select("referrer_user_id")
          .eq("referred_user_id", charge.user_id).in("status", ["QUALIFIED", "REWARDED"]).maybeSingle();

        if (referral) {
          const affiliatePercent = Number(config.affiliate_percent_of_platform);
          const affiliateAmount = Math.floor(platformAmount * affiliatePercent / 100);
          platformAmount -= affiliateAmount;

          allocations.push({
            usage_charge_id: usageChargeId,
            beneficiary_type: "AFFILIATE",
            beneficiary_id: referral.referrer_user_id,
            amount_cents: affiliateAmount,
            status: "PENDING",
            available_at: availableAt,
          });
        }

        allocations.push({
          usage_charge_id: usageChargeId,
          beneficiary_type: "PLATFORM",
          beneficiary_id: null,
          amount_cents: platformAmount,
          status: "PENDING",
          available_at: availableAt,
        });
      }

      if (allocations.length > 0) {
        const { error: insertErr } = await supabaseClient.from("revenue_allocations").insert(allocations);
        if (insertErr) throw new Error(insertErr.message);
      }

      return new Response(JSON.stringify({ success: true, allocations: allocations.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- CREATOR ONBOARD (Stripe Connect placeholder) ----
    if (action === "creator-onboard") {
      // Check if already a creator
      let { data: creator } = await supabaseClient
        .from("creators").select("*").eq("user_id", user.id).maybeSingle();

      if (!creator) {
        const { data: profile } = await supabaseClient
          .from("profiles").select("name, email").eq("user_id", user.id).single();
        const { data: newCreator, error: createErr } = await supabaseClient
          .from("creators").insert({
            user_id: user.id,
            display_name: profile?.name || profile?.email || "Creator",
            connect_status: "NOT_STARTED",
          }).select().single();
        if (createErr) throw new Error(createErr.message);
        creator = newCreator;
      }

      // In production, you'd create a Stripe Connect account link here
      // For now, return the creator profile
      return new Response(JSON.stringify({
        creator,
        message: "Stripe Connect onboarding would redirect here. For now, admin can set connect_status to ACTIVE.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- REVERSE (admin only - for refunds/chargebacks) ----
    if (action === "reverse") {
      const { data: adminRole } = await supabaseClient
        .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (!adminRole) throw new Error("Admin access required");

      const { usageChargeId, reason } = params;
      if (!usageChargeId) throw new Error("usageChargeId required");

      // Get allocations for this charge
      const { data: allocations } = await supabaseClient
        .from("revenue_allocations").select("*")
        .eq("usage_charge_id", usageChargeId).neq("status", "REVERSED");

      if (!allocations?.length) throw new Error("No allocations to reverse");

      // Mark all as reversed
      const ids = allocations.map((a: any) => a.id);
      await supabaseClient.from("revenue_allocations")
        .update({ status: "REVERSED" }).in("id", ids);

      // Record refund event
      const { data: charge } = await supabaseClient
        .from("usage_charges").select("stripe_payment_intent_id, usd_price_cents")
        .eq("id", usageChargeId).single();

      await supabaseClient.from("refund_events").insert({
        stripe_payment_intent_id: charge?.stripe_payment_intent_id,
        amount_cents: charge?.usd_price_cents || 0,
        reason: reason || "Admin reversal",
      });

      return new Response(JSON.stringify({ success: true, reversed: ids.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Invalid action");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
