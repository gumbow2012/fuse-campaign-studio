import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const secrets = [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "STRIPE_SECRET_KEY",
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
});
