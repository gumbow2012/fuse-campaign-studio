/**
 * PENDING GENERATION INTENT (P2 — in-memory only)
 *
 * Captures what the visitor had configured when the generate auth gate opened,
 * so a later phase (P3/P4) can restore and replay it. Never holds raw file
 * bytes and never touches storage — file persistence is P3.
 */
export type PendingGenerationIntent = {
  templateId: string;
  versionId?: string | null;
  /** Editable text field values keyed by input key. */
  textInputs: Record<string, string>;
  /** Non-file selections (options, toggles) keyed by input key. */
  selectedOptions: Record<string, string>;
  /** Cast selection by slot. */
  cast: Record<string, string>;
  /** Input keys that currently hold a locally selected file (no bytes here). */
  pendingFileKeys: string[];
  /** Internal path to return to after auth. */
  returnTo: string;
  capturedAt: number;
};

let current: PendingGenerationIntent | null = null;

export function setPendingGenerationIntent(intent: PendingGenerationIntent) {
  current = intent;
  return current;
}

export function getPendingGenerationIntent() {
  return current;
}

export function clearPendingGenerationIntent() {
  current = null;
}
