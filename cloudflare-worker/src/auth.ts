import { Env } from "./types";

/** Verify the Supabase JWT and return the user ID. */
export async function verifyToken(
  request: Request,
  env: Env,
): Promise<string> {
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
    // If it's our mismatch error, re-throw it
    if (e.message?.includes("Token issuer mismatch")) throw e;
    // Otherwise just log and let Supabase do the final validation
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
