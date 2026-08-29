import { useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
import { storePendingReferralCode } from "@/lib/pendingReferral";
import { track } from "@/lib/analytics/track";

/** Public referral landing (/join/:code, /r/:code) — stores the code, sends to signup. */
export default function ReferralCapturePage() {
  const { code } = useParams<{ code: string }>();

  useEffect(() => {
    const stored = storePendingReferralCode(code);
    if (stored) track("referral_landing", { source: "link" });
  }, [code]);

  return <Navigate to="/auth?mode=signup" replace />;
}
