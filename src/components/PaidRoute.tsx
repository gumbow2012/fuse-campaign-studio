/**
 * Paid-only route wrapper. Sits INSIDE CustomerRoute usage: signed-in users on
 * the free plan are sent to the marketplace; paid users pass through untouched.
 */
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { isPaidPlan } from "@/lib/planEntitlement";

export default function PaidRoute({ children }: { children: ReactNode }) {
  const { loading, profile, isAdmin } = useAuth();

  // Wait for the profile so a paid user is never bounced on a cold load.
  if (loading || (!profile && !isAdmin)) return null;
  if (!isAdmin && !isPaidPlan(profile?.plan)) return <Navigate to="/app/templates" replace />;

  return <>{children}</>;
}
