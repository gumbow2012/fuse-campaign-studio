// FUSE CINEMA — generation submit + status (cinema-only code).
//
// ISOLATION / REUSE RULES honoured here:
//   * fal submission uses ONLY the generic helpers imported read-only from
//     ../_shared/fal.ts — that file is NOT modified.
//   * credit accounting uses the SAME math as generate-studio (see ./credits.ts):
//     identical USD_PER_CREDIT and identical fal-pricing lookup. No pricing or
//     credit-math change, and generate-studio itself is untouched.
//   * results live in `studio_generations` with input_payload.feature =
//     "cinema-studio" plus the immutable cinema snapshot. Metadata only — no
//     schema change, no new table, no writes to any other table.

import {
  clampSeedanceDuration,
  getFalQueueResult,
  getFalQueueStatus,
  getVideoModel,
  submitFalJob,
  submitSeedanceReferenceVideoJob,
  submitVideoJob,
  textToVideoEndpoint,
} from "../_shared/fal.ts";
import { createAdminClient, errorMessage, json } from "../_shared/supabase-admin.ts";
import { creditsFromUsd, estimateUsd, videoUsdPerSecond } from "./credits.ts";

type AdminClient = ReturnType<typeof createAdminClient>;

/* ------------------------------------------------------------------ */
/* Model capability truth (mirror of src/lib/cinema/modelAdapters.ts)  */
/* ------------------------------------------------------------------ */

type Capabilities = {
  label: string;
  resolutions: string[];
  aspectRatios: string[];
  fixedAspect?: string;
  durations: string[];
  supportsAudio: boolean;
};

const KLING3_DURATIONS = Array.from({ length: 13 }, (_, i) => String(i + 3));
const SEEDANCE_DURATIONS = ["auto", ...Array.from({ length: 12 }, (_, i) => String(i + 4))];
const SEEDANCE_ASPECTS = ["9:16", "16:9", "1:1", "4:3", "3:4", "21:9"];

const CAPABILITIES: Record<string, Capabilities> = {
  "kling-3.0-pro": {
    label: "Kling 3.0 Pro",
    resolutions: [],
    aspectRatios: [],
    durations: KLING3_DURATIONS,
    supportsAudio: true,
  },
  "kling-3.0-standard": {
    label: "Kling 3.0 Standard",
    resolutions: [],
    aspectRatios: [],
    durations: KLING3_DURATIONS,
    supportsAudio: true,
  },
  "kling-2.5": {
    label: "Kling 2.5",
    resolutions: [],
    aspectRatios: [],
    fixedAspect: "9:16",
    durations: ["5", "10"],
    supportsAudio: false,
  },
  "seedance-2.0": {
    label: "Seedance 2.0",
    resolutions: ["480p", "720p", "1080p", "4k"],
    aspectRatios: SEEDANCE_ASPECTS,
    durations: SEEDANCE_DURATIONS,
    supportsAudio: true,
  },
  "seedance-2.0-fast": {
    label: "Seedance 2.0 Fast",
    resolutions: ["480p", "720p"],
    aspectRatios: SEEDANCE_ASPECTS,
    durations: SEEDANCE_DURATIONS,
    supportsAudio: true,
  },
};

function capabilitiesFor(modelKey: string): Capabilities {
  const caps = CAPABILITIES[modelKey];
  if (!caps) throw new Error(`Unknown Cinema model: ${modelKey}`);
  return caps;
}

/**
 * Validates the requested native options against the model's live schema.
 * Requested === submitted: an unsupported option is REJECTED, never downgraded.
 */
function validateNativeParams(
  modelKey: string,
  requested: Record<string, unknown>,
): { resolution: string | null; aspectRatio: string | null; duration: string | null; generateAudio: boolean | null } {
  const caps = capabilitiesFor(modelKey);

  const resolutionRaw = String(requested.resolution ?? "").trim().toLowerCase();
  if (resolutionRaw) {
    if (!caps.resolutions.length) {
      throw new Error(`${caps.label} has no resolution setting — its output size is provider-fixed`);
    }
    if (!caps.resolutions.includes(resolutionRaw)) {
      throw new Error(
        `${caps.label} cannot render ${resolutionRaw.toUpperCase()} — supported: ${
          caps.resolutions.map((r) => r.toUpperCase()).join(", ")
        }`,
      );
    }
  }

  const aspectRaw = String(requested.aspect_ratio ?? requested.aspectRatio ?? "").trim();
  if (aspectRaw) {
    if (caps.fixedAspect) {
      if (aspectRaw !== caps.fixedAspect) {
        throw new Error(`${caps.label} always renders ${caps.fixedAspect} — ${aspectRaw} is not available`);
      }
    } else if (!caps.aspectRatios.length) {
      throw new Error(`${caps.label} has no aspect-ratio setting — frame it through the prompt instead`);
    } else if (!caps.aspectRatios.includes(aspectRaw)) {
      throw new Error(
        `${caps.label} cannot render ${aspectRaw} — supported: ${caps.aspectRatios.join(", ")}`,
      );
    }
  }

  const durationRaw = String(requested.duration ?? "").trim().toLowerCase();
  if (durationRaw && !caps.durations.includes(durationRaw)) {
    throw new Error(
      `${caps.label} cannot render ${durationRaw}s — supported: ${caps.durations.join(", ")}`,
    );
  }

  const audio = caps.supportsAudio
    ? (requested.generate_audio === undefined ? null : requested.generate_audio === true)
    : null;

  return {
    resolution: resolutionRaw || null,
    aspectRatio: aspectRaw || caps.fixedAspect || null,
    duration: durationRaw || null,
    generateAudio: audio,
  };
}

