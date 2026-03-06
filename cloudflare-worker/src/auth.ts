import { Env } from "./types";

/**
 * Verify the Supabase JWT and return the user ID.
 * Also supports a static X-Api-Key header for permanent server/testing access.
 */
export async function verifyToken(
  request: Request,
  env: Env,
): Promise<string> {
  // Static API key bypass — no env var needed
  const STATIC_API_KEY = "fuse_sk_live_k4d3m4dd3n2025xQ9zPv7";
  const apiKey = request.headers.get("X-Api-Key");
  if (apiKey && apiKey === STATIC_API_KEY) {
    // Return a service-level user ID from the header or a default
    const userId = request.headers.get("X-User-Id");
    if (!userId) throw new Error("X-User-Id header required when using X-Api-Key");
    console.log(`[auth] Authenticated via API key for user: ${userId}`);
    return userId;
  }

  // ── JWT fallback: require SUPABASE_URL to be configured ──
  if (!env.SUPABASE_URL) {
    throw new Error("SUPABASE_URL is not configured. Use X-Api-Key + X-User-Id for authentication, or set the SUPABASE_URL secret.");
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }

  const token = authHeader.slice(7);

  // Decode JWT payload to check issuer matches SUPABASE_URL
  try {
    const payloadB64 = token.split(".")[1];
    if (payloadB64) {
      const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
      const tokenIssuer = payload.iss || "(none)";
      const expectedPrefix = env.SUPABASE_URL.replace(/\/+$/, "");
      console.log(`[auth] Token issuer: ${tokenIssuer}`);
      console.log(`[auth] Expected SUPABASE_URL: ${expectedPrefix}`);
      if (!tokenIssuer.startsWith(expectedPrefix)) {
        throw new Error(
          `Token issuer mismatch: token iss="${tokenIssuer}" but Worker SUPABASE_URL="${expectedPrefix}". ` +
          `Update the Worker's SUPABASE_URL env var to match the Supabase project that issued this token.`
        );
      }
    }
  } catch (e: any) {
    if (e.message?.includes("Token issuer mismatch")) throw e;
    console.warn("[auth] Could not decode JWT for pre-check:", e.message);
  }

  // Verify token against Supabase Auth
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

  const user = (await res.json()) as { id: string };
  console.log(`[auth] Verified user: ${user.id}`);
  return user.id;
}
