import { Env } from "./types";

export type RunnerAccessState = {
  exists: boolean;
  plan: string | null;
  subscriptionStatus: string | null;
  creditsBalance: number;
  roles: string[];
  isPrivileged: boolean;
  hasActiveSubscription: boolean;
};

/** Helper to make authenticated Supabase REST API calls.
 *  Write ops (POST/PATCH/PUT/DELETE) use SERVICE_ROLE to bypass RLS.
 *  Read ops use ANON key (RLS applies). */
export async function supabaseFetch(
  env: Env,
  path: string,
  opts?: { method?: string; body?: unknown; headers?: Record<string, string> },
): Promise<Response> {
  const method = (opts?.method ?? "GET").toUpperCase();
  const isWrite = method !== "GET" && method !== "HEAD";
  const sbKey = isWrite
    ? (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY)
    : (env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY);

  return fetch(`${env.SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...opts?.headers,
    },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
}

/** Update a project's status in Supabase. */
export async function updateProjectStatus(
  env: Env,
  projectId: string,
  status: "queued" | "running" | "complete" | "failed",
  extra?: Record<string, unknown>,
) {
  const body: Record<string, unknown> = { status, ...extra };
  const res = await supabaseFetch(env, `/projects?id=eq.${projectId}`, {
    method: "PATCH",
    body,
  });
  if (!res.ok) {
    console.error("Failed to update project status:", await res.text());
  }
}

/** Fetch a project by ID. Uses SERVICE_ROLE so it always succeeds. */
export async function getProject(env: Env, projectId: string) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/projects?id=eq.${projectId}&select=*`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error("Failed to fetch project");
  const rows = (await res.json()) as unknown[];
  return rows[0] as Record<string, unknown> | undefined;
}

/** Fetch a template by ID. */
export async function getTemplate(env: Env, templateId: string) {
  const res = await supabaseFetch(env, `/templates?id=eq.${templateId}&select=*`);
  if (!res.ok) throw new Error("Failed to fetch template");
  const rows = (await res.json()) as unknown[];
  return rows[0] as Record<string, unknown> | undefined;
}

/** Fetch all active templates. */
export async function getTemplates(env: Env) {
  const res = await supabaseFetch(
    env,
    "/templates?is_active=eq.true&order=created_at.desc&select=id,name,description,category,output_type,estimated_credits_per_run,is_active,input_schema,preview_url,tags,weavy_recipe_id",
  );
  if (!res.ok) throw new Error("Failed to fetch templates");
  return (await res.json()) as Record<string, unknown>[];
}

/** Fetch a user's credit balance. Returns 0 if user not found. */
export async function getCreditBalance(env: Env, userId: string): Promise<number> {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/profiles?user_id=eq.${userId}&select=credits_balance`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
    },
  );
  if (!res.ok) return 0;
  const rows = (await res.json()) as { credits_balance: number }[];
  return rows[0]?.credits_balance ?? 0;
}

export async function getRunnerAccessState(env: Env, userId: string): Promise<RunnerAccessState> {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;

  const [profileRes, roleRes] = await Promise.all([
    fetch(
      `${env.SUPABASE_URL}/rest/v1/profiles?user_id=eq.${userId}&select=plan,subscription_status,credits_balance`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
      },
    ),
    fetch(
      `${env.SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${userId}&select=role`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
      },
    ),
  ]);

  if (!profileRes.ok) {
    throw new Error("Failed to fetch billing profile");
  }

  const profiles = await profileRes.json() as Array<{
    plan?: string | null;
    subscription_status?: string | null;
    credits_balance?: number | null;
  }>;
  const profile = profiles[0];
  if (!profile) {
    return {
      exists: false,
      plan: null,
      subscriptionStatus: null,
      creditsBalance: 0,
      roles: [],
      isPrivileged: false,
      hasActiveSubscription: false,
    };
  }

  const roles = roleRes.ok
    ? ((await roleRes.json()) as Array<{ role?: string | null }>).map((row) => row.role).filter(Boolean) as string[]
    : [];
  const isPrivileged = roles.includes("admin") || roles.includes("dev");
  const subscriptionStatus = profile.subscription_status ?? null;

  return {
    exists: true,
    plan: profile.plan ?? null,
    subscriptionStatus,
    creditsBalance: profile.credits_balance ?? 0,
    roles,
    isPrivileged,
    hasActiveSubscription: subscriptionStatus === "active" || subscriptionStatus === "trialing",
  };
}

/** Deduct credits via Supabase RPC and record in ledger. */
export async function deductCredits(
  env: Env,
  userId: string,
  amount: number,
  projectId: string,
  templateId: string | null,
  description: string,
): Promise<void> {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;

  // Atomic decrement via RPC
  const rpcRes = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/decrement_credits`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_user_id: userId, p_amount: amount }),
  });

  // Fallback: manual PATCH if RPC not available
  if (!rpcRes.ok) {
    // Read current balance then set new value
    const profileRes = await fetch(
      `${env.SUPABASE_URL}/rest/v1/profiles?user_id=eq.${userId}&select=credits_balance`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (profileRes.ok) {
      const rows = await profileRes.json() as { credits_balance: number }[];
      const current = rows[0]?.credits_balance ?? 0;
      await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?user_id=eq.${userId}`, {
        method: "PATCH",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ credits_balance: Math.max(0, current - amount) }),
      });
    }
  }

  // Insert credit_ledger entry
  await fetch(`${env.SUPABASE_URL}/rest/v1/credit_ledger`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      user_id: userId,
      type: "run_template",
      amount: -amount,
      project_id: projectId,
      template_id: templateId,
      description,
    }),
  });
}

/** Upsert project steps. */
export async function upsertStep(
  env: Env,
  projectId: string,
  stepKey: string,
  data: Record<string, unknown>,
) {
  const res = await supabaseFetch(env, "/project_steps", {
    method: "POST",
    body: { project_id: projectId, step_key: stepKey, ...data },
    headers: { Prefer: "return=representation,resolution=merge-duplicates" },
  });
  if (!res.ok) {
    console.error("Failed to upsert step:", await res.text());
  }
}