/* ------------------------------------------------------------------ */
/* Output extraction / serialization                                   */
/* ------------------------------------------------------------------ */

function extractOutput(payload: unknown): { url: string; type: "video" | "image" } | null {
  const data = (payload as any)?.data ?? payload;
  if (!data) return null;
  const videoUrl = data?.video?.url ?? data?.videos?.[0]?.url ??
    (typeof data?.video === "string" ? data.video : null);
  if (videoUrl) return { url: String(videoUrl), type: "video" };
  const imageUrl = data?.images?.[0]?.url ?? data?.image?.url ?? data?.output?.url;
  if (imageUrl) return { url: String(imageUrl), type: "image" };
  return null;
}

function serialize(row: any) {
  const payload = (row?.input_payload ?? {}) as Record<string, unknown>;
  const cinema = (payload.cinema ?? {}) as Record<string, unknown>;
  return {
    id: row.id as string,
    status: row.status as string,
    outputUrl: row.output_url ?? null,
    outputType: row.output_type ?? null,
    error: row.error_log ?? null,
    estimatedCredits: row.estimated_credits ?? null,
    providerModel: row.provider_model ?? null,
    requestId: row.provider_request_id ?? null,
    createdAt: row.created_at ?? null,
    completedAt: row.completed_at ?? null,
    /** Immutable snapshot exactly as submitted. */
    snapshot: cinema.snapshot ?? null,
    cinemaProjectId: cinema.cinema_project_id ?? null,
    sceneId: cinema.scene_id ?? null,
    shotId: cinema.shot_id ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Submit                                                              */
/* ------------------------------------------------------------------ */

const MAX_REFERENCES = 15;

function collectUrls(value: unknown): string[] {
  const urls: string[] = [];
  for (const entry of Array.isArray(value) ? value : []) {
    const url = typeof entry === "string" ? entry.trim() : String((entry as any)?.url ?? "").trim();
    if (!url || urls.includes(url)) continue;
    urls.push(url);
    if (urls.length >= MAX_REFERENCES) break;
  }
  return urls;
}

export async function handleGenerate(body: any, userId: string) {
  const admin = createAdminClient();

  const prompt = String(body?.prompt ?? "").trim();
  if (!prompt) throw new Error("Compile a prompt before generating");

  const modelKey = String(body?.model ?? "").trim();
  const videoModel = getVideoModel(modelKey);
  if (videoModel.key !== modelKey) throw new Error(`Unknown Cinema model: ${modelKey || "(none)"}`);

  const requested = (body?.nativeParams ?? {}) as Record<string, unknown>;
  const native = validateNativeParams(modelKey, requested);
  const referenceUrls = collectUrls(body?.referenceUrls ?? body?.references);

  const snapshot = {
    prompt,
    model: modelKey,
    nativeParams: requested,
    resolvedConfig: body?.resolvedConfig ?? null,
    references: body?.references ?? [],
    presetIds: Array.isArray(body?.presetIds) ? body.presetIds : [],
    directorAgentState: body?.directorAgentState ?? null,
    promptSource: body?.promptSource === "USER_EDITED" ? "USER_EDITED" : "COMPILED",
    compiledAt: new Date().toISOString(),
  };

  const { data: inserted, error: insertError } = await admin
    .from("studio_generations")
    .insert({
      user_id: userId,
      status: "queued",
      kind: "video",
      provider: "fal",
      prompt,
      input_payload: {
        feature: "cinema-studio",
        cinema: {
          cinema_project_id: body?.cinemaProjectId ?? null,
          scene_id: body?.sceneId ?? null,
          shot_id: body?.shotId ?? null,
          snapshot,
        },
      },
    })
    .select("*")
    .single();
  if (insertError || !inserted) {
    throw new Error(insertError?.message ?? "Could not start the generation");
  }

  const webhookUrl = `${
    Deno.env.get("SUPABASE_URL")
  }/functions/v1/cinema-studio?callback=1&generationId=${encodeURIComponent(inserted.id)}`;

  try {
    const durationSeconds = native.duration === "auto" || native.duration === null
      ? clampSeedanceDuration(5, videoModel)
      : Number(native.duration);
    const durationParam: string | number = native.duration === "auto"
      ? "auto"
      : (native.duration ?? durationSeconds);

    const estimatedCostUsd = await estimateUsd({
      endpointId: videoModel.endpointId,
      seconds: durationSeconds,
      fallbackUsdPerSecond: videoUsdPerSecond(videoModel, native.generateAudio),
    });

    let endpointId = videoModel.endpointId;
    let payload: Record<string, unknown>;
    let requestId: string;

    if (referenceUrls.length === 0) {
      // Text-to-video: no reference imagery attached to the shot.
      endpointId = textToVideoEndpoint(videoModel.endpointId);
      payload = {
        prompt,
        duration: String(durationParam),
        ...(native.resolution ? { resolution: native.resolution } : {}),
        ...(native.aspectRatio ? { aspect_ratio: native.aspectRatio } : {}),
        ...(native.generateAudio === null ? {} : { generate_audio: native.generateAudio }),
        ...(videoModel.family === "kling3" ? { cfg_scale: 0.5 } : {}),
      };
      requestId = await submitFalJob(endpointId, payload, webhookUrl);
    } else if (referenceUrls.length >= 2 && videoModel.supportsMultiReference === true) {
      const submitted = await submitSeedanceReferenceVideoJob({
        modelKey: videoModel.key,
        prompt,
        imageUrls: referenceUrls,
        duration: durationParam,
        ...(native.resolution ? { resolution: native.resolution } : {}),
        ...(native.aspectRatio ? { aspectRatio: native.aspectRatio } : {}),
        ...(native.generateAudio === null ? {} : { generateAudio: native.generateAudio }),
        webhookUrl,
      });
      requestId = submitted.requestId;
      endpointId = submitted.endpointId;
      payload = submitted.input;
    } else {
      payload = {
        prompt,
        image_url: referenceUrls[0],
        duration: String(durationParam),
        ...(native.resolution ? { resolution: native.resolution } : {}),
        ...(native.aspectRatio ? { aspect_ratio: native.aspectRatio } : {}),
        ...(native.generateAudio === null ? {} : { generate_audio: native.generateAudio }),
      };
      requestId = await submitVideoJob({
        prompt,
        initImageUrl: referenceUrls[0],
        modelKey: videoModel.key,
        duration: durationParam as unknown as number,
        ...(native.resolution ? { resolution: native.resolution } : {}),
        ...(native.aspectRatio ? { aspectRatio: native.aspectRatio } : {}),
        ...(native.generateAudio === null ? {} : { generateAudio: native.generateAudio }),
        webhookUrl,
      });
    }

    const { data: updated } = await admin
      .from("studio_generations")
      .update({
        status: "running",
        provider_model: endpointId,
        provider_request_id: requestId,
        estimated_cost_usd: estimatedCostUsd,
        estimated_credits: creditsFromUsd(estimatedCostUsd),
        input_payload: {
          feature: "cinema-studio",
          cinema: {
            cinema_project_id: body?.cinemaProjectId ?? null,
            scene_id: body?.sceneId ?? null,
            shot_id: body?.shotId ?? null,
            snapshot,
          },
          submitted: payload,
          video_model: videoModel.key,
          // Truthfulness record: what the UI asked for vs what fal received.
          requested_resolution: native.resolution,
          submitted_resolution: (payload as any).resolution ?? null,
          requested_duration: native.duration,
          submitted_duration: (payload as any).duration ?? null,
        },
      })
      .eq("id", inserted.id)
      .select("*")
      .single();

    return json({ generation: serialize(updated ?? inserted) });
  } catch (error) {
    const message = errorMessage(error);
    await admin
      .from("studio_generations")
      .update({
        status: "failed",
        error_log: message.slice(0, 10000),
        completed_at: new Date().toISOString(),
      })
      .eq("id", inserted.id);
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

const STUCK_AFTER_MS = 20 * 60 * 1000;
const PROVIDER_CALL_TIMEOUT_MS = 10_000;

class ProviderTimeout extends Error {}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) =>
      setTimeout(
        () => reject(new ProviderTimeout(`${label} timed out after ${PROVIDER_CALL_TIMEOUT_MS}ms`)),
        PROVIDER_CALL_TIMEOUT_MS,
      )
    ),
  ]);
}

