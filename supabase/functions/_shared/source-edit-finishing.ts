/**
 * Completion-path glue for deterministic source-edit finishing. Used by the
 * full-job paths (fal-webhook, queue reconciliation via uploadRemoteAsset) and
 * by single-step previews (run-node). No provider calls, no public storage:
 * the source clip is read through the existing authenticated asset resolver.
 */
import { resolveRequiredVideoUrls } from "./asset-access.ts";
import {
  FINISH_MAX_INPUT_BYTES,
  FINISH_MEMORY_BUDGET_BYTES,
  finishSourceEditMp4,
  Mp4FinishError,
  shouldFinishSourceEdit,
  type FinishExpectation,
} from "./mp4-source-audio-finish.ts";

export { shouldFinishSourceEdit };

export type SourceEditFinishing = {
  status: "finished" | "skipped" | "rejected" | "error";
  code?: string;
  reason?: string;
  provider_output_url: string;
  finished_at: string;
  report?: Record<string, unknown>;
};

/**
 * Streams at most `maxBytes`; aborts as soon as the limit is crossed whether or
 * not content-length is present or truthful. Pre-sizes when a valid length is
 * declared so there is no second copy.
 */
export async function fetchBounded(url: string, maxBytes: number, label: string): Promise<Uint8Array> {
  if (!Number.isFinite(maxBytes) || maxBytes < 1) throw new Mp4FinishError("too_large", `No memory budget left for ${label}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${label}: ${response.status}`);
  const tooLarge = () => new Mp4FinishError("too_large", `${label} is larger than ${maxBytes} bytes`);
  const declaredRaw = response.headers.get("content-length");
  const declared = declaredRaw != null && /^\d+$/.test(declaredRaw) ? Number(declaredRaw) : null;
  if (declared != null && declared > maxBytes) {
    await response.body?.cancel().catch(() => {});
    throw tooLarge();
  }
  if (!response.body) return new Uint8Array(0);
  const reader = response.body.getReader();
  let buffer = new Uint8Array(declared ?? Math.min(maxBytes, 4_000_000));
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (length + value.byteLength > maxBytes) throw tooLarge();
      if (length + value.byteLength > buffer.byteLength) {
        const grown = new Uint8Array(Math.min(maxBytes, Math.max(buffer.byteLength * 2, length + value.byteLength)));
        grown.set(buffer.subarray(0, length));
        buffer = grown;
      }
      buffer.set(value, length);
      length += value.byteLength;
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  return buffer.subarray(0, length);
}

async function loadExpectation(admin: any, nodeId: string | null | undefined): Promise<FinishExpectation | null> {
  if (!nodeId) return null;
  const { data } = await admin.from("nodes").select("prompt_config").eq("id", nodeId).maybeSingle();
  const meta = (data?.prompt_config?.source_video ?? null) as Record<string, unknown> | null;
  if (!meta) return null;
  return {
    duration: Number(meta.duration) || null,
    width: Number(meta.width) || null,
    height: Number(meta.height) || null,
  };
}

/**
 * Returns the bytes to store plus finishing metadata. When the gate is off the
 * provider bytes pass through untouched and `finishing` is null. Unsupported
 * media never claims exact finishing: provider bytes are kept and the
 * rejection is recorded.
 */
export async function applySourceEditFinishing(admin: any, args: {
  inputPayload: Record<string, unknown> | null | undefined;
  nodeId?: string | null;
  providerUrl: string;
  generated: Uint8Array;
}): Promise<{ bytes: Uint8Array; finishing: SourceEditFinishing | null }> {
  if (!shouldFinishSourceEdit(args.inputPayload)) return { bytes: args.generated, finishing: null };
  const base = { provider_output_url: args.providerUrl, finished_at: new Date().toISOString() };
  try {
    const sourceRef = String(args.inputPayload?.video_url ?? "");
    if (!sourceRef) throw new Mp4FinishError("missing_source", "No source clip reference recorded on this step");
    const [signed] = await resolveRequiredVideoUrls(admin, [sourceRef]);
    // Output ≤ generated + source, so both inputs plus output stay inside the budget.
    const sourceMax = Math.min(FINISH_MAX_INPUT_BYTES, Math.floor(FINISH_MEMORY_BUDGET_BYTES / 2) - args.generated.byteLength);
    if (sourceMax < 1) throw new Mp4FinishError("too_large", "Generated video leaves no memory budget for the source clip");
    const source = await fetchBounded(signed, sourceMax, "source clip");
    const expected = await loadExpectation(admin, args.nodeId);
    const { bytes, report } = finishSourceEditMp4({ generated: args.generated, source, expected });
    return {
      bytes,
      finishing: { ...base, status: report.status, reason: report.reason, report: report as unknown as Record<string, unknown> },
    };
  } catch (error) {
    const isFinish = error instanceof Mp4FinishError;
    console.error("source-edit finishing not applied:", error instanceof Error ? error.message : String(error));
    return {
      bytes: args.generated,
      finishing: {
        ...base,
        status: isFinish ? "rejected" : "error",
        code: isFinish ? (error as Mp4FinishError).code : "finishing_error",
        reason: (error instanceof Error ? error.message : String(error)).slice(0, 500),
      },
    };
  }
}
