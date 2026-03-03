import { Env } from "./types";

/**
 * Exchange the long-lived Firebase refresh token for a fresh Weavy id_token.
 */
export async function getWeavyIdToken(env: Env): Promise<string> {
  const res = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${env.WEAVY_FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: env.WEAVY_REFRESH_TOKEN,
      }),
    },
  );

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Firebase token refresh failed (${res.status}): ${txt}`);
  }

  const data: { id_token: string } = await res.json();
  return data.id_token;
}

/**
 * Trigger a Weavy recipe run with the given inputs.
 */
export async function triggerWeavyRecipe(
  env: Env,
  recipeId: string,
  inputs: Record<string, unknown>,
): Promise<{ runId: string }> {
  const idToken = await getWeavyIdToken(env);
  const url = `${env.WEAVY_API_BASE_URL}/api/v1/recipe-runs/recipes/${recipeId}/run`;

  console.log(`[weavy] triggering recipe=${recipeId}`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ inputs }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Weavy trigger failed (${res.status}): ${body.slice(0, 1000)}`);
  }

  const data = await res.json();
  const runId = data.id || data.runId;
  console.log(`[weavy] run started runId=${runId}`);
  return { runId };
}

/**
 * Poll Weavy for the status of a recipe run.
 */
export async function getWeavyRunStatus(
  env: Env,
  recipeId: string,
  runId: string,
): Promise<{
  status: string;
  progress?: number;
  outputs?: unknown[];
  error?: string;
}> {
  const idToken = await getWeavyIdToken(env);
  const url = `${env.WEAVY_API_BASE_URL}/api/v1/recipe-runs/recipes/${recipeId}/runs/status?runIds=${runId}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Weavy status poll failed (${res.status}): ${body.slice(0, 500)}`);
  }

  return res.json();
}
