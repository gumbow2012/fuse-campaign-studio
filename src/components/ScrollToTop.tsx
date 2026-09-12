import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** Resets scroll to the top whenever the route path changes (in-page anchors keep working). */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}

export default ScrollToTop;
