import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { AuthRetry, AuthSpinner } from "@/components/AuthGuardStates";

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { authStatus, hasAppAccess, refreshAccess } = useAuth();

  if (authStatus === "initializing_session" || authStatus === "loading_access") {
    return <AuthSpinner />;
  }

  if (authStatus === "access_load_failed") {
    return <AuthRetry onRetry={() => void refreshAccess()} />;
  }

  if (authStatus === "unauthorized") {
    return <Navigate to="/auth" replace />;
  }

  if (!hasAppAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default AdminRoute;
