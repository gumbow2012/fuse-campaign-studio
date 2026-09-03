/**
 * FUSE Campaign Editor — Basic / Advanced mode preference.
 * Presentation-only: the underlying adjustment state is identical in both modes.
 */
export type EditorMode = "basic" | "advanced";

const modeKey = (projectId: string) => `fuse.editor.mode.${projectId}`;
const PROMPT_KEY = "fuse.editor.advancedPrompt.hidden";

/** New projects always open in Basic — never block the editor with a choice. */
export function readEditorMode(projectId: string | undefined): EditorMode {
  if (!projectId) return "basic";
  try {
    return window.localStorage.getItem(modeKey(projectId)) === "advanced" ? "advanced" : "basic";
  } catch {
    return "basic";
  }
}

export function writeEditorMode(projectId: string | undefined, mode: EditorMode) {
  if (!projectId) return;
  try {
    window.localStorage.setItem(modeKey(projectId), mode);
  } catch {
    /* preference is best-effort */
  }
}

export function readAdvancedPromptHidden(): boolean {
  try {
    return window.localStorage.getItem(PROMPT_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeAdvancedPromptHidden(hidden: boolean) {
  try {
    if (hidden) window.localStorage.setItem(PROMPT_KEY, "1");
    else window.localStorage.removeItem(PROMPT_KEY);
  } catch {
    /* preference is best-effort */
  }
}
