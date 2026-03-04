import { Env } from "./types";

/**
 * Trigger a Weavy recipe run via the design API.
 * Uses WEAVY_REFRESH_TOKEN directly as Bearer auth.
 */
export async function weavyRun(
  env: Env,
  recipeId: string,
  inputs: Record<string, unknown>,
): Promise<{ id: string; [key: string]: unknown }> {
  const url = `${env.WEAVY_API_BASE_URL}/api/design/runs`;

  console.log(`[weavy] triggering recipe=${recipeId}`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WEAVY_REFRESH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipe_id: recipeId,
      inputs,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Weavy run failed (${res.status}): ${body.slice(0, 1000)}`);
  }

  const data = await res.json() as { id: string; [key: string]: unknown };
  console.log(`[weavy] run started id=${data.id}`);
  return data;
}

/**
 * Poll Weavy for the status of a design run.
 */
export async function weavyStatus(
  env: Env,
  runId: string,
): Promise<{
  status?: string;
  state?: string;
  progress?: number;
  outputs?: unknown;
  result?: unknown;
  error?: string;
  message?: string;
  [key: string]: unknown;
}> {
  const url = `${env.WEAVY_API_BASE_URL}/api/design/runs/${runId}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${env.WEAVY_REFRESH_TOKEN}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Weavy status failed (${res.status}): ${body.slice(0, 500)}`);
  }

  return res.json();
}

// Keep old names as aliases for backward compat
export const triggerWeavyRecipe = async (
  env: Env,
  recipeId: string,
  inputs: Record<string, unknown>,
): Promise<{ runId: string }> => {
  const data = await weavyRun(env, recipeId, inputs);
  return { runId: data.id };
};

export const getWeavyRunStatus = weavyStatus;
