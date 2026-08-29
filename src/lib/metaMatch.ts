/**
 * Reads Meta browser match parameters (_fbc / _fbp) for CAPI match quality.
 * Additive analytics only — never affects billing.
 */
export function getMetaMatchParams(): { fbc: string | null; fbp: string | null } {
  if (typeof document === "undefined") return { fbc: null, fbp: null };
  const get = (name: string) => {
    const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
    return m ? decodeURIComponent(m[1]) : null;
  };
  let fbc = get("_fbc");
  const fbp = get("_fbp");
  // Derive fbc from fbclid if the cookie isn't set yet.
  if (!fbc && typeof window !== "undefined") {
    const p = new URLSearchParams(window.location.search).get("fbclid");
    if (p) fbc = `fb.1.${Date.now()}.${p}`;
  }
  return { fbc, fbp };
}
