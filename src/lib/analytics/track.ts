/**
 * Site-wide analytics — ONE shared module.
 *
 * HARD RULES
 *  - Fire-and-forget. Never awaited in a UI path, never throws, swallows every error.
 *  - Never send PII: no emails, names, tokens, credentials, or query strings.
 *    `props` carries small non-PII descriptors only (template_id, plan_key, ...).
 */
import { supabase } from "@/integrations/supabase/client";

const EVENT_NAME_RE = /^[a-z0-9_.:-]{1,64}$/;
const SESSION_KEY = "fuse_analytics_session_id";
const GA_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined) || "";

let memorySessionId: string | null = null;
let gaLoaded = false;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function getSessionId(): string {
  if (memorySessionId) return memorySessionId;
  try {
    const stored = window.localStorage.getItem(SESSION_KEY);
    if (stored) {
      memorySessionId = stored;
      return stored;
    }
    const fresh = newId();
    window.localStorage.setItem(SESSION_KEY, fresh);
    memorySessionId = fresh;
    return fresh;
  } catch {
    memorySessionId = memorySessionId ?? newId();
    return memorySessionId;
  }
}

/** Path only — query string and hash are stripped so no data leaks into analytics. */
function safePath(): string {
  try {
    return window.location.pathname || "/";
  } catch {
    return "/";
  }
}

function ensureGa() {
  if (!GA_ID || gaLoaded) return;
  gaLoaded = true;
  try {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
    document.head.appendChild(script);
    window.dataLayer = window.dataLayer || [];
    window.gtag =
      window.gtag ||
      function gtag(...args: unknown[]) {
        window.dataLayer?.push(args);
      };
    window.gtag("js", new Date());
    window.gtag("config", GA_ID, { send_page_view: false });
  } catch {
    /* GA is optional — never surface an error */
  }
}

async function send(eventName: string, props: Record<string, unknown>) {
  const path = safePath();
  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    userId = data.session?.user?.id ?? null;
  } catch {
    userId = null;
  }

  let referrer: string | null = null;
  try {
    referrer = document.referrer || null;
  } catch {
    referrer = null;
  }

  await supabase.from("analytics_events").insert({
    event_name: eventName,
    user_id: userId,
    session_id: getSessionId(),
    path,
    referrer,
    props: props as never,
  });
}

/** Fire-and-forget event. Safe to call anywhere; failures are silent by design. */
export function track(eventName: string, props?: Record<string, unknown>) {
  try {
    if (!EVENT_NAME_RE.test(eventName)) return;
    const payload = props && typeof props === "object" ? props : {};

    void send(eventName, payload).catch(() => {
      /* analytics must never break a page */
    });

    if (GA_ID) {
      ensureGa();
      try {
        window.gtag?.("event", eventName, payload);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}
