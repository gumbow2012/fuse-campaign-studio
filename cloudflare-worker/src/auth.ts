export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;

  FUSE_API_KEY?: string;

  FAL_API_KEY?: string;
  KLING_ACCESS_KEY?: string;
  KLING_SECRET_KEY?: string;
  GEMINI_API_KEY?: string;

  WEAVY_API_BASE_URL?: string;
  WEAVY_FIREBASE_API_KEY?: string;
  WEAVY_REFRESH_TOKEN?: string;

  FUSE_ASSETS: R2Bucket;
  FUSE_TEMPLATES: R2Bucket;
}

export async function verifyToken(request: Request, env: Env): Promise<string> {
  const staticApiKey = env.FUSE_API_KEY;
  const apiKey = request.headers.get("X-Api-Key");

  if (staticApiKey && apiKey && apiKey === staticApiKey) {
    const userId = request.headers.get("X-User-Id");
    if (!userId) {
      throw new Error("X-User-Id header required when using X-Api-Key");
    }
    console.log(`[auth] Authenticated via API key for user: ${userId}`);
    return userId;
  }

  if (!env.SUPABASE_URL) {
    throw new Error(
      "SUPABASE_URL is not configured. Use X-Api-Key + X-User-Id for authentication, or set SUPABASE_URL."
    );
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }

  const token = authHeader.slice(7);

  try {
    const payloadB64 = token.split(".")[1];
    if (payloadB64) {
      const payload = JSON.parse(
        atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"))
      );
      const tokenIssuer = payload.iss || "(none)";
      const expectedPrefix = env.SUPABASE_URL.replace(/\/+$/, "");

      console.log(`[auth] Token issuer: ${tokenIssuer}`);
      console.log(`[auth] Expected SUPABASE_URL: ${expectedPrefix}`);

      if (!tokenIssuer.startsWith(expectedPrefix)) {
        throw new Error(
          `Token issuer mismatch: token iss="${tokenIssuer}" but Worker SUPABASE_URL="${expectedPrefix}".`
        );
      }
    }
  } catch (e: any) {
    if (e?.message?.includes("Token issuer mismatch")) throw e;
    console.warn("[auth] Could not decode JWT for pre-check:", e?.message || e);
  }

  const supabaseUrl = env.SUPABASE_URL.replace(/\/+$/, "");
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_ANON_KEY,
    },
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error(`[auth] Supabase auth failed (${res.status}): ${txt}`);
    throw new Error(`Auth failed (${res.status}): ${txt}`);
  }

  const user = await res.json<{ id: string }>();
  console.log(`[auth] Verified user: ${user.id}`);
  return user.id;
}
