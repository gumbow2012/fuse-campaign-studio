import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { classifyProviderCallback } from "../_shared/provider-callback-guard.ts";
import { HAT_FILM_QA_KEY, supersededRequestIds } from "../_shared/hat-film-qa.ts";
import { HAT_FILM_CONTEXT_KEY } from "../_shared/hat-film-recipe.ts";

import nacl from "npm:tweetnacl";

import { corsHeaders, createAdminClient, errorMessage, json } from "../_shared/supabase-admin.ts";
import { finalizeJobIfTerminal, retryHatProviderRefusal, runGraphJob, uploadRemoteAsset } from "../_shared/executor.ts";
import { getFalRequestTelemetry } from "../_shared/fal.ts";

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function verifyFalWebhook(req: Request, rawBody: Uint8Array) {
  const requestId = req.headers.get("x-fal-webhook-request-id");
  const userId = req.headers.get("x-fal-webhook-user-id");
  const timestamp = req.headers.get("x-fal-webhook-timestamp");
  const signature = req.headers.get("x-fal-webhook-signature");

  if (!requestId || !userId || !timestamp || !signature) return false;

  const currentUnix = Math.floor(Date.now() / 1000);
  if (Math.abs(currentUnix - Number(timestamp)) > 300) return false;

  const digest = await crypto.subtle.digest("SHA-256", rawBody);
  const bodyHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const message = new TextEncoder().encode([requestId, userId, timestamp, bodyHash].join("\n"));
  const signatureBytes = Uint8Array.from(signature.match(/.{1,2}/g)?.map((part) => parseInt(part, 16)) ?? []);

  const jwksResponse = await fetch("https://rest.fal.ai/.well-known/jwks.json");
  if (!jwksResponse.ok) return false;
  const jwks = await jwksResponse.json() as { keys?: Array<{ x?: string }> };

  for (const key of jwks.keys ?? []) {
    if (!key.x) continue;
    const publicKey = decodeBase64Url(key.x);
    if (nacl.sign.detached.verify(message, signatureBytes, publicKey)) return true;
  }

  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const rawBody = new Uint8Array(await req.arrayBuffer());
  const verified = await verifyFalWebhook(req, rawBody);
  if (!verified) return json({ error: "Invalid fal webhook signature" }, 401);

  const admin = createAdminClient();

  try {
    const url = new URL(req.url);
    const body = JSON.parse(new TextDecoder().decode(rawBody)) as {
      request_id?: string;
      status?: string;
      payload?: Record<string, unknown> | null;
      error?: string;
    };

    const requestId = body.request_id;
    if (!requestId) throw new Error("Missing request_id");

    let { data: step, error: stepError } = await admin
      .from("execution_steps")
      .select("id, job_id, node_id, status, provider_model, provider_request_id, started_at, input_payload, output_payload, nodes!execution_steps_node_id_fkey(name, node_type)")
      .eq("provider_request_id", requestId)
      .single();

    let matchedBy: "request_id" | "step_id" = "request_id";
    if ((stepError || !step) && url.searchParams.get("stepId")) {
      const stepId = url.searchParams.get("stepId");
      const jobId = url.searchParams.get("jobId");
      const fallback = await admin
        .from("execution_steps")
        .select("id, job_id, node_id, status, provider_model, provider_request_id, started_at, input_payload, output_payload, nodes!execution_steps_node_id_fkey(name, node_type)")
        .eq("id", stepId)
        .maybeSingle();
      if (fallback.error) throw new Error(fallback.error.message);
      if (fallback.data && (!jobId || fallback.data.job_id === jobId)) {
        step = fallback.data as any;
        matchedBy = "step_id";
      }
    }

    if (!step) throw new Error(stepError?.message ?? "Step not found for request");

    // Reject callbacks from superseded attempts (e.g. a still rejected by the
    // Hat Brand Film product check whose late result arrives during/after its retry).
    const { data: jobRow, error: jobRowError } = await admin
      .from("execution_jobs").select("result_payload, input_payload").eq("id", step.job_id).maybeSingle();
    if (jobRowError) throw new Error(jobRowError.message);
    const decision = classifyProviderCallback({
      matchedBy,
      stepRequestId: step.provider_request_id,
      callbackRequestId: requestId,
      superseded: [
        ...supersededRequestIds((jobRow as any)?.result_payload?.[HAT_FILM_QA_KEY]),
        ...(Array.isArray((step.output_payload as any)?.superseded_request_ids) ? (step.output_payload as any).superseded_request_ids : []),
      ],
    });
    if (decision === "superseded") return json({ ok: true, superseded: true });
    if (decision === "adopt") {
      const { data: adopted, error: adoptError } = await admin
        .from("execution_steps")
        .update({ provider_request_id: requestId })
        .eq("id", step.id)
        .is("provider_request_id", null)
        .select("id");
      if (adoptError) throw new Error(adoptError.message);
      if ((adopted ?? []).length !== 1) return json({ ok: true, superseded: true });
      step.provider_request_id = requestId;
    }

    if (step.status === "complete") return json({ ok: true, duplicate: true });

    if (body.status && body.status !== "ERROR") {
      const payload = (body.payload as any)?.data ?? body.payload;
      const videoUrl = payload?.video?.url;
      const imageUrl = payload?.images?.[0]?.url ?? payload?.image?.url;
      if (!videoUrl && !imageUrl) {
        return json({ ok: true, status: body.status.toLowerCase() });
      }
    }

    if (body.status === "ERROR") {
      // Hat Brand Film: provider refusals are intermittent; resubmit (bounded) before failing the shot.
      const isHatFilm = Boolean((jobRow as any)?.input_payload?.[HAT_FILM_CONTEXT_KEY]);
      const providerError = String(body.error ?? (body.payload as any)?.detail ?? "provider error");
      if (isHatFilm && await retryHatProviderRefusal(admin, step as any, requestId, providerError)) {
        await runGraphJob(admin, step.job_id);
        return json({ ok: true, status: "retrying" });
      }
      const completedAt = new Date().toISOString();
      await admin
        .from("execution_steps")
        .update({
          status: "failed",
          error_log: body.error ?? "fal job failed",
          completed_at: completedAt,
          execution_time_ms: step.started_at ? Math.max(0, new Date(completedAt).getTime() - new Date(step.started_at).getTime()) : null,
          output_payload: {
            ...(step.output_payload ?? {}),
            rawPayload: body.payload ?? {},
          },
        })
        .eq("id", step.id);

      await finalizeJobIfTerminal(admin, step.job_id);
      return json({ ok: true, status: "failed" });
    }

    const payload = (body.payload as any)?.data ?? body.payload;
    const videoUrl = payload?.video?.url;
    const imageUrl = payload?.images?.[0]?.url ?? payload?.image?.url;
    const outputUrl = videoUrl ?? imageUrl;
    if (!outputUrl) throw new Error("Webhook payload had no output URL");

    const falTelemetry = step.provider_model
      ? await getFalRequestTelemetry(step.provider_model, requestId).catch(() => null)
      : null;
    const completedAt = new Date().toISOString();
    const executionTimeMs = step.started_at
      ? Math.max(0, new Date(completedAt).getTime() - new Date(step.started_at).getTime())
      : null;

    const asset = await uploadRemoteAsset(admin, {
      jobId: step.job_id,
      stepId: step.id,
      kind: videoUrl ? "video" : "image",
      sourceUrl: outputUrl,
      metadata: {
        nodeId: step.node_id,
        nodeName: (step as any).nodes?.name ?? "Output",
        falRequestId: requestId,
      },
      finish: { inputPayload: (step as any).input_payload ?? null, nodeId: step.node_id },
    });

    await admin
      .from("execution_steps")
      .update({
        status: "complete",
        output_asset_id: asset.id,
        completed_at: completedAt,
        execution_time_ms: executionTimeMs,
        error_log: null,
        output_payload: {
          ...(step.output_payload ?? {}),
          requestId,
          sourceUrl: outputUrl,
          outputUrl: asset.supabase_storage_url,
          ...(asset.finishing ? { providerOutputUrl: outputUrl, sourceEditFinishing: asset.finishing } : {}),
          telemetry: {
            ...((step.output_payload as any)?.telemetry ?? {}),
            executionTimeMs,
            falDurationSeconds: falTelemetry?.duration ?? null,
            falStartedAt: falTelemetry?.started_at ?? null,
            falEndedAt: falTelemetry?.ended_at ?? null,
            falSentAt: falTelemetry?.sent_at ?? null,
          },
        },
      })
      .eq("id", step.id);

    await runGraphJob(admin, step.job_id);
    await finalizeJobIfTerminal(admin, step.job_id);
    return json({ ok: true, status: "complete" });
  } catch (error) {
    return json({ error: errorMessage(error) }, 400);
  }
});
