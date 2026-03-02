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

  // Verify token against Supabase Auth
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });

  if (!res.ok) {
    throw new Error("Invalid or expired token");
  }

  const user = (await res.json()) as { id: string };
  return user.id;
}
