/**
 * Resolves a private fuse-assets reference into a short-lived signed URL.
 *
 * Cards request their preview only once they're near the viewport; requests made
 * in the same burst are collected into ONE `sign-asset-urls` call (a page at a
 * time, never one call per card). Results come from the session cache in
 * `assetSigning`, so re-opening the library is instant until the TTL nears.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCachedSignedUrl,
  isDeniedAsset,
  needsSigning,
  resolveAssetUrls,
} from "@/services/assetSigning";

type Waiter = (map: Record<string, string | null>) => void;

let queue: string[] = [];
let waiters: Waiter[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flush(force: boolean) {
  const refs = queue;
  const listeners = waiters;
  queue = [];
  waiters = [];
  timer = null;
  void resolveAssetUrls(refs, { force }).then((map) => {
    listeners.forEach((listener) => listener(map));
  });
}

function enqueue(ref: string, force: boolean): Promise<Record<string, string | null>> {
  return new Promise((resolve) => {
    queue.push(ref);
    waiters.push(resolve);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => flush(force), 60);
  });
}

export type SignedAssetState = "idle" | "loading" | "ready" | "unavailable";

export function useSignedAssetUrl(ref: string | null | undefined, active: boolean) {
  const [url, setUrl] = useState<string | null>(() => {
    if (!ref) return null;
    return needsSigning(ref) ? getCachedSignedUrl(ref) : ref;
  });
  const [state, setState] = useState<SignedAssetState>(() => {
    if (!ref) return "unavailable";
    if (!needsSigning(ref)) return "ready";
    if (getCachedSignedUrl(ref)) return "ready";
    return "idle";
  });
  const generation = useRef(0);

  const load = useCallback(
    (force: boolean) => {
      if (!ref) {
        setState("unavailable");
        return;
      }
      if (!needsSigning(ref)) {
        setUrl(ref);
        setState("ready");
        return;
      }
      if (!force) {
        const cached = getCachedSignedUrl(ref);
        if (cached) {
          setUrl(cached);
          setState("ready");
          return;
        }
        if (isDeniedAsset(ref)) {
          setUrl(null);
          setState("unavailable");
          return;
        }
      }
      const token = ++generation.current;
      setState("loading");
      void enqueue(ref, force).then((map) => {
        if (token !== generation.current) return;
        const next = map[ref.trim()] ?? null;
        setUrl(next);
        setState(next ? "ready" : "unavailable");
      });
    },
    [ref],
  );

  useEffect(() => {
    if (!active) return;
    if (state === "idle") load(false);
  }, [active, state, load]);

  /** Fresh signature — used by the per-card retry and by expiring previews. */
  const refresh = useCallback(() => load(true), [load]);

  return { url, state, refresh } as const;
}

export default useSignedAssetUrl;
