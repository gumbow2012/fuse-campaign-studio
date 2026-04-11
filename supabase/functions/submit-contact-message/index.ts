import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const payload = await request.json().catch(() => null);
    const name = typeof payload?.name === "string" ? payload.name.trim() : "";
    const email = typeof payload?.email === "string" ? payload.email.trim().toLowerCase() : "";
    const company = typeof payload?.company === "string" ? payload.company.trim() : null;
    const message = typeof payload?.message === "string" ? payload.message.trim() : "";

    if (name.length < 2 || name.length > 120) {
      return json({ error: "Name must be between 2 and 120 characters." }, 400);
    }
    if (email.length < 5 || email.length > 200 || !email.includes("@")) {
      return json({ error: "A valid email address is required." }, 400);
    }
    if (message.length < 10 || message.length > 4000) {
      return json({ error: "Message must be between 10 and 4000 characters." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "Supabase service credentials are not configured." }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const forwardedFor = request.headers.get("x-forwarded-for");
    const userAgent = request.headers.get("user-agent");
    const origin = request.headers.get("origin");

    const { data, error } = await supabase
      .from("contact_messages")
      .insert({
        name,
        email,
        company,
        message,
        metadata: {
          forwarded_for: forwardedFor,
          user_agent: userAgent,
          origin,
        },
      })
      .select("id")
      .single();

    if (error) {
      console.error("contact insert failed", error);
      return json({ error: "Could not store contact message." }, 500);
    }

    return json({ ok: true, id: data.id });
  } catch (error) {
    console.error("submit-contact-message failed", error);
    return json({ error: "Unexpected server error." }, 500);
  }
});
