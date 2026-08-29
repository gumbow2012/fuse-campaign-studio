const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content"] as const;
const KEY = "fuse_utm_v1";

function readLS(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

/** Capture ad params on any landing (latest ad touch wins). */
export function captureUtmParams(): void {
  if (typeof window === "undefined") return;
  try {
    const sp = new URLSearchParams(window.location.search);
    const cur = readLS();
    let changed = false;
    for (const k of UTM_KEYS) {
      const v = sp.get(k);
      if (v) {
        cur[k] = v;
        changed = true;
      }
    }
    const fbclid = sp.get("fbclid");
    if (fbclid) {
      cur.fbclid = fbclid;
      changed = true;
    }
    if (changed) localStorage.setItem(KEY, JSON.stringify(cur));
  } catch {
    /* storage unavailable — attribution is best-effort */
  }
}

export function getStoredUtm(): Record<string, string> {
  return readLS();
}
