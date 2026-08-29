import { useEffect, useRef, useState } from "react";

/**
 * GS-PERF5 — lightweight intersection gate for media loading.
 *
 * Returns a ref to attach to the media host plus a boolean that flips to true
 * once the element gets within `rootMargin` of the viewport. Once true it stays
 * true (media never unloads) and the observer disconnects.
 *
 * `initial` lets first-screen tiles skip the observer entirely (eager path).
 */
export function useNearViewport<T extends HTMLElement = HTMLDivElement>(
  initial = false,
  rootMargin = "400px",
) {
  const ref = useRef<T | null>(null);
  const [near, setNear] = useState(initial);

  useEffect(() => {
    if (near) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [near, rootMargin]);

  return { ref, near } as const;
}

export default useNearViewport;
