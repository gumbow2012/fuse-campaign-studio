/**
 * §F1 — PROMPT INPUT FINGERPRINT.
 *
 * A short, stable hash of the inputs that produced the AUTO Seedance director
 * prompt. It is recorded next to the prompt so a later input change can be
 * detected (the stored auto prompt is stale) WITHOUT ever overwriting a prompt
 * the user edited by hand.
 */

export const PROMPT_FINGERPRINT_VERSION = "prompt-inputs-v1";

/** FNV-1a — deterministic, dependency-free, good enough for change detection. */
function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** `${version}:${hash}` of the serialized prompt inputs. */
export function promptInputFingerprint(inputs: unknown): string {
  let serialized: string;
  try {
    serialized = typeof inputs === "string" ? inputs : JSON.stringify(inputs) ?? "";
  } catch {
    serialized = String(inputs ?? "");
  }
  return `${PROMPT_FINGERPRINT_VERSION}:${hashText(serialized)}`;
}

/**
 * §F1 — the persisted prompt record for one reconstruction. `final` is the
 * EXACT string that was submitted to the provider.
 */
export type DirectorPromptRecord = {
  /** What the builder produced for the recorded inputs. */
  auto: string | null;
  /** The exact text submitted (identical to `auto` unless the user edited it). */
  final: string;
  /** True when the user hand-edited the prompt. */
  userEdited: boolean;
  /** Fingerprint of the inputs that produced `auto`. */
  inputFingerprint: string | null;
  createdAt: string;
};

/** True when the inputs moved on since this prompt record was captured. */
export function isDirectorPromptStale(
  record: { input_fingerprint?: string | null } | null | undefined,
  currentFingerprint: string | null,
): boolean {
  if (!record?.input_fingerprint || !currentFingerprint) return false;
  return record.input_fingerprint !== currentFingerprint;
}
