import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface Profile {
  id: string;
  user_id: string;
  email: string;
  name: string | null;
  plan: string | null;
  subscription_status: string | null;
  credits_balance: number;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  subscription_period_start: string | null;
  subscription_period_end: string | null;
  subscription_cycle_credits: number;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
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
      setProfile(null);
      return null;
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

  const fetchRoles = useCallback(async (userId: string) => {
    const { data, error } = await supabase.rpc("get_my_roles");
    if (error) {
      console.error("Failed to load roles:", error);
      setRoles([]);
      setIsAdmin(false);
      setIsCreator(false);
      setHasAppAccess(false);
      return;
    }

    const nextRoles = ((data ?? []) as Array<{ role: string }>).map((row) => String(row.role));
    setRoles(nextRoles);
    setIsAdmin(nextRoles.includes("admin"));
    setIsCreator(nextRoles.includes("creator"));
    setHasAppAccess(nextRoles.includes("admin") || nextRoles.includes("dev"));
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return null;
    return await fetchProfile(user.id);
  }, [user, fetchProfile]);

  const refreshAccess = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      await Promise.all([
        fetchProfile(user.id),
        fetchRoles(user.id),
      ]);
    } finally {
      setLoading(false);
    }
  }, [user, fetchProfile, fetchRoles]);

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
  }, [clearAccessState]);

  useEffect(() => {
    let isMounted = true;

    const syncAccessState = async (nextUserId: string) => {
      try {
        await Promise.all([
          fetchProfile(nextUserId),
          fetchRoles(nextUserId),
        ]);
      } catch (error) {
        console.error("Failed to sync auth access state:", error);
        clearAccessState();
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (!isMounted) return;

        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          // Background refresh only. Do not blank protected routes on token refresh/focus.
          setTimeout(() => {
            if (!isMounted) return;
            void syncAccessState(newSession.user.id);
          }, 0);
          return;
        }

        clearAccessState();
        setLoading(false);
      }
    );

    void supabase.auth.getSession().then(async ({ data: { session: existingSession } }) => {
      if (!isMounted) return;

      setSession(existingSession);
      setUser(existingSession?.user ?? null);

      try {
        if (existingSession?.user) {
          await syncAccessState(existingSession.user.id);
        } else {
          clearAccessState();
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [clearAccessState, fetchProfile, fetchRoles]);

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
      void fetchProfile(user.id);
    };

    window.addEventListener("focus", refreshVisibleProfile);
    document.addEventListener("visibilitychange", refreshVisibleProfile);

    return () => {
      window.removeEventListener("focus", refreshVisibleProfile);
      document.removeEventListener("visibilitychange", refreshVisibleProfile);
    };
  }, [fetchProfile, user]);

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, roles, isAdmin, isCreator, hasAppAccess, canUseBuilder: hasAppAccess || isCreator, signOut, refreshAccess, refreshProfile, refreshSubscription }}>
      {children}
    </AuthContext.Provider>
  );
};
