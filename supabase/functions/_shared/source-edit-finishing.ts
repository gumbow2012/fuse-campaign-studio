/**
 * Completion-path glue for deterministic source-edit finishing. Used by the
 * full-job paths (fal-webhook, queue reconciliation via uploadRemoteAsset) and
 * by single-step previews (run-node). No provider calls, no public storage:
 * the source clip is read through the existing authenticated asset resolver.
 */
import { resolveRequiredVideoUrls } from "./asset-access.ts";
import {
  FINISH_MAX_INPUT_BYTES,
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

export async function fetchBounded(url: string, maxBytes: number, label: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${label}: ${response.status}`);
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared && declared > maxBytes) {
    await response.body?.cancel();
    throw new Mp4FinishError("too_large", `${label} is larger than ${maxBytes} bytes`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new Mp4FinishError("too_large", `${label} is larger than ${maxBytes} bytes`);
  return bytes;
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
    const source = await fetchBounded(signed, FINISH_MAX_INPUT_BYTES, "source clip");
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
