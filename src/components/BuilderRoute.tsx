import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { AuthRetry, AuthSpinner } from "@/components/AuthGuardStates";

/** Allows admins, devs, and invited creators into the template builder surfaces. */
const BuilderRoute = ({ children }: { children: React.ReactNode }) => {
  const { authStatus, canUseBuilder, refreshAccess } = useAuth();

  if (authStatus === "initializing_session" || authStatus === "loading_access") {
    return <AuthSpinner />;
  }

  if (authStatus === "access_load_failed") {
    return <AuthRetry onRetry={() => void refreshAccess()} />;
  }

  if (authStatus === "unauthorized") {
    return <Navigate to="/auth" replace />;
  }

  if (!canUseBuilder) {
    return <Navigate to="/app/templates" replace />;
  }

  return <>{children}</>;
};

export default BuilderRoute;
