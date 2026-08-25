/**
 * Meta Pixel standard-event helper.
 * Purely additive analytics — never affects auth, checkout, billing or credit logic.
 */

type PixelParams = Record<string, string | number | undefined>;

export function trackEvent(name: string, params?: PixelParams, eventID?: string) {
  try {
    if (typeof window === "undefined" || !window.fbq) return;
    const options = eventID ? { eventID } : undefined;
    if (params) window.fbq("track", name, params, options);
    else window.fbq("track", name, undefined, options);
  } catch {
    // analytics must never break the app
  }
}

/** Fires an event at most once per key (persisted so refreshes don't double-count). */
export function trackEventOnce(key: string, name: string, params?: PixelParams, eventID?: string) {
  try {
    if (typeof window === "undefined") return;
    const storageKey = `fuse.pixel.once.${key}`;
    if (window.localStorage.getItem(storageKey)) return;
    window.localStorage.setItem(storageKey, "1");
    trackEvent(name, params, eventID);
  } catch {
    trackEvent(name, params, eventID);
  }
}

/**
 * Deterministic event id shared with the server-side Conversions API so Meta dedupes.
 * Derived from the Stripe checkout session id, available on the return URL and the webhook.
 */
export function checkoutEventId(name: string, checkoutSessionId: string) {
  return `fuse_${name.toLowerCase()}_${checkoutSessionId}`;
}

const PENDING_CHECKOUT_KEY = "fuse.pixel.pendingCheckout";

export type PendingCheckout = {
  mode: "subscription" | "credits";
  value?: number;
  contentName?: string;
  startedAt: number;
};

export function rememberPendingCheckout(pending: Omit<PendingCheckout, "startedAt">) {
  try {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(
      PENDING_CHECKOUT_KEY,
      JSON.stringify({ ...pending, startedAt: Date.now() } satisfies PendingCheckout),
    );
  } catch {
    // ignore
  }
}

export function readPendingCheckout(): PendingCheckout | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.sessionStorage.getItem(PENDING_CHECKOUT_KEY);
    return raw ? (JSON.parse(raw) as PendingCheckout) : null;
  } catch {
    return null;
  }
}

export function clearPendingCheckout() {
  try {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(PENDING_CHECKOUT_KEY);
  } catch {
    // ignore
  }
}
