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
  hasAppAccess: boolean;
  signOut: () => Promise<void>;
  refreshAccess: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  roles: [],
  isAdmin: false,
  hasAppAccess: false,
  signOut: async () => {},
  refreshAccess: async () => {},
  refreshProfile: async () => {},
  refreshSubscription: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hasAppAccess, setHasAppAccess] = useState(false);

  const clearAccessState = useCallback(() => {
    setProfile(null);
    setRoles([]);
    setIsAdmin(false);
    setHasAppAccess(false);
  }, []);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase.rpc("get_my_profile");
    if (error) {
      console.error("Failed to load profile:", error);
      setProfile(null);
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
      setProfile(row as Profile);
      return;
    }

    setProfile(null);
  }, []);

  const fetchRoles = useCallback(async (userId: string) => {
    const { data, error } = await supabase.rpc("get_my_roles");
    if (error) {
      console.error("Failed to load roles:", error);
      setRoles([]);
      setIsAdmin(false);
      setHasAppAccess(false);
      return;
    }

    const nextRoles = (data ?? []).map((row: any) => String(row.role));
    setRoles(nextRoles);
    setIsAdmin(nextRoles.includes("admin"));
    setHasAppAccess(nextRoles.includes("admin") || nextRoles.includes("dev"));
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
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
    if (!session) return;
    try {
      await refreshProfile();
    } catch (e) {
      console.error("Failed to check subscription:", e);
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

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, roles, isAdmin, hasAppAccess, signOut, refreshAccess, refreshProfile, refreshSubscription }}>
      {children}
    </AuthContext.Provider>
  );
};
