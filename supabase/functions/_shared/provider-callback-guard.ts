/**
 * Decides whether a provider (fal) callback may update a step. A callback is
 * only accepted for the step's CURRENT request id. The URL step-id fallback
 * may adopt a request id only when the step has none yet and that id was not
 * superseded by a corrective retry. Pure; node-testable.
 */
export type CallbackDecision = "accept" | "adopt" | "superseded";

export function classifyProviderCallback(a: {
  matchedBy: "request_id" | "step_id";
  stepRequestId: string | null | undefined;
  callbackRequestId: string;
  superseded: readonly string[];
}): CallbackDecision {
  if (a.superseded.includes(a.callbackRequestId)) return "superseded";
  if (a.matchedBy === "request_id") return a.stepRequestId === a.callbackRequestId ? "accept" : "superseded";
  if (!a.stepRequestId) return "adopt";
  return a.stepRequestId === a.callbackRequestId ? "accept" : "superseded";
}
