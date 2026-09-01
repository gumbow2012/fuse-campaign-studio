import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface Profile {
  id: string;
  user_id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  plan: string | null;
  subscription_status: string | null;
  credits_balance: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  subscription_period_start: string | null;
  subscription_period_end: string | null;
  subscription_cycle_credits: number;
  /** Post-auth onboarding plan-offer decision (server-owned, decided once). */
  onboarding_plan_offer?: string | null;
}


export type AuthStatus =
  | "initializing_session"
  | "loading_access"
  | "authorized"
  | "unauthorized"
  | "access_load_failed";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  authStatus: AuthStatus;
  roles: string[];
  isAdmin: boolean;
  isCreator: boolean;
  hasAppAccess: boolean;
  canUseBuilder: boolean;
  signOut: () => Promise<void>;
  refreshAccess: () => Promise<void>;
  refreshProfile: () => Promise<Profile | null>;
  refreshSubscription: () => Promise<Profile | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  authStatus: "initializing_session",
  roles: [],
  isAdmin: false,
  isCreator: false,
  hasAppAccess: false,
  canUseBuilder: false,
  signOut: async () => {},
  refreshAccess: async () => {},
  refreshProfile: async () => null,
  refreshSubscription: async () => null,
});

export const useAuth = () => useContext(AuthContext);

const ACCESS_RESOLUTION_TIMEOUT_MS = 8000;

class AccessTimeoutError extends Error {}

const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>;
  return await Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new AccessTimeoutError("Access resolution timed out")), ms);
    }),
  ]).finally(() => clearTimeout(timer!)) as T;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>("initializing_session");
  const [roles, setRoles] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [hasAppAccess, setHasAppAccess] = useState(false);


  const clearAccessState = useCallback(() => {
    setProfile(null);
    setRoles([]);
    setIsAdmin(false);
    setIsCreator(false);
    setHasAppAccess(false);
  }, []);

  const fetchProfile = useCallback(async (_userId: string) => {
    const { data, error } = await supabase.rpc("get_my_profile");
    if (error) {
      console.error("Failed to load profile:", error);
      throw error;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
      const nextProfile = row as Profile;
      setProfile(nextProfile);
      return nextProfile;
    }

    setProfile(null);
    return null;
  }, []);

  const fetchRoles = useCallback(async (_userId: string) => {
    const { data, error } = await supabase.rpc("get_my_roles");
    if (error) {
      console.error("Failed to load roles:", error);
      throw error;
    }

    const nextRoles = ((data ?? []) as Array<{ role: string }>).map((row) => String(row.role));
    setRoles(nextRoles);
    setIsAdmin(nextRoles.includes("admin"));
    setIsCreator(nextRoles.includes("creator"));
    setHasAppAccess(nextRoles.includes("admin") || nextRoles.includes("dev"));
    return nextRoles;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return null;
    try {
      return await fetchProfile(user.id);
    } catch (error) {
      console.error("Failed to refresh profile:", error);
      return null;
    }
  }, [user, fetchProfile]);

  /**
   * Resolves profile + roles with a finite timeout.
   * On hang/failure the secure default is "access_load_failed" — never a grant.
   */
  const resolveAccess = useCallback(
    async (userId: string, options?: { background?: boolean }) => {
      if (!options?.background) {
        setAuthStatus("loading_access");
      }

      try {
        await withTimeout(
          Promise.all([fetchProfile(userId), fetchRoles(userId)]),
          ACCESS_RESOLUTION_TIMEOUT_MS,
        );
        setAuthStatus("authorized");
        return true;
      } catch (error) {
        console.error("Failed to resolve auth access state:", error);
        if (options?.background) {
          // Background refresh must never blank or downgrade an already-resolved route.
          return false;
        }
        clearAccessState();
        setAuthStatus("access_load_failed");
        return false;
      }

    },
    [clearAccessState, fetchProfile, fetchRoles],
  );

  const refreshAccess = useCallback(async () => {
    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession();

    setSession(currentSession);
    setUser(currentSession?.user ?? null);

    if (!currentSession?.user) {
      clearAccessState();
      setAuthStatus("unauthorized");
      return;
    }

    await resolveAccess(currentSession.user.id);
  }, [clearAccessState, resolveAccess]);

  const refreshSubscription = useCallback(async () => {
    if (!session) return null;
    try {
      return await refreshProfile();
    } catch (e) {
      console.error("Failed to check subscription:", e);
      return null;
    }
  }, [session, refreshProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    clearAccessState();
    setAuthStatus("unauthorized");
  }, [clearAccessState]);

  const resolvedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let initialResolved = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (!isMounted) return;

        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          // SECURITY (UI accuracy): on any account change, drop privileged state
          // synchronously so the previous user's admin/creator UI can never flash.
          const changedUser = resolvedUserIdRef.current !== newSession.user.id;
          if (changedUser) {
            clearAccessState();
            resolvedUserIdRef.current = newSession.user.id;
          }
          // Background refresh: never blank protected routes on token refresh/focus.
          // If the initial load never released, this also rescues the loading state.
          setTimeout(() => {
            if (!isMounted) return;
            void resolveAccess(newSession.user.id, { background: initialResolved && !changedUser });
          }, 0);
          return;
        }

        resolvedUserIdRef.current = null;
        clearAccessState();
        setAuthStatus("unauthorized");
      }
    );

    void supabase.auth.getSession().then(async ({ data: { session: existingSession } }) => {
      if (!isMounted) return;

      setSession(existingSession);
      setUser(existingSession?.user ?? null);

      if (existingSession?.user) {
        if (resolvedUserIdRef.current !== existingSession.user.id) {
          clearAccessState();
          resolvedUserIdRef.current = existingSession.user.id;
        }
        await resolveAccess(existingSession.user.id);
      } else {
        resolvedUserIdRef.current = null;
        clearAccessState();
        setAuthStatus("unauthorized");
      }
      initialResolved = true;
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [clearAccessState, resolveAccess]);



  // Refresh subscription state on sign-in so profile billing fields stay current.
  useEffect(() => {
    if (!session) return;
    refreshSubscription();
  }, [session, refreshSubscription]);

  useEffect(() => {
    if (!user) return;

    let lastRefreshAt = 0;
    const refreshVisibleProfile = () => {
      if (document.visibilityState === "hidden") return;
      const now = Date.now();
      if (now - lastRefreshAt < 15_000) return;
      lastRefreshAt = now;
      void fetchProfile(user.id).catch((error) => {
        console.error("Background profile refresh failed:", error);
      });
    };

    window.addEventListener("focus", refreshVisibleProfile);
    document.addEventListener("visibilitychange", refreshVisibleProfile);

    return () => {
      window.removeEventListener("focus", refreshVisibleProfile);
      document.removeEventListener("visibilitychange", refreshVisibleProfile);
    };
  }, [fetchProfile, user]);

  const loading = authStatus === "initializing_session" || authStatus === "loading_access";

  return (

    <AuthContext.Provider value={{ user, session, profile, loading, authStatus, roles, isAdmin, isCreator, hasAppAccess, canUseBuilder: hasAppAccess || isCreator, signOut, refreshAccess, refreshProfile, refreshSubscription }}>
      {children}
    </AuthContext.Provider>
  );
};
