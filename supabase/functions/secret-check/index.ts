import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { errorMessage, requireAdminUser } from "../_shared/supabase-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await requireAdminUser(req);

    const secrets = [
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PORTAL_CONFIGURATION_ID",
      "WEAVY_API_KEY",
      "WEAVY_API_BASE_URL",
      "WEAVY_FIREBASE_API_KEY",
      "WEAVY_REFRESH_TOKEN",
      "VITE_CF_WORKER_URL",
      "LOVABLE_API_KEY",
    ];

    const result: Record<string, boolean> = {};
    for (const name of secrets) {
      const val = Deno.env.get(name);
      result[name] = !!val && val.length > 0;
    }

    return new Response(JSON.stringify(result, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: errorMessage(error) }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
