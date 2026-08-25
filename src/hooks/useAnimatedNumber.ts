import { useEffect, useRef, useState } from "react";

/** True when the user asked for reduced motion. */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);
  return reduced;
}

/**
 * Tweens toward the target value; snaps instantly when motion is reduced.
 * Presentation only — never changes the underlying value it is given.
 */
export function useAnimatedNumber(target: number, duration = 280) {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);
  const frame = useRef<number | null>(null);
  const current = useRef(value);
  current.current = value;

  useEffect(() => {
    if (reduced) {
      setValue(target);
      return;
    }
    const start = current.current;
    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(start + (target - start) * eased));
      if (progress < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [target, reduced, duration]);

  return value;
}
