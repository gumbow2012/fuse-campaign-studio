/**
 * Standalone (non-template) image and video generation for the MCP layer.
 * This is a thin pass-through to the existing `generate-studio` function called
 * with the user's own token, so credits, refunds, storage and signed URLs stay
 * exactly where they already live. Nothing here charges or refunds anything.
 */
import type { Admin, AuthContext } from "../auth.ts";
import { withUserToken } from "../auth.ts";
import { FuseError } from "../errors.ts";

export type StandaloneGenerationArgs = {
  kind: "image" | "video";
  prompt: string;
  imageUrls?: string[];
  startImageUrl?: string;
  endImageUrl?: string;
  duration?: number;
  aspectRatio?: string;
  model?: string;
  resolution?: string;
  generateAudio?: boolean;
};

async function callStudio(admin: Admin, auth: AuthContext, payload: Record<string, unknown>) {
  if (!auth.userId) throw new FuseError("AUTH_REQUIRED");
  return await withUserToken(admin, auth, async (token) => {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-studio`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({} as any));
    if (res.status === 402 || /INSUFFICIENT_CREDITS/i.test(String(body?.error ?? body?.code ?? ""))) {
      throw new FuseError("INSUFFICIENT_CREDITS", "Not enough credits for this generation.");
    }
    if (!res.ok) {
      throw new FuseError("GENERATION_FAILED", String(body?.error ?? `Studio HTTP ${res.status}`), { retryable: true });
    }
    return body as Record<string, any>;
  });
}

export async function startStandaloneGeneration(admin: Admin, auth: AuthContext, args: StandaloneGenerationArgs) {
  const body = await callStudio(admin, auth, { action: "start", ...args });
  const gen = body?.generation;
  if (!gen) throw new FuseError("GENERATION_FAILED", String(body?.error ?? "The generation did not start"), { retryable: true });
  return {
    generation_id: gen.id,
    kind: args.kind,
    status: gen.status,
    estimated_credits: gen.estimatedCredits ?? null,
    output_type: gen.outputType ?? null,
    provider_model: gen.providerModel ?? null,
    next_poll_after_seconds: 10,
  };
}

export async function getStandaloneGenerationStatus(admin: Admin, auth: AuthContext, generationId: string) {
  const body = await callStudio(admin, auth, { action: "status", generationId });
  const gen = body?.generation;
  if (!gen) throw new FuseError("NOT_FOUND", "That generation could not be found");
  const pending = gen.status === "queued" || gen.status === "running";
  return {
    generation_id: generationId,
    status: gen.status,
    output_type: gen.outputType ?? null,
    output_url: gen.outputUrl ?? null,
    preview_url: gen.previewUrl ?? null,
    poster_url: gen.posterUrl ?? null,
    public_failure: gen.publicFailure ?? null,
    next_poll_after_seconds: pending ? 10 : null,
  };
}

export async function listStandaloneGenerations(admin: Admin, auth: AuthContext, args: { limit?: number }) {
  const body = await callStudio(admin, auth, { action: "list", limit: args.limit });
  return { generations: body?.generations ?? [], next_cursor: body?.nextCursor ?? null };
}
