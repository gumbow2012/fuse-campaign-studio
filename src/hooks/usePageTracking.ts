import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export const usePageTracking = () => {
  const location = useLocation();

  useEffect(() => {
    if (typeof window !== "undefined" && window.fbq) {
      window.fbq("track", "PageView");
    }
  }, [location.pathname, location.search]);
};

export const PageTracking = () => {
  usePageTracking();
  return null;
};
