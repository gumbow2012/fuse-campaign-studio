import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";

/** Allows admins, devs, and invited creators into the template builder surfaces. */
const BuilderRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, canUseBuilder } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!canUseBuilder) {
    return <Navigate to="/app/templates" replace />;
  }

  return <>{children}</>;
};

export default BuilderRoute;