function inFlight(row: any) {
  return row?.status === "queued" || row?.status === "running";
}

async function syncRow(admin: AdminClient, row: any) {
  if (!inFlight(row)) return serialize(row);

  const created = Date.parse(String(row?.created_at ?? ""));
  const age = Number.isFinite(created) ? Date.now() - created : 0;
  if (age > STUCK_AFTER_MS) {
    const { data: expired } = await admin
      .from("studio_generations")
      .update({
        status: "failed",
        error_log: "Generation timed out (no provider result within 20m)",
        completed_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .select("*")
      .maybeSingle();
    return serialize(expired ?? row);
  }

  if (!row.provider_model || !row.provider_request_id) return serialize(row);

  try {
    const status = await withTimeout(
      getFalQueueStatus(row.provider_model, row.provider_request_id),
      "queue status lookup",
    );
    const normalized = String(status ?? "").toUpperCase();
    if (normalized !== "COMPLETED" && normalized !== "OK") return serialize(row);

    const result = await withTimeout(
      getFalQueueResult(row.provider_model, row.provider_request_id),
      "queue result lookup",
    );
    const output = extractOutput(result);
    if (!output) throw new Error("The provider finished without returning a file");

    const { data: updated } = await admin
      .from("studio_generations")
      .update({
        status: "complete",
        output_url: output.url,
        output_type: output.type,
        completed_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .select("*")
      .single();
    return serialize(updated ?? row);
  } catch (error) {
    if (error instanceof ProviderTimeout) return serialize(row);
    const message = errorMessage(error);
    if (/queue status lookup failed|fetch|network|timed out/i.test(message)) return serialize(row);

    const { data: failed } = await admin
      .from("studio_generations")
      .update({
        status: "failed",
        error_log: message.slice(0, 10000),
        completed_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .select("*")
      .single();
    return serialize(failed ?? row);
  }
}

export async function handleGenerationStatus(body: any, userId: string) {
  const admin = createAdminClient();
  const generationId = String(body?.generationId ?? "").trim();
  if (!generationId) throw new Error("generationId is required");

  const { data: row, error } = await admin
    .from("studio_generations")
    .select("*")
    .eq("id", generationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return json({ error: "Generation not found" }, 404);
  if ((row.input_payload as any)?.feature !== "cinema-studio") {
    return json({ error: "Generation not found" }, 404);
  }

  return json({ generation: await syncRow(admin, row) });
}

/** Revision history for one shot — append-only, newest last. */
export async function handleGenerationHistory(body: any, userId: string) {
  const admin = createAdminClient();
  const projectId = String(body?.cinemaProjectId ?? "").trim();
  const limit = Math.min(100, Math.max(1, Number(body?.limit ?? 50)));

  let query = admin
    .from("studio_generations")
    .select("*")
    .eq("user_id", userId)
    .eq("kind", "video")
    .order("created_at", { ascending: true })
    .limit(limit);

  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);

  const generations = (rows ?? [])
    .filter((row: any) => (row.input_payload as any)?.feature === "cinema-studio")
    .filter((row: any) =>
      !projectId || (row.input_payload as any)?.cinema?.cinema_project_id === projectId
    )
    .map((row: any) => serialize(row));

  return json({ generations });
}

/** fal webhook: completes a cinema row without waiting for a poll. */
export async function handleGenerateCallback(req: Request, generationId: string) {
  const admin = createAdminClient();
  const body = await req.json().catch(() => ({})) as {
    request_id?: string;
    status?: string;
    payload?: unknown;
    error?: string;
  };

  const { data: row } = await admin
    .from("studio_generations")
    .select("*")
    .eq("id", generationId)
    .maybeSingle();
  if (!row) return json({ error: "Generation not found" }, 404);
  if ((row.input_payload as any)?.feature !== "cinema-studio") {
    return json({ error: "Generation not found" }, 404);
  }
  if (body.request_id && row.provider_request_id && body.request_id !== row.provider_request_id) {
    return json({ error: "Request mismatch" }, 400);
  }
  if (row.status === "complete" || row.status === "failed") return json({ ok: true });

  const output = extractOutput(body.payload);
  const failed = String(body.status ?? "").toUpperCase() === "ERROR" || (!output && !!body.error);

  if (!output) {
    if (!failed) return json({ ok: true }); // let the poller reconcile
    await admin
      .from("studio_generations")
      .update({
        status: "failed",
        error_log: String(body.error ?? "Generation failed").slice(0, 10000),
        completed_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return json({ ok: true });
  }

  await admin
    .from("studio_generations")
    .update({
      status: "complete",
      output_url: output.url,
      output_type: output.type,
      completed_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  return json({ ok: true });
}
