import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  hasValidRunnerCode,
  json,
  requireAdminUser,
} from "../_shared/supabase-admin.ts";

type Body = {
  email?: string;
  role?: "admin" | "dev";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createAdminClient();
  const runnerAccess = hasValidRunnerCode(req);

  try {
    if (!runnerAccess) {
      await requireAdminUser(req, admin);
    }

    const body = await req.json() as Body;
    const email = body.email?.trim().toLowerCase();
    const role = body.role;

    if (!email) throw new Error("email is required");
    if (role !== "admin" && role !== "dev") throw new Error("role must be admin or dev");

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("user_id, email")
      .eq("email", email)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile?.user_id) throw new Error("User not found. Have them sign up first.");

    const { error: upsertError } = await admin
      .from("user_roles")
      .upsert(
        {
          user_id: profile.user_id,
          role,
        },
        { onConflict: "user_id,role" },
      );
    if (upsertError) throw new Error(upsertError.message);

    const { data: roles, error: rolesError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", profile.user_id);
    if (rolesError) throw new Error(rolesError.message);

    return json({
      ok: true,
      email,
      userId: profile.user_id,
      roles: (roles ?? []).map((row: any) => row.role),
    });
  } catch (error) {
    return json({ error: errorMessage(error) }, 400);
  }
});
