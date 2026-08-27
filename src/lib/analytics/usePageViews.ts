import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { track } from "@/lib/analytics/track";

/** Auto page_view on every route change. Mounted once in the app shell. */
export function usePageViews() {
  const location = useLocation();
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (last.current === location.pathname) return;
    last.current = location.pathname;
    track("page_view");
  }, [location.pathname]);
}

export const PageViewTracker = () => {
  usePageViews();
  return null;
};
