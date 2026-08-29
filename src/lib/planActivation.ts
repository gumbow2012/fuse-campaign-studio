const KEY = "fuse.planActivating";

/** Flags that a paid plan was just claimed but billing state hasn't posted yet. */
export function markPlanActivating(): void {
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* storage unavailable */
  }
}

export function isPlanActivating(): boolean {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return false;
    // Stale flags self-expire after 10 minutes.
    if (Date.now() - Number(raw) > 10 * 60 * 1000) {
      sessionStorage.removeItem(KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function clearPlanActivating(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}
